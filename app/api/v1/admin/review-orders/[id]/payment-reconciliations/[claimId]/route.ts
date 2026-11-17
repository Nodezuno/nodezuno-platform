import { requireFreshAdminRequest } from "@/lib/server/admin";
import { STABLECOIN_PAYMENT_INTENT_ID_PATTERN } from "@/lib/server/stablecoin-payment";
import { applyReconciledStablecoinPayment } from "@/lib/server/stablecoin-payment-records";
import { REVIEW_ORDER_ID_PATTERN } from "@/lib/server/review-commerce";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  readIdempotencyKey,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = {
  params: Promise<{ id: string; claimId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const admin = await requireFreshAdminRequest(request);
    const idempotencyKey = readIdempotencyKey(request);
    const { id, claimId } = await context.params;
    if (!REVIEW_ORDER_ID_PATTERN.test(id)) {
      throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
    }
    if (!STABLECOIN_PAYMENT_INTENT_ID_PATTERN.test(claimId)) {
      throw new HttpProblem(400, "payment_claim_id_invalid", "The payment claim identifier is invalid.");
    }
    const result = await applyReconciledStablecoinPayment({
      reviewOrderId: id,
      paymentClaimId: claimId,
      actorEmail: admin.email,
      idempotencyKey,
      body: await readJsonBody(request),
    });
    return apiJson(
      { data: result, requestId },
      { requestId, status: result.replayed ? 200 : 201 },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
