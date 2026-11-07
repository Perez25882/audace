import "server-only";

import { normaliseGhanaPhone, validateCheckout } from "@/lib/checkout";
import { parseCheckout, parseLines, uuidPattern } from "@/lib/checkout-input";
import { isPesewas } from "@/lib/bag";
import { getShop } from "./shop";
import { dataClient } from "./supabase";

type ReviewError = ReturnType<typeof validateCheckout>;
export type ReviewResult =
  | { status: "invalid"; errors: ReviewError }
  | { status: "unavailable" }
  | { status: "reviewed"; subtotal: number; delivery: number; total: number };

async function checkedInput(rawLines: unknown, rawContact: unknown) {
  const contact = parseCheckout(rawContact);
  const lines = parseLines(rawLines);
  if (!contact || !lines) return { status: "unavailable" } as const;
  const shop = await getShop();
  if (shop.mode !== "connected") return { status: "unavailable" } as const;
  const options = shop.methods.filter(({ regions }) => regions.some((region) => region === contact.region));
  const errors = validateCheckout(contact, options);
  if (Object.keys(errors).length || !uuidPattern.test(contact.method)) {
    return { status: "invalid", errors } as const;
  }
  return { status: "valid", contact, lines } as const;
}

export async function reviewOrder(rawLines: unknown, rawContact: unknown): Promise<ReviewResult> {
  try {
    const input = await checkedInput(rawLines, rawContact);
    if (input.status !== "valid") return input;
    const { data, error } = await dataClient().rpc("audace_checkout_quote", {
      p_lines: input.lines, p_region: input.contact.region, p_delivery: input.contact.method,
    }).abortSignal(AbortSignal.timeout(5000));
    if (error || !data || !isPesewas(data.subtotal) || !isPesewas(data.delivery) || !isPesewas(data.total)) {
      return { status: "unavailable" };
    }
    return { status: "reviewed", subtotal: data.subtotal, delivery: data.delivery, total: data.total };
  } catch {
    return { status: "unavailable" };
  }
}

// Internal integration boundary for a future trusted payment initializer. Public checkout only calls reviewOrder.
export async function reservePendingOrder(requestId: string, rawLines: unknown, rawContact: unknown) {
  if (!uuidPattern.test(requestId)) throw new Error("Invalid order request identifier.");
  const values = parseCheckout(rawContact);
  const lines = parseLines(rawLines);
  if (!values || !lines || !uuidPattern.test(values.method) || Object.keys(validateCheckout(values)).length) {
    throw new Error("Order details are unavailable or invalid.");
  }
  const { method, ...contact } = values;
  const { data, error } = await dataClient(true).rpc("audace_place_pending", {
    p_request: requestId, p_lines: lines, p_delivery: method,
    p_contact: { ...contact, email: contact.email.toLowerCase(), phone: normaliseGhanaPhone(contact.phone) },
  }).abortSignal(AbortSignal.timeout(8000));
  if (error || !data) throw new Error("The order could not be reserved.");
  return data as { id: string; reference: string; payment: string; total: number; expiresAt: string };
}
