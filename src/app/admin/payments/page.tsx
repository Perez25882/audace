import Link from "next/link";
import { formatGhs } from "@/lib/bag";
import {
  pageOffset,
  pageSize,
  queryValue,
  requireAdmin,
  requireData,
  type Search,
} from "@/lib/server/admin";
import { AdminPage, Pager } from "../admin-ui";
import { Submit } from "../submit";
import { reverifyPayment } from "./actions";

type PaymentRow = {
  id: string;
  order_id: string;
  public_ref: string;
  reference: string;
  state: string;
  provider_status: string | null;
  provider_channel: string | null;
  expected_pesewas: number;
  created_at: string;
  allocation_status: string;
  financial_review: boolean;
  last_error: string | null;
  job_state: string | null;
  reconciliation_error: string | null;
};

export default async function Payments({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { client, role } = await requireAdmin();
  const params = await searchParams;
  const search = queryValue(params, "q");
  const filter = queryValue(params, "state");
  const offset = pageOffset(params);
  const rows: PaymentRow[] = requireData(
    await client.rpc("audace_admin_payments", {
      p_search: search,
      p_filter: ["pending", "failed", "review", "success"].includes(filter)
        ? filter
        : "",
      p_offset: offset,
    }),
  );
  const result = queryValue(params, "result");
  const notices: Record<string, string> = {
    checked:
      "Provider verification checked. The latest recorded status is shown below.",
    queued: "Verification has been queued for reconciliation.",
    error: "The action could not be completed. Please try again shortly.",
  };
  return (
    <AdminPage title="Payments" role={role}>
      {notices[result] && (
        <p className="shop-notice" role="status">
          {notices[result]}
        </p>
      )}
      <form className="admin-filters">
        <label>
          Order reference{" "}
          <input name="q" maxLength={40} defaultValue={search} />
        </label>
        <label>
          Payment state{" "}
          <select name="state" defaultValue={filter}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed or abandoned</option>
            <option value="review">Needs review</option>
            <option value="success">Verified successful</option>
          </select>
        </label>
        <button className="button button-outline" type="submit">
          Apply filters
        </button>
      </form>
      {!rows.length ? (
        <p>Payment attempts will appear here when checkout begins.</p>
      ) : (
        <div
          className="admin-table"
          role="region"
          tabIndex={0}
          aria-label="Payment attempts"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Reference</th>
                <th scope="col">Status</th>
                <th scope="col">Amount</th>
                <th scope="col">Channel</th>
                <th scope="col">Verification</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, pageSize).map((payment) => (
                <tr key={payment.id}>
                  <th scope="row">
                    <Link href={`/admin/orders/${payment.order_id}`}>
                      {payment.public_ref}
                    </Link>
                    <small>
                      {payment.created_at.slice(0, 16).replace("T", " ")} UTC
                    </small>
                  </th>
                  <td>{payment.reference}</td>
                  <td>
                    {payment.state}
                    {payment.provider_status && (
                      <small>{payment.provider_status}</small>
                    )}
                    {(payment.last_error || payment.reconciliation_error) && (
                      <small>
                        {(
                          payment.last_error ?? payment.reconciliation_error
                        )?.replaceAll("_", " ")}
                      </small>
                    )}
                    {(payment.allocation_status === "review" ||
                      payment.financial_review) && (
                      <small>Paid order needs review</small>
                    )}
                  </td>
                  <td>{formatGhs(payment.expected_pesewas)}</td>
                  <td>{payment.provider_channel ?? "Pending"}</td>
                  <td>
                    <form action={reverifyPayment}>
                      <input type="hidden" name="attempt" value={payment.id} />
                      <Submit>Verify with Paystack</Submit>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        route="/admin/payments"
        query={{ q: search, state: filter }}
        offset={offset}
        hasNext={rows.length > pageSize}
      />
    </AdminPage>
  );
}
