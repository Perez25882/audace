import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function backendConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !key) return null;
  if (!url || !key) throw new Error("Supabase configuration is incomplete.");
  const endpoint = new URL(url);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/" ||
    (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost"].includes(endpoint.hostname)))) {
    throw new Error("Supabase requires an HTTPS origin or a loopback HTTP origin.");
  }
  return { url: endpoint.origin, key };
}

const adminCookie = "audace-admin-auth-token";
const adminCookieLifetime = 60 * 60 * 8;

export function adminCookieOptions(): CookieOptions & { name: string } {
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(process.env.AUDACE_APP_ORIGIN ?? "");
  return { name: adminCookie, path: "/", httpOnly: true, secure: !local, sameSite: "lax", maxAge: adminCookieLifetime };
}

export function limitAdminCookie(options: CookieOptions): CookieOptions {
  return { ...options, maxAge: options.maxAge === 0 ? 0 : adminCookieLifetime };
}

export async function clearAdminCookies() {
  const store = await cookies();
  const { name, ...options } = adminCookieOptions();
  for (const cookie of store.getAll()) {
    if (cookie.name === name || cookie.name.startsWith(name + ".")) {
      store.set(cookie.name, "", { ...options, maxAge: 0 });
    }
  }
}

const request: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(10_000);
  return fetch(input, { ...init, cache: "no-store", signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
};

export function dataClient(privileged = false) {
  const config = backendConfig();
  if (!config) throw new Error("Supabase is unavailable.");
  const key = privileged ? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() : config.key;
  if (!key) throw new Error("The private order service is unconfigured.");
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: request },
  });
}

export async function authClient() {
  const config = backendConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: adminCookieOptions(),
    global: { fetch: request },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, limitAdminCookie(options)));
        } catch {
          // Server Components receive refreshed cookies from the admin proxy.
        }
      },
    },
  });
}
