import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminCookieOptions, backendConfig, limitAdminCookie } from "@/lib/server/supabase";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  try {
    const config = backendConfig();
    if (config) {
      const client = createServerClient(config.url, config.key, {
        cookieOptions: adminCookieOptions(),
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (values) => {
            values.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            values.forEach(({ name, value, options }) => response.cookies.set(name, value, limitAdminCookie(options)));
          },
        },
      });
      await client.auth.getUser();
    }
  } catch {
    // Each admin page and action verifies the session independently.
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = { matcher: ["/admin/:path*"] };
