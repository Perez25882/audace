import type { Metadata } from "next";
import { Status } from "@/components/status";
import { PaymentStatus } from "@/components/payment-status";
import { ownedOrder } from "@/lib/server/payment-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Payment status",
  robots: { index: false, follow: false },
};

export default async function PaymentStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const id = (await searchParams).order;
  const order = typeof id === "string" ? await ownedOrder(id) : null;
  if (!order)
    return (
      <Status
        title="Order access is unavailable."
        description="Return using the browser where you started checkout. Your payment can still be reconciled by the store."
      />
    );
  return <PaymentStatus order={order} />;
}
