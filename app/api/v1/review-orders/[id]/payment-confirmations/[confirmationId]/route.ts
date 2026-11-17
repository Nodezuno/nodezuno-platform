import {
  authorizeReviewOrder,
  REVIEW_ORDER_ID_PATTERN,
} from "@/lib/server/review-commerce";
import { stablecoinPaymentConfirmation } from "@/lib/server/stablecoin-payment-records";
import { observeReviewApiRequest } from "@/lib/server/api-observability";
import { HttpProblem } from "@/lib/server/http";

const CONFIRMATION_ID_PATTERN = /^[A-Za-z0-9:_-]{16,100}$/;
type RouteContext = {
  params: Promise<{ id: string; confirmationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return observeReviewApiRequest(request, "review.confirmation.download", async (requestId) => {
    const { id, confirmationId } = await context.params;
    if (!REVIEW_ORDER_ID_PATTERN.test(id)) {
      throw new HttpProblem(400, "review_order_id_invalid", "The review request identifier is invalid.");
    }
    if (!CONFIRMATION_ID_PATTERN.test(confirmationId)) {
      throw new HttpProblem(400, "payment_confirmation_id_invalid", "The payment confirmation identifier is invalid.");
    }
    await authorizeReviewOrder(request, id);
    const confirmation = await stablecoinPaymentConfirmation({
      reviewOrderId: id,
      confirmationId,
    });
    return new Response(JSON.stringify({
      recordType: "Nodezuno Ethereum payment confirmation",
      confirmation,
    }, null, 2), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${confirmation.receiptReference}.json"`,
        "Content-Type": "application/json; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
      },
    });
  });
}
