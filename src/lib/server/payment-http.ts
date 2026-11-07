import "server-only";

import { NextResponse } from "next/server";
import { parseProviderJson } from "@/lib/payments/security";
import { paymentConfig } from "./paystack";
import { observe } from "./observe";

export async function boundedBody(request: Request, maximum: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maximum) throw new Error("request_too_large");
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel().catch(() => null);
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function customerRequest(request: Request) {
  const config = paymentConfig();
  if (
    request.headers.get("origin") !== config.appOrigin ||
    !request.headers.get("content-type")?.startsWith("application/json")
  ) {
    throw new Error("invalid_origin");
  }
  return parseProviderJson(
    (await boundedBody(request, 24_000)).toString("utf8"),
  );
}

export function paymentResponse(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function paymentError(error: unknown) {
  observe("payment_retry", { code: "checkout_rejected" });
  const code = error instanceof Error ? error.message : "";
  if (
    error instanceof SyntaxError ||
    [
      "invalid_request",
      "request_too_large",
      "invalid_checkout",
      "invalid_provider_data",
    ].includes(code)
  )
    return paymentResponse(
      { error: "Check your checkout details and try again." },
      400,
    );
  if (code === "invalid_origin")
    return paymentResponse({ error: "Request could not be accepted." }, 403);
  if (code === "rate_limited")
    return paymentResponse({ error: "Please wait before trying again." }, 429);
  if (code === "order_access_denied")
    return paymentResponse({ error: "Order access is unavailable." }, 404);
  if (
    [
      "price_changed",
      "request_conflict",
      "item_unavailable",
      "delivery_unavailable",
      "retry_unavailable",
      "order_review_required",
    ].includes(code)
  ) {
    return paymentResponse(
      {
        error:
          "Your selections need review. Open your bag to confirm current prices and availability.",
      },
      409,
    );
  }
  return paymentResponse(
    { error: "Checkout is temporarily unavailable. Please try again shortly." },
    503,
  );
}
