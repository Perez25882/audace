"use client";

import Link from "next/link";
import { useBag } from "@/lib/bag-store";
import { BagIcon } from "./icons";

export function BagLink() {
  const { items } = useBag();
  const count = items.reduce((total, { quantity }) => total + quantity, 0);

  return (
    <Link className="header-link bag-link" href="/bag" aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`}>
      <BagIcon /> <span>Bag</span> <span className="bag-count" aria-hidden="true">{count}</span>
    </Link>
  );
}
