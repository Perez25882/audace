"use client";

import Link from "next/link";
import { useRef } from "react";
import { formatGhs, isPesewas, lineKey, quantityLimit, quoteBag, setBagQuantity } from "@/lib/bag";
import { changeBag, useBag } from "@/lib/bag-store";
import type { Variant } from "@/lib/shop-model";
import { GarmentImage } from "./garment-image";
import { Arrow } from "./icons";
import { Quantity } from "./quantity";

export function BagView({ variants, serviceUnavailable }: { variants: readonly Variant[]; serviceUnavailable: boolean }) {
  const { items, ready, persistent } = useBag();
  const heading = useRef<HTMLHeadingElement>(null);
  const quote = quoteBag(items, variants);

  return (
    <section className="frame shop-page" aria-labelledby="bag-heading">
      <Link className="back-link" href="/#collection"><Arrow direction="left" /> Continue shopping</Link>
      <h1 className="shop-heading" id="bag-heading" ref={heading} tabIndex={-1}>Your bag</h1>
      {serviceUnavailable && <p className="shop-notice" role="status">Product availability is temporarily unavailable. Your bag is saved for another visit.</p>}
      {!ready ? <p role="status">Loading your bag…</p> : items.length === 0 ? (
        <div className="shop-empty">
          <p>Your bag is empty.</p>
          <Link className="button button-solid" href="/#collection">Explore the collection <Arrow /></Link>
        </div>
      ) : (
        <div className="shop-layout">
          <ul className="bag-items" aria-label="Bag items">
            {quote.lines.map(({ item, variant, lineTotal, available }) => (
              <li key={lineKey(item)} className="bag-item">
                {variant && (
                  <Link className="bag-image" href={`/products/${variant.slug}`} aria-label={`View ${variant.colour} ${variant.sleeve.toLowerCase()} shirt`}>
                    <GarmentImage asset={variant.images[0]} sizes="116px" decorative />
                  </Link>
                )}
                <div className="bag-item-main">
                  <div className="bag-item-top">
                    <div>
                      <h2>{variant ? `${variant.colour} ${variant.name.toLowerCase()}` : "Unavailable item"}</h2>
                      <p>{variant ? `${variant.sleeve} / ${item.size}` : `Size ${item.size}`}</p>
                    </div>
                    {lineTotal !== null && <strong>{formatGhs(lineTotal)}</strong>}
                  </div>
                  {isPesewas(variant?.pricePesewas) && <p>{formatGhs(variant.pricePesewas)} each</p>}
                  {!available && <p className="shop-alert">This selection is unavailable at the saved quantity.</p>}
                  <div className="bag-item-actions">
                    <Quantity value={item.quantity} max={variant ? quantityLimit(variant, item.size) : 0}
                      label={`Quantity for ${variant ? `${variant.colour} ${variant.sleeve.toLowerCase()}` : "unavailable item"}, size ${item.size}`}
                      onChange={(quantity) => changeBag((bag) => setBagQuantity(bag, { ...item, quantity }, variant))} />
                    <button className="text-action" type="button" aria-label={`Remove ${variant ? `${variant.colour} ${variant.sleeve.toLowerCase()}` : "unavailable item"}, size ${item.size}`}
                      onClick={() => {
                        changeBag((bag) => setBagQuantity(bag, { ...item, quantity: 0 }, variant));
                        heading.current?.focus();
                      }}>Remove</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <aside className="shop-summary" aria-labelledby="bag-summary">
            <h2 id="bag-summary">Bag summary</h2>
            <dl><div><dt>Subtotal</dt><dd>{quote.subtotal === null ? "Unavailable" : formatGhs(quote.subtotal)}</dd></div></dl>
            <p>Delivery is shown at checkout when available.</p>
            {quote.ready ? (
              <Link className="button button-solid" href="/checkout">Continue to checkout <Arrow /></Link>
            ) : <p className="shop-alert">Update or remove unavailable items to continue.</p>}
          </aside>
        </div>
      )}
      {!persistent && <p className="shop-alert">Your browser could not save this bag. Keep this tab open to retain it.</p>}
    </section>
  );
}
