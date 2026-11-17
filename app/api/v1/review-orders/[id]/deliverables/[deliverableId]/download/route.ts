import { signedReviewDeliverableDownload } from "@/lib/server/review-deliverables";
import { authorizeReviewOrder, REVIEW_ORDER_ID_PATTERN } from "@/lib/server/review-commerce";
import { observeReviewApiRequest } from "@/lib/server/api-observability";
import { HttpProblem } from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string; deliverableId: string }> };

export async function GET(request: Request, context: RouteContext) {
  return observeReviewApiRequest(request, "review.deliverable.download", async (requestId) => {
    const { id, deliverableId } = await context.params;
    if (!REVIEW_ORDER_ID_PATTERN.test(id)) {
      throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
    }
    await authorizeReviewOrder(request, id);
    const response = await signedReviewDeliverableDownload({
      reviewOrderId: id,
      deliverableId,
    });
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", requestId);
    return new Response(response.body, { status: response.status, headers });
  });
}
