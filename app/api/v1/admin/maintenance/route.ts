import { requireAdminRequest } from "@/lib/server/admin";
import { runRetentionMaintenance } from "@/lib/server/database";
import {
  apiJson,
  assertSameOrigin,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const admin = await requireAdminRequest(request);
    const result = await runRetentionMaintenance({
      actorEmail: admin.email,
    });
    return apiJson(
      {
        data: {
          ...result,
          completedAt: new Date().toISOString(),
        },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
