import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { startDatabase } from "./database/cluster.mjs";

const owner = "20000000-0000-4000-8000-000000000001";
const operator = "20000000-0000-4000-8000-000000000002";
const stranger = "20000000-0000-4000-8000-000000000003";
const method = "10000000-0000-4000-8000-000000000001";
const contact = {
  name: "Synthetic Buyer",
  email: "buyer@example.test",
  phone: "+233200000000",
  region: "Greater Accra",
  city: "Accra",
  address: "Synthetic address",
  directions: "",
};
const access = createHash("sha256").update("Synthetic secret").digest("hex");
let db,
  counter = 0;
before(
  async () => {
    db = await startDatabase();
    await db.file(
      fileURLToPath(new URL("./database/shop-fixture.sql", import.meta.url)),
    );
  },
  { timeout: 240000 },
);
after(
  async () => {
    await db?.cleanup();
  },
  { timeout: 45000 },
);
const service = (name, args) => db.rpc("service_role", null, name, args);
const admin = (name, args, subject = owner) =>
  db.rpc("authenticated", subject, name, args);

async function fixture(stock = 1) {
  const size = `Payment fixture ${++counter}`;
  const sku = await admin("audace_add_size", {
    p_variant: "audace-cr-ss",
    p_size: size,
    p_code: `PAYMENT-FIXTURE-${counter}`,
  });
  await admin("audace_adjust_stock", {
    p_sku: sku,
    p_expected: 0,
    p_count: stock,
    p_reason: "Synthetic payment test stock",
  });
  const args = {
    p_request: randomUUID(),
    p_access: access,
    p_lines: [{ variantId: "audace-cr-ss", size, quantity: 1 }],
    p_delivery: method,
    p_contact: contact,
    p_expected: 41245,
  };
  return { sku, args, start: () => service("audace_payment_begin", args) };
}

function evidence(attempt, status = "success", id = String(8000000 + counter)) {
  return {
    providerId: id,
    reference: attempt.reference,
    domain: "test",
    currency: "GHS",
    amount: 41245,
    status,
    orderId: attempt.orderId,
    attemptId: attempt.attemptId,
    email: contact.email,
    channel: "mobile_money",
    paidAt: "2026-01-01T00:00:00Z",
  };
}
const settle = (attempt, data) =>
  service("audace_payment_apply", {
    p_reference: attempt.reference,
    p_data: data ?? evidence(attempt),
  });
const get = (orderId, hash = access) =>
  service("audace_payment_access", { p_order: orderId, p_access: hash });

test("initialization is consent-checked, owner-bound and idempotent", async () => {
  const f = await fixture(2);
  await assert.rejects(
    service("audace_payment_begin", { ...f.args, p_expected: 1 }),
    /price_changed/,
  );
  const [one, two] = await Promise.all([f.start(), f.start()]);
  assert.equal(one.orderId, two.orderId);
  assert.equal(one.reference, two.reference);
  assert.equal(one.amount, 41245);
  await assert.rejects(
    service("audace_payment_begin", { ...f.args, p_access: "0".repeat(64) }),
    /order_access_denied/,
  );
  assert.equal(await get(one.orderId, "0".repeat(64)), null);
  await assert.rejects(
    db.rpc("anon", null, "audace_payment_access", {
      p_order: one.orderId,
      p_access: access,
    }),
    /permission denied/,
  );
  const [leaseA, leaseB] = await Promise.all([
    service("audace_payment_claim_init", { p_attempt: one.attemptId }),
    service("audace_payment_claim_init", { p_attempt: one.attemptId }),
  ]);
  assert.equal([leaseA, leaseB].filter(Boolean).length, 1);
  const lease = leaseA ?? leaseB;
  await service("audace_payment_save_init", {
    p_attempt: one.attemptId,
    p_lease: lease,
    p_url: null,
    p_error: "provider_unavailable",
  });
  assert.equal((await f.start()).reference, one.reference);
});

