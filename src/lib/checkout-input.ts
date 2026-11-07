import { checkoutFields, type CheckoutValues } from "./checkout";
import { lineKey, type BagItem } from "./bag";

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseLines(value: unknown): BagItem[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const seen = new Set<string>();
  const result: BagItem[] = [];
  for (const item of value) {
    if (!item || typeof item.variantId !== "string" || !/^[a-z0-9-]{1,80}$/.test(item.variantId)
      || typeof item.size !== "string" || !item.size.trim() || item.size.length > 40
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return null;
    const line = { variantId: item.variantId, size: item.size, quantity: item.quantity };
    const key = lineKey(line);
    if (seen.has(key)) return null;
    seen.add(key);
    result.push(line);
  }
  return result.sort((a, b) => lineKey(a).localeCompare(lineKey(b)));
}

export function parseCheckout(value: unknown): CheckoutValues | null {
  if (!value || typeof value !== "object") return null;
  const fields = value as Record<string, unknown>;
  const result = {} as CheckoutValues;
  for (const key of Object.keys(checkoutFields) as (keyof CheckoutValues)[]) {
    const field = fields[key];
    if (typeof field !== "string" || field.length > checkoutFields[key] || field.includes("\0")) return null;
    result[key] = field.trim();
  }
  return result;
}
