export type PaymentConfig = {
  secret: string;
  environment: "test";
  appOrigin: string;
  apiOrigin: string;
  mockOrigin: string | null;
  channels: ("card" | "mobile_money")[];
  signingMode: "timestamped" | "legacy";
  signingSecrets: string[];
  workerSecret: string;
  integrationId: string | null;
};

function safeOrigin(raw: string | undefined) {
  if (!raw) throw new Error("payments_disabled");
  const url = new URL(raw);
  const loopback =
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(url.hostname);
  if (
    (!loopback && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("invalid_payment_origin");
  }
  return { origin: url.origin, loopback };
}

export function paymentConfiguration(
  env: Record<string, string | undefined>,
): PaymentConfig {
  if (
    env.PAYSTACK_ENVIRONMENT !== "test" ||
    !/^sk_test_[a-zA-Z0-9]{16,}$/.test(env.PAYSTACK_SECRET_KEY ?? "") ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_PUBLISHABLE_KEY
  ) {
    throw new Error("payments_disabled");
  }
  const app = safeOrigin(env.AUDACE_APP_ORIGIN);
  const channels = (env.PAYSTACK_CHANNELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !channels.length ||
    channels.some((channel) => !["card", "mobile_money"].includes(channel)) ||
    new Set(channels).size !== channels.length
  ) {
    throw new Error("payment_channels_unconfigured");
  }
  const signingMode = env.PAYSTACK_WEBHOOK_MODE;
  const signingSecrets = [
    env.PAYSTACK_WEBHOOK_SECRET,
    env.PAYSTACK_WEBHOOK_SECRET_PREVIOUS,
  ].filter((value): value is string => !!value);
  if (
    (signingMode !== "legacy" && signingMode !== "timestamped") ||
    (signingMode === "timestamped" &&
      (!signingSecrets.length ||
        signingSecrets.some(
          (secret) => !/^whsec_[A-Za-z0-9_-]{16,}$/.test(secret),
        )))
  ) {
    throw new Error("webhook_unconfigured");
  }
  if ((env.PAYMENT_RECONCILE_SECRET?.length ?? 0) < 32)
    throw new Error("reconciliation_unconfigured");
  let apiOrigin = "https://api.paystack.co";
  let mockOrigin: string | null = null;
  if (env.PAYSTACK_TEST_API_ORIGIN) {
    const mock = safeOrigin(env.PAYSTACK_TEST_API_ORIGIN);
    if (env.AUDACE_PROVIDER_MOCKS !== "1" || !app.loopback || !mock.loopback)
      throw new Error("invalid_mock_origin");
    apiOrigin = mock.origin;
    mockOrigin = mock.origin;
  }
  if (
    env.PAYSTACK_INTEGRATION_ID &&
    !/^\d{1,20}$/.test(env.PAYSTACK_INTEGRATION_ID)
  )
    throw new Error("invalid_integration");
  return {
    secret: env.PAYSTACK_SECRET_KEY!,
    environment: "test",
    appOrigin: app.origin,
    apiOrigin,
    mockOrigin,
    channels: channels as PaymentConfig["channels"],
    signingMode,
    signingSecrets,
    workerSecret: env.PAYMENT_RECONCILE_SECRET!,
    integrationId: env.PAYSTACK_INTEGRATION_ID ?? null,
  };
}

export function checkoutUrl(
  value: unknown,
  config: Pick<PaymentConfig, "mockOrigin">,
) {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    if (
      url.origin === "https://checkout.paystack.com" ||
      (config.mockOrigin && url.origin === config.mockOrigin)
    )
      return url.href;
  } catch {
    /* Invalid provider URL is handled as an initialization failure. */
  }
  return null;
}
