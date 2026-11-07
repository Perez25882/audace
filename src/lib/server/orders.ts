import "server-only";

import { validateCheckout } from "@/lib/checkout";
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
  const options = shop.methods.filter(({ regions }) =>
    regions.some((region) => region === contact.region),
  );
  const errors = validateCheckout(contact, options);
  if (Object.keys(errors).length || !uuidPattern.test(contact.method)) {
    return { status: "invalid", errors } as const;
  }
  return { status: "valid", contact, lines } as const;
}

export async function reviewOrder(
  rawLines: unknown,
  rawContact: unknown,
): Promise<ReviewResult> {
  try {
    const input = await checkedInput(rawLines, rawContact);
    if (input.status !== "valid") return input;
    const { data, error } = await dataClient()
      .rpc("audace_checkout_quote", {
        p_lines: input.lines,
        p_region: input.contact.region,
        p_delivery: input.contact.method,
      })
      .abortSignal(AbortSignal.timeout(5000));
    if (
      error ||
      !data ||
      !isPesewas(data.subtotal) ||
      !isPesewas(data.delivery) ||
      !isPesewas(data.total)
    ) {
      return { status: "unavailable" };
    }
    return {
      status: "reviewed",
      subtotal: data.subtotal,
      delivery: data.delivery,
      total: data.total,
    };
  } catch {
    return { status: "unavailable" };
  }
}
