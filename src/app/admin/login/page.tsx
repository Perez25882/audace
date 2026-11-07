import Link from "next/link";
import { backendConfig } from "@/lib/server/supabase";
import { queryValue, type Search } from "@/lib/server/admin";
import { signInAdmin } from "../actions";
import { Submit } from "../submit";

export default async function Login({ searchParams }: { searchParams: Search }) {
  let configured = false;
  try { configured = !!backendConfig(); } catch { /* Configuration is shown as unavailable. */ }
  const denied = queryValue(await searchParams,"result") === "denied";
  return <section className="frame admin-login" aria-labelledby="admin-login">
    <Link className="wordmark" href="/" aria-label="AUDACE storefront">AUDACE</Link>
    <h1 className="shop-heading" id="admin-login">Store administration</h1>
    {configured ? (
      <form action={signInAdmin} className="admin-form">
        <label>Email address <input type="email" name="email" autoComplete="username" maxLength={254} required /></label>
        <label>Password <input type="password" name="password" autoComplete="current-password" maxLength={1024} required /></label>
        {denied && <p className="shop-alert" role="alert">Sign-in was unsuccessful. Check your credentials or try again later.</p>}
        <Submit primary>Sign in</Submit>
      </form>
    ) : <p className="shop-notice">Administration is awaiting a Supabase connection.</p>}
    <Link className="text-action" href="/">Back to the storefront</Link>
  </section>;
}
