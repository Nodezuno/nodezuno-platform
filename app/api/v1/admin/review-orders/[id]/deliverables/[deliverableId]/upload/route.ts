import { requireFreshAdminRequest } from "@/lib/server/admin";
import { uploadReviewDeliverableBytes } from "@/lib/server/review-deliverables";
import { REVIEW_ORDER_ID_PATTERN } from "@/lib/server/review-commerce";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string; deliverableId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    await requireFreshAdminRequest(request);
    const { id, deliverableId } = await context.params;
    if (!REVIEW_ORDER_ID_PATTERN.test(id)) {
      throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
    }
    const result = await uploadReviewDeliverableBytes({
      reviewOrderId: id,
      deliverableId,
      contentLength: request.headers.get("content-length"),
      contentType: request.headers.get("content-type"),
      sha256: request.headers.get("x-nodezuno-sha256"),
      body: request.body,
    });
    return apiJson({ data: result, requestId }, { requestId, status: 201 });
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
