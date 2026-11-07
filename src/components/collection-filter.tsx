"use client";

import { useState } from "react";
import type { Sleeve } from "@/lib/catalogue";

type CollectionItem = { slug: string; sleeve: Sleeve; card: React.ReactNode };
type Filter = "All styles" | Sleeve;

export function CollectionFilter({
  items,
  sleeves,
}: {
  items: CollectionItem[];
  sleeves: readonly Sleeve[];
}) {
  const [filter, setFilter] = useState<Filter>("All styles");
  const visible = filter === "All styles" ? items : items.filter((item) => item.sleeve === filter);

  return (
    <>
      <div className="collection-controls">
        <div className="filter-options" role="group" aria-label="Filter garments by sleeve">
          {(["All styles", ...sleeves] as const).map((option) => (
            <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}>
              {option}
            </button>
          ))}
        </div>
        <p className="collection-count" role="status">
          {visible.length} {visible.length === 1 ? "variant" : "variants"}
        </p>
      </div>
      <ul className="collection-grid">
        {visible.map(({ slug, card }) => <li key={slug}>{card}</li>)}
      </ul>
    </>
  );
}