test("verification mismatches cannot mark an order paid", async () => {
  const f = await fixture();
  const attempt = await f.start();
  for (const change of [
    { amount: 1 },
    { currency: "NGN" },
    { domain: "live" },
    { reference: "wrong" },
    { orderId: randomUUID() },
  ]) {
    assert.equal(
      await settle(attempt, { ...evidence(attempt), ...change }),
      "review",
    );
    assert.equal((await get(attempt.orderId)).payment, "pending");
  }
  await assert.rejects(
    admin("audace_payment_apply", {
      p_reference: attempt.reference,
      p_data: evidence(attempt),
    }),
    /permission denied/,
  );
  assert.equal(
    await db.query("select on_hand from audace_stock where sku_id=:'sku';", {
      sku: f.sku,
    }),
    "1",
  );
});

test("concurrent callback and webhook verification deduct stock and record a receipt once", async () => {
  const f = await fixture();
  const attempt = await f.start();
  const data = evidence(attempt);
  assert.deepEqual(
    await Promise.all([settle(attempt, data), settle(attempt, data)]),
    ["success", "success"],
  );
  assert.equal(
    await db.query(
      "select count(*) from audace_payment_receipts where order_id=:'id';",
      { id: attempt.orderId },
    ),
    "1",
  );
  assert.equal(
    await db.query(
      "select count(*) from audace_movements where order_id=:'id';",
      { id: attempt.orderId },
    ),
    "1",
  );
  assert.equal(
    await db.query("select on_hand from audace_stock where sku_id=:'sku';", {
      sku: f.sku,
    }),
    "0",
  );
  assert.equal((await get(attempt.orderId)).allocation, "allocated");
  for (const action of ["processing", "shipped", "delivered"]) {
    await admin(
      "audace_admin_order_action",
      { p_order: attempt.orderId, p_action: action },
      operator,
    );
  }
  assert.equal((await get(attempt.orderId)).fulfilment, "delivered");
  assert.equal(
    await settle(attempt, { ...data, status: "pending", paidAt: null }),
    "success",
  );
});

test("late verified payments enter review and an owner can allocate actual available stock", async () => {
  const f = await fixture();
  const attempt = await f.start();
  await db.query(
    "update audace_orders set expires_at=now()-interval '1 second' where id=:'id'; update audace_reservations set expires_at=now()-interval '1 second' where order_id=:'id';",
    { id: attempt.orderId },
  );
  await service("audace_expire_orders", { p_limit: 200 });
  assert.equal(await settle(attempt), "review");
  const order = await get(attempt.orderId);
  assert.equal(order.payment, "paid");
  assert.equal(order.verified, true);
  assert.equal(order.allocation, "review");
  assert.equal(
    await db.query("select on_hand from audace_stock where sku_id=:'sku';", {
      sku: f.sku,
    }),
    "1",
  );
  await assert.rejects(
    admin("audace_admin_order_action", {
      p_order: attempt.orderId,
      p_action: "processing",
    }),
    /payment_review_required/,
  );
  await assert.rejects(
    admin(
      "audace_resolve_inventory",
      { p_order: attempt.orderId, p_reason: "Synthetic review" },
      operator,
    ),
    /Admin permission required/,
  );
  await admin("audace_resolve_inventory", {
    p_order: attempt.orderId,
    p_reason: "Approved allocation of actual test stock",
  });
  assert.equal((await get(attempt.orderId)).allocation, "allocated");
  assert.equal(
    await db.query("select on_hand from audace_stock where sku_id=:'sku';", {
      sku: f.sku,
    }),
    "0",
  );
  await assert.rejects(
    admin("audace_resolve_inventory", {
      p_order: attempt.orderId,
      p_reason: "Duplicate",
    }),
    /resolution_unavailable/,
  );
});

test("late payment never steals a final unit reserved by another buyer", async () => {
  const f = await fixture();
  const late = await f.start();
  await db.query(
    "update audace_orders set expires_at=now()-interval '1 second' where id=:'id'; update audace_reservations set expires_at=now()-interval '1 second' where order_id=:'id';",
    { id: late.orderId },
  );
  const other = await service("audace_payment_begin", {
    ...f.args,
    p_request: randomUUID(),
    p_access: "1".repeat(64),
  });
  assert.equal(await settle(late), "review");
  await assert.rejects(
    admin("audace_resolve_inventory", {
      p_order: late.orderId,
      p_reason: "No free inventory",
    }),
    /insufficient_stock/,
  );
  assert.equal(
    await settle(other, evidence(other, "success", "900000001")),
    "success",
  );
  assert.equal((await get(late.orderId)).allocation, "review");
});

