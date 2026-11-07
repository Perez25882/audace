import "server-only";
import { operationRecord, type OperationContext } from "@/lib/operations";
import { withinLimit } from "./rate-limit";

export function observe(
  event: Parameters<typeof operationRecord>[0],
  context: OperationContext = {},
) {
  if (!withinLimit("log:" + event, 60)) return;
  const line = JSON.stringify(operationRecord(event, context));
  if (event === "worker_result") console.info(line);
  else console.warn(line);
}
