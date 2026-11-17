import { verifyAbuseChallenge } from "@/lib/server/abuse-challenge";
import { observeReviewApiRequest } from "@/lib/server/api-observability";
import { consumeRateLimit } from "@/lib/server/database";
import { requestFingerprint } from "@/lib/server/crypto";
import {
  createReviewOrder,
  findReviewOrderReplay,
  reviewCreateRequestHash,
  reviewEmailHash,
  validateReviewOrderPayload,
} from "@/lib/server/review-commerce";
import {
  apiJson,
  assertSameOrigin,
  problemResponse,
  readIdempotencyKey,
  readJsonBody,
} from "@/lib/server/http";

export async function POST(request: Request) {
  return observeReviewApiRequest(request, "review.order.create", async (requestId) => {
    assertSameOrigin(request);
    const idempotencyKey = readIdempotencyKey(request);
    await verifyAbuseChallenge(request, "submission");
    const validation = validateReviewOrderPayload(await readJsonBody(request));
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the highlighted service order fields.",
        fields: validation.fields,
        requestId,
      });
    }
    const input = validation.value;
    const [fingerprint, emailHash, requestHash] = await Promise.all([
      requestFingerprint(request),
      reviewEmailHash(input.workEmail),
      reviewCreateRequestHash(input),
    ]);
    await consumeRateLimit({
      scope: "review-order:request:ip",
      subjectHash: fingerprint.ipHash,
      limit: 40,
      windowMs: 10 * 60 * 1000,
    });
    const replay = await findReviewOrderReplay({ idempotencyKey, requestHash });
    if (replay) {
      return apiJson(
        {
          data: {
            order: {
              id: replay.order.id,
              reference: replay.order.reference,
              status: replay.order.status,
              trackingPath: `/review/${replay.order.id}`,
              accessToken: replay.accessToken,
              createdAt: new Date(replay.order.createdAt).toISOString(),
            },
          },
          replayed: true,
          requestId,
        },
        { requestId, status: 200 },
      );
    }
    await Promise.all([
      consumeRateLimit({
        scope: "review-order:create:ip",
        subjectHash: fingerprint.ipHash,
        limit: 5,
        windowMs: 60 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: "review-order:create:email",
        subjectHash: emailHash,
        limit: 10,
        windowMs: 24 * 60 * 60 * 1000,
      }),
    ]);
    const result = await createReviewOrder({
      input,
      request,
      idempotencyKey,
      requestHash,
      emailHash,
    });
    return apiJson(
      {
        data: {
          order: {
            id: result.order.id,
            reference: result.order.reference,
            status: result.order.status,
            trackingPath: `/review/${result.order.id}`,
            accessToken: result.accessToken,
            createdAt: new Date(result.order.createdAt).toISOString(),
          },
        },
        requestId,
      },
      { requestId, status: result.replayed ? 200 : 201 },
    );
  });
}
