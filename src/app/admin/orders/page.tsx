import Link from "next/link";
import { formatGhs } from "@/lib/bag";
import { pageOffset, pageSize, queryValue, requireAdmin, requireData, type Search } from "@/lib/server/admin";
import { AdminPage, Pager, ResultNotice } from "../admin-ui";

const payments = ["pending","paid","failed","cancelled","refunded"];
const fulfilments = ["unfulfilled","processing","shipped","delivered","cancelled"];

export default async function Orders({ searchParams }: { searchParams: Search }) {
  const { client, role } = await requireAdmin();
  const params = await searchParams;
  const reference = queryValue(params,"q");
  const payment = queryValue(params,"payment");
  const fulfilment = queryValue(params,"fulfilment");
  const offset = pageOffset(params);
  let query = client.from("audace_orders").select("id,public_ref,payment_status,fulfilment_status,total_pesewas,created_at,expires_at")
    .order("created_at",{ ascending: false }).order("id").range(offset,offset + pageSize);
  if (payments.includes(payment)) query = query.eq("payment_status",payment);
  if (fulfilments.includes(fulfilment)) query = query.eq("fulfilment_status",fulfilment);
  const validReference = !reference || /^[A-Za-z0-9-]{1,35}$/.test(reference);
  if (validReference && reference) query = query.ilike("public_ref",`${reference}%`);
  const rows = validReference ? requireData(await query) : [];
  return <AdminPage title="Orders" role={role}>
    <ResultNotice result={queryValue(params,"result")} />
    <form className="admin-filters">
      <label>Order reference <input name="q" defaultValue={reference} maxLength={35} /></label>
      <label>Payment <select name="payment" defaultValue={payment}><option value="">All</option>{payments.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Fulfilment <select name="fulfilment" defaultValue={fulfilment}><option value="">All</option>{fulfilments.map((status) => <option key={status}>{status}</option>)}</select></label>
      <button className="button button-outline">Apply filters</button>
    </form>
    {!rows.length ? <p>No orders match these filters.</p> : <div className="admin-table" tabIndex={0} role="region" aria-label="Orders table"><table>
      <thead><tr><th scope="col">Reference</th><th scope="col">Payment</th><th scope="col">Fulfilment</th><th scope="col">Total</th><th scope="col">Date</th></tr></thead>
      <tbody>{rows.slice(0,pageSize).map((order) => <tr key={order.id}>
        <th scope="row"><Link href={`/admin/orders/${order.id}`}>{order.public_ref}</Link></th>
        <td>{order.payment_status}{order.payment_status === "pending" && <><br /><small>Hold until <time dateTime={order.expires_at}>{order.expires_at.slice(0,16).replace("T"," ")} UTC</time></small></>}</td>
        <td>{order.fulfilment_status}</td><td>{formatGhs(order.total_pesewas)}</td><td>{order.created_at.slice(0,10)}</td>
      </tr>)}</tbody>
    </table></div>}
    <Pager route="/admin/orders" query={{ q: reference,payment,fulfilment }} offset={offset} hasNext={rows.length > pageSize} />
  </AdminPage>;
}
