import Link from "next/link";
import { notFound } from "next/navigation";
import { formatGhs } from "@/lib/bag";
import { uuidPattern } from "@/lib/checkout-input";
import { queryValue, requireAdmin, requireData, type Search } from "@/lib/server/admin";
import { saveAdmin } from "../../actions";
import { AdminPage, ResultNotice } from "../../admin-ui";
import { Submit } from "../../submit";

export default async function Order({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const { client, role } = await requireAdmin();
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const [orderResult,contactResult,itemResult,historyResult] = await Promise.all([
    client.from("audace_orders").select("public_ref,payment_status,fulfilment_status,subtotal_pesewas,delivery_pesewas,total_pesewas,delivery_label,verified_at,expires_at").eq("id",id).maybeSingle(),
    client.from("audace_order_contacts").select("name,email,phone,region,city,address,directions").eq("order_id",id).maybeSingle(),
    client.from("audace_order_items").select("sku,product_name,colour,sleeve,size,quantity,price_pesewas").eq("order_id",id).order("sku"),
    client.from("audace_order_history").select("id,payment_status,fulfilment_status,event,created_at").eq("order_id",id).order("id"),
  ]);
  if (orderResult.error || contactResult.error) throw new Error("Store records are temporarily unavailable.");
  const order = orderResult.data;
  if (!order) notFound();
  const contact = contactResult.data;
  const items = requireData(itemResult);
  const history = requireData(historyResult);
  const transitions: Record<string, [string,string]> = { unfulfilled:["processing","Start fulfilment"], processing:["shipped","Mark shipped"], shipped:["delivered","Mark delivered"] };
  const action = order.payment_status === "pending" ? ["cancel_pending","Cancel pending order"]
    : order.payment_status === "paid" ? transitions[order.fulfilment_status] : null;

  return <AdminPage title={order.public_ref} role={role}>
    <Link className="text-action" href="/admin/orders">Back to orders</Link>
    <ResultNotice result={queryValue(await searchParams,"result")} />
    <div className="admin-grid">
      <section className="admin-panel"><h2>Order summary</h2>
        <dl className="admin-definitions"><div><dt>Payment</dt><dd>{order.payment_status}</dd></div>
          <div><dt>Fulfilment</dt><dd>{order.fulfilment_status}</dd></div>
          <div><dt>Subtotal</dt><dd>{formatGhs(order.subtotal_pesewas)}</dd></div>
          <div><dt>Delivery · {order.delivery_label}</dt><dd>{formatGhs(order.delivery_pesewas)}</dd></div>
          <div><dt>Total</dt><dd>{formatGhs(order.total_pesewas)}</dd></div>
          {order.payment_status === "pending" && <div><dt>Hold expires</dt><dd>{order.expires_at.slice(0,16).replace("T"," ")} UTC</dd></div>}
        </dl>
        {action && <form action={saveAdmin}>
          <input type="hidden" name="operation" value="order" /><input type="hidden" name="id" value={id} />
          <input type="hidden" name="transition" value={action[0]} /><Submit>{action[1]}</Submit>
        </form>}
      </section>
      <section className="admin-panel"><h2>Contact and delivery</h2>
        {contact ? <address className="admin-address">{contact.name}<br />{contact.email}<br />{contact.phone}<br />
          {contact.address}<br />{contact.city}, {contact.region}{contact.directions && <><br />{contact.directions}</>}</address>
        : <p>Contact details are unavailable.</p>}
      </section>
    </div>
    <section className="admin-section"><h2>Items</h2>
      <ul>{items.map((item) => <li key={item.sku} className="admin-line">
        <span>{item.product_name} · {item.colour} · {item.sleeve} · {item.size} ({item.sku})</span>
        <span>{item.quantity} × {formatGhs(item.price_pesewas)}</span>
      </li>)}</ul>
    </section>
    <section className="admin-section"><h2>Timeline</h2>
      <ol>{history.map((entry) => <li key={entry.id} className="admin-line">
        <span>{entry.event.replaceAll("_"," ")} · {entry.payment_status} / {entry.fulfilment_status}</span>
        <time dateTime={entry.created_at}>{entry.created_at.slice(0,16).replace("T"," ")} UTC</time>
      </li>)}</ol>
    </section>
  </AdminPage>;
}
