import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthExperience } from "@/components/auth-experience";
import { firstSearchParam, safeRelativeReturnPath } from "@/lib/auth-paths";
import { accountIdentityFromHeaders } from "@/lib/server/account-identity";
import { getAuthProviderAvailability } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to your Nodezuno client portal.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
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
          : error === "verify_email"
            ? "Check your inbox and verify your email before signing in."
            : error === "password_reset"
              ? "Your password was reset. Sign in with the new password."
              : undefined
      }
      mode="login"
      providers={providers}
      returnTo={returnTo}
    />
  );
}
