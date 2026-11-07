"use server";

import { reviewOrder, type ReviewResult } from "@/lib/server/orders";
import { withinLimit } from "@/lib/server/rate-limit";

export async function reviewDelivery(lines: unknown, contact: unknown): Promise<ReviewResult> {
  if (!withinLimit("checkout-review", 180)) return { status: "unavailable" };
  return reviewOrder(lines, contact);
}
