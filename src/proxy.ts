import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  adminCookieOptions,
  backendConfig,
  limitAdminCookie,
} from "@/lib/server/supabase";
import { contentPolicy, privateRoute, publicSite } from "@/lib/release";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentPolicy(
    nonce,
    process.env.NODE_ENV === "development",
    request.nextUrl.protocol === "https:",
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", crypto.randomUUID());
  requestHeaders.set("Content-Security-Policy", policy);
  const next = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  let response = next();
  try {
    const config = backendConfig();
    if (config && request.nextUrl.pathname.startsWith("/admin")) {
      const client = createServerClient(config.url, config.key, {
        cookieOptions: adminCookieOptions(),
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              cache: "no-store",
              signal: AbortSignal.timeout(10_000),
            }),
        },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (values) => {
            values.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            requestHeaders.set("cookie", request.cookies.toString());
            response = next();
            values.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, limitAdminCookie(options)),
            );
          },
        },
      });
      await client.auth.getUser();
    }
  } catch {
    /* Protected pages and database mutations independently authorize staff. */
  }
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("x-request-id", requestHeaders.get("x-request-id")!);
  if (request.nextUrl.protocol === "https:")
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  if (privateRoute(request.nextUrl.pathname) || !publicSite(process.env).index)
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|garments/|icon.svg).*)"],
};
