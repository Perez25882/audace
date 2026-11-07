import { formatGhs } from "@/lib/bag";
import { queryValue, requireAdmin, requireData, type Search } from "@/lib/server/admin";
import { AdminPage, ResultNotice } from "./admin-ui";

export default async function Dashboard({ searchParams }: { searchParams: Search }) {
  const { client, role } = await requireAdmin();
  const metrics = requireData(await client.rpc("audace_admin_metrics"));
  const entries = [
    ["Total orders",metrics.total], ["Pending orders",metrics.pending], ["Paid orders",metrics.paid],
    ["Fulfilment queue",metrics.fulfilment], ["Low-stock SKUs",metrics.low], ["Out-of-stock SKUs",metrics.out],
    ["Verified paid revenue",formatGhs(BigInt(metrics.revenue))],
  ];
  return <AdminPage title="Overview" role={role}>
    <ResultNotice result={queryValue(await searchParams,"result")} />
    <dl className="admin-metrics">{entries.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {metrics.total === 0 && <p className="shop-intro">Orders will appear here when the store begins accepting them.</p>}
  </AdminPage>;
}
