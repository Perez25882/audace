import { sameSecret } from "@/lib/payments/security";
import { paymentResponse } from "@/lib/server/payment-http";
import { runPaymentJobs, rpc } from "@/lib/server/payment-service";
import { paymentConfig } from "@/lib/server/paystack";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const config = paymentConfig();
    const supplied = request.headers.get("authorization") ?? "";
    if (!sameSecret(`Bearer ${config.workerSecret}`, supplied))
      return paymentResponse({ error: "Unauthorized." }, 401);
    await rpc("audace_expire_orders", { p_limit: 200 });
    return paymentResponse(await runPaymentJobs());
  } catch {
    return paymentResponse({ error: "Reconciliation is unavailable." }, 503);
  }
}
