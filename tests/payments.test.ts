import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { test } from "node:test";
import { checkoutUrl, paymentConfiguration } from "../src/lib/payments/config";
import {
  digest,
  parseProviderJson,
  verifyWebhook,
} from "../src/lib/payments/security";
import {
  transactionEvidence,
  webhookEvidence,
  type AttemptContext,
} from "../src/lib/payments/contracts";

// Disposable local values exercise provider formats without storing credentials.
const secret = `whsec_${randomBytes(24).toString("hex")}`;
const key = `sk_test_${randomBytes(24).toString("hex")}`;
const env = {
  PAYSTACK_ENVIRONMENT: "test",
  PAYSTACK_SECRET_KEY: key,
  PAYSTACK_CHANNELS: "card,mobile_money",
  PAYSTACK_WEBHOOK_MODE: "timestamped",
  PAYSTACK_WEBHOOK_SECRET: secret,
  PAYMENT_RECONCILE_SECRET: "synthetic-worker-secret-at-least-32-characters",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "synthetic",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic",
  AUDACE_APP_ORIGIN: "http://127.0.0.1:3000",
};
const now = 1800000000;
const raw = Buffer.from(
  '{"event":"charge.success","data":{"domain":"test","reference":"ADT-fixture","id":123}}',
);
const signature = (body: Buffer, timestamp = now, signing = secret) =>
  `t=${timestamp},v1=whk_fixture:${createHmac("sha512", signing)
    .update(String(timestamp) + ".")
    .update(body)
    .digest("hex")}`;
const options = {
  mode: "timestamped" as const,
  secrets: [secret],
  secretKey: key,
  now,
};

test("only explicit test configuration with approved channels enables checkout", () => {
  assert.equal(paymentConfiguration(env).environment, "test");
  for (const change of [
    { PAYSTACK_ENVIRONMENT: "live" },
    { PAYSTACK_SECRET_KEY: `sk_live_${randomBytes(24).toString("hex")}` },
    { PAYSTACK_CHANNELS: "" },
    { PAYSTACK_CHANNELS: "bank_transfer" },
    { PAYSTACK_WEBHOOK_MODE: "" },
    { SUPABASE_SERVICE_ROLE_KEY: "" },
    { PAYMENT_RECONCILE_SECRET: "short" },
    { AUDACE_APP_ORIGIN: "https://shop.test/unsafe" },
  ])
    assert.throws(() => paymentConfiguration({ ...env, ...change }));
  assert.throws(() =>
    paymentConfiguration({
      ...env,
      PAYSTACK_TEST_API_ORIGIN: "https://attacker.test",
    }),
  );
  const mock = paymentConfiguration({
    ...env,
    AUDACE_PROVIDER_MOCKS: "1",
    PAYSTACK_TEST_API_ORIGIN: "http://127.0.0.1:9000",
  });
  assert.equal(mock.apiOrigin, "http://127.0.0.1:9000");
  assert.equal(
    checkoutUrl("https://checkout.paystack.com/fixture", mock),
    "https://checkout.paystack.com/fixture",
  );
  for (const url of [
    "https://checkout.paystack.com.attacker.test/x",
    "https://attacker.test",
    "javascript:alert(1)",
    "https://user:secret@checkout.paystack.com/x",
  ]) {
    assert.equal(checkoutUrl(url, mock), null);
  }
});

test("timestamped webhook authentication covers raw bytes, tolerance and key rotation", () => {
  assert.equal(verifyWebhook(raw, signature(raw), null, options), true);
  assert.equal(verifyWebhook(raw, null, null, options), false);
  assert.equal(
    verifyWebhook(
      Buffer.concat([raw, Buffer.from(" ")]),
      signature(raw),
      null,
      options,
    ),
    false,
  );
  assert.equal(
    verifyWebhook(raw, signature(raw, now - 301), null, options),
    false,
  );
  assert.equal(
    verifyWebhook(raw, signature(raw, now + 301), null, options),
    false,
  );
  assert.equal(
    verifyWebhook(raw, signature(raw, now - 300), null, options),
    true,
  );
  assert.equal(
    verifyWebhook(
      raw,
      signature(raw, now, randomBytes(24).toString("hex")),
      null,
      options,
    ),
    false,
  );
  assert.equal(
    verifyWebhook(raw, signature(raw) + `,t=${now}`, null, options),
    false,
  );
  assert.equal(
    verifyWebhook(
      raw,
      `t=${now},v1=whk_other:${"0".repeat(128)},${signature(raw).split(",")[1]}`,
      null,
      options,
    ),
    true,
  );
  assert.equal(
    verifyWebhook(raw, signature(raw), null, {
      ...options,
      secrets: [randomBytes(24).toString("hex"), secret],
    }),
    true,
  );
  assert.equal(digest(raw), digest(Buffer.from(raw)));
});

