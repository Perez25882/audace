import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout-view";
import { variants } from "@/lib/catalogue";
import { merchant } from "@/lib/merchant-config";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return <CheckoutView variants={variants} methods={merchant.deliveryMethods} />;
}
