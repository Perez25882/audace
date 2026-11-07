import type { Metadata } from "next";
import { BagView } from "@/components/bag-view";
import { variants } from "@/lib/catalogue";

export const metadata: Metadata = { title: "Bag", robots: { index: false } };

export default function BagPage() {
  return <BagView variants={variants} />;
}
