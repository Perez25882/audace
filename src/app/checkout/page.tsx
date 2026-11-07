import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout-view";
import { getShop } from "@/lib/server/shop";
import { paymentsEnabled } from "@/lib/server/paystack";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const { variants, methods, mode } = await getShop();
  return <CheckoutView variants={variants} methods={methods} serviceUnavailable={mode === "unavailable"} paymentsAvailable={paymentsEnabled()} />;
}
