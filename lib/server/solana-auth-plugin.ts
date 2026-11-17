import {
  type SolanaSignInInput,
  type SolanaSignInOutput,
  SolanaSignIn,
} from "@solana/wallet-standard-features";
import {
  parseSignInMessage,
  verifySignIn,
} from "@solana/wallet-standard-util";
import type { WalletAccount } from "@wallet-standard/base";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import bs58 from "bs58";
import { z } from "zod";

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
const SIGN_IN_STATEMENT =
  "Sign in to Nodezuno. This request does not create a transaction or cost gas.";
const SOLANA_CHAIN_ID = "solana:mainnet";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const solanaSchema = {
  solanaWallet: {
    fields: {
      userId: {
        type: "string" as const,
        references: { model: "user", field: "id" },
        required: true,
        index: true,
      },
      address: {
        type: "string" as const,
        required: true,
        unique: true,
      },
      isPrimary: {
        type: "boolean" as const,
        defaultValue: false,
      },
      createdAt: {
        type: "date" as const,
        required: true,
      },
    },
  },
};

const nonceBodySchema = z.object({
  address: z.string().min(32).max(64).optional(),
});

const verifyBodySchema = z.object({
  address: z.string().min(32).max(64),
  signedMessage: z.string().min(1).max(4096).regex(BASE64URL_PATTERN),
  signature: z.string().min(1).max(256).regex(BASE64URL_PATTERN),
  signatureType: z.literal("ed25519").optional(),
});

export function nodezunoSolanaAuth(options: {
  domain: string;
  uri: string;
}) {
  return {
    id: "nodezuno-solana",
    schema: solanaSchema,
    endpoints: {
      getSolanaNonce: createAuthEndpoint(
        "/solana/nonce",
        {
          method: "POST",
          body: nonceBodySchema,
        },
        async (ctx) => {
          if (ctx.body.address) {
            validateSolanaAddress(ctx.body.address);
          }
          const now = new Date();
          const expiresAt = new Date(now.getTime() + CHALLENGE_LIFETIME_MS);
          const input: SolanaSignInInput = {
            domain: options.domain,
            address: ctx.body.address,
            statement: SIGN_IN_STATEMENT,
            uri: options.uri,
            version: "1",
            chainId: SOLANA_CHAIN_ID,
            nonce: randomNonce(),
            issuedAt: now.toISOString(),
            expirationTime: expiresAt.toISOString(),
            requestId: crypto.randomUUID(),
          };

          await ctx.context.internalAdapter.createVerificationValue({
            identifier: `solana:${input.nonce}`,
            value: JSON.stringify(input),
            expiresAt,
          });
          return ctx.json({ input });
        },
      ),
      verifySolanaSignIn: createAuthEndpoint(
        "/solana/verify",
        {
          method: "POST",
          body: verifyBodySchema,
        },
        async (ctx) => {
          const signedMessage = decodeBase64Url(ctx.body.signedMessage);
          const signature = decodeBase64Url(ctx.body.signature);
          if (signedMessage.byteLength > 2048 || signature.byteLength !== 64) {
            throw unauthorized("The Solana signature payload is invalid.");
          }

          let parsed: SolanaSignInInput;
          try {
            const parsedMessage = parseSignInMessage(signedMessage);
            if (!parsedMessage) {
              throw new Error("invalid");
            }
            parsed = parsedMessage;
          } catch {
            throw unauthorized("The Solana sign-in message is invalid.");
          }
          if (!parsed?.nonce) {
            throw unauthorized("The Solana sign-in message is invalid.");
          }
          if (parsed.address !== ctx.body.address) {
            throw unauthorized("The signed Solana account does not match.");
          }

          const challenge =
            await ctx.context.internalAdapter.consumeVerificationValue(
              `solana:${parsed.nonce}`,
            );
          if (!challenge) {
            throw unauthorized(
              "The Solana sign-in request expired or was already used.",
            );
          }

          const input = parseStoredInput(challenge.value);
          validateChallenge(input, options);
          const publicKey = validateSolanaAddress(ctx.body.address);
          const account: WalletAccount = {
            address: ctx.body.address,
            publicKey,
            chains: [SOLANA_CHAIN_ID],
            features: [SolanaSignIn],
          };
          const output: SolanaSignInOutput = {
            account,
            signedMessage,
            signature,
            signatureType: ctx.body.signatureType,
          };

          if (!verifySignIn(input, output)) {
            throw unauthorized("The Solana signature could not be verified.");
          }

          let user: AuthUser | null = null;
          let existingWallet = await ctx.context.adapter.findOne<{
            userId: string;
          }>({
            model: "solanaWallet",
            where: [
              {
                field: "address",
                operator: "eq",
                value: ctx.body.address,
              },
            ],
          });
          if (existingWallet) {
            user = await ctx.context.adapter.findOne<AuthUser>({
              model: "user",
              where: [
                {
                  field: "id",
                  operator: "eq",
                  value: existingWallet.userId,
                },
              ],
            });
          }

          if (!user) {
            const syntheticEmail = await syntheticSolanaEmail(
              ctx.body.address,
            );
            user = await ctx.context.adapter.findOne<AuthUser>({
              model: "user",
              where: [
                {
                  field: "email",
                  operator: "eq",
                  value: syntheticEmail,
                },
              ],
            });
            if (user) {
              const existingAccount =
                await ctx.context.adapter.findOne<{
                  accountId: string;
                  providerId: string;
                }>({
                  model: "account",
                  where: [
                    {
                      field: "userId",
                      operator: "eq",
                      value: user.id,
                    },
                  ],
                });
              if (
                existingAccount &&
                (existingAccount.providerId !== "solana" ||
                  existingAccount.accountId !== ctx.body.address)
              ) {
                throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
                  message: "The wallet account could not be recovered safely.",
                });
              }
            } else {
              user = (await ctx.context.internalAdapter.createUser({
                name: compactWalletAddress(ctx.body.address),
                email: syntheticEmail,
                emailVerified: false,
                image: "",
              }, { method: "solana" })) as AuthUser;
            }
          }

          if (!existingWallet) {
            try {
              await ctx.context.adapter.create({
                model: "solanaWallet",
                data: {
                  userId: user.id,
                  address: ctx.body.address,
                  isPrimary: true,
                  createdAt: new Date(),
                },
              });
            } catch {
              existingWallet = await ctx.context.adapter.findOne<{
                userId: string;
              }>({
                model: "solanaWallet",
                where: [
                  {
                    field: "address",
                    operator: "eq",
                    value: ctx.body.address,
                  },
                ],
              });
              if (!existingWallet || existingWallet.userId !== user.id) {
                throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
                  message: "The wallet account could not be linked safely.",
                });
              }
            }
          }

          const providerAccount =
            await ctx.context.adapter.findOne<{ userId: string }>({
              model: "account",
              where: [
                {
                  field: "providerId",
                  operator: "eq",
                  value: "solana",
                },
                {
                  field: "accountId",
                  operator: "eq",
                  value: ctx.body.address,
                },
              ],
            });
          if (providerAccount && providerAccount.userId !== user.id) {
            throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
              message: "The wallet account is linked to another identity.",
            });
          }
          if (!providerAccount) {
            try {
              await ctx.context.internalAdapter.createAccount({
                userId: user.id,
                providerId: "solana",
                accountId: ctx.body.address,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
            } catch {
              const recoveredAccount =
                await ctx.context.adapter.findOne<{ userId: string }>({
                  model: "account",
                  where: [
                    {
                      field: "providerId",
                      operator: "eq",
                      value: "solana",
                    },
                    {
                      field: "accountId",
                      operator: "eq",
                      value: ctx.body.address,
                    },
                  ],
                });
              if (!recoveredAccount || recoveredAccount.userId !== user.id) {
                throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
                  message:
                    "The wallet provider account could not be linked safely.",
                });
              }
            }
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          if (!session) {
            throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
              message: "A secure session could not be created.",
            });
          }
          await setSessionCookie(ctx, { session, user });
          return ctx.json({
            success: true,
            token: session.token,
            user: {
              id: user.id,
              walletAddress: ctx.body.address,
              chainId: SOLANA_CHAIN_ID,
            },
          });
        },
      ),
    },
  };
}