test("terminal provider failure permits a new attempt and duplicate collection is isolated", async () => {
  const f = await fixture();
  const first = await f.start();
  assert.equal(await settle(first, evidence(first, "failed")), "failed");
  const second = await f.start();
  assert.notEqual(second.reference, first.reference);
  assert.equal(second.orderId, first.orderId);
  assert.equal(
    await settle(second, evidence(second, "success", "900000002")),
    "success",
  );
  assert.equal(
    await settle(first, evidence(first, "success", "900000003")),
    "review",
  );
  assert.equal((await get(first.orderId)).review, true);
  assert.equal(
    await db.query(
      "select count(*) from audace_movements where order_id=:'id';",
      { id: first.orderId },
    ),
    "1",
  );
});

test("webhook receipts deduplicate and durable job leases recover after failure", async () => {
  const f = await fixture();
  const attempt = await f.start();
  const event = {
    p_id: "a".repeat(64),
    p_type: "charge.success",
    p_ref: attempt.reference,
    p_provider: "990000001",
    p_evidence: { domain: "test", amount: 41245, currency: "GHS" },
  };
  assert.equal(await service("audace_payment_record_event", event), true);
  assert.equal(await service("audace_payment_record_event", event), false);
  let jobs = await service("audace_payment_claim_jobs", {
    p_limit: 1,
    p_attempt: attempt.attemptId,
  });
  assert.equal(jobs.length, 1);
  assert.deepEqual(
    await service("audace_payment_claim_jobs", {
      p_limit: 1,
      p_attempt: attempt.attemptId,
    }),
    [],
  );
  await service("audace_payment_finish_job", {
    p_attempt: attempt.attemptId,
    p_lease: jobs[0].lease,
    p_done: false,
    p_error: "provider_unavailable",
  });
  await db.query(
    "update audace_payment_jobs set next_at=now(),lease_until=now()-interval '1 second' where attempt_id=:'id';",
    { id: attempt.attemptId },
  );
  jobs = await service("audace_payment_claim_jobs", {
    p_limit: 1,
    p_attempt: attempt.attemptId,
  });
  assert.equal(jobs.length, 1);
  assert.equal(
    await settle(attempt, evidence(attempt, "success", "990000001")),
    "success",
  );
  await service("audace_payment_finish_job", {
    p_attempt: attempt.attemptId,
    p_lease: jobs[0].lease,
    p_done: true,
    p_error: null,
  });
  assert.equal(
    await db.query(
      "select state from audace_payment_jobs where attempt_id=:'id';",
      { id: attempt.attemptId },
    ),
    "done",
  );
});

test("a webhook arriving during a leased verification cannot lose its queued work", async () => {
  const f = await fixture();
  const attempt = await f.start();
  const [leased] = await service("audace_payment_claim_jobs", {
    p_limit: 1,
    p_attempt: attempt.attemptId,
  });
  await service("audace_payment_record_event", {
    p_id: "b".repeat(64),
    p_type: "charge.success",
    p_ref: attempt.reference,
    p_provider: "990000011",
    p_evidence: { domain: "test" },
  });
  await service("audace_payment_finish_job", {
    p_attempt: attempt.attemptId,
    p_lease: leased.lease,
    p_done: true,
    p_error: null,
  });
  const [next] = await service("audace_payment_claim_jobs", {
    p_limit: 1,
    p_attempt: attempt.attemptId,
  });
  assert.ok(next);
  assert.notEqual(next.lease, leased.lease);
  await service("audace_payment_finish_job", {
    p_attempt: attempt.attemptId,
    p_lease: leased.lease,
    p_done: true,
    p_error: null,
  });
  assert.equal(
    await db.query(
      "select state from audace_payment_jobs where attempt_id=:'id';",
      { id: attempt.attemptId },
    ),
    "ready",
  );
  await service("audace_payment_finish_job", {
    p_attempt: attempt.attemptId,
    p_lease: next.lease,
    p_done: true,
    p_error: null,
  });
  assert.equal(
    await db.query(
      "select state from audace_payment_jobs where attempt_id=:'id';",
      { id: attempt.attemptId },
    ),
    "done",
  );
  await Promise.all([
    service("audace_payment_record_event", {
      p_id: "c".repeat(64),
      p_type: "charge.success",
      p_ref: attempt.reference,
      p_provider: "990000011",
      p_evidence: { domain: "test" },
    }),
    admin("audace_admin_verify", { p_attempt: attempt.attemptId }),
    settle(attempt, evidence(attempt, "success", "990000011")),
  ]);
  assert.equal((await get(attempt.orderId)).payment, "paid");
});

