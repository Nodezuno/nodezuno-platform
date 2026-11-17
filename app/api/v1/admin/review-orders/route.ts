import { requireAdminRequest } from "@/lib/server/admin";
import {
  adminReviewOrder,
  listAdminReviewOrders,
} from "@/lib/server/review-commerce";
import { apiJson, requestIdFor, responseFromError } from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    await requireAdminRequest(request);
    const rawLimit = new URL(request.url).searchParams.get("limit") ?? "100";
    const limit = /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : 100;
    const orders = await listAdminReviewOrders(limit);
    return apiJson(
      { data: { orders: await Promise.all(orders.map(adminReviewOrder)) }, requestId },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
