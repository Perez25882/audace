import { randomUUID } from "node:crypto";
import { formatGhs } from "@/lib/bag";
import type { AdminRole } from "@/lib/server/admin";
import { Submit } from "../submit";
import { requestRefundReview } from "./actions";

export type PaymentDetail = {
  attempts: {
    id: string;
    reference: string;
    state: string;
    provider_status: string | null;
    provider_channel: string | null;
    expected_pesewas: number;
    created_at: string;
  }[];
  receipts: {
    provider_id: string;
    amount_pesewas: number;
    channel: string;
    resolution: string;
    verified_at: string;
  }[];
  history: { id: number; event: string; created_at: string }[];
  events: {
    id: string;
    event_type: string;
    duplicates: number;
    received_at: string;
  }[];
  refunds: {
    id: string;
    amount_pesewas: number;
    state: string;
    reason: string;
  }[];
  disputes: {
    id: number;
    provider_id: string;
    event_type: string;
    state: string;
  }[];
};

export function OrderPayments({
  data,
  orderId,
  role,
}: {
  data: PaymentDetail;
  orderId: string;
  role: AdminRole;
}) {
  return (
    <section className="admin-section">
      <h2>Payments and reconciliation</h2>
      {!data.attempts.length ? (
        <p>There are no payment attempts for this order.</p>
      ) : (
        <ul>
          {data.attempts.map((attempt) => (
            <li key={attempt.id} className="admin-line">
              <span>
                {attempt.reference} · {attempt.state} ·{" "}
                {attempt.provider_channel ?? "Channel pending"}
              </span>
              <span>{formatGhs(attempt.expected_pesewas)}</span>
            </li>
          ))}
        </ul>
      )}
      {data.receipts.map((receipt) => (
        <div key={receipt.provider_id} className="admin-panel">
          <h3>Verified transaction {receipt.provider_id}</h3>
          <p>
            {formatGhs(receipt.amount_pesewas)} · {receipt.channel} ·{" "}
            {receipt.resolution.replaceAll("_", " ")}
          </p>
          {role === "owner" && (
            <details className="admin-disclosure">
              <summary>Request refund review</summary>
              <p>This records a review request for a full or partial refund.</p>
              <form action={requestRefundReview} className="admin-form">
                <input type="hidden" name="order" value={orderId} />
                <input
                  type="hidden"
                  name="provider"
                  value={receipt.provider_id}
                />
                <input type="hidden" name="request" value={randomUUID()} />
                <label>
                  Amount in GHS{" "}
                  <input
                    name="amount"
                    inputMode="decimal"
                    maxLength={11}
                    required
                  />
                </label>
                <label>
                  Reason{" "}
                  <textarea name="reason" maxLength={500} required rows={2} />
                </label>
                <Submit>Record refund review</Submit>
              </form>
            </details>
          )}
        </div>
      ))}
      {data.refunds.length > 0 && (
        <>
          <h3>Refund reviews</h3>
          <ul>
            {data.refunds.map((refund) => (
              <li className="admin-line" key={refund.id}>
                <span>
                  {refund.state} · {refund.reason}
                </span>
                <span>{formatGhs(refund.amount_pesewas)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {data.disputes.length > 0 && (
        <>
          <h3>Disputes</h3>
          <ul>
            {data.disputes.map((dispute) => (
              <li className="admin-line" key={dispute.id}>
                {dispute.provider_id} · {dispute.event_type} · {dispute.state}
              </li>
            ))}
          </ul>
        </>
      )}
      <details className="admin-disclosure">
        <summary>Payment event history</summary>
        <ol>
          {data.history.map((entry) => (
            <li key={entry.id} className="admin-line">
              <span>{entry.event.replaceAll("_", " ")}</span>
              <time dateTime={entry.created_at}>
                {entry.created_at.slice(0, 16).replace("T", " ")} UTC
              </time>
            </li>
          ))}
        </ol>
        <ul>
          {data.events.map((event) => (
            <li className="admin-line" key={event.id}>
              {event.event_type} · {event.duplicates} duplicate deliveries
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
