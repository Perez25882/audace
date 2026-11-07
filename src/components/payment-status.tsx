"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGhs } from "@/lib/bag";
import type { CustomerOrder } from "@/lib/server/payment-service";

export function PaymentStatus({ order }: { order: CustomerOrder }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const checking = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const paid = order.verified && order.payment === "paid";
  const failed =
    !paid &&
    (order.attempt?.state === "failed" || order.attempt?.state === "abandoned");
  const needsReview =
    paid && (order.review || order.allocation !== "allocated");
  const confirmed = paid && !needsReview;
  const activeReservation = order.canResume && order.payment === "pending";
  const reservationEnded = !paid && !failed && !activeReservation;

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setWorking(true);
    controller.current = new AbortController();
    try {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.orderId }),
        signal: controller.current.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        setNotice(
          "Payment verification is temporarily unavailable. Please check again shortly.",
        );
      } else if (
        data.verified &&
        data.payment === "paid" &&
        data.allocation === "allocated" &&
        !data.review
      ) {
        router.replace(`/order-confirmation?order=${order.orderId}`);
      } else {
        setNotice(
          data.verified
            ? "Your payment is verified and the store is reviewing your order."
            : "Payment has yet to be confirmed. You can check again shortly.",
        );
        router.refresh();
      }
    } catch {
      setNotice(
        "The connection was interrupted. You can safely check this payment again.",
      );
    } finally {
      checking.current = false;
      setWorking(false);
    }
  }, [order.orderId, router]);

  useEffect(() => {
    if (confirmed) {
      router.replace(`/order-confirmation?order=${order.orderId}`);
      return;
    }
    if (paid || failed || order.attempt?.state === "review") return;
    const initialCheck = setTimeout(() => {
      void check();
    }, 0);
    let rounds = 0;
    const interval = setInterval(() => {
      if (++rounds > 12) {
        clearInterval(interval);
        return;
      }
      if (document.visibilityState === "visible") void check();
    }, 10_000);
    return () => {
      clearTimeout(initialCheck);
      clearInterval(interval);
      controller.current?.abort();
    };
  }, [
    check,
    confirmed,
    failed,
    paid,
    order.attempt?.state,
    order.orderId,
    router,
  ]);

  async function retry() {
    if (checking.current) return;
    checking.current = true;
    setWorking(true);
    try {
      const response = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryOrderId: order.orderId }),
      });
      const data = await response.json();
      if (!response.ok)
        setNotice(
          data.error ??
            "Payment could not be restarted. Review your bag and try again.",
        );
      else if (data.authorizationUrl)
        window.location.assign(data.authorizationUrl);
      else {
        setNotice(
          "The payment request is being reconciled. Check its status again shortly.",
        );
        router.refresh();
      }
    } catch {
      setNotice(
        "The connection was interrupted. You can safely retry this request.",
      );
    } finally {
      checking.current = false;
      setWorking(false);
    }
  }

  const title = confirmed
    ? "Payment confirmed."
    : needsReview
      ? "Your payment is verified."
      : paid
        ? "Payment verified."
        : failed
          ? "Payment incomplete."
          : order.attempt?.state === "review"
            ? "Payment under review."
            : reservationEnded
              ? "Reservation ended."
              : "Checking your payment.";

  return (
    <section className="frame shop-page" aria-labelledby="payment-heading">
      <p className="kicker">AUDACE · {order.reference}</p>
      <h1 className="shop-heading" id="payment-heading">
        {title}
      </h1>
      <p className="shop-intro">
        {needsReview
          ? "The store is reviewing your order before fulfilment. Your payment has been recorded."
          : failed
            ? "You can retry securely or return to your bag."
            : reservationEnded
              ? "Your stock reservation has ended. Check any payment already started before placing another order. A delayed payment can still be verified."
              : "Mobile money and card payments can take a moment to update. Closing this page does not cancel a payment."}
      </p>
      <p className="payment-amount">{formatGhs(order.amount)}</p>
      <div className="payment-actions">
        <button
          className="button button-solid"
          type="button"
          disabled={working}
          onClick={check}
        >
          {working ? "Checking…" : "Check payment status"}
        </button>
        {!paid &&
          (failed ||
            (activeReservation && order.attempt?.state !== "review")) && (
            <button
              className="button button-outline"
              type="button"
              disabled={working}
              onClick={retry}
            >
              {failed ? "Retry payment" : "Resume secure checkout"}
            </button>
          )}
        <Link className="button button-outline" href="/bag">
          Return to bag
        </Link>
      </div>
      <p className="purchase-feedback" role="status">
        {notice}
      </p>
    </section>
  );
}
