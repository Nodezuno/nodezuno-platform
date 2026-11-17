import { requireFreshAdminRequest } from "@/lib/server/admin";
import { finalizeReviewDeliverableUpload } from "@/lib/server/review-deliverables";
import { REVIEW_ORDER_ID_PATTERN } from "@/lib/server/review-commerce";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string; deliverableId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const admin = await requireFreshAdminRequest(request);
    const { id, deliverableId } = await context.params;
    if (!REVIEW_ORDER_ID_PATTERN.test(id)) {
      throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
    }
    const deliverable = await finalizeReviewDeliverableUpload({
      reviewOrderId: id,
      deliverableId,
      actorEmail: admin.email,
    });
    return apiJson({ data: { deliverable }, requestId }, { requestId });
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
