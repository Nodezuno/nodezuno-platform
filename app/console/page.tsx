import { permanentRedirect } from "next/navigation";
import {
  type PublicSearchParams,
  withSearchParams,
} from "@/lib/public-navigation";

export const dynamic = "force-dynamic";

export default async function LegacyConsolePage({
  searchParams,
}: {
  searchParams: Promise<PublicSearchParams>;
}) {
  const values = await searchParams;
  permanentRedirect(withSearchParams("/account", values));
}
