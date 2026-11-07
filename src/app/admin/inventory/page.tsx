import { pageOffset, pageSize, queryValue, requireAdmin, requireData, type Search } from "@/lib/server/admin";
import { saveAdmin } from "../actions";
import { AdminPage, Pager, ResultNotice } from "../admin-ui";
import { Submit } from "../submit";

type Stock = { id: string; code: string; size: string; colour: string; sleeve: string; active: boolean; on_hand: number; available: number; low: boolean };
type Movement = { id: number; delta: number; balance: number; reason: string; created_at: string; actor: string | null; audace_skus: { code: string } | null };

export default async function Inventory({ searchParams }: { searchParams: Search }) {
  const { client, role } = await requireAdmin();
  const params = await searchParams;
  const search = queryValue(params,"q");
  const requested = queryValue(params,"stock");
  const filter = ["low","out","inactive"].includes(requested) ? requested : "";
  const offset = pageOffset(params);
  const [stockResult, movementResult] = await Promise.all([
    client.rpc("audace_admin_inventory", { p_search: search, p_filter: filter, p_offset: offset }),
    client.from("audace_movements").select("id,delta,balance,reason,created_at,actor,audace_skus(code)").order("id",{ ascending: false }).limit(40).overrideTypes<Movement[], { merge: false }>(),
  ]);
  const rows: Stock[] = requireData(stockResult);
  const movements: Movement[] = requireData(movementResult);
  return <AdminPage title="Inventory" role={role}>
    <ResultNotice result={queryValue(params,"result")} />
    <form className="admin-filters">
      <label>Search SKU, size or colour <input name="q" defaultValue={search} maxLength={100} /></label>
      <label>Stock filter <select name="stock" defaultValue={filter}><option value="">All</option><option value="low">Low stock</option>
        <option value="out">Out of stock</option><option value="inactive">Inactive sizes</option></select></label>
      <button className="button button-outline">Apply filters</button>
    </form>
    {rows.length ? <div className="admin-table" tabIndex={0} role="region" aria-label="Stock table"><table>
      <thead><tr><th scope="col">SKU</th><th scope="col">Variant</th><th scope="col">On hand</th><th scope="col">Available</th><th scope="col">Adjustment</th></tr></thead>
      <tbody>{rows.slice(0,pageSize).map((row) => <tr key={row.id}>
        <th scope="row">{row.code}</th><td>{row.colour} · {row.sleeve} · {row.size}</td><td>{row.on_hand}</td>
        <td>{row.available} {!row.active ? <small>Inactive</small> : row.available === 0 ? <small>Out of stock</small> : row.low ? <small>Low</small> : null}</td>
        <td><details className="admin-disclosure"><summary>Set stock</summary>
          <form action={saveAdmin} className="admin-form">
            <input type="hidden" name="operation" value="stock" /><input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="expected" value={row.on_hand} />
            <label>New on-hand count <input name="count" type="number" min={0} max={1000000} defaultValue={row.on_hand} required /></label>
            <label>Adjustment reason <input name="reason" maxLength={240} required /></label>
            <Submit>Save adjustment</Submit>
          </form>
        </details></td>
      </tr>)}</tbody>
    </table></div> : <p>No SKUs match these filters.</p>}
    <Pager route="/admin/inventory" query={{ q: search, stock: filter }} offset={offset} hasNext={rows.length > pageSize} />
    <section className="admin-section">
      <h2>Recent stock movements</h2>
      {!movements.length ? <p>Stock adjustments will appear here.</p> : <div className="admin-table" tabIndex={0} role="region" aria-label="Stock movements"><table>
        <thead><tr><th scope="col">SKU</th><th scope="col">Change</th><th scope="col">Balance</th><th scope="col">Reason</th><th scope="col">Recorded by</th><th scope="col">Time</th></tr></thead>
        <tbody>{movements.map((row) => <tr key={row.id}><th scope="row">{row.audace_skus?.code}</th>
          <td>{row.delta > 0 ? "+" : ""}{row.delta}</td><td>{row.balance}</td><td>{row.reason}</td><td>{row.actor ?? "System"}</td>
          <td><time dateTime={row.created_at}>{row.created_at.slice(0,16).replace("T"," ")} UTC</time></td></tr>)}</tbody>
      </table></div>}
    </section>
  </AdminPage>;
}
