import type { Metadata } from "next";
import { Status } from "@/components/status";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return <Status title="Checkout is unavailable." label="Checkout" description="You can explore the collection while ordering is being prepared." />;
}
