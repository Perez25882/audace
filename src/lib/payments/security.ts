import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function sameSecret(expected: string, supplied: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyWebhook(
  raw: Buffer,
  header: string | null,
  legacy: string | null,
  options: {
    mode: "timestamped" | "legacy";
    secrets: readonly string[];
    secretKey: string;
    now: number;
  },
) {
  if (options.mode === "legacy") {
    if (header || !legacy || !/^[0-9a-f]{128}$/.test(legacy)) return false;
    const expected = createHmac("sha512", options.secretKey)
      .update(raw)
      .digest();
    return timingSafeEqual(expected, Buffer.from(legacy, "hex"));
  }
  if (!header || header.length > 4096) return false;
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === "t") {
      if (timestamp !== null || !/^[1-9][0-9]{8,12}$/.test(value)) return false;
      timestamp = value;
    } else if (name === "v1") {
      const colon = value.indexOf(":");
      if (
        colon > 0 &&
        /^whk_[A-Za-z0-9_-]{1,100}$/.test(value.slice(0, colon)) &&
        /^[0-9a-f]{128}$/.test(value.slice(colon + 1))
      ) {
        signatures.push(value.slice(colon + 1));
      }
    }
  }
  if (
    timestamp === null ||
    !signatures.length ||
    Math.abs(options.now - Number(timestamp)) > 300
  )
    return false;
  return options.secrets.some((secret) => {
    const expected = createHmac("sha512", secret)
      .update(timestamp + ".")
      .update(raw)
      .digest();
    return signatures.some((signature) =>
      timingSafeEqual(expected, Buffer.from(signature, "hex")),
    );
  });
}

// Node.js 22 exposes the source spelling to revivers, preserving unsigned 64-bit provider IDs.
export function parseProviderJson(raw: string): unknown {
  return JSON.parse(
    raw,
    (_key: string, value: unknown, context?: { source?: string }) => {
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        !Number.isSafeInteger(value)
      ) {
        if (context?.source && /^\d+$/.test(context.source))
          return context.source;
        throw new Error("unsafe_provider_integer");
      }
      return value;
    },
  );
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_provider_data");
  return value as Record<string, unknown>;
}

export function providerId(value: unknown) {
  const id =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : value;
  if (
    typeof id !== "string" ||
    !/^[0-9]{1,20}$/.test(id) ||
    BigInt(id) > BigInt("18446744073709551615")
  )
    throw new Error("invalid_provider_id");
  return id;
}
