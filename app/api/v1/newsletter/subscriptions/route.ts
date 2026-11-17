import { validateNewsletterPayload } from "@/lib/server/contracts";
import {
  consumeRateLimit,
  persistNewsletterSubscription,
} from "@/lib/server/database";
import {
  privateHash,
  requestFingerprint,
  sha256Hex,
} from "@/lib/server/crypto";
import {
  apiJson,
  assertSameOrigin,
  problemResponse,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";
import { verifyAbuseChallenge } from "@/lib/server/abuse-challenge";

const GENERIC_ACCEPTED_DATA = {
  state: "pending",
  message:
    "If confirmation is needed, check this address's inbox for the next step.",
} as const;

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    await verifyAbuseChallenge(request, "newsletter");
    const validation = validateNewsletterPayload(await readJsonBody(request));
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the subscription details.",
        fields: validation.fields,
        requestId,
      });
    }
    const input = validation.value;
    if (input.website) {
      return apiJson(
        {
          data: GENERIC_ACCEPTED_DATA,
          requestId,
        },
        { requestId, status: 202 },
      );
    }
    const [fingerprint, emailHash] = await Promise.all([
      requestFingerprint(request),
      privateHash("newsletter-email", input.email),
    ]);
    await Promise.all([
      consumeRateLimit({
        scope: "newsletter:ip",
        subjectHash: fingerprint.ipHash,
        limit: 5,
        windowMs: 60 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: "newsletter:email",
        subjectHash: emailHash,
        limit: 3,
        windowMs: 24 * 60 * 60 * 1000,
      }),
    ]);

    const confirmationTokenId = crypto.randomUUID().replaceAll("-", "");
    const confirmationSecret = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const confirmationToken = `${confirmationTokenId}.${confirmationSecret}`;
    const unsubscribeToken = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const [confirmationTokenHash, unsubscribeTokenHash] = await Promise.all([
      sha256Hex(`newsletter-confirmation\u0000${confirmationTokenId}\u0000${confirmationSecret}`),
      sha256Hex(unsubscribeToken),
    ]);
    await persistNewsletterSubscription({
      input,
      emailHash,
      confirmationTokenId,
      confirmationTokenHash,
      confirmationToken,
      unsubscribeTokenHash,
      unsubscribeToken,
    });
    return apiJson(
      {
        data: GENERIC_ACCEPTED_DATA,
        requestId,
      },
      { requestId, status: 202 },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
