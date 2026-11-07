import { record } from "@/lib/payments/security";
import { uuidPattern } from "@/lib/checkout-input";
import {
  customerRequest,
  paymentError,
  paymentResponse,
} from "@/lib/server/payment-http";
import {
  orderCookie,
  retryPayment,
  startPayment,
} from "@/lib/server/payment-service";
import { paymentConfig } from "@/lib/server/paystack";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = record(await customerRequest(request));
    const retryId = input.retryOrderId;
    if (
      retryId !== undefined &&
      (typeof retryId !== "string" || !uuidPattern.test(retryId))
    )
      throw new Error("invalid_checkout");
    const token = input.accessToken;
    const result =
      typeof retryId === "string"
        ? await retryPayment(retryId)
        : await startPayment({
            requestId:
              typeof input.requestId === "string" ? input.requestId : "",
            accessToken: typeof token === "string" ? token : "",
            lines: input.lines,
            contact: input.contact,
            expectedTotal: input.expectedTotal,
          });
    const response = paymentResponse(
      {
        orderId: result.orderId,
        authorizationUrl: result.authorizationUrl,
        statusUrl: `/payment-status?order=${result.orderId}`,
      },
      result.authorizationUrl ? 200 : 202,
    );
    if (typeof retryId !== "string" && typeof token === "string") {
      response.cookies.set(orderCookie(result.orderId), token, {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(paymentConfig().appOrigin).protocol === "https:",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    }
    return response;
  } catch (error) {
    return paymentError(error);
  }
}
