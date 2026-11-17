import type { Metadata } from "next";
import { PasswordRecoveryExperience } from "@/components/password-recovery-experience";
import { firstSearchParam, safeRelativeReturnPath } from "@/lib/auth-paths";
import { getAuthProviderAvailability } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new password for a Nodezuno account.",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    return_to?: string | string[];
    token?: string | string[];
  }>;
}) {
  const {
    return_to: requestedReturnTo,
    token: tokenValue,
  } = await searchParams;
  const returnTo = safeRelativeReturnPath(
    firstSearchParam(requestedReturnTo) ?? "/account",
  );
  const token = firstSearchParam(tokenValue);
  const providers = await getAuthProviderAvailability();
  return (
    <PasswordRecoveryExperience
      available={providers.emailVerification}
      mode="reset"
      returnTo={returnTo}
      token={token}
    />
  );
}
