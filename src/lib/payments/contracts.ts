import { isPesewas } from "../bag";
import { record, providerId } from "./security";

export type AttemptContext = {
  attemptId: string;
  orderId: string;
  reference: string;
  amount: number;
  currency: "GHS";
  environment: "test";
  email: string;
  state: string;
  authorizationUrl: string | null;
  expiresAt: string;
  payment: string;
};

export const providerStatuses = [
  "success",
  "pending",
  "ongoing",
  "processing",
  "queued",
  "failed",
  "abandoned",
  "reversed",
] as const;
export type ProviderStatus = (typeof providerStatuses)[number];

export type VerifiedTransaction = {
  providerId: string;
  reference: string;
  domain: "test";
  currency: "GHS";
  amount: number;
  status: ProviderStatus;
  orderId: string;
  attemptId: string;
  email: string;
  channel: string;
  paidAt: string | null;
};

export function transactionEvidence(
  value: unknown,
  expected: AttemptContext,
  integrationId: string | null,
): VerifiedTransaction {
  const data = record(value);
  const metadata = record(
    typeof data.metadata === "string"
      ? JSON.parse(data.metadata)
      : data.metadata,
  );
  const customer = record(data.customer);
  const integration = data.integration ?? customer.integration;
  if (
    data.reference !== expected.reference ||
    data.domain !== expected.environment ||
    data.currency !== "GHS" ||
    !isPesewas(data.amount) ||
    data.amount !== expected.amount ||
    metadata.audace_order_id !== expected.orderId ||
    metadata.audace_attempt_id !== expected.attemptId ||
    metadata.audace_environment !== "test" ||
    typeof customer.email !== "string" ||
    customer.email.toLowerCase() !== expected.email.toLowerCase() ||
    (integrationId !== null &&
      integration !== undefined &&
      String(integration) !== integrationId) ||
    !providerStatuses.some((status) => status === data.status)
  )
    throw new Error("verification_mismatch");
  if (
    data.status === "success" &&
    (typeof data.paid_at !== "string" ||
      !Number.isFinite(Date.parse(data.paid_at)))
  )
    throw new Error("verification_mismatch");
  const channel = typeof data.channel === "string" ? data.channel : "";
  if ((data.status === "success" && !channel) || channel.length > 40)
    throw new Error("verification_mismatch");
  return {
    providerId: providerId(data.id),
    reference: expected.reference,
    domain: "test",
    currency: "GHS",
    amount: data.amount,
    status: data.status as ProviderStatus,
    orderId: expected.orderId,
    attemptId: expected.attemptId,
    email: expected.email.toLowerCase(),
    channel,
    paidAt: typeof data.paid_at === "string" ? data.paid_at : null,
  };
}

export const supportedEvents = [
  "charge.success",
  "refund.pending",
  "refund.processing",
  "refund.needs-attention",
  "refund.failed",
  "refund.processed",
  "charge.dispute.create",
  "charge.dispute.remind",
  "charge.dispute.resolve",
] as const;

export function webhookEvidence(value: unknown) {
  const body = record(value);
  const data = record(body.data);
  if (
    typeof body.event !== "string" ||
    !supportedEvents.some((event) => event === body.event) ||
    data.domain !== "test"
  ) {
    throw new Error("unsupported_event");
  }
  const transaction =
    data.transaction && typeof data.transaction === "object"
      ? record(data.transaction)
      : {};
  const reference =
    data.reference ?? data.transaction_reference ?? transaction.reference;
  if (
    typeof reference !== "string" ||
    !/^[A-Za-z0-9.=-]{1,120}$/.test(reference)
  )
    throw new Error("invalid_event");
  let id: string | null = null;
  if (data.id !== undefined && data.id !== null) id = providerId(data.id);
  return {
    type: body.event,
    reference,
    providerId: id,
    evidence: {
      domain: "test",
      status: typeof data.status === "string" ? data.status.slice(0, 40) : null,
      amount: isPesewas(data.amount) ? data.amount : null,
      currency:
        typeof data.currency === "string" ? data.currency.slice(0, 8) : null,
    },
  };
}
