import {
  STABLECOIN_PAYMENT_INTENT_ID_PATTERN,
  submitStablecoinPaymentClaim,
} from "@/lib/server/stablecoin-payment";
import { REVIEW_ORDER_ID_PATTERN } from "@/lib/server/review-commerce";
import { observeReviewApiRequest } from "@/lib/server/api-observability";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  problemResponse,
  readJsonBody,
} from "@/lib/server/http";

type RouteContext = {
  params: Promise<{ id: string; intentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  return observeReviewApiRequest(request, "review.payment.claim", async (requestId) => {
    assertSameOrigin(request);
    const { id, intentId } = await context.params;
    if (!REVIEW_ORDER_ID_PATTERN.test(id)) {
      throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
    }
    if (!STABLECOIN_PAYMENT_INTENT_ID_PATTERN.test(intentId)) {
      throw new HttpProblem(400, "payment_intent_id_invalid", "The payment instruction identifier is invalid.");
    }
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Enter the Ethereum transaction hash and Telegram username.",
        requestId,
      });
    }
    const allowed = new Set(["transactionHash", "telegramUsername"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Remove unsupported payment claim fields.",
        requestId,
      });
    }
    const result = await submitStablecoinPaymentClaim({
      request,
      reviewOrderId: id,
      paymentIntentId: intentId,
      transactionHash: typeof body.transactionHash === "string" ? body.transactionHash : "",
      telegramUsername: typeof body.telegramUsername === "string" ? body.telegramUsername : "",
    });
    return apiJson(
      {
        data: {
          payment: result.payment,
          configuration: result.configuration,
        },
        requestId,
      },
      { requestId, status: 202 },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
