import { isPesewas, quoteBag, type BagItem } from "./bag";
import { regions, type DeliveryMethod, type Region, type Variant } from "./shop-model";

export type CheckoutValues = {
  name: string; email: string; phone: string; region: string;
  city: string; address: string; directions: string; method: string;
};

export const checkoutFields = {
  name: 100, email: 254, phone: 32, region: 32,
  city: 100, address: 240, directions: 400, method: 80,
} satisfies Record<keyof CheckoutValues, number>;

export function normaliseGhanaPhone(value: string) {
  const phone = value.trim().replace(/[\s()-]/g, "");
  const local = /^(?:0|\+233|00233)([235]\d{8})$/.exec(phone);
  return local ? `+233${local[1]}` : null;
}

export function deliveryOptions(methods: readonly DeliveryMethod[], region: string) {
  if (!regions.includes(region as Region)) return [];
  return methods.filter((method) => method.regions.some((name) => name === region) && isPesewas(method.feePesewas));
}

export function checkoutQuote(
  items: readonly BagItem[], variants: readonly Variant[], methods: readonly DeliveryMethod[],
  region: string, methodId: string,
) {
  const bag = quoteBag(items, variants);
  const options = deliveryOptions(methods, region);
  const method = options.find(({ id }) => id === methodId);
  const sum = bag.subtotal !== null && method ? bag.subtotal + method.feePesewas : null;
  const total = isPesewas(sum) ? sum : null;
  return { ...bag, options, method, total, canReview: bag.ready && !!method && total !== null };
}

export function validateCheckout(values: CheckoutValues, options: readonly DeliveryMethod[]) {
  const errors: Partial<Record<keyof CheckoutValues, string>> = {};
  for (const field of Object.keys(checkoutFields) as (keyof CheckoutValues)[]) {
    if (values[field].trim().length > checkoutFields[field]) errors[field] = "This entry is too long.";
  }

  if (!values.name.trim()) errors.name = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(values.email.trim())) errors.email = "Enter a valid email address.";
  if (!normaliseGhanaPhone(values.phone)) errors.phone = "Enter a Ghanaian number beginning with 0 or +233.";
  if (!regions.includes(values.region as Region)) errors.region = "Select your delivery region.";
  if (!values.city.trim()) errors.city = "Enter your town or city.";
  if (!values.address.trim()) errors.address = "Enter your delivery address.";
  if (!options.some(({ id }) => id === values.method)) errors.method = "Select an available delivery method.";

  return errors;
}