function parseStoredInput(value: string): SolanaSignInInput {
  try {
    const parsed = JSON.parse(value) as SolanaSignInInput;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.issuedAt !== "string" ||
      typeof parsed.expirationTime !== "string"
    ) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw unauthorized("The Solana sign-in request is invalid.");
  }
}

function validateChallenge(
  input: SolanaSignInInput,
  options: { domain: string; uri: string },
): void {
  const issuedAt = Date.parse(input.issuedAt ?? "");
  const expiresAt = Date.parse(input.expirationTime ?? "");
  const now = Date.now();
  const fixedFieldsMatch =
    input.domain === options.domain &&
    input.statement === SIGN_IN_STATEMENT &&
    input.uri === options.uri &&
    input.version === "1" &&
    input.chainId === SOLANA_CHAIN_ID;
  const timeWindowValid =
    Number.isFinite(issuedAt) &&
    Number.isFinite(expiresAt) &&
    issuedAt <= now + 30_000 &&
    issuedAt >= now - CHALLENGE_LIFETIME_MS &&
    expiresAt > now &&
    expiresAt - issuedAt === CHALLENGE_LIFETIME_MS;
  if (!fixedFieldsMatch || !timeWindowValid) {
    throw unauthorized("The Solana sign-in request is invalid or expired.");
  }
}

function validateSolanaAddress(address: string): Uint8Array {
  try {
    const publicKey = bs58.decode(address);
    if (publicKey.byteLength !== 32) throw new Error("invalid");
    return publicKey;
  } catch {
    throw APIError.fromStatus("BAD_REQUEST", {
      message: "Provide a valid Solana account address.",
    });
  }
}

function decodeBase64Url(value: string): Uint8Array {
  try {
    const padded = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw unauthorized("The wallet signature encoding is invalid.");
  }
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function compactWalletAddress(address: string): string {
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

async function syntheticSolanaEmail(address: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(address),
  );
  const localPart = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 48);
  return `${localPart}@sol.wallet.nodezuno.invalid`;
}

function unauthorized(message: string) {
  return APIError.fromStatus("UNAUTHORIZED", { message });
}
