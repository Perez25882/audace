import Link from "next/link";
import type { AdminRole } from "@/lib/server/admin";
import { signOutAdmin } from "./actions";

export function AdminPage({
  title,
  role,
  children,
  reference = false,
}: {
  title: string;
  role: AdminRole;
  children: React.ReactNode;
  reference?: boolean;
}) {
  return (
    <div className="frame admin-page">
      <header className="admin-header">
        <Link className="wordmark" href="/admin">
          AUDACE
        </Link>
        <nav aria-label="Store management">
          <Link href="/admin">Overview</Link>
          <Link href="/admin/catalogue">Catalogue</Link>
          <Link href="/admin/inventory">Inventory</Link>
          <Link href="/admin/orders">Orders</Link>
          <Link href="/admin/payments">Payments</Link>
          <Link href="/admin/delivery">Delivery</Link>
        </nav>
        <form action={signOutAdmin}>
          <button className="text-action" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <p className="kicker">Store administration · {role}</p>
      <h1
        className={reference ? "shop-heading admin-reference" : "shop-heading"}
      >
        {title}
      </h1>
      {children}
    </div>
  );
}

const results: Record<string, string> = {
  saved: "Changes saved.",
  resolved: "Inventory review resolved.",
  "refund-review":
    "Refund review recorded. Provider processing awaits approval.",
  error: "The change could not be saved. Check the details and try again.",
  stale:
    "Stock changed since this page loaded. Review the current count and try again.",
  reserved: "The new count would fall below units held for pending orders.",
  duplicate: "That SKU, size or delivery method already exists.",
};

export function ResultNotice({ result }: { result: string }) {
  return result && Object.hasOwn(results, result) ? (
    <p className="shop-notice" role="status">
      {results[result]}
    </p>
  ) : null;
}

export function Pager({
  route,
  query,
  offset,
  hasNext,
}: {
  route: string;
  query: Record<string, string>;
  offset: number;
  hasNext: boolean;
}) {
  const page = offset / 50 + 1;
  function url(target: number) {
    const params = new URLSearchParams({ ...query, page: String(target) });
    return `${route}?${params.toString()}`;
  }
  if (!hasNext && page === 1) return null;
  return (
    <nav className="admin-pager" aria-label="Pagination">
      {page > 1 && <Link href={url(page - 1)}>Previous</Link>}
      <span>Page {page}</span>
      {hasNext && <Link href={url(page + 1)}>Next</Link>}
    </nav>
  );
}
