import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { siwe } from "better-auth/plugins";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { verifyMessage, type Address, type Hex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { getDb } from "../../db/index.ts";
import {
  authAccounts,
  authRateLimits,
  authSessions,
  authSolanaWallets,
  authUsers,
  authVerifications,
  authWalletAddresses,
} from "../../db/schema.ts";
import { HttpProblem } from "./http.ts";
import { sha256Hex } from "./crypto.ts";
import {
  allowsLocalUnverifiedEmailAuthentication,
  configuredPublicOrigin,
  INTERNAL_CLIENT_IP_HEADER,
  INTERNAL_ORIGIN_VERIFIED_HEADER,
  isContainerRuntime,
  normalizeApplicationOrigin,
  normalizedRuntimeSecret,
  optionalGoogleConfigurationIsValid,
  runtimeEnvironmentValue,
} from "./runtime-config.ts";
import {
  isZohoEmailDeliveryConfigured,
  sendNodezunoEmail,
} from "./zoho-email.ts";
import { nodezunoSolanaAuth } from "./solana-auth-plugin.ts";

const SIWE_STATEMENT =
  "Sign in to Nodezuno. This request does not create a transaction or cost gas.";
const WALLET_CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
const DEFAULT_SESSION_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_SESSION_REFRESH_SECONDS = 24 * 60 * 60;
const ALLOWED_EVM_CHAIN_IDS = new Set([
  1, 10, 56, 137, 8453, 42161, 43114, 80002, 84532, 11155111,
]);

const authSchema = {
  user: authUsers,
  session: authSessions,
  account: authAccounts,
  verification: authVerifications,
  rateLimit: authRateLimits,
  walletAddress: authWalletAddresses,
  solanaWallet: authSolanaWallets,
};

export type AuthProviderAvailability = {
  email: boolean;
  emailVerification: boolean;
  google: boolean;
  evm: true;
  solana: true;
  evmChainIds: number[];
};

type AuthRuntimeConfiguration = {
  baseURL: string;
  domain: string;
  scheme: "http" | "https";
  secret: string;
  googleClientId: string | null;
  googleClientSecret: string | null;
  emailDeliveryEnabled: boolean;
  emailEnabled: boolean;
};

export async function getAuthProviderAvailability(): Promise<AuthProviderAvailability> {
  const [
    googleClientId,
    googleClientSecret,
    zohoSmtpHost,
    zohoSmtpPassword,
    configuredAuthUrl,
    localPreview,
  ] = await Promise.all([
    runtimeEnvironmentValue("GOOGLE_CLIENT_ID"),
    runtimeEnvironmentValue("GOOGLE_CLIENT_SECRET"),
    runtimeEnvironmentValue("ZOHO_SMTP_HOST"),
    runtimeEnvironmentValue("ZOHO_SMTP_PASSWORD"),
    runtimeEnvironmentValue("BETTER_AUTH_URL"),
    runtimeEnvironmentValue("NODEZUNO_LOCAL_PREVIEW"),
  ]);
  const emailVerification = isZohoEmailDeliveryConfigured(
    zohoSmtpPassword,
    zohoSmtpHost,
  );
  return {
    email:
      emailVerification ||
      allowsLocalUnverifiedEmailAuthentication(
        configuredAuthUrl,
        localPreview,
      ),
    emailVerification,
    google: hasGoogleProvider(googleClientId, googleClientSecret),
    evm: true,
    solana: true,
    evmChainIds: [...ALLOWED_EVM_CHAIN_IDS],
  };
}

export async function createNodezunoAuth(
  request?: Request,
  database?: D1Database,
) {
  const configuration = await readAuthRuntimeConfiguration(request);
  const db = database
    ? drizzleD1(database, { schema: authSchema })
    : await getDb();
  const googleEnabled = Boolean(
    configuration.googleClientId && configuration.googleClientSecret,
  );
  const emailDeliveryEnabled = configuration.emailDeliveryEnabled;

  return betterAuth({
    appName: "Nodezuno",
    baseURL: configuration.baseURL,
    basePath: "/api/auth",
    secret: configuration.secret,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema,
      transaction: false,
    }),
    emailAndPassword: {
      enabled: configuration.emailEnabled,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: emailDeliveryEnabled,
      autoSignIn: !emailDeliveryEnabled,
      revokeSessionsOnPasswordReset: true,
      ...(emailDeliveryEnabled
        ? {
            sendResetPassword: async ({
              user,
              url,
            }: {
              user: { email: string; name: string };
              url: string;
            }) =>
              sendAuthenticationEmail({
                to: user.email,
                subject: "Reset your Nodezuno password",
                preview:
                  "Use this secure link to choose a new Nodezuno password.",
                url,
              }),
          }
        : {}),
    },
    ...(emailDeliveryEnabled
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: true,
            expiresIn: 60 * 60,
            sendVerificationEmail: async ({
              user,
              url,
            }: {
              user: { email: string; name: string };
              url: string;
            }) =>
              sendAuthenticationEmail({
                to: user.email,
                subject: "Verify your Nodezuno email",
                preview:
                  "Confirm this email address to activate your Nodezuno account.",
                url,
              }),
          },
        }
      : {}),
    socialProviders: googleEnabled
      ? {
          google: {
            clientId: configuration.googleClientId!,
            clientSecret: configuration.googleClientSecret!,
            accessType: "online",
            disableDefaultScope: true,
            scope: ["openid", "email", "profile"],
          },
        }
      : {},
    account: {
      encryptOAuthTokens: true,
      updateAccountOnSignIn: false,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },
    session: {
      expiresIn: DEFAULT_SESSION_SECONDS,
      updateAge: DEFAULT_SESSION_REFRESH_SECONDS,
      freshAge: 15 * 60,
      cookieCache: { enabled: false },
    },
    verification: {
      storeIdentifier: "hashed",
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path !== "/sign-up/email") return;
        const email =
          typeof context.body.email === "string"
            ? context.body.email.trim().toLowerCase()
            : "";
        if (isReservedWalletEmail(email)) {
          throw APIError.fromStatus("BAD_REQUEST", {
            message: "Use a public email address or sign in with your wallet.",
          });
        }
      }),
    },
    trustedOrigins: [configuration.baseURL],
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
        "/siwe/nonce": { window: 60, max: 12 },
        "/siwe/verify": { window: 60, max: 8 },
        "/solana/nonce": { window: 60, max: 12 },
        "/solana/verify": { window: 60, max: 8 },
      },
    },
    advanced: {
      useSecureCookies: configuration.scheme === "https",
      cookiePrefix: "nodezuno",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: configuration.scheme === "https",
        path: "/",
      },
      ipAddress: {
        ipAddressHeaders: [INTERNAL_CLIENT_IP_HEADER],
      },
      database: {
        generateId: "uuid",
      },
    },
    plugins: [
      siwe({
        domain: configuration.domain,
        emailDomainName: "evm.wallet.nodezuno.invalid",
        anonymous: true,
        getNonce: async () => randomNonce(),
        verifyMessage: async ({
          message,
          signature,
          address,
          chainId,
        }) =>
          verifyStrictSiweMessage({
            message,
            signature,
            address,
            chainId,
            baseURL: configuration.baseURL,
            domain: configuration.domain,
            scheme: configuration.scheme,
          }),
      }),
      nodezunoSolanaAuth({
        domain: configuration.domain,
        uri: configuration.baseURL,
      }),
    ],
  });
}

