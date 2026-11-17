import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthExperience } from "@/components/auth-experience";
import { firstSearchParam, safeRelativeReturnPath } from "@/lib/auth-paths";
import { accountIdentityFromHeaders } from "@/lib/server/account-identity";
import { getAuthProviderAvailability } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create account",
  description:
    "Create an account for the Nodezuno client portal.",
  robots: { index: false, follow: false },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    return_to?: string | string[];
  }>;
}) {
  const requestHeaders = await headers();
  const existingUser = await accountIdentityFromHeaders(requestHeaders);
  const {
    error: errorValue,
    return_to: requestedReturnTo,
  } = await searchParams;
  const error = firstSearchParam(errorValue);
  const returnTo = safeRelativeReturnPath(
    firstSearchParam(requestedReturnTo) ?? "/account",
  );
  if (existingUser) redirect(returnTo);
  const providers = await getAuthProviderAvailability();
  return (
    <AuthExperience
      initialError={
        error === "google"
          ? "Google sign-in was not completed. Please try again."
          : undefined
      }
      mode="signup"
      providers={providers}
      returnTo={returnTo}
    />
  );
}
