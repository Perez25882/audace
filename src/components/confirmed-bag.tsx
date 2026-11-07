"use client";

import { useEffect, useRef } from "react";
import { changeBag } from "@/lib/bag-store";
import { lineKey, type BagItem } from "@/lib/bag";
import { clearCheckoutIdentity } from "@/lib/payments/checkout-session";

export function ConfirmedBag({
  orderId,
  items,
}: {
  orderId: string;
  items: readonly BagItem[];
}) {
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    try {
      const key = `audace-paid-${orderId}`;
      if (localStorage.getItem(key)) return;
      // Clear only a bag that still exactly matches the paid checkout.
      changeBag((current) => {
        const unchanged =
          current.length === items.length &&
          items.every((paid) =>
            current.some(
              (item) =>
                lineKey(item) === lineKey(paid) &&
                item.quantity === paid.quantity,
            ),
          );
        return unchanged ? [] : current;
      });
      localStorage.setItem(key, "1");
      clearCheckoutIdentity();
    } catch {
      /* Bag editing remains available when browser storage is restricted. */
    }
  }, [items, orderId]);
  return null;
}
