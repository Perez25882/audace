import "server-only";

import {
  checkoutUrl,
  paymentConfiguration,
  type PaymentConfig,
} from "@/lib/payments/config";
import { parseProviderJson, record } from "@/lib/payments/security";
import type { AttemptContext } from "@/lib/payments/contracts";

export function paymentConfig(): PaymentConfig {
  return paymentConfiguration(process.env);
}

export function paymentsEnabled() {
  try {
    paymentConfig();
    return true;
  } catch {
    return false;
  }
}

async function providerRequest(
  config: PaymentConfig,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(config.apiOrigin + path, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${config.secret}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const raw = await response.text();
  if (raw.length > 256_000) throw new Error("provider_unavailable");
  const envelope = record(parseProviderJson(raw));
  if (!response.ok || envelope.status !== true)
    throw new Error("provider_unavailable");
  return envelope.data;
}

export async function initializeProvider(
  config: PaymentConfig,
  attempt: AttemptContext,
) {
  const callback = new URL("/payment-status", config.appOrigin);
  callback.searchParams.set("order", attempt.orderId);
  const data = record(
    await providerRequest(config, "/transaction/initialize", {
      email: attempt.email,
      amount: String(attempt.amount),
      currency: "GHS",
      reference: attempt.reference,
      callback_url: callback.href,
      channels: config.channels,
      metadata: JSON.stringify({
        audace_order_id: attempt.orderId,
        audace_attempt_id: attempt.attemptId,
        audace_environment: "test",
      }),
    }),
  );
  const url = checkoutUrl(data.authorization_url, config);
  if (!url || data.reference !== attempt.reference)
    throw new Error("provider_unavailable");
  return url;
}

export function verifyProvider(config: PaymentConfig, reference: string) {
  if (!/^[A-Za-z0-9.=-]{1,120}$/.test(reference))
    throw new Error("invalid_reference");
  return providerRequest(
    config,
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}
