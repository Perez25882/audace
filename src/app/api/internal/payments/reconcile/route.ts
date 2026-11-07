import { sameSecret } from "@/lib/payments/security";
import { paymentResponse } from "@/lib/server/payment-http";
import { runPaymentJobs, rpc } from "@/lib/server/payment-service";
import { paymentConfig } from "@/lib/server/paystack";
import { observe } from "@/lib/server/observe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const config = paymentConfig();
    const supplied = request.headers.get("authorization") ?? "";
    if (!sameSecret(`Bearer ${config.workerSecret}`, supplied))
      return paymentResponse({ error: "Unauthorized." }, 401);
    await rpc("audace_expire_orders", { p_limit: 200 });
    const result = await runPaymentJobs();
    await rpc("audace_worker_heartbeat", {
      p_claimed: result.claimed,
      p_processed: result.processed,
    });
    observe("worker_result", {
      count: result.claimed,
      processed: result.processed,
    });
    return paymentResponse(result);
  } catch {
    observe("payment_retry", { code: "worker_incomplete" });
    return paymentResponse({ error: "Reconciliation is unavailable." }, 503);
  }
}
