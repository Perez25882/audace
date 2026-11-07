import type { Metadata } from "next";
import Link from "next/link";
import { Status } from "@/components/status";
import { ConfirmedBag } from "@/components/confirmed-bag";
import { PaymentStatus } from "@/components/payment-status";
import { formatGhs } from "@/lib/bag";
import { ownedOrder } from "@/lib/server/payment-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
};

export default async function Confirmation({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const id = (await searchParams).order;
  if (!id)
    return (
      <Status
        title="No order to display."
        label="Order confirmation"
        description="Use the payment status link from your checkout to review an order."
      />
    );
  const order = typeof id === "string" ? await ownedOrder(id) : null;
  if (!order)
    return (
      <Status
        title="Order access is unavailable."
        description="Return using the browser where you started checkout."
      />
    );
  if (
    !order.verified ||
    order.payment !== "paid" ||
    order.allocation !== "allocated" ||
    order.review
  )
    return <PaymentStatus order={order} />;

  return (
    <section className="frame shop-page" aria-labelledby="confirmation-heading">
      <ConfirmedBag
        orderId={order.orderId}
        items={order.items.map(({ variantId, size, quantity }) => ({
          variantId,
          size,
          quantity,
        }))}
      />
      <p className="kicker">{order.reference}</p>
      <h1 className="shop-heading" id="confirmation-heading">
        Payment confirmed.
      </h1>
      <p className="shop-intro">
        Thank you for choosing AUDACE. Your order is {order.fulfilment}.
      </p>
      <div className="shop-layout">
        <div>
          <h2 className="confirmation-title">Your garments</h2>
          <ul className="confirmation-items">
            {order.items.map((item) => (
              <li key={JSON.stringify([item.variantId, item.size])}>
                <div>
                  <h3>
                    {item.colour} {item.name.toLowerCase()}
                  </h3>
                  <p>
                    {item.sleeve} · {item.size} · Qty {item.quantity}
                  </p>
                </div>
                <strong>{formatGhs(item.unitPesewas * item.quantity)}</strong>
              </li>
            ))}
          </ul>
          <h2 className="confirmation-title">Delivery</h2>
          <address className="confirmation-address">
            {order.delivery.name}
            <br />
            {order.delivery.address}
            <br />
            {order.delivery.city}, {order.delivery.region}
            {order.delivery.directions && (
              <>
                <br />
                {order.delivery.directions}
              </>
            )}
          </address>
          <p>{order.deliveryMethod}</p>
        </div>
        <aside className="shop-summary" aria-label="Verified payment summary">
          <h2>Payment summary</h2>
          <dl>
            <div>
              <dt>Garments</dt>
              <dd>{formatGhs(order.subtotal)}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{formatGhs(order.deliveryFee)}</dd>
            </div>
            <div className="summary-total">
              <dt>Verified amount paid</dt>
              <dd>{formatGhs(order.amount)}</dd>
            </div>
          </dl>
          <p>Fulfilment · {order.fulfilment}</p>
          <Link className="button button-solid" href="/#collection">
            Continue shopping
          </Link>
        </aside>
      </div>
    </section>
  );
}
