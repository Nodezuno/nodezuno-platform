import type { Metadata } from "next";
import { PasswordRecoveryExperience } from "@/components/password-recovery-experience";
import { firstSearchParam, safeRelativeReturnPath } from "@/lib/auth-paths";
import { getAuthProviderAvailability } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recover account",
  description: "Request a secure Nodezuno password recovery link.",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string | string[] }>;
}) {
  const { return_to: requestedReturnTo } = await searchParams;
  const returnTo = safeRelativeReturnPath(
    firstSearchParam(requestedReturnTo) ?? "/account",
  );
  const providers = await getAuthProviderAvailability();
  return (
    <PasswordRecoveryExperience
      available={providers.emailVerification}
      mode="request"
      returnTo={returnTo}
    />
  );
}
