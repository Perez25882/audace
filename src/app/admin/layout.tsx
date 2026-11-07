import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = { title: { default: "Administration", template: "%s | AUDACE Admin" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-layout">{children}</div>;
}
