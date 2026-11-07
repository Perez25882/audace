"use client";

import { useRef, useState } from "react";
import type { Variant } from "@/lib/shop-model";
import { GarmentImage } from "./garment-image";

export function ProductGallery({ images }: Pick<Variant, "images">) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const asset = images[index];

  return (
    <div className="product-figure">
      <figure>
        <div className="product-image">
          <GarmentImage asset={asset} sizes="(min-width: 80rem) 570px, (min-width: 52rem) 52vw, 88vw" aboveFold />
        </div>
        <figcaption className="gallery-caption">
          <span>{asset.label} <span aria-hidden="true">/</span> Garment illustration</span>
          <button className="text-action" type="button" ref={trigger} onClick={() => dialog.current?.showModal()}>
            Zoom image <span aria-hidden="true">+</span>
          </button>
        </figcaption>
      </figure>
      {images.length > 1 && (
        <div className="gallery-thumbnails" role="group" aria-label="Choose an image">
          {images.map((image, position) => (
            <button key={image.src} type="button" aria-label={image.label} aria-pressed={index === position} onClick={() => setIndex(position)}>
              <GarmentImage asset={image} sizes="64px" decorative />
            </button>
          ))}
        </div>
      )}
      <dialog className="gallery-dialog" ref={dialog} aria-labelledby="zoom-title" onClose={() => trigger.current?.focus()}>
        <div className="gallery-toolbar">
          <h2 id="zoom-title">{asset.label}</h2>
          <button className="text-action" type="button" onClick={() => dialog.current?.close()}>Close image</button>
        </div>
        <div className="gallery-zoom" role="region" tabIndex={0} aria-label="Scrollable garment illustration">
          <GarmentImage asset={asset} sizes="742px" original />
        </div>
      </dialog>
    </div>
  );
}
