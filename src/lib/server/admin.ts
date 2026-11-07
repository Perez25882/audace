import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { authClient } from "./supabase";

export type AdminRole = "owner" | "operator";

export const requireAdmin = cache(async () => {
  const client = await authClient().catch(() => null);
  if (!client) redirect("/admin/login");
  const verified = await client.auth.getUser().catch(() => null);
  const user = verified?.data.user;
  if (verified?.error || !user) redirect("/admin/login");
  const { data, error: roleError } = await client.rpc("audace_admin_role").abortSignal(AbortSignal.timeout(5000));
  if (roleError || (data !== "owner" && data !== "operator")) redirect("/admin/login");
  return { client, role: data as AdminRole, userId: user.id };
});

export function requireData<T>(result: { data: T | null; error: unknown }): T {
  if (result.error || result.data === null) throw new Error("Store records are temporarily unavailable.");
  return result.data;
}

export type Search = Promise<Record<string, string | string[] | undefined>>;
export const pageSize = 50;

export function queryValue(params: Awaited<Search>, name: string) {
  const value = params[name];
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

export function pageOffset(params: Awaited<Search>) {
  const page = queryValue(params, "page");
  return /^\d{1,4}$/.test(page) ? Math.max(0, Number(page) - 1) * pageSize : 0;
}

export function moneyInput(value: number | null) {
  return value === null ? "" : `${Math.floor(value / 100)}.${String(value % 100).padStart(2,"0")}`;
}
