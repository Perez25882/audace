import type { Metadata } from "next";
import { BagView } from "@/components/bag-view";
import { getShop } from "@/lib/server/shop";

export const metadata: Metadata = { title: "Bag", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BagPage() {
  const { variants, mode } = await getShop();
  return <BagView variants={variants} serviceUnavailable={mode === "unavailable"} />;
}
