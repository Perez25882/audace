import type { Variant } from "./shop-model";

export type BagItem = { variantId: string; size: string; quantity: number };
type StockVariant = Pick<Variant, "id" | "published" | "pricePesewas" | "sizes">;
export const BAG_KEY = "audace-bag";
const MAX_QUANTITY = 99;
const MAX_LINES = 100;

export function isPesewas(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const wholeNumber = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 });

export function formatGhs(pesewas: number) {
  const amount = BigInt(pesewas);
  return `GHS ${wholeNumber.format(amount / BigInt(100))}.${String(amount % BigInt(100)).padStart(2, "0")}`;
}

export function availability(variant: StockVariant) {
  if (!variant.published) return "unavailable";
  if (!isPesewas(variant.pricePesewas) || !variant.sizes.length) {
    return "unconfigured";
  }
  if (variant.sizes.some(({ label }) => quantityLimit(variant, label) > 0)) return "available";
  return variant.sizes.some(({ stock }) => !isPesewas(stock)) ? "unconfigured" : "unavailable";
}

export function quantityLimit(variant: StockVariant, size: string) {
  const stock = variant.sizes.find(({ label }) => label === size)?.stock;
  return variant.published && isPesewas(variant.pricePesewas) && isPesewas(stock)
    ? Math.min(stock, MAX_QUANTITY)
    : 0;
}

export function lineKey({ variantId, size }: Pick<BagItem, "variantId" | "size">) {
  return JSON.stringify([variantId, size]);
}

export function decodeBag(raw: string | null): readonly BagItem[] {
  if (!raw || raw.length > 50_000) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1
      || !("items" in data) || !Array.isArray(data.items)) return [];

    const lines = new Map<string, BagItem>();
    for (const item of data.items.slice(0, MAX_LINES)) {
      if (!item || typeof item.variantId !== "string" || !/^[a-z0-9-]{1,80}$/.test(item.variantId)
        || typeof item.size !== "string" || !item.size.trim() || item.size.length > 40
        || !isPesewas(item.quantity) || item.quantity === 0) continue;

      const key = lineKey(item);
      const quantity = Math.min(MAX_QUANTITY, (lines.get(key)?.quantity ?? 0) + item.quantity);
      lines.set(key, { variantId: item.variantId, size: item.size, quantity });
    }
    return [...lines.values()];
  } catch {
    return [];
  }
}

export function quantityInBag(items: readonly BagItem[], variantId: string, size: string) {
  return items.find((item) => item.variantId === variantId && item.size === size)?.quantity ?? 0;
}

export function setBagQuantity(items: readonly BagItem[], item: BagItem, variant?: StockVariant) {
  const key = lineKey(item);
  const index = items.findIndex((existing) => lineKey(existing) === key);
  if (!isPesewas(item.quantity)) return null;
  if (item.quantity === 0) return items.filter((existing) => lineKey(existing) !== key);

  if (index < 0 || item.quantity > items[index].quantity) {
    if (!variant || variant.id !== item.variantId || item.quantity > quantityLimit(variant, item.size)) return null;
    if (index < 0 && items.length >= MAX_LINES) return null;
  }

  return index < 0 ? [...items, item] : items.map((existing, position) => position === index ? item : existing);
}

export function quoteBag(items: readonly BagItem[], variants: readonly Variant[]) {
  let subtotal: number | null = 0;
  const seen = new Set<string>();
  const lines = items.map((item) => {
    const key = lineKey(item);
    const duplicate = seen.has(key);
    seen.add(key);
    const validQuantity = isPesewas(item.quantity) && item.quantity > 0;
    const variant = variants.find((candidate) => candidate.id === item.variantId && candidate.published);
    const unit = variant?.pricePesewas;
    const lineAmount = validQuantity && isPesewas(unit) ? unit * item.quantity : null;
    const lineTotal = isPesewas(lineAmount) ? lineAmount : null;
    const available = !duplicate && !!variant && item.quantity <= quantityLimit(variant, item.size) && lineTotal !== null;
    const sum: number | null = subtotal !== null && lineTotal !== null ? subtotal + lineTotal : null;
    subtotal = isPesewas(sum) ? sum : null;
    return { item, variant, lineTotal, available };
  });
  return { lines, subtotal, ready: lines.length > 0 && subtotal !== null && lines.every(({ available }) => available) };
}
