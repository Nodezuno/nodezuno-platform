import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewOrderExperience } from "@/components/review-order-experience";
import { REVIEW_ORDER_ID_PATTERN } from "@/lib/server/review-commerce";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smart contract and protocol release service order",
  description:
    "Review the fixed service order and complete the Ethereum Mainnet scheduling deposit securely.",
  robots: { index: false, follow: false },
};

export default async function ReviewOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!REVIEW_ORDER_ID_PATTERN.test(id)) notFound();
  return <ReviewOrderExperience orderId={id} />;
}
