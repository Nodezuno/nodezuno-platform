import {
  consumeRateLimit,
  unsubscribeNewsletter,
} from "@/lib/server/database";
import { requestFingerprint, sha256Hex } from "@/lib/server/crypto";
import {
  apiRedirect,
  apiJson,
  assertSameOrigin,
  HttpProblem,
  readJsonBody,
  readTextBody,
  requestHasMediaType,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

function tokenFromUnknown(value: unknown): string {
  const token =
    typeof value === "object" && value !== null && "token" in value
      ? (value as { token?: unknown }).token
      : null;
  if (
    typeof token !== "string" ||
    !/^[A-Za-z0-9_-]{40,200}$/.test(token)
  ) {
    throw new HttpProblem(
      422,
      "invalid_unsubscribe_token",
      "The unsubscribe link is invalid.",
    );
  }
  return token;
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const isForm = requestHasMediaType(
      request,
      "application/x-www-form-urlencoded",
    );
    let token: string;
    if (isForm) {
      const body = await readTextBody(request, 8 * 1024);
      token = tokenFromUnknown({
        token: new URLSearchParams(body).get("token"),
      });
    } else {
      token = tokenFromUnknown(await readJsonBody(request));
    }

    const fingerprint = await requestFingerprint(request);
    await consumeRateLimit({
      scope: "newsletter:unsubscribe:ip",
      subjectHash: fingerprint.ipHash,
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    await unsubscribeNewsletter(await sha256Hex(token));

    if (isForm) {
      return apiRedirect(
        new URL(
          "/community/newsletter/unsubscribe?state=complete",
          request.url,
        ),
        { requestId, status: 303 },
      );
    }
    return apiJson(
      {
        data: {
          state: "unsubscribed",
          message:
            "If this link matched a subscription, it has been unsubscribed.",
        },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
