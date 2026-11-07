import type { Instrumentation } from "next";
import { observe } from "@/lib/server/observe";

export const onRequestError: Instrumentation.onRequestError = async (
  _error,
  request,
) => {
  const requestId = request.headers["x-request-id"];
  observe("request_error", {
    code: "server_error",
    requestId: typeof requestId === "string" ? requestId : undefined,
  });
};
