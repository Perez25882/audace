"use client";

import Link from "next/link";

export default function AdminError({ reset }: { reset: () => void }) {
  return <section className="frame status">
    <h1>Store records are unavailable.</h1>
    <p className="status-description">Try loading this page again.</p>
    <button className="button button-solid" onClick={reset}>Try again</button>
    <Link className="button button-outline" href="/admin">Overview</Link>
  </section>;
}
