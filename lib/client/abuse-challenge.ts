import { hasLeadingZeroBits } from "../abuse-proof";

type ChallengeResponse = {
  data?: {
    challenge: string;
    difficulty: number;
    expiresAt: string;
  };
  title?: string;
  detail?: string;
  requestId?: string;
};

const CHALLENGE_TIMEOUT_MS = 15_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export async function solveAbuseChallenge(
  purpose: "submission" | "newsletter",
): Promise<string> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    CHALLENGE_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await fetch(
      `/api/v1/abuse-challenge?purpose=${encodeURIComponent(purpose)}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Browser verification timed out. Please try again.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
  let body: ChallengeResponse = {};
  try {
    const candidate = await response.json();
    if (candidate && typeof candidate === "object") {
      body = candidate as ChallengeResponse;
    }
  } catch {
    body = {};
  }
  if (!response.ok || !body.data) {
    const requestId = body.requestId ?? response.headers.get("x-request-id") ?? "";
    const message = body.title ?? body.detail ?? "Browser verification is unavailable.";
    throw new Error(
      REQUEST_ID_PATTERN.test(requestId)
        ? `${message} Request ID: ${requestId}.`
        : message,
    );
  }

  const { challenge, difficulty, expiresAt } = body.data;
  if (
    typeof challenge !== "string" ||
    !Number.isInteger(difficulty) ||
    difficulty < 1 ||
    difficulty > 24 ||
    Date.parse(expiresAt) <= Date.now()
  ) {
    throw new Error("Browser verification returned an invalid challenge.");
  }

  const encoder = new TextEncoder();
  const batchSize = 128;
  const maximumCounter = 2_000_000;
  for (let start = 0; start <= maximumCounter; start += batchSize) {
    const counters = Array.from(
      { length: Math.min(batchSize, maximumCounter - start + 1) },
      (_, index) => start + index,
    );
    const digests = await Promise.all(
      counters.map(async (counter) => {
        const proof = `${challenge}.${counter}`;
        const digest = new Uint8Array(
          await crypto.subtle.digest("SHA-256", encoder.encode(proof)),
        );
        return { counter, digest };
      }),
    );
    const solved = digests.find(({ digest }) =>
      hasLeadingZeroBits(digest, difficulty),
    );
    if (solved) return `${challenge}.${solved.counter}`;
  }
  throw new Error("Browser verification could not be completed.");
}
