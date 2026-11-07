import "server-only";

import { cookies } from "next/headers";
import { normaliseGhanaPhone, validateCheckout } from "@/lib/checkout";
import { parseCheckout, parseLines, uuidPattern } from "@/lib/checkout-input";
import { isPesewas } from "@/lib/bag";
import {
  transactionEvidence,
  type AttemptContext,
} from "@/lib/payments/contracts";
import { checkoutUrl } from "@/lib/payments/config";
import { digest } from "@/lib/payments/security";
import { dataClient } from "./supabase";
import { paymentConfig, initializeProvider, verifyProvider } from "./paystack";

export type CustomerOrder = {
  orderId: string;
  reference: string;
  payment: string;
  allocation: string;
  review: boolean;
  fulfilment: string;
  canResume: boolean;
  amount: number;
  subtotal: number;
  deliveryFee: number;
  deliveryMethod: string;
  expiresAt: string;
  verified: boolean;
  attempt: {
    reference: string;
    state: string;
    providerStatus: string | null;
    authorizationUrl: string | null;
  } | null;
  items: {
    variantId: string;
    name: string;
    colour: string;
    sleeve: string;
    size: string;
    quantity: number;
    unitPesewas: number;
  }[];
  delivery: {
    name: string;
    region: string;
    city: string;
    address: string;
    directions: string;
  };
};

type PaymentJob = {
  attemptId: string;
  reference: string;
  lease: string;
  runs: number;
};
type Started = {
  orderId: string;
  attemptId: string;
  reference: string;
  amount: number;
  state: string;
  authorizationUrl: string | null;
};

export function orderCookie(id: string) {
  return `audace-order-${id}`;
}

export async function rpc<T>(
  name: string,
  parameters: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await dataClient(true)
    .rpc(name, parameters)
    .abortSignal(AbortSignal.timeout(8000));
  if (error) {
    const codes = [
      "price_changed",
      "request_conflict",
      "order_access_denied",
      "item_unavailable",
      "delivery_unavailable",
      "retry_unavailable",
      "order_review_required",
      "verification_rate_limited",
    ];
    throw new Error(
      codes.includes(error.message)
        ? error.message
        : "payment_service_unavailable",
    );
  }
  return data as T;
}

export async function paymentLimit(bucket: string, limit: number) {
  if (
    !(await rpc<boolean>("audace_payment_rate", {
      p_bucket: bucket,
      p_limit: limit,
    }))
  )
    throw new Error("rate_limited");
}

export async function ownedOrder(id: string): Promise<CustomerOrder | null> {
  if (!uuidPattern.test(id)) return null;
  const token = (await cookies()).get(orderCookie(id))?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  try {
    const order = await rpc<CustomerOrder | null>("audace_payment_access", {
      p_order: id,
      p_access: digest(token),
    });
    if (order?.attempt?.authorizationUrl) {
      try {
        order.attempt.authorizationUrl = checkoutUrl(
          order.attempt.authorizationUrl,
          paymentConfig(),
        );
      } catch {
        order.attempt.authorizationUrl = null;
      }
    }
    return order;
  } catch {
    return null;
  }
}

async function context(reference: string) {
  const result = await rpc<AttemptContext | null>("audace_payment_context", {
    p_reference: reference,
  });
  if (!result) throw new Error("payment_service_unavailable");
  return result;
}

export async function reconcileReference(reference: string) {
  const config = paymentConfig();
  const expected = await context(reference);
  let data: unknown;
  try {
    data = await verifyProvider(config, reference);
  } catch {
    return { done: false, error: "provider_unavailable" };
  }
  try {
    const evidence = transactionEvidence(data, expected, config.integrationId);
    const state = await rpc<string>("audace_payment_apply", {
      p_reference: reference,
      p_data: evidence,
    });
    return { done: state !== "pending", error: null };
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error &&
        [
          "verification_mismatch",
          "invalid_provider_data",
          "invalid_provider_id",
          "unsafe_provider_integer",
        ].includes(error.message))
    ) {
      await rpc("audace_payment_note_error", {
        p_attempt: expected.attemptId,
        p_code: "verification_mismatch",
      });
      return { done: true, error: "verification_mismatch" };
    }
    throw error;
  }
}

async function runJob(job: PaymentJob) {
  let done = false;
  let error: string | null = "verification_unavailable";
  try {
    const result = await reconcileReference(job.reference);
    done = result.done;
    error = result.error;
  } catch {
    // The durable lease expires after process interruption, allowing the next worker to recover.
  }
  await rpc("audace_payment_finish_job", {
    p_attempt: job.attemptId,
    p_lease: job.lease,
    p_done: done,
    p_error: error,
  });
}

