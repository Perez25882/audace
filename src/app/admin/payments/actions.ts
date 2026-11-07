"use server";

import { redirect } from "next/navigation";
import { uuidPattern } from "@/lib/checkout-input";
import { parseGhs } from "@/lib/bag";
import { requireAdmin } from "@/lib/server/admin";
import { runPaymentJobs } from "@/lib/server/payment-service";

function text(form: FormData, key: string, max: number) {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("invalid_input");
  return value.trim();
}
function id(form: FormData, key: string) {
  const value = text(form, key, 36);
  if (!uuidPattern.test(value)) throw new Error("invalid_input");
  return value;
}

export async function reverifyPayment(form: FormData) {
  const { client } = await requireAdmin();
  let result = "error";
  try {
    const attemptId = id(form, "attempt");
    const { error } = await client.rpc("audace_admin_verify", {
      p_attempt: attemptId,
    });
    if (!error) {
      result = "queued";
      await runPaymentJobs(attemptId);
      result = "checked";
    }
  } catch {
    /* The queued verification remains durable during provider failures. */
  }
  redirect(`/admin/payments?result=${result}`);
}

export async function resolveInventory(form: FormData) {
  const { client, role } = await requireAdmin();
  let order = "";
  let result = "error";
  try {
    order = id(form, "order");
    if (role !== "owner") throw new Error("permission_denied");
    const { error } = await client.rpc("audace_resolve_inventory", {
      p_order: order,
      p_reason: text(form, "reason", 500),
    });
    result = error ? "error" : "resolved";
  } catch {
    /* Database validation and role checks determine whether the operation commits. */
  }
  redirect(
    uuidPattern.test(order)
      ? `/admin/orders/${order}?result=${result}`
      : "/admin/payments?result=error",
  );
}

export async function requestRefundReview(form: FormData) {
  const { client, role } = await requireAdmin();
  let order = "";
  let result = "error";
  try {
    order = id(form, "order");
    if (role !== "owner") throw new Error("permission_denied");
    const provider = text(form, "provider", 20);
    if (!/^\d+$/.test(provider)) throw new Error("invalid_input");
    const amount = parseGhs(text(form, "amount", 11));
    const { error } = await client.rpc("audace_request_refund_review", {
      p_request: id(form, "request"),
      p_provider: provider,
      p_amount: amount,
      p_reason: text(form, "reason", 500),
    });
    result = error ? "error" : "refund-review";
  } catch {
    /* A request cannot exceed the verified payment or bypass the owner role. */
  }
  redirect(
    uuidPattern.test(order)
      ? `/admin/orders/${order}?result=${result}`
      : "/admin/payments?result=error",
  );
}
