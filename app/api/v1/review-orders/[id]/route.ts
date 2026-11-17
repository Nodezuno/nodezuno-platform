import {
  authorizeReviewOrder,
  publicReviewOrder,
  REVIEW_ORDER_ID_PATTERN,
} from "@/lib/server/review-commerce";
import { observeReviewApiRequest } from "@/lib/server/api-observability";
import {
  apiJson,
  HttpProblem,
} from "@/lib/server/http";
import { publicReviewPaymentConfiguration } from "@/lib/server/review-payment-experience";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return observeReviewApiRequest(request, "review.order.read", async (requestId) => {
    const { id } = await context.params;
    assertOrderId(id);
    const order = await authorizeReviewOrder(request, id);
    const configuration = await publicReviewPaymentConfiguration();
    return apiJson(
      {
        data: {
          order: await publicReviewOrder(order),
          configuration,
        },
        requestId,
      },
      { requestId },
    );
  });
}

function assertOrderId(id: string) {
  if (!REVIEW_ORDER_ID_PATTERN.test(id)) {
    throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
  }
}
