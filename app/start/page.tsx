import { permanentRedirect } from "next/navigation";
import {
  type PublicSearchParams,
  withSearchParams,
} from "@/lib/public-navigation";

export const dynamic = "force-dynamic";

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<PublicSearchParams>;
}) {
  const values = await searchParams;
  permanentRedirect(withSearchParams("/review/start", values));
}