function isReservedWalletEmail(email: string): boolean {
  return (
    email.endsWith("@evm.wallet.nodezuno.invalid") ||
    email.endsWith("@sol.wallet.nodezuno.invalid")
  );
}

async function readAuthRuntimeConfiguration(
  request?: Request,
): Promise<AuthRuntimeConfiguration> {
  const [
    secretValue,
    configuredAuthUrl,
    googleClientId,
    googleClientSecret,
    zohoSmtpHost,
    zohoSmtpPassword,
    localPreview,
  ] = await Promise.all([
      runtimeEnvironmentValue("BETTER_AUTH_SECRET"),
      runtimeEnvironmentValue("BETTER_AUTH_URL"),
      runtimeEnvironmentValue("GOOGLE_CLIENT_ID"),
      runtimeEnvironmentValue("GOOGLE_CLIENT_SECRET"),
      runtimeEnvironmentValue("ZOHO_SMTP_HOST"),
      runtimeEnvironmentValue("ZOHO_SMTP_PASSWORD"),
      runtimeEnvironmentValue("NODEZUNO_LOCAL_PREVIEW"),
    ]);
  const secret = normalizedRuntimeSecret(secretValue);
  if (!secret) {
    throw new HttpProblem(
      503,
      "authentication_not_configured",
      "Account authentication is temporarily unavailable.",
    );
  }

  const fallbackOrigin = isContainerRuntime()
    ? configuredPublicOrigin()
    : request && process.env.NODE_ENV !== "production"
      ? new URL(request.url).origin
      : null;
  const baseURL = normalizeApplicationOrigin(
    configuredAuthUrl ?? fallbackOrigin ?? undefined,
    localPreview === "true",
  );
  if (!baseURL) {
    throw new HttpProblem(
      503,
      "authentication_origin_not_configured",
      "Account authentication is temporarily unavailable.",
    );
  }
  const requestOrigin = request ? new URL(request.url).origin : null;
  const verifiedContainerIngress =
    request !== undefined &&
    isContainerRuntime() &&
    request.headers.get(INTERNAL_ORIGIN_VERIFIED_HEADER) === "1" &&
    configuredPublicOrigin() === baseURL;
  if (
    requestOrigin !== null &&
    requestOrigin !== baseURL &&
    !verifiedContainerIngress
  ) {
    throw new HttpProblem(
      400,
      "authentication_origin_mismatch",
      "The authentication request origin is not allowed.",
    );
  }
  const url = new URL(baseURL);
  const googleEnabled = hasGoogleProvider(
    googleClientId,
    googleClientSecret,
  );
  const emailDeliveryEnabled = isZohoEmailDeliveryConfigured(
    zohoSmtpPassword,
    zohoSmtpHost,
  );
  return {
    baseURL,
    domain: url.host,
    scheme: url.protocol === "https:" ? "https" : "http",
    secret,
    googleClientId: googleEnabled ? googleClientId!.trim() : null,
    googleClientSecret: googleEnabled
      ? googleClientSecret!.trim()
      : null,
    emailDeliveryEnabled,
    emailEnabled:
      emailDeliveryEnabled ||
      allowsLocalUnverifiedEmailAuthentication(
        baseURL,
        localPreview,
      ),
  };
}

