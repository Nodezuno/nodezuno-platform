import type { ParsedUser } from "./http.ts";
import { createNodezunoAuth } from "./auth.ts";
import {
  verifiedUserFromHeaders,
  verifiedUserFromRequest,
} from "./identity.ts";

type AuthIdentityDetails = {
  providerId: string | null;
  evmAddress: string | null;
  solanaAddress: string | null;
};

export async function accountIdentityFromRequest(
  request: Request,
): Promise<ParsedUser | null> {
  const applicationIdentity = await readApplicationIdentity(
    request.headers,
    request,
  );
  if (applicationIdentity) return applicationIdentity;
  return hostedAccountIdentity(
    await verifiedUserFromRequest(request),
  );
}

export async function accountIdentityFromHeaders(
  requestHeaders: Headers,
): Promise<ParsedUser | null> {
  const applicationIdentity = await readApplicationIdentity(requestHeaders);
  if (applicationIdentity) return applicationIdentity;
  return hostedAccountIdentity(
    await verifiedUserFromHeaders(requestHeaders),
  );
}

function hostedAccountIdentity(user: ParsedUser | null): ParsedUser | null {
  if (!user) return null;
  return {
    ...user,
    authMethod: "chatgpt",
    contactEmail: user.email,
  };
}

async function readApplicationIdentity(
  requestHeaders: Headers,
  request?: Request,
): Promise<ParsedUser | null> {
  if (!hasApplicationSessionCookie(requestHeaders)) return null;
  try {
    const auth = await createNodezunoAuth(request);
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user) return null;

    const details = await readIdentityDetails(session.user.id);
    const syntheticEmail = isSyntheticWalletEmail(session.user.email);
    const walletAddress =
      details.evmAddress ?? details.solanaAddress ?? null;
    const authMethod = resolveAuthMethod(details);
    const displayName =
      walletAddress && syntheticEmail
        ? compactWalletAddress(walletAddress)
        : session.user.name.trim() ||
          (syntheticEmail ? "Wallet account" : session.user.email);
    return {
      accountId: session.user.id,
      authMethod,
      contactEmail: syntheticEmail ? null : session.user.email,
      displayName,
      email: session.user.email,
      fullName: syntheticEmail ? null : session.user.name,
      walletAddress,
    };
  } catch (error) {
    if (isMissingAuthConfiguration(error)) return null;
    throw error;
  }
}

function hasApplicationSessionCookie(requestHeaders: Headers): boolean {
  const cookies = requestHeaders.get("cookie");
  if (!cookies) return false;
  return /(?:^|;\s*)(?:__Secure-)?nodezuno\.session_token=/.test(cookies);
}

async function readIdentityDetails(
  userId: string,
): Promise<AuthIdentityDetails> {
  const { getDatabase } = await import("./database-binding.ts");
  const database = await getDatabase();
  const [provider, evm, solana] = await Promise.all([
    database
      .prepare(
        `SELECT provider_id AS providerId
         FROM auth_accounts
         WHERE user_id = ?
         ORDER BY created_at ASC
         LIMIT 1`,
      )
      .bind(userId)
      .first<{ providerId: string }>(),
    database
      .prepare(
        `SELECT address
         FROM auth_wallet_addresses
         WHERE user_id = ?
         ORDER BY is_primary DESC, created_at ASC
         LIMIT 1`,
      )
      .bind(userId)
      .first<{ address: string }>(),
    database
      .prepare(
        `SELECT address
         FROM auth_solana_wallets
         WHERE user_id = ?
         ORDER BY is_primary DESC, created_at ASC
         LIMIT 1`,
      )
      .bind(userId)
      .first<{ address: string }>(),
  ]);
  return {
    providerId: provider?.providerId ?? null,
    evmAddress: evm?.address ?? null,
    solanaAddress: solana?.address ?? null,
  };
}

function resolveAuthMethod(
  details: AuthIdentityDetails,
): NonNullable<ParsedUser["authMethod"]> {
  if (details.solanaAddress) return "solana";
  if (details.evmAddress) return "evm";
  if (details.providerId === "google") return "google";
  return "email";
}

function isSyntheticWalletEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (
    normalized.endsWith("@evm.wallet.nodezuno.invalid") ||
    normalized.endsWith("@sol.wallet.nodezuno.invalid")
  );
}

function compactWalletAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-5)}`;
}

function isMissingAuthConfiguration(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown };
  return (
    candidate.code === "authentication_not_configured" ||
    candidate.code === "authentication_origin_not_configured"
  );
}
