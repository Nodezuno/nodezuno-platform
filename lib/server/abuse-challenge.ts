import { privateHash } from "./crypto";
import { HttpProblem } from "./http";
import { hasLeadingZeroBits } from "../abuse-proof";
import { requestClientAddress } from "./runtime-config";

export const ABUSE_CHALLENGE_DIFFICULTY = 14;
const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const MAX_COUNTER = 2_000_000;

export type AbuseChallengePurpose = "submission" | "newsletter";

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

async function requestBinding(request: Request): Promise<string> {
  const ip = requestClientAddress(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? "";
  return privateHash("abuse-binding", `${ip}\u0000${userAgent}`);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function issueAbuseChallenge(
  request: Request,
  purpose: AbuseChallengePurpose,
  now = Date.now(),
): Promise<{
  challenge: string;
  difficulty: number;
  expiresAt: string;
}> {
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(18)));
  const expiresAt = now + CHALLENGE_TTL_MS;
  const binding = await requestBinding(request);
  const unsigned = [
    "v1",
    purpose,
    now.toString(36),
    expiresAt.toString(36),
    nonce,
    binding,
  ].join(".");
  const signature = await privateHash("abuse-challenge", unsigned);
  return {
    challenge: `${unsigned}.${signature}`,
    difficulty: ABUSE_CHALLENGE_DIFFICULTY,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function verifyAbuseChallenge(
  request: Request,
  purpose: AbuseChallengePurpose,
  now = Date.now(),
): Promise<void> {
  const proof = request.headers.get("x-nodezuno-challenge")?.trim() ?? "";
  if (!proof || proof.length > 512) {
    throw new HttpProblem(
      403,
      "challenge_required",
      "Complete the browser verification before submitting.",
    );
  }

  const parts = proof.split(".");
  if (parts.length !== 8) {
    throw new HttpProblem(
      403,
      "invalid_challenge",
      "The browser verification is invalid.",
    );
  }
  const [version, tokenPurpose, issuedRaw, expiresRaw, nonce, binding, signature, counterRaw] =
    parts;
  if (
    version !== "v1" ||
    tokenPurpose !== purpose ||
    !/^[a-z0-9]+$/.test(issuedRaw) ||
    !/^[a-z0-9]+$/.test(expiresRaw) ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(binding) ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !/^\d{1,10}$/.test(counterRaw)
  ) {
    throw new HttpProblem(
      403,
      "invalid_challenge",
      "The browser verification is invalid.",
    );
  }

  const issuedAt = Number.parseInt(issuedRaw, 36);
  const expiresAt = Number.parseInt(expiresRaw, 36);
  const counter = Number(counterRaw);
  if (
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(expiresAt) ||
    !Number.isSafeInteger(counter) ||
    counter < 0 ||
    counter > MAX_COUNTER ||
    expiresAt - issuedAt !== CHALLENGE_TTL_MS ||
    issuedAt > now + 30_000 ||
    expiresAt <= now
  ) {
    throw new HttpProblem(
      403,
      "expired_challenge",
      "The browser verification expired. Please submit again.",
    );
  }

  const unsigned = parts.slice(0, 6).join(".");
  const [expectedBinding, expectedSignature] = await Promise.all([
    requestBinding(request),
    privateHash("abuse-challenge", unsigned),
  ]);
  if (
    !constantTimeEqual(binding, expectedBinding) ||
    !constantTimeEqual(signature, expectedSignature)
  ) {
    throw new HttpProblem(
      403,
      "invalid_challenge",
      "The browser verification is invalid.",
    );
  }

  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(proof),
    ),
  );
  if (!hasLeadingZeroBits(digest, ABUSE_CHALLENGE_DIFFICULTY)) {
    throw new HttpProblem(
      403,
      "invalid_challenge",
      "The browser verification is incomplete.",
    );
  }
}
