import assert from "node:assert/strict";
import { test } from "node:test";
import { availability, decodeBag, formatGhs, quantityInBag, quoteBag, setBagQuantity, type BagItem } from "../src/lib/bag";
import { checkoutQuote, normaliseGhanaPhone, validateCheckout, type CheckoutValues } from "../src/lib/checkout";
import { merchant } from "../src/lib/merchant-config";
import { selectColourVariant, type DeliveryMethod, type Variant } from "../src/lib/shop-model";

// Fictional amounts and stock for isolated tests.
const first: Variant = {
  id: "fixture-a", sku: "FIXTURE-A", name: "Fixture garment", slug: "fixture-a", colour: "Cream", sleeve: "Short sleeve",
  published: true, pricePesewas: 39995, sizes: [{ label: "Fixture A", stock: 4 }, { label: "Fixture B", stock: 2 }],
  images: [{ src: "/fixture.webp", width: 100, height: 100, alt: "Fixture", label: "Front" }],
  description: "Fixture", specifications: [], sizeGuide: null,
};
const second: Variant = { ...first, id: "fixture-b", sku: "FIXTURE-B", colour: "Black", pricePesewas: 54900 };
const methods: DeliveryMethod[] = [{ id: "fixture", label: "Fixture courier", feePesewas: 1250, regions: ["Greater Accra"] }];
const details: CheckoutValues = {
  name: "Sample Customer", email: "example@example.test", phone: "020 000 0000",
  region: "Greater Accra", city: "Accra", address: "Fixture address", directions: "", method: "fixture",
};

const item = (variant: Variant, quantity: number, size = "Fixture A"): BagItem => ({ variantId: variant.id, size, quantity });

test("colour selection retains the sleeve when possible and uses the actual White short sleeve", () => {
  const white = { ...first, id: "fixture-white", colour: "White", sleeve: "Short sleeve" } as const;
  const long = { ...first, id: "fixture-long", sleeve: "Long sleeve" } as const;
  assert.equal(selectColourVariant([first, long, white], "Cream", "Long sleeve"), long);
  assert.equal(selectColourVariant([first, long, white], "White", "Long sleeve"), white);
  assert.equal(selectColourVariant([first, long, white], "Burgundy", "Long sleeve"), undefined);
});

test("the supplied merchant configuration publishes no commercial values", () => {
  assert.deepEqual(merchant.variants, {});
  assert.deepEqual(merchant.deliveryMethods, []);
  assert.equal(merchant.shippingReturns, null);
});

test("unconfirmed prices, sizes, stock and unpublished items cannot be added", () => {
  for (const variant of [
    { ...first, pricePesewas: null },
    { ...first, sizes: [] },
    { ...first, sizes: [{ label: "Fixture A", stock: null }] },
    { ...first, sizes: [{ label: "Fixture A", stock: 0 }] },
    { ...first, published: false },
  ]) {
    assert.notEqual(availability(variant), "available");
    assert.equal(setBagQuantity([], item(variant, 1), variant), null);
    assert.equal(quoteBag([item(variant, 1)], [variant]).ready, false);
  }
  assert.equal(availability({ ...first, sizes: [{ label: "Fixture A", stock: 0 }, { label: "Fixture B", stock: null }] }), "unconfigured");
  assert.equal(availability(first), "available");
});

test("the bag distinguishes variants and sizes and validates changes against stock", () => {
  const one = setBagQuantity([], item(first, 2), first)!;
  const two = setBagQuantity(one, item(second, 1), second)!;
  const three = setBagQuantity(two, item(first, 1, "Fixture B"), first)!;
  assert.equal(three.length, 3);
  assert.equal(quantityInBag(three, first.id, "Fixture A"), 2);
  assert.equal(setBagQuantity(three, item(first, 5), first), null);
  assert.equal(setBagQuantity(three, item(first, 1, "Unknown"), first), null);
  const edited = setBagQuantity(three, item(first, 4), first)!;
  assert.equal(quantityInBag(edited, first.id, "Fixture A"), 4);
  assert.deepEqual(setBagQuantity(edited, item(second, 0)), [item(first, 4), item(first, 1, "Fixture B")]);
  assert.equal(setBagQuantity(edited, item(first, 1), { ...first, sizes: [] })?.[0].quantity, 1);
});

test("bag persistence handles bad payloads, duplicate lines and old versions safely", () => {
  assert.deepEqual(decodeBag("{"), []);
  assert.deepEqual(decodeBag(JSON.stringify({ version: 0, items: [item(first, 1)] })), []);
  assert.deepEqual(decodeBag(JSON.stringify({ version: 1, items: [item(first, 2), item(first, 3), item(second, 1), item(second, -1), null] })), [item(first, 5), item(second, 1)]);
  assert.deepEqual(decodeBag(JSON.stringify({ version: 1, items: [item(first, 1)] })), [item(first, 1)]);
  const outdated = quoteBag([item(first, 1)], []);
  assert.equal(outdated.ready, false);
  assert.equal(outdated.subtotal, null);
});

test("subtotals and delivery are calculated in integer pesewas", () => {
  const items = [item(first, 2), item(second, 1)];
  const quote = quoteBag(items, [first, second]);
  assert.equal(quote.subtotal, 134890);
  assert.equal(formatGhs(quote.subtotal), "GHS 1,348.90");
  assert.equal(formatGhs(0), "GHS 0.00");
  assert.equal(formatGhs(Number.MAX_SAFE_INTEGER), "GHS 90,071,992,547,409.91");
  assert.equal(checkoutQuote(items, [first, second], methods, details.region, details.method).total, 136140);
  assert.equal(quoteBag([item(first, 2)], [{ ...first, pricePesewas: Number.MAX_SAFE_INTEGER }]).subtotal, null);
});

test("checkout blocks missing or stale pricing, inventory, delivery configuration and method mismatches", () => {
  const items = [item(first, 1)];
  assert.equal(checkoutQuote(items, [first], methods, details.region, details.method).canReview, true);
  assert.equal(checkoutQuote(items, [first], [], details.region, details.method).canReview, false);
  assert.equal(checkoutQuote(items, [first], methods, "Ashanti", details.method).canReview, false);
  assert.equal(checkoutQuote(items, [first], methods, details.region, "wrong-id").canReview, false);
  assert.equal(checkoutQuote(items, [{ ...first, pricePesewas: null }], methods, details.region, details.method).canReview, false);
  assert.equal(checkoutQuote([item(first, 5)], [first], methods, details.region, details.method).canReview, false);
  assert.equal(checkoutQuote([], [first], methods, details.region, details.method).canReview, false);
  assert.equal(checkoutQuote([item(first, 0.4)], [first], methods, details.region, details.method).canReview, false);
  assert.equal(checkoutQuote([item(first, 3), item(first, 3)], [first], methods, details.region, details.method).canReview, false);
});

test("guest details validate and Ghanaian contact numbers normalise to +233", () => {
  assert.deepEqual(validateCheckout(details, methods), {});
  assert.equal(normaliseGhanaPhone("020 000 0000"), "+233200000000");
  assert.equal(normaliseGhanaPhone("+233 30 000 0000"), "+233300000000");
  assert.equal(normaliseGhanaPhone("00233-50-000-0000"), "+233500000000");
  assert.equal(normaliseGhanaPhone("+1 202 555 0100"), null);
  assert.equal(normaliseGhanaPhone("02012345"), null);
  assert.deepEqual(Object.keys(validateCheckout({ ...details, name: "", email: "not-an-email", phone: "wrong", region: "", city: "", address: "", method: "" }, methods)), ["name", "email", "phone", "region", "city", "address", "method"]);
});
