import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";

export const metadata: Metadata = {
  title: "Smart contract and protocol release security reviews",
  description:
    "Compare one planned smart contract or protocol release with its previously audited or professionally reviewed version before production.",
};

export default function Home() {
  return <HomePage />;
}
