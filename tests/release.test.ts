import assert from "node:assert/strict";
import { test } from "node:test";
import {
  publicSite,
  privateRoute,
  contentPolicy,
  productEvidence,
  structuredJson,
} from "../src/lib/release";
import { operationRecord } from "../src/lib/operations";
import type { Variant } from "../src/lib/shop-model";

test("indexing needs an explicitly approved HTTPS public origin and opt-in", () => {
  for (const origin of [
    "",
    "http://audace.example",
    "https://user:password@audace.example",
    "https://audace.example/path",
    "https://audace.example/?key=x",
    "https://localhost",
    "https://127.0.0.1",
  ])
    assert.equal(
      publicSite({
        AUDACE_PUBLIC_ORIGIN: origin,
        AUDACE_INDEXING_ENABLED: "true",
      }).index,
      false,
    );
  assert.deepEqual(
    publicSite({ AUDACE_PUBLIC_ORIGIN: "https://audace.example" }),
    { origin: "https://audace.example", index: false },
  );
  assert.equal(
    publicSite({
      AUDACE_PUBLIC_ORIGIN: "https://audace.example",
      AUDACE_INDEXING_ENABLED: "true",
    }).index,
    true,
  );
});
test("private route classification uses path boundaries", () => {
  for (const path of [
    "/admin",
    "/admin/orders/id",
    "/api/internal/health",
    "/checkout",
    "/payment-status",
    "/order-confirmation",
    "/bag",
  ])
    assert.ok(privateRoute(path));
  assert.equal(privateRoute("/products/admin-shirt"), false);
  assert.equal(privateRoute("/administration"), false);
});
test("production CSP requires a nonce, excludes script eval and retains hosted redirects", () => {
  const policy = contentPolicy("syntheticNonce", false, true);
  assert.ok(
    policy.includes(
      "script-src 'self' 'nonce-syntheticNonce' 'strict-dynamic';",
    ),
  );
  assert.ok(!policy.includes("'unsafe-eval'"));
  assert.ok(policy.includes("form-action 'self'"));
  assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.ok(policy.includes("upgrade-insecure-requests"));
  assert.ok(
    !contentPolicy("test", true, false).includes("upgrade-insecure-requests"),
  );
});
const variant: Variant = {
  id: "audace-cr-ss",
  sku: "AUD-CR-SS",
  slug: "cream-short-sleeve",
  name: "Stand-collar shirt",
  colour: "Cream",
  sleeve: "Short sleeve",
  images: [
    {
      src: "/garments/cream-short-sleeve.webp",
      width: 742,
      height: 764,
      alt: "Approved illustration",
      label: "Front view",
    },
  ],
  pricePesewas: null,
  sizes: [],
  published: true,
  description: "Approved description",
  specifications: [],
  sizeGuide: null,
};
test("product evidence does not invent offers, ratings or stock", () => {
  const base = productEvidence(variant, "https://audace.example");
  assert.ok(!("offers" in base));
  assert.ok(!("aggregateRating" in base));
  for (const sizes of [[], [{ label: "Approved", stock: null }]]) {
    assert.ok(
      !(
        "offers" in
        productEvidence(
          { ...variant, pricePesewas: 39995, sizes },
          "https://audace.example",
        )
      ),
    );
  }
  const offered = productEvidence(
    {
      ...variant,
      pricePesewas: 39995,
      sizes: [{ label: "Approved", stock: 1 }],
    },
    "https://audace.example",
  );
  assert.deepEqual(offered.offers, {
    "@type": "Offer",
    url: "https://audace.example/products/cream-short-sleeve",
    priceCurrency: "GHS",
    price: "399.95",
    availability: "https://schema.org/InStock",
  });
});
test("structured product data cannot escape its script element", () => {
  const value = { description: "</script><script>alert('x')</script>" };
  const serialized = structuredJson(value);
  assert.ok(!serialized.includes("<"));
  assert.deepEqual(JSON.parse(serialized), value);
});
test("operational logs discard PII, URLs, tokens, raw errors and uncontrolled codes", () => {
  const record = operationRecord("database_error", {
    code: "buyer@example.test",
    requestId: "raw-session-token",
    attemptId: "../../secret",
    count: Infinity,
    processed: -1,
    email: "buyer@example.test",
    password: "sensitive",
    url: "https://example.test/?token=sensitive",
    error: new Error("sensitive"),
  } as Parameters<typeof operationRecord>[1]);
  assert.deepEqual(Object.keys(record).sort(), ["event", "service", "time"]);
  assert.equal(
    operationRecord("database_error", { code: "rpc_unavailable", count: 1 })
      .code,
    "rpc_unavailable",
  );
});
