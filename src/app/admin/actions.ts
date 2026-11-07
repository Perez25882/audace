"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { parseGhs } from "@/lib/bag";
import { uuidPattern } from "@/lib/checkout-input";
import { regions } from "@/lib/shop-model";
import { requireAdmin } from "@/lib/server/admin";
import { withinLimit } from "@/lib/server/rate-limit";
import { authClient, clearAdminCookies } from "@/lib/server/supabase";
import { observe } from "@/lib/server/observe";

function field(form: FormData, name: string, max: number, optional = false) {
  const input = form.get(name);
  if (input === null && optional) return "";
  if (typeof input !== "string" || input.length > max || input.includes("\0") || (!optional && !input.trim())) {
    throw new Error("invalid_input");
  }
  return input.trim();
}

function identifier(form: FormData, name: string) {
  const id = field(form, name, 80);
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error("invalid_input");
  return id;
}

function uuid(form: FormData, name: string, optional = false) {
  const id = field(form, name, 36, optional);
  if (optional && !id) return null;
  if (!uuidPattern.test(id)) throw new Error("invalid_input");
  return id;
}

function count(form: FormData, name: string) {
  const raw = field(form, name, 7);
  if (!/^\d+$/.test(raw) || Number(raw) > 1_000_000) throw new Error("invalid_input");
  return Number(raw);
}

function pesewas(form: FormData, name: string, optional = false) {
  const raw = field(form, name, 11, optional);
  if (optional && !raw) return null;
  return parseGhs(raw);
}

export async function signInAdmin(form: FormData) {
  let signedIn = false;
  try {
    const email = field(form, "email", 254).toLowerCase();
    const password = form.get("password");
    const hash = createHash("sha256").update(email).digest("hex");
    if (typeof password === "string" && password.length > 0 && password.length <= 1024
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && withinLimit("admin-login", 120) && withinLimit(`login:${hash}`, 8)) {
      const client = await authClient();
      if (client) {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (!error) {
          const { data } = await client.rpc("audace_admin_role").abortSignal(AbortSignal.timeout(5000));
          signedIn = data === "owner" || data === "operator";
          if (!signedIn) {
            await client.auth.signOut({ scope: "local" }).catch(() => null);
            await clearAdminCookies();
          }
        }
      }
    }
  } catch {
    // Credentials and provider errors stay out of application logs and user-facing responses.
  }
  if (!signedIn) observe("admin_failed", { code: "action_rejected" });
  redirect(signedIn ? "/admin" : "/admin/login?result=denied");
}

export async function signOutAdmin() {
  const client = await authClient().catch(() => null);
  if (client) await client.auth.signOut({ scope: "local" }).catch(() => null);
  await clearAdminCookies();
  redirect("/admin/login");
}

const destinations = {
  product: "/admin/catalogue", variant: "/admin/catalogue", size: "/admin/catalogue", sizeActive: "/admin/catalogue",
  stock: "/admin/inventory", delivery: "/admin/delivery", settings: "/admin/delivery", order: "/admin/orders",
} as const;

export async function saveAdmin(form: FormData) {
  const { client, role } = await requireAdmin();
  const action = form.get("operation");
  if (typeof action !== "string" || !Object.hasOwn(destinations, action)) redirect("/admin?result=error");
  const operation = action as keyof typeof destinations;
  let target: string = destinations[operation];
  let result = "saved";

  try {
    if (operation !== "stock" && operation !== "order" && role !== "owner") throw new Error("invalid_input");
    let response;
    switch (operation) {
      case "product":
        response = await client.rpc("audace_set_product", {
          p_id: identifier(form,"id"), p_description: field(form,"description",2000),
          p_size_guide: field(form,"sizeGuide",2000,true), p_published: form.has("published"),
        });
        break;
      case "variant":
        response = await client.rpc("audace_set_variant", {
          p_id: identifier(form,"id"), p_price: pesewas(form,"price",true), p_published: form.has("published"),
        });
        break;
      case "size": {
        const code = field(form,"code",120).toUpperCase();
        if (!/^[A-Z0-9-]+$/.test(code)) throw new Error("invalid_input");
        response = await client.rpc("audace_add_size", {
          p_variant: identifier(form,"id"), p_size: field(form,"size",40), p_code: code,
        });
        break;
      }
      case "sizeActive":
        response = await client.rpc("audace_set_size_active", { p_id: uuid(form,"id"), p_active: form.get("active") === "true" });
        break;
      case "stock":
        response = await client.rpc("audace_adjust_stock", {
          p_sku: uuid(form,"id"), p_expected: count(form,"expected"), p_count: count(form,"count"), p_reason: field(form,"reason",240),
        });
        break;
      case "delivery": {
        const region = field(form,"region",32);
        if (!regions.some((value) => value === region)) throw new Error("invalid_input");
        response = await client.rpc("audace_set_delivery", {
          p_id: uuid(form,"id",true), p_region: region, p_label: field(form,"label",100),
          p_fee: pesewas(form,"price"), p_active: form.has("active"),
        });
        break;
      }
      case "settings":
        response = await client.rpc("audace_set_settings", {
          p_threshold: count(form,"threshold"), p_shipping_returns: field(form,"shippingReturns",3000,true),
        });
        break;
      case "order": {
        const id = uuid(form,"id");
        const transition = field(form,"transition",24);
        if (!["cancel_pending","processing","shipped","delivered"].includes(transition)) throw new Error("invalid_input");
        target = `/admin/orders/${id}`;
        response = await client.rpc("audace_admin_order_action", { p_order: id, p_action: transition });
        break;
      }
    }
    if (response.error) result = response.error.message === "stock_changed" ? "stale"
      : response.error.message === "stock_reserved" ? "reserved" : response.error.code === "23505" ? "duplicate" : "error";
  } catch {
    result = "error";
  }
  if (result !== "saved") observe("admin_failed", { code: "action_rejected" });
  redirect(`${target}?result=${result}`);
}
