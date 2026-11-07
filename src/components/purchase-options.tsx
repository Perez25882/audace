"use client";

import Link from "next/link";
import { useState } from "react";
import { availability, formatGhs, isPesewas, quantityInBag, quantityLimit, setBagQuantity } from "@/lib/bag";
import { changeBag, useBag } from "@/lib/bag-store";
import type { Variant } from "@/lib/shop-model";
import { Quantity } from "./quantity";

type PurchaseVariant = Pick<Variant, "id" | "pricePesewas" | "sizes" | "published">;

export function PurchaseOptions({ variant }: { variant: PurchaseVariant }) {
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const { items, ready, persistent } = useBag();
  const status = availability(variant);
  const remaining = Math.max(0, quantityLimit(variant, size) - quantityInBag(items, variant.id, size));
  const selectedQuantity = Math.min(quantity, Math.max(remaining, 1));

  function addItem() {
    const added = changeBag((bag) => setBagQuantity(bag, {
      variantId: variant.id,
      size,
      quantity: quantityInBag(bag, variant.id, size) + selectedQuantity,
    }, variant));
    setMessage(added ? "Added to your bag." : "This quantity is unavailable. Check your bag and try again.");
    if (added) setQuantity(1);
  }

  return (
    <div className="purchase-options">
      <div className="purchase-price">
        <strong>{isPesewas(variant.pricePesewas) ? formatGhs(variant.pricePesewas) : "Price to be confirmed"}</strong>
        <p id="availability">{status === "available" ? "Available to order" : status === "unconfigured" ? "Ordering details are pending." : "Currently unavailable."}</p>
      </div>
      <fieldset className="variant-group size-group">
        <legend>Size</legend>
        {variant.sizes.length ? (
          <div className="size-options">
            {variant.sizes.map(({ label, stock }) => (
              <label key={label}>
                <input type="radio" name="garment-size" value={label} checked={size === label} disabled={!isPesewas(stock) || stock === 0}
                  onChange={() => { setSize(label); setQuantity(1); setMessage(""); }} />
                <span>{label}{stock === 0 ? " (unavailable)" : stock === null ? " (pending)" : ""}</span>
              </label>
            ))}
          </div>
        ) : <p>Sizes to be confirmed.</p>}
      </fieldset>
      <div className="purchase-actions">
        <Quantity value={selectedQuantity} max={remaining} disabled={!ready || !remaining} onChange={setQuantity} />
        <button className="button button-solid" type="button" disabled={!ready || !remaining} aria-describedby="availability" onClick={addItem}>Add to Bag</button>
      </div>
      {status === "available" && !size && <p className="purchase-hint">Select a size to add this garment.</p>}
      {size && status === "available" && !remaining && <p className="purchase-hint">The available quantity for this size is already in your bag.</p>}
      <p className="purchase-feedback" role="status">{message}</p>
      {message === "Added to your bag." && <Link className="text-action" href="/bag">View bag</Link>}
      {!persistent && <p className="purchase-hint">Your browser could not save this bag. Keep this tab open to retain it.</p>}
    </div>
  );
}
