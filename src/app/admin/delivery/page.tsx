import { formatGhs } from "@/lib/bag";
import { regions } from "@/lib/shop-model";
import { moneyInput, queryValue, requireAdmin, requireData, type Search } from "@/lib/server/admin";
import { saveAdmin } from "../actions";
import { AdminPage, ResultNotice } from "../admin-ui";
import { Submit } from "../submit";

type Method = { id: string; region: string; label: string; fee_pesewas: number; active: boolean };

function MethodForm({ method }: { method?: Method }) {
  return <form action={saveAdmin} className="admin-form">
    <input type="hidden" name="operation" value="delivery" /><input type="hidden" name="id" value={method?.id ?? ""} />
    <label>Delivery area <select name="region" defaultValue={method?.region ?? ""} required>
      <option value="">Select a region</option>{regions.map((region) => <option key={region}>{region}</option>)}</select></label>
    <label>Method name <input name="label" defaultValue={method?.label} maxLength={100} required /></label>
    <label>Approved fee in GHS <input name="price" inputMode="decimal" maxLength={11} defaultValue={moneyInput(method?.fee_pesewas ?? null)} required /></label>
    <label className="admin-check"><input type="checkbox" name="active" defaultChecked={method?.active} /> Available at checkout</label>
    <Submit>{method ? "Save delivery method" : "Add delivery method"}</Submit>
  </form>;
}

export default async function Delivery({ searchParams }: { searchParams: Search }) {
  const { client, role } = await requireAdmin();
  const [methodResult,settingsResult] = await Promise.all([
    client.from("audace_delivery").select("id,region,label,fee_pesewas,active").order("region").order("label"),
    client.from("audace_settings").select("low_stock_threshold,shipping_returns").single(),
  ]);
  const methods: Method[] = requireData(methodResult);
  const settings = requireData(settingsResult);
  return <AdminPage title="Delivery" role={role}>
    <ResultNotice result={queryValue(await searchParams,"result")} />
    {!methods.length && <p>Delivery areas and fees are awaiting approval.</p>}
    <div className="admin-grid">
      {methods.map((method) => <section className="admin-panel" key={method.id}>
        <h2>{method.label}</h2>
        {role === "owner" ? <MethodForm method={method} /> : <p>{method.region} · {formatGhs(method.fee_pesewas)} · {method.active ? "Active" : "Inactive"}</p>}
      </section>)}
      {role === "owner" && <section className="admin-panel"><h2>New delivery method</h2><MethodForm /></section>}
    </div>
    {role === "owner" && <section className="admin-section"><h2>Store settings</h2>
      <form action={saveAdmin} className="admin-form">
        <input type="hidden" name="operation" value="settings" />
        <label>Low-stock threshold <input name="threshold" type="number" min={0} max={1000000} defaultValue={settings.low_stock_threshold} required /></label>
        <label>Approved shipping and returns copy <textarea name="shippingReturns" maxLength={3000} rows={4} defaultValue={settings.shipping_returns ?? ""} /></label>
        <Submit>Save settings</Submit>
      </form>
    </section>}
  </AdminPage>;
}