test("legacy authentication is explicit and never rescues an invalid current signature", () => {
  const legacy = createHmac("sha512", key).update(raw).digest("hex");
  assert.equal(
    verifyWebhook(raw, null, legacy, { ...options, mode: "legacy" }),
    true,
  );
  assert.equal(
    verifyWebhook(raw, null, "0".repeat(128), { ...options, mode: "legacy" }),
    false,
  );
  assert.equal(
    verifyWebhook(raw, signature(raw), legacy, { ...options, mode: "legacy" }),
    false,
  );
  assert.equal(verifyWebhook(raw, null, legacy, options), false);
});

const expected: AttemptContext = {
  attemptId: "40000000-0000-4000-8000-000000000001",
  orderId: "50000000-0000-4000-8000-000000000001",
  reference: "ADT-fixture",
  amount: 41245,
  currency: "GHS",
  environment: "test",
  email: "buyer@example.test",
  state: "pending",
  authorizationUrl: null,
  expiresAt: "2026-01-01T00:00:00Z",
  payment: "pending",
};
const provider = {
  id: "18446744073709551615",
  reference: expected.reference,
  amount: expected.amount,
  currency: "GHS",
  domain: "test",
  status: "success",
  channel: "mobile_money",
  paid_at: "2026-01-01T00:00:00Z",
  integration: 123,
  customer: { email: "buyer@example.test" },
  metadata: {
    audace_order_id: expected.orderId,
    audace_attempt_id: expected.attemptId,
    audace_environment: "test",
  },
};

test("verification enforces status, amount, currency, reference, ownership and environment", () => {
  assert.equal(
    transactionEvidence(provider, expected, "123").status,
    "success",
  );
  for (const status of [
    "pending",
    "ongoing",
    "processing",
    "queued",
    "failed",
    "abandoned",
    "reversed",
  ]) {
    assert.equal(
      transactionEvidence(
        { ...provider, status, paid_at: null, channel: null },
        expected,
        "123",
      ).status,
      status,
    );
  }
  for (const change of [
    { amount: 1 },
    { amount: 41245.1 },
    { currency: "NGN" },
    { reference: "wrong" },
    { domain: "live" },
    { metadata: { ...provider.metadata, audace_order_id: "wrong" } },
    { metadata: { ...provider.metadata, audace_attempt_id: "wrong" } },
    { integration: 999 },
    { customer: { email: "someone-else@example.test" } },
    { status: "unknown" },
    { paid_at: null },
  ])
    assert.throws(
      () => transactionEvidence({ ...provider, ...change }, expected, "123"),
      /verification_mismatch/,
    );
});

test("unsigned 64-bit transaction IDs are preserved without floating-point rounding", () => {
  const value = parseProviderJson(
    '{"id":18446744073709551615,"amount":41245}',
  ) as { id: string; amount: number };
  assert.equal(value.id, "18446744073709551615");
  assert.equal(value.amount, 41245);
  assert.equal(
    transactionEvidence({ ...provider, id: value.id }, expected, null)
      .providerId,
    value.id,
  );
});

test("event parsing keeps scoped evidence and rejects unsupported environments and malformed events", () => {
  const event = webhookEvidence(parseProviderJson(raw.toString()));
  assert.equal(event.reference, "ADT-fixture");
  assert.ok(!("customer" in event.evidence));
  assert.throws(() =>
    webhookEvidence({
      event: "charge.success",
      data: { domain: "live", reference: "x" },
    }),
  );
  assert.throws(() =>
    webhookEvidence({
      event: "made.up",
      data: { domain: "test", reference: "x" },
    }),
  );
  assert.throws(() =>
    webhookEvidence({
      event: "charge.success",
      data: { domain: "test", reference: "invalid/ref" },
    }),
  );
});
