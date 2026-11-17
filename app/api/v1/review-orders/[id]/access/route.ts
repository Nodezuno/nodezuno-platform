import {
  exchangeReviewAccess,
  publicReviewOrder,
  REVIEW_ORDER_ID_PATTERN,
} from "@/lib/server/review-commerce";
import { observeReviewApiRequest } from "@/lib/server/api-observability";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  problemResponse,
  readJsonBody,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  return observeReviewApiRequest(request, "review.access.exchange", async (requestId) => {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!REVIEW_ORDER_ID_PATTERN.test(id)) {
      throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
    }
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "accessToken") || !("accessToken" in body) || typeof body.accessToken !== "string") {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Provide the private tracking capability.",
        fields: { accessToken: "Use the capability from the private tracking link." },
        requestId,
      });
    }
    const result = await exchangeReviewAccess({ request, id, accessToken: body.accessToken });
    return apiJson(
      { data: { order: await publicReviewOrder(result.order) }, requestId },
      { requestId, headers: { "Set-Cookie": result.setCookie } },
    );
  });
}
