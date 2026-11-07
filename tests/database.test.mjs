import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { startDatabase } from "./database/cluster.mjs";

const owner = "20000000-0000-4000-8000-000000000001";
const operator = "20000000-0000-4000-8000-000000000002";
const stranger = "20000000-0000-4000-8000-000000000003";
const sku = "30000000-0000-4000-8000-000000000001";
const method = "10000000-0000-4000-8000-000000000001";
const contact = { name:"Test Customer", email:"customer@example.test",phone:"+233200000000",
  region:"Greater Accra",city:"Accra",address:"Synthetic address",directions:"" };
const line = (quantity = 1, variantId = "audace-cr-ss", size = "Fixture A") => ({ variantId, size, quantity });
let db;

before(async () => { db = await startDatabase(); },{ timeout: 240_000 });
after(async () => { await db?.cleanup(); },{ timeout: 45_000 });

function as(role, subject = "") {
  return `set role ${role}; set request.jwt.claim.sub = '${subject}';\n`;
}

function pending(request, lines = [line()], customer = contact, delivery = method) {
  return db.query(as("service_role") + "select audace_place_pending(:'request',:'lines',:'delivery',:'contact');", {
    request, lines:JSON.stringify(lines), delivery, contact:JSON.stringify(customer),
  }).then(JSON.parse);
}

function quote(lines, region = "Greater Accra", delivery = method) {
  return db.query(as("anon") + "select audace_checkout_quote(:'lines',:'region',:'delivery');", {
    lines:JSON.stringify(lines),region,delivery,
  }).then(JSON.parse);
}

function adjust(previous, count, reason = "Synthetic test count", subject = operator) {
  return db.query(as("authenticated",subject) + "select audace_adjust_stock(:'sku',:'previous',:'count',:'reason');", {
    sku,previous,count,reason,
  });
}

test("migration, locked catalogue, idempotent seed and restrictive default grants", async () => {
  await db.reseed();
  const result = JSON.parse(await db.query(as("anon") + "select audace_public_shop();"));
  assert.equal(result.variants.length,7);
  assert.equal(result.variants.filter((v) => v.colour === "White").length,1);
  assert.ok(result.variants.every((v) => v.pricePesewas === null && v.sizes.length === 0 && v.images.length === 1));
  assert.deepEqual(result.methods,[]);
  await assert.rejects(db.query(as("anon") + "select * from audace_order_contacts;"),/permission denied/);
  await assert.rejects(db.query(as("anon") + "select audace_admin_metrics();"),/permission denied/);
  await db.file(fileURLToPath(new URL("./database/shop-fixture.sql",import.meta.url)));
  await db.reseed();
  const configured = JSON.parse(await db.query(as("anon") + "select audace_public_shop();"));
  assert.equal(configured.variants.length,6);
  assert.equal(configured.variants.find((v) => v.id === "audace-cr-ss").pricePesewas,39995);
  assert.equal(configured.methods[0].id,method);
});

test("role checks prevent escalation, unauthorized writes and customer-order access", async () => {
  assert.equal(await db.query(as("authenticated",stranger) + "select count(*) from audace_variants;"),"0");
  assert.equal(await db.query(as("authenticated",stranger) + "select coalesce(audace_admin_role(),'none');"),"none");
  assert.equal(await db.query(as("authenticated",owner) + "select audace_admin_role();"),"owner");
  await assert.rejects(db.query(as("authenticated",stranger) + "insert into audace_admins(user_id,role) values (auth.uid(),'owner');"),/permission denied/);
  await assert.rejects(db.query(as("authenticated",operator) + "select audace_set_variant('audace-cr-ss',1,true);"),/Admin permission required/);
  await assert.rejects(db.query(as("authenticated",owner) + "update audace_stock set on_hand=1;"),/permission denied/);
  await assert.rejects(db.query(as("authenticated",owner) + "select audace_finalize_verified(gen_random_uuid(),'x',1,'GHS');"),/permission denied/);
  await assert.rejects(db.query(as("anon") + "select audace_place_pending(gen_random_uuid(),'[]',gen_random_uuid(),'{}');"),/permission denied/);
  await assert.rejects(db.query("update audace_stock set on_hand=-1;"),/check constraint/);
  await assert.rejects(db.query(as("authenticated",owner) + "select audace_add_size('audace-cr-ls','Other','FIXTURE-CR-SS-A');"),/duplicate key/);
  await assert.rejects(db.query(as("authenticated",owner) + "select audace_add_size('audace-cr-ss','fixture a','FIXTURE-NEW');"),/duplicate key/);
  await db.query(as("authenticated",owner) + "select audace_set_product('first-release-shirt','Synthetic changed description',null,false);");
  assert.equal(JSON.parse(await db.query(as("anon") + "select audace_public_shop();")).variants.length,0);
  await db.query(as("authenticated",owner) + "select audace_set_product('first-release-shirt','Synthetic description',null,true); select audace_set_variant('audace-cr-ss',42000,true);");
  assert.equal(JSON.parse(await db.query(as("anon") + "select audace_public_shop();")).variants.find((v) => v.id === "audace-cr-ss").pricePesewas,42000);
  await db.query(as("authenticated",owner) + "select audace_set_variant('audace-cr-ss',39995,true);");
  await db.query(as("authenticated",owner) + "select audace_set_delivery(:'method','Greater Accra','Fixture courier',999,true);",{method});
  assert.equal((await quote([line()])).delivery,999);
  await db.query(as("authenticated",owner) + "select audace_set_delivery(:'method','Greater Accra','Fixture courier',1250,true);",{method});
  assert.match(await db.query(as("authenticated",owner) + "select audace_add_size('audace-bg-ss','Test size','FIXTURE-ADMIN-ADDED');"),/^[a-f0-9-]{36}$/);
});

