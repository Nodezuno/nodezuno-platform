import { listAdminSubmissions } from "@/lib/server/database";
import { requireAdminRequest } from "@/lib/server/admin";
import {
  apiJson,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    await requireAdminRequest(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const submissions = await listAdminSubmissions(
      Number.isFinite(limit) ? limit : 100,
    );
    return apiJson(
      {
        data: { submissions, count: submissions.length },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
