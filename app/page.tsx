import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";
import { brandMessaging } from "@/lib/brand-messaging";

export const metadata: Metadata = {
  title: brandMessaging.socialTitle,
  description: brandMessaging.description,
};

export default function Home() {
  return <HomePage />;
}
