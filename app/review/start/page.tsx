import type { Metadata } from "next";
import { ReviewStartExperience } from "@/components/review-start-experience";

export const metadata: Metadata = {
  title: "Start a smart contract or protocol release review",
  description:
    "Submit one fixed-scope release for a supported EVM or non-EVM ecosystem and continue directly to the scheduling-deposit checkout.",
  robots: { index: false, follow: false },
};

export default function ReviewStartPage() {
  return <ReviewStartExperience />;
}
