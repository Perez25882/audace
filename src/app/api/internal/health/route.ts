import { sameSecret } from "@/lib/payments/security";
import { paymentResponse } from "@/lib/server/payment-http";
import { rpc } from "@/lib/server/payment-service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.PAYMENT_RECONCILE_SECRET;
  if (!secret || secret.length < 32)
    return paymentResponse({ error: "Health unavailable." }, 503);
  if (
    !sameSecret("Bearer " + secret, request.headers.get("authorization") ?? "")
  )
    return paymentResponse({ error: "Unauthorized." }, 401);
  try {
    const health = await rpc<{ status: string }>("audace_operational_health");
    return paymentResponse(health, health.status === "healthy" ? 200 : 503);
  } catch {
    return paymentResponse({ error: "Health unavailable." }, 503);
  }
}
