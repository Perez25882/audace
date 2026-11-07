"use client";

import { useFormStatus } from "react-dom";

export function Submit({ children, primary = false }: { children: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={`button ${primary ? "button-solid" : "button-outline"}`} type="submit" disabled={pending}>{pending ? "Working…" : children}</button>;
}
