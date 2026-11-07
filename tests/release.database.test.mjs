import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { startDatabase } from "./database/cluster.mjs";
const owner = "20000000-0000-4000-8000-000000000001",
  operator = "20000000-0000-4000-8000-000000000002",
  stranger = "20000000-0000-4000-8000-000000000003";
const method = "10000000-0000-4000-8000-000000000001",
  nil = "00000000-0000-4000-8000-000000000001";
let db;
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
const service = (name, args = {}) => db.rpc("service_role", null, name, args);
const admin = (name, args = {}, who = owner) =>
  db.rpc("authenticated", who, name, args);
async function order(size = "Fixture A") {
  const a = await service("audace_payment_begin", {
    p_request: randomUUID(),
    p_access: "e".repeat(64),
    p_lines: [{ variantId: "audace-cr-ss", size, quantity: 1 }],
    p_delivery: method,
    p_expected: 41245,
    p_contact: {
      name: "Synthetic QA buyer",
      email: "qa@example.test",
      phone: "+233200000000",
      region: "Greater Accra",
      city: "Accra",
      address: "Synthetic QA address",
      directions: "",
    },
  });
  return a;
}
function evidence(a, id, status = "success") {
  return {
    providerId: id,
    reference: a.reference,
    domain: "test",
    currency: "GHS",
    amount: 41245,
    status,
    orderId: a.orderId,
    attemptId: a.attemptId,
    email: "qa@example.test",
    channel: "card",
    paidAt: new Date().toISOString(),
  };
}
const apply = (a, id, status) =>
  service("audace_payment_apply", {
    p_reference: a.reference,
    p_data: evidence(a, id, status),
  });

test("all sensitive administration operations reject guests and non-staff; owner operations reject operators", async () => {
  const operations = [
    [
      "audace_set_product",
      {
        p_id: "audace-shirt",
        p_description: "Synthetic",
        p_size_guide: "",
        p_published: true,
      },
      true,
    ],
    [
      "audace_set_variant",
      { p_id: "audace-cr-ss", p_price: 1, p_published: true },
      true,
    ],
    [
      "audace_add_size",
      { p_variant: "audace-cr-ss", p_size: "Audit", p_code: "AUDIT-DENIED" },
      true,
    ],
    ["audace_set_size_active", { p_id: nil, p_active: false }, true],
    [
      "audace_adjust_stock",
      { p_sku: nil, p_expected: 0, p_count: 1, p_reason: "Synthetic" },
      false,
    ],
    [
      "audace_set_delivery",
      {
        p_id: method,
        p_region: "Greater Accra",
        p_label: "Synthetic",
        p_fee: 1,
        p_active: true,
      },
      true,
    ],
    [
      "audace_set_settings",
      { p_threshold: 1, p_shipping_returns: "Synthetic" },
      true,
    ],
    [
      "audace_admin_order_action",
      { p_order: nil, p_action: "processing" },
      false,
    ],
    [
      "audace_admin_inventory",
      { p_search: "", p_filter: "", p_offset: 0 },
      false,
    ],
    ["audace_admin_metrics", {}, false],
    [
      "audace_admin_payments",
      { p_search: "", p_filter: "", p_offset: 0 },
      false,
    ],
    ["audace_admin_payment_detail", { p_order: nil }, false],
    ["audace_admin_verify", { p_attempt: nil }, false],
    ["audace_resolve_inventory", { p_order: nil, p_reason: "Synthetic" }, true],
    [
      "audace_request_refund_review",
      {
        p_request: randomUUID(),
        p_provider: "1",
        p_amount: 1,
        p_reason: "Synthetic",
      },
      true,
    ],
  ];
  for (const [name, args, ownerOnly] of operations) {
    await assert.rejects(
      db.rpc("anon", null, name, args),
      /permission denied/,
      name + " guest",
    );
    await assert.rejects(
      admin(name, args, stranger),
      /Admin permission required/,
      name + " customer",
    );
    if (ownerOnly)
      await assert.rejects(
        admin(name, args, operator),
        /Admin permission required/,
        name + " operator",
      );
  }
  for (const name of ["audace_operational_health", "audace_worker_heartbeat"]) {
    const args = name.endsWith("heartbeat")
      ? { p_claimed: 0, p_processed: 0 }
      : {};
    await assert.rejects(admin(name, args), /permission denied/);
    await assert.rejects(db.rpc("anon", null, name, args), /permission denied/);
  }
  const tables = await db.sql(
    "postgres",
    null,
    "select tablename from pg_tables where schemaname='public' and tablename like 'audace_%'",
  );
  for (const { tablename } of tables) {
    if (tablename === "audace_admins") {
      await assert.rejects(
        db.sql(
          "authenticated",
          stranger,
          'select * from public."' + tablename + '"',
        ),
        /permission denied/,
      );
      continue;
    }
    assert.equal(
      (
        await db.sql(
          "authenticated",
          stranger,
          'select count(*)::int as count from public."' + tablename + '"',
        )
      )[0].count,
      0,
      tablename,
    );
    await assert.rejects(
      db.sql("anon", null, 'select * from public."' + tablename + '"'),
      /permission denied/,
      tablename,
    );
  }
});