export async function runPaymentJobs(attemptId?: string) {
  paymentConfig();
  const jobs = await rpc<PaymentJob[]>("audace_payment_claim_jobs", {
    p_limit: 5,
    p_attempt: attemptId ?? null,
  });
  const results = await Promise.allSettled(jobs.map(runJob));
  return {
    claimed: jobs.length,
    processed: results.filter((result) => result.status === "fulfilled").length,
  };
}

async function initializeAttempt(started: Started) {
  if (
    !["created", "initializing", "initialized", "pending"].includes(
      started.state,
    )
  )
    return { ...started, authorizationUrl: null };
  const current = await context(started.reference);
  if (
    Date.parse(current.expiresAt) <= Date.now() ||
    current.payment !== "pending"
  )
    return { ...started, authorizationUrl: null };
  if (started.authorizationUrl)
    return {
      ...started,
      authorizationUrl: checkoutUrl(started.authorizationUrl, paymentConfig()),
    };
  const lease = await rpc<string | null>("audace_payment_claim_init", {
    p_attempt: started.attemptId,
  });
  if (!lease) return { ...started, authorizationUrl: null };
  try {
    const expected = await context(started.reference);
    const url = await initializeProvider(paymentConfig(), expected);
    const saved = await rpc<boolean>("audace_payment_save_init", {
      p_attempt: started.attemptId,
      p_lease: lease,
      p_url: url,
      p_error: null,
    });
    return { ...started, authorizationUrl: saved ? url : null };
  } catch {
    await rpc("audace_payment_save_init", {
      p_attempt: started.attemptId,
      p_lease: lease,
      p_url: null,
      p_error: "provider_unavailable",
    }).catch(() => null);
    return { ...started, authorizationUrl: null };
  }
}

export async function startPayment(input: {
  requestId: string;
  accessToken: string;
  lines: unknown;
  contact: unknown;
  expectedTotal: unknown;
}) {
  paymentConfig();
  const contact = parseCheckout(input.contact);
  const lines = parseLines(input.lines);
  if (
    !uuidPattern.test(input.requestId) ||
    !/^[0-9a-f]{64}$/.test(input.accessToken) ||
    !contact ||
    !lines ||
    !uuidPattern.test(contact.method) ||
    Object.keys(validateCheckout(contact)).length ||
    !isPesewas(input.expectedTotal) ||
    input.expectedTotal < 1
  )
    throw new Error("invalid_checkout");
  await paymentLimit("initialize", 120);
  await paymentLimit(`checkout:${digest(input.accessToken)}`, 10);
  const { method, ...details } = contact;
  const started = await rpc<Started>("audace_payment_begin", {
    p_request: input.requestId,
    p_access: digest(input.accessToken),
    p_lines: lines,
    p_delivery: method,
    p_contact: {
      ...details,
      email: details.email.toLowerCase(),
      phone: normaliseGhanaPhone(details.phone),
    },
    p_expected: input.expectedTotal,
  });
  return initializeAttempt(started);
}

export async function retryPayment(orderId: string) {
  paymentConfig();
  const token = (await cookies()).get(orderCookie(orderId))?.value;
  if (!uuidPattern.test(orderId) || !token || !/^[0-9a-f]{64}$/.test(token))
    throw new Error("order_access_denied");
  const details = await rpc<{
    requestId: string;
    lines: unknown;
    contact: unknown;
    deliveryId: string;
    total: number;
  } | null>("audace_payment_retry_input", {
    p_order: orderId,
    p_access: digest(token),
  });
  if (!details) throw new Error("order_access_denied");
  const contact = {
    ...(details.contact as Record<string, unknown>),
    method: details.deliveryId,
  };
  return startPayment({
    requestId: details.requestId,
    accessToken: token,
    lines: details.lines,
    contact,
    expectedTotal: details.total,
  });
}

export async function verifyOwnedPayment(orderId: string) {
  paymentConfig();
  const token = (await cookies()).get(orderCookie(orderId))?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token))
    throw new Error("order_access_denied");
  await paymentLimit(`verify:${digest(token)}`, 12);
  const reference = await rpc<string | null>("audace_payment_request_check", {
    p_order: orderId,
    p_access: digest(token),
  });
  if (reference) {
    const expected = await context(reference);
    await runPaymentJobs(expected.attemptId);
  }
  return ownedOrder(orderId);
}
