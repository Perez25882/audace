import {
  digest,
  parseProviderJson,
  verifyWebhook,
} from "@/lib/payments/security";
import { webhookEvidence } from "@/lib/payments/contracts";
import { boundedBody, paymentResponse } from "@/lib/server/payment-http";
import { rpc } from "@/lib/server/payment-service";
import { paymentConfig } from "@/lib/server/paystack";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let config;
  try {
    config = paymentConfig();
  } catch {
    return paymentResponse({ error: "Webhook unavailable." }, 503);
  }
  try {
    const raw = await boundedBody(request, 256_000);
    if (
      !verifyWebhook(
        raw,
        request.headers.get("paystack-signature"),
        request.headers.get("x-paystack-signature"),
        {
          mode: config.signingMode,
          secrets: config.signingSecrets,
          secretKey: config.secret,
          now: Math.floor(Date.now() / 1000),
        },
      )
    )
      return paymentResponse({ error: "Invalid signature." }, 401);
    let event;
    try {
      event = webhookEvidence(parseProviderJson(raw.toString("utf8")));
    } catch {
      return paymentResponse({ error: "Unsupported or malformed event." }, 400);
    }
    await rpc("audace_payment_record_event", {
      p_id: digest(raw),
      p_type: event.type,
      p_ref: event.reference,
      p_provider: event.providerId,
      p_evidence: event.evidence,
    });
    return paymentResponse({ received: true });
  } catch {
    return paymentResponse({ error: "Event could not be recorded." }, 503);
  }
}
