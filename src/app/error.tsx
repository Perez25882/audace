"use client";

import { Status } from "@/components/status";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <Status title="Something went wrong." description="Try loading this page again.">
      <button className="button button-solid" type="button" onClick={reset}>Try again</button>
    </Status>
  );
}
