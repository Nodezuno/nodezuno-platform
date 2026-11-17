import {
  consumeRateLimit,
  getDeveloperRpcUsage,
} from "@/lib/server/database";
import { requireDeveloperApiKeyScope } from "@/lib/server/developer-api-key-auth";
import { isDeveloperResourceId } from "@/lib/server/developer-platform";
import {
  apiJson,
  HttpProblem,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";
import {
  parseDeveloperRpcUsageWindow,
  serializeDeveloperRpcUsage,
} from "@/lib/server/rpc-usage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    const identity = await requireDeveloperApiKeyScope(
      request,
      "services:manage",
    );
    const { id } = await context.params;
    if (!isDeveloperResourceId(id)) {
      throw new HttpProblem(
        400,
        "invalid_service_id",
        "Use a valid service identifier.",
      );
    }
    const window = parseDeveloperRpcUsageWindow(
      new URL(request.url).searchParams.get("window"),
    );
    await Promise.all([
      consumeRateLimit({
        scope: "control-plane-rpc-usage:read:key",
        subjectHash: identity.secretHash,
        limit: 600,
        windowMs: 60 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: "control-plane-rpc-usage:read:workspace",
        subjectHash: identity.workspace.id,
        limit: 1_200,
        windowMs: 60 * 60 * 1000,
      }),
    ]);
    const report = await getDeveloperRpcUsage({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
      serviceId: id,
      window,
    });
    if (!report) {
      throw new HttpProblem(
        404,
        "rpc_service_not_found",
        "The RPC service was not found in this workspace.",
      );
    }
    return apiJson(
      {
        data: serializeDeveloperRpcUsage(report),
        requestId,
      },
      {
        requestId,
        headers: { Vary: "Authorization" },
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
