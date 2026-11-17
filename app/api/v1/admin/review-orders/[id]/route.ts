import { requireFreshAdminRequest } from "@/lib/server/admin";
import {
  adminReviewOrder,
  adminUpdateReviewOrder,
  REVIEW_ORDER_ID_PATTERN,
} from "@/lib/server/review-commerce";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const admin = await requireFreshAdminRequest(request);
    const { id } = await context.params;
    if (!REVIEW_ORDER_ID_PATTERN.test(id)) throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
    const order = await adminUpdateReviewOrder({
      id,
      actorEmail: admin.email,
      body: await readJsonBody(request),
    });
    return apiJson(
      { data: { order: await adminReviewOrder(order) }, requestId },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
