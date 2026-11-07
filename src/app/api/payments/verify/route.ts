import { record } from "@/lib/payments/security";
import { uuidPattern } from "@/lib/checkout-input";
import {
  customerRequest,
  paymentError,
  paymentResponse,
} from "@/lib/server/payment-http";
import { verifyOwnedPayment } from "@/lib/server/payment-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = record(await customerRequest(request));
    if (typeof body.orderId !== "string" || !uuidPattern.test(body.orderId))
      throw new Error("order_access_denied");
    const order = await verifyOwnedPayment(body.orderId);
    if (!order) throw new Error("order_access_denied");
    return paymentResponse({
      payment: order.payment,
      allocation: order.allocation,
      review: order.review,
      verified: order.verified,
      attempt: order.attempt?.state ?? null,
    });
  } catch (error) {
    return paymentError(error);
  }
}
