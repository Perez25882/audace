"use client";

type Identity = { fingerprint: string; requestId: string; accessToken: string };
const key = "audace-checkout-v1";

export async function checkoutIdentity(input: unknown): Promise<Identity> {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  try {
    const previous: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (previous && typeof previous === "object") {
      const stored = previous as Record<string, unknown>;
      if (
        stored.fingerprint === fingerprint &&
        typeof stored.requestId === "string" &&
        /^[0-9a-f-]{36}$/.test(stored.requestId) &&
        typeof stored.accessToken === "string" &&
        /^[0-9a-f]{64}$/.test(stored.accessToken)
      ) {
        return stored as Identity;
      }
    }
  } catch {
    /* A malformed stored identity is replaced before initialization. */
  }
  const identity = {
    fingerprint,
    requestId: crypto.randomUUID(),
    accessToken: Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
  sessionStorage.setItem(key, JSON.stringify(identity));
  return identity;
}

export function clearCheckoutIdentity() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* The confirmed order remains accessible through its cookie. */
  }
}