test("authoritative quote checks every line, delivery region, prices and stock", async () => {
  assert.deepEqual(await quote([line(2),line(1,"audace-cr-ls")]), {
    subtotal:134890,delivery:1250,total:136140,deliveryLabel:"Fixture courier",
  });
  for (const bad of [line(0.5),line(0),line(100)]) await assert.rejects(quote([bad]),/invalid_items/);
  await assert.rejects(quote([line(),line()]),/invalid_items/);
  for (const bad of [line(1,"audace-bk-ls"),line(1,"audace-bg-ss","Test size"),line(1,"audace-cr-ss","missing"),line(5)]) {
    await assert.rejects(quote([bad]),/item_unavailable/);
  }
  await assert.rejects(quote([line()],"Ashanti"),/delivery_unavailable/);
  await assert.rejects(quote([line()],"Greater Accra",randomUUID()),/delivery_unavailable/);
  await assert.rejects(pending(randomUUID(),[line()],{ ...contact,phone:"123" }),/check constraint/);
  assert.equal(await db.query("select count(*) from audace_orders;"),"0");
});

test("final-unit concurrency, idempotent request, payment failure and stock adjustment audit", async () => {
  await adjust(4,1);
  const keys = [randomUUID(),randomUUID()];
  const outcomes = await Promise.allSettled(keys.map((key) => pending(key)));
  const winnerIndex = outcomes.findIndex((result) => result.status === "fulfilled");
  assert.ok(winnerIndex >= 0);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length,1);
  assert.match(outcomes[1 - winnerIndex].reason.message,/item_unavailable/);
  const order = outcomes[winnerIndex].value;
  assert.deepEqual(await pending(keys[winnerIndex]),order);
  await assert.rejects(pending(keys[winnerIndex],[line(2)]),/request_conflict/);
  assert.equal(order.payment,"pending");
  assert.match(order.reference,/^AD-[A-F0-9]{32}$/);
  assert.equal(await db.query(as("authenticated",stranger) + "select count(*) from audace_order_contacts;"),"0");
  assert.equal(await db.query(as("authenticated",operator) + "select count(*) from audace_order_contacts;"),"1");
  await assert.rejects(adjust(1,0),/stock_reserved/);
  await assert.rejects(adjust(4,5),/stock_changed/);
  await assert.rejects(db.query(as("authenticated",operator) + "select audace_admin_order_action(:'id','processing');",{id:order.id}),/invalid_transition/);
  assert.equal(await db.query(as("service_role") + "select audace_release_payment(:'id',true);",{id:order.id}),"t");
  assert.equal(await db.query(as("service_role") + "select audace_release_payment(:'id',true);",{id:order.id}),"f");
  assert.equal((await quote([line()])).total,41245);
  assert.equal(await db.query("select count(*) from audace_movements where actor is not null;"),"1");
});

test("expired stock recovers before the sweep and verified finalization is exact and idempotent", async () => {
  const expired = await pending(randomUUID());
  await db.query("update audace_orders set expires_at=now()-interval '1 second' where id=:'id'; update audace_reservations set expires_at=now()-interval '1 second' where order_id=:'id';",{id:expired.id});
  assert.equal((await quote([line()])).subtotal,39995);
  await assert.rejects(db.query(as("service_role") + "select audace_finalize_verified(:'id','late',41245,'GHS');",{id:expired.id}),/reservation_unavailable/);
  assert.equal(await db.query(as("service_role") + "select audace_expire_orders(100);"),"1");
  assert.equal(await db.query(as("service_role") + "select audace_expire_orders(100);"),"0");
  const order = await pending(randomUUID());
  const final = (amount, currency = "GHS") => db.query(as("service_role") + "select audace_finalize_verified(:'id','fixture-verification',:'amount',:'currency');",{
    id:order.id,amount,currency,
  });
  await assert.rejects(final(1),/payment_mismatch/);
  await assert.rejects(final(41245,"USD"),/payment_mismatch/);
  assert.equal(await final(41245),"t");
  assert.equal(await final(41245),"f");
  assert.equal(await db.query("select on_hand from audace_stock where sku_id=:'sku';",{sku}),"0");
  assert.equal(await db.query("select count(*) from audace_movements where order_id=:'id';",{id:order.id}),"1");
  await assert.rejects(db.query(as("authenticated",operator) + "select audace_admin_order_action(:'id','delivered');",{id:order.id}),/invalid_transition/);
  for (const action of ["processing","shipped","delivered"]) await db.query(as("authenticated",operator) + "select audace_admin_order_action(:'id',:'action');",{id:order.id,action});
  const metrics = JSON.parse(await db.query(as("authenticated",operator) + "select audace_admin_metrics();"));
  assert.equal(metrics.revenue,"41245");
  assert.equal(metrics.paid,1);
  assert.equal(metrics.fulfilment,0);
});
