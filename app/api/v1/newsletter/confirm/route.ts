import {
  confirmNewsletterSubscription,
  consumeRateLimit,
} from "@/lib/server/database";
import { requestFingerprint, sha256Hex } from "@/lib/server/crypto";
import {
  apiJson,
  apiRedirect,
  assertSameOrigin,
  HttpProblem,
  readJsonBody,
  readTextBody,
  requestHasMediaType,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

const CONFIRMATION_TOKEN_PATTERN = /^([a-f0-9]{32})\.([a-f0-9]{64})$/;

function confirmationTokenFromUnknown(value: unknown): {
  tokenId: string;
  secret: string;
} {
  const token =
    typeof value === "object" && value !== null && "token" in value
      ? (value as { token?: unknown }).token
      : null;
  const match =
    typeof token === "string"
      ? CONFIRMATION_TOKEN_PATTERN.exec(token)
      : null;
  if (!match) {
    throw new HttpProblem(
      422,
      "invalid_confirmation_token",
      "The confirmation link is invalid.",
    );
  }
  return { tokenId: match[1], secret: match[2] };
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const isForm = requestHasMediaType(
      request,
      "application/x-www-form-urlencoded",
    );
    const token = confirmationTokenFromUnknown(
      isForm
        ? {
            token: new URLSearchParams(
              await readTextBody(request, 8 * 1024),
            ).get("token"),
          }
        : await readJsonBody(request),
    );

    const fingerprint = await requestFingerprint(request);
    await consumeRateLimit({
      scope: "newsletter:confirmation:ip",
      subjectHash: fingerprint.ipHash,
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
    const state = await confirmNewsletterSubscription({
      confirmationTokenId: token.tokenId,
      confirmationTokenHash: await sha256Hex(
        `newsletter-confirmation\u0000${token.tokenId}\u0000${token.secret}`,
      ),
    });

    if (isForm) {
      return apiRedirect(
        new URL(`/community/newsletter/confirm?state=${state}`, request.url),
        { requestId, status: 303 },
      );
    }
    return apiJson(
      {
        data: {
          state,
          message:
            state === "subscribed"
              ? "Your Nodezuno Signal subscription is confirmed."
              : state === "expired"
                ? "This confirmation link has expired. Request a new link to subscribe."
                : "This confirmation link is invalid or has been replaced.",
        },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
