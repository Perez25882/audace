export const operationalEvents = [
  "request_error",
  "database_error",
  "provider_error",
  "verification_rejected",
  "payment_retry",
  "initialization_uncertain",
  "webhook_rejected",
  "webhook_record_failed",
  "worker_result",
  "admin_failed",
] as const;
type Event = (typeof operationalEvents)[number];
const codes = new Set([
  "server_error",
  "rpc_unavailable",
  "provider_unavailable",
  "verification_mismatch",
  "verification_unavailable",
  "invalid_signature",
  "invalid_event",
  "receipt_unavailable",
  "action_rejected",
  "checkout_rejected",
  "worker_incomplete",
]);
export type OperationContext = {
  code?: string;
  attemptId?: string;
  count?: number;
  processed?: number;
  requestId?: string;
};
export function operationRecord(
  event: Event,
  context: OperationContext = {},
  now = new Date(),
) {
  // Never spread untrusted context or include messages, bodies, headers, URLs or customer data.
  const result: Record<string, string | number> = {
    time: now.toISOString(),
    service: "audace",
    event,
  };
  if (context.code && codes.has(context.code)) result.code = context.code;
  for (const key of ["attemptId", "requestId"] as const)
    if (
      context[key] &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        context[key]!,
      )
    )
      result[key] = context[key]!;
  for (const key of ["count", "processed"] as const)
    if (
      Number.isSafeInteger(context[key]) &&
      context[key]! >= 0 &&
      context[key]! <= 1000
    )
      result[key] = context[key]!;
  return result;
}