function hasGoogleProvider(
  clientId: string | undefined,
  clientSecret: string | undefined,
): boolean {
  return Boolean(
    clientId?.trim() &&
      clientSecret?.trim() &&
      optionalGoogleConfigurationIsValid(clientId, clientSecret),
  );
}

async function sendAuthenticationEmail(options: {
  to: string;
  subject: string;
  preview: string;
  url: string;
}): Promise<void> {
  const idempotencyHash = await sha256Hex(
    `authentication-email\u0000${options.subject}\u0000${options.url}`,
  );
  await sendNodezunoEmail({
    to: options.to,
    subject: options.subject,
    text: `${options.preview}\n\n${options.url}\n\nThis link expires soon. If you did not request it, you can ignore this email.`,
    html: `<p>${escapeHtml(options.preview)}</p><p><a href="${escapeHtml(options.url)}">Continue securely</a></p><p>This link expires soon. If you did not request it, you can ignore this email.</p>`,
    messageId: `nodezuno-${idempotencyHash}`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function verifyStrictSiweMessage(options: {
  message: string;
  signature: string;
  address: string;
  chainId: number;
  baseURL: string;
  domain: string;
  scheme: "http" | "https";
}): Promise<boolean> {
  if (
    !ALLOWED_EVM_CHAIN_IDS.has(options.chainId) ||
    !/^0x[0-9a-fA-F]{130}$/.test(options.signature)
  ) {
    return false;
  }

  let parsed: ReturnType<typeof parseSiweMessage>;
  try {
    parsed = parseSiweMessage(options.message);
  } catch {
    return false;
  }
  const issuedAt = parsed.issuedAt?.getTime() ?? Number.NaN;
  const expiresAt = parsed.expirationTime?.getTime() ?? Number.NaN;
  const now = Date.now();
  const fixedFieldsMatch =
    parsed.address?.toLowerCase() === options.address.toLowerCase() &&
    parsed.chainId === options.chainId &&
    parsed.domain === options.domain &&
    parsed.scheme === options.scheme &&
    parsed.uri === options.baseURL &&
    parsed.version === "1" &&
    parsed.statement === SIWE_STATEMENT;
  const timeWindowValid =
    Number.isFinite(issuedAt) &&
    Number.isFinite(expiresAt) &&
    issuedAt <= now + 30_000 &&
    issuedAt >= now - WALLET_CHALLENGE_LIFETIME_MS &&
    expiresAt > now &&
    expiresAt - issuedAt === WALLET_CHALLENGE_LIFETIME_MS;
  if (!fixedFieldsMatch || !timeWindowValid) return false;

  try {
    return await verifyMessage({
      address: options.address as Address,
      message: options.message,
      signature: options.signature as Hex,
    });
  } catch {
    return false;
  }
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export { ALLOWED_EVM_CHAIN_IDS, SIWE_STATEMENT };