test("refund reviews are owner-only, bounded, idempotent and do not claim refund completion", async () => {
  const f = await fixture();
  const attempt = await f.start();
  const provider = "990000002";
  await settle(attempt, evidence(attempt, "success", provider));
  const args = {
    p_request: randomUUID(),
    p_provider: provider,
    p_amount: 20000,
    p_reason: "Synthetic partial refund review",
  };
  await assert.rejects(
    admin("audace_request_refund_review", args, operator),
    /Admin permission required/,
  );
  const id = await admin("audace_request_refund_review", args);
  assert.equal(await admin("audace_request_refund_review", args), id);
  await assert.rejects(
    admin("audace_request_refund_review", {
      ...args,
      p_request: randomUUID(),
      p_amount: 30000,
    }),
    /invalid_refund_review/,
  );
  assert.equal(
    await db.query("select state from audace_refund_requests where id=:'id';", {
      id,
    }),
    "requested",
  );
  await assert.rejects(
    db.rpc("authenticated", stranger, "audace_admin_verify", {
      p_attempt: attempt.attemptId,
    }),
    /Admin permission required/,
  );
  const metrics = await admin("audace_admin_metrics");
  assert.ok(BigInt(metrics.revenue) > BigInt(0));
});

test("immutable payment totals and reused provider transactions cannot authorize another order", async () => {
  const firstFixture = await fixture();
  const secondFixture = await fixture();
  const first = await firstFixture.start();
  const second = await secondFixture.start();
  await assert.rejects(
    db.sql(
      "postgres",
      null,
      "update audace_payment_attempts set expected_pesewas=1 where id=$1",
      [first.attemptId],
    ),
    /immutable_payment/,
  );
  await assert.rejects(
    db.sql(
      "postgres",
      null,
      "update audace_orders set subtotal_pesewas=1 where id=$1",
      [first.orderId],
    ),
    /immutable_order/,
  );
  assert.equal(
    await settle(first, evidence(first, "success", "990000009")),
    "success",
  );
  assert.equal(
    await settle(second, evidence(second, "success", "990000009")),
    "review",
  );
  assert.equal((await get(second.orderId)).payment, "pending");
  assert.equal((await get(first.orderId)).review, true);
});

test("pending and abandoned payments release safely and stale observations cannot undo success", async () => {
  const f = await fixture();
  const first = await f.start();
  assert.equal(await settle(first, evidence(first, "pending")), "pending");
  assert.equal((await get(first.orderId)).verified, false);
  assert.equal(await settle(first, evidence(first, "abandoned")), "abandoned");
  assert.equal((await get(first.orderId)).payment, "failed");
  const retry = await f.start();
  assert.equal(
    await settle(retry, evidence(retry, "success", "990000010")),
    "success",
  );
  for (const status of ["pending", "failed", "abandoned"]) {
    assert.equal(
      await settle(retry, evidence(retry, status, "990000010")),
      "success",
    );
    assert.equal((await get(retry.orderId)).payment, "paid");
  }
  await assert.rejects(
    service("audace_payment_apply", {
      p_reference: "ADT-unrecognized",
      p_data: evidence(retry),
    }),
    /unknown_payment/,
  );
  await assert.rejects(
    db.sql(
      "authenticated",
      operator,
      "update audace_payment_attempts set provider_status='success' where id=$1",
      [retry.attemptId],
    ),
    /permission denied/,
  );
  assert.equal(
    await db.query(
      "select count(*) from audace_movements where order_id=:'id';",
      {
        id: retry.orderId,
      },
    ),
    "1",
  );
});
