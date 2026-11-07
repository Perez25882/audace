import type { Metadata } from "next";
import { Status } from "@/components/status";

export const metadata: Metadata = { title: "Bag" };

export default function BagPage() {
  return <Status title="Your bag is empty." label="Bag" description="Ordering has yet to open." />;
}
