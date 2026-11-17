import {
  createStablecoinPaymentIntent,
} from "@/lib/server/stablecoin-payment";
import { REVIEW_ORDER_ID_PATTERN } from "@/lib/server/review-commerce";
import { observeReviewApiRequest } from "@/lib/server/api-observability";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  problemResponse,
  readIdempotencyKey,
  readJsonBody,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  return observeReviewApiRequest(request, "review.payment.create", async (requestId) => {
    assertSameOrigin(request);
    const idempotencyKey = readIdempotencyKey(request);
    const { id } = await context.params;
    if (!REVIEW_ORDER_ID_PATTERN.test(id)) {
      throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
    }
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Choose a payment asset and accept the current service order.",
        requestId,
      });
    }
    const allowed = new Set(["acceptTerms", "proposalVersion", "phase", "asset"]);
    if (
      Object.keys(body).some((key) => !allowed.has(key)) ||
      body.acceptTerms !== true ||
      !Number.isSafeInteger(body.proposalVersion) ||
      (body.phase !== "deposit" && body.phase !== "balance") ||
      (body.asset !== "USDC" && body.asset !== "USDT")
    ) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Choose USDC or USDT and accept the exact current service order.",
        fields: {
          acceptTerms: body.acceptTerms === true ? "" : "Acceptance is required.",
          proposalVersion: Number.isSafeInteger(body.proposalVersion) ? "" : "Use the current service order version.",
          phase: body.phase === "deposit" || body.phase === "balance" ? "" : "Use the currently due payment phase.",
          asset: body.asset === "USDC" || body.asset === "USDT" ? "" : "Choose USDC or USDT.",
        },
        requestId,
      });
    }
    const result = await createStablecoinPaymentIntent({
      request,
      id,
      phase: body.phase,
      proposalVersion: body.proposalVersion as number,
      asset: body.asset,
      idempotencyKey,
    });
    return apiJson(
      {
        data: {
          payment: result.payment,
          order: result.order,
          configuration: result.configuration,
        },
        requestId,
      },
      { requestId, status: 201 },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
