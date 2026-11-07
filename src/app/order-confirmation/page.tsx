import type { Metadata } from "next";
import { Status } from "@/components/status";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false } };

export default function OrderConfirmationPage() {
  return <Status title="No order to display." label="Order confirmation" description="Confirmed orders will appear here once ordering is available." />;
}