test("worker health is private and exposes stale, failed and review work without personal data", async () => {
  const before = await service("audace_operational_health");
  assert.equal(before.workerRecent, false);
  await service("audace_worker_heartbeat", { p_claimed: 0, p_processed: 0 });
  const health = await service("audace_operational_health");
  assert.equal(health.status, "healthy");
  assert.ok(health.workerRecent);
  const a = await order();
  await db.sql(
    "postgres",
    null,
    "update audace_payment_jobs set next_at=now()-interval '6 minutes',last_error='provider_unavailable' where attempt_id=$1",
    [a.attemptId],
  );
  const stale = await service("audace_operational_health");
  assert.equal(stale.status, "degraded");
  assert.equal(stale.overdueJobs, 1);
  assert.equal(stale.retryJobs, 1);
  assert.ok(!JSON.stringify(stale).includes("qa@example.test"));
  await db.sql(
    "postgres",
    null,
    "update audace_payment_jobs set next_at=now(),last_error=null where attempt_id=$1",
    [a.attemptId],
  );
  await service("audace_release_payment", {
    p_order: a.orderId,
    p_failed: true,
  });
});

test("reversals and signed financial observations remain durable after processing, shipping and delivery", async () => {
  for (const [index, state] of [
    "processing",
    "shipped",
    "delivered",
  ].entries()) {
    const a = await order();
    const id = String(7770000 + index);
    await apply(a, id);
    for (const step of ["processing", "shipped", "delivered"]) {
      await admin(
        "audace_admin_order_action",
        { p_order: a.orderId, p_action: step },
        operator,
      );
      if (step === state) break;
    }
    assert.equal(
      await service("audace_payment_record_event", {
        p_id: String(index + 1).repeat(64),
        p_type: "charge.dispute.create",
        p_ref: a.reference,
        p_provider: String(8880000 + index),
        p_evidence: { domain: "test" },
      }),
      true,
    );
    assert.equal(await apply(a, id, "reversed"), "review");
    const rows = await db.sql(
      "postgres",
      null,
      "select financial_review,fulfilment_status from audace_orders where id=$1",
      [a.orderId],
    );
    assert.equal(rows[0].financial_review, true);
    assert.equal(rows[0].fulfilment_status, state);
    if (state !== "delivered")
      await assert.rejects(
        admin(
          "audace_admin_order_action",
          {
            p_order: a.orderId,
            p_action: state === "processing" ? "shipped" : "delivered",
          },
          operator,
        ),
        /payment_review_required/,
      );
    assert.equal(
      (
        await db.sql(
          "postgres",
          null,
          "select count(*)::int as count from audace_movements where order_id=$1",
          [a.orderId],
        )
      )[0].count,
      1,
    );
  }
  assert.equal((await admin("audace_admin_metrics")).revenue, "0");
});

test("native backup restores financial rows, stock, functions, RLS and replay safety into an isolated database", async () => {
  const a = await order();
  await apply(a, "7770099");
  const before = await db.sql(
    "postgres",
    null,
    "select on_hand from audace_stock where sku_id='30000000-0000-4000-8000-000000000001'",
  );
  await db.withRestoredCopy(async (restored) => {
    assert.deepEqual(
      await restored.sql(
        "postgres",
        null,
        "select on_hand from audace_stock where sku_id='30000000-0000-4000-8000-000000000001'",
      ),
      before,
    );
    const paid = await restored.sql(
      "postgres",
      null,
      "select provider_id,amount_pesewas from audace_payment_receipts where order_id=$1",
      [a.orderId],
    );
    assert.equal(paid[0].provider_id, "7770099");
    assert.equal(paid[0].amount_pesewas, "41245");
    assert.equal(
      (
        await restored.sql(
          "authenticated",
          stranger,
          "select count(*)::int as count from audace_order_contacts",
        )
      )[0].count,
      0,
    );
    const replay = await restored.sql(
      "service_role",
      null,
      "select audace_payment_apply($1,$2) as state",
      [a.reference, JSON.stringify(evidence(a, "7770099"))],
    );
    assert.equal(replay[0].state, "success");
    assert.deepEqual(
      await restored.sql(
        "postgres",
        null,
        "select on_hand from audace_stock where sku_id='30000000-0000-4000-8000-000000000001'",
      ),
      before,
    );
  });
  await writeFile(
    new URL("../work/phase-5-restore.json", import.meta.url),
    JSON.stringify(
      {
        engine: "PostgreSQL 17",
        target: "disposable second database",
        result: "PASS",
        checks: ["payment evidence", "stock", "function replay", "RLS"],
      },
      null,
      2,
    ),
  );
});

test("owner inventory resolution retains a permitted long audit reason atomically", async () => {
  const size = "Resolution reason fixture";
  const sku = await admin("audace_add_size", {
    p_variant: "audace-cr-ss",
    p_size: size,
    p_code: "QA-RESOLUTION-REASON",
  });
  await admin("audace_adjust_stock", {
    p_sku: sku,
    p_expected: 0,
    p_count: 1,
    p_reason: "Synthetic QA stock",
  });
  const a = await order(size);
  await db.sql(
    "postgres",
    null,
    "update audace_orders set expires_at=now()-interval '1 second' where id=$1",
    [a.orderId],
  );
  assert.equal(await apply(a, "7770098"), "review");
  const reason = "Synthetic QA resolution ".padEnd(300, "x");
  await admin("audace_resolve_inventory", {
    p_order: a.orderId,
    p_reason: reason,
  });
  const rows = await db.sql(
    "postgres",
    null,
    "select reason,balance from audace_movements where order_id=$1",
    [a.orderId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, reason);
  assert.equal(rows[0].balance, 0);
  await assert.rejects(
    admin("audace_resolve_inventory", { p_order: a.orderId, p_reason: reason }),
    /resolution_unavailable/,
  );
});
