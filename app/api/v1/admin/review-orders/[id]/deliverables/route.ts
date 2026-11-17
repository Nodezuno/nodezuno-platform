import { requireFreshAdminRequest } from "@/lib/server/admin";
import { createReviewDeliverableUpload } from "@/lib/server/review-deliverables";
import { REVIEW_ORDER_ID_PATTERN } from "@/lib/server/review-commerce";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const admin = await requireFreshAdminRequest(request);
    const { id } = await context.params;
    if (!REVIEW_ORDER_ID_PATTERN.test(id)) {
      throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
    }
    const result = await createReviewDeliverableUpload({
      reviewOrderId: id,
      actorEmail: admin.email,
      body: await readJsonBody(request),
    });
    return apiJson({ data: result, requestId }, { requestId, status: 201 });
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
