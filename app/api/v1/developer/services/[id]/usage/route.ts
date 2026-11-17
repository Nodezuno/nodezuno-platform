import {
  consumeRateLimit,
  getDeveloperRpcUsage,
} from "@/lib/server/database";
import { privateHash } from "@/lib/server/crypto";
import {
  developerActorFromUser,
  developerIdentitySubject,
  isDeveloperResourceId,
  requireDeveloperIdentity,
} from "@/lib/server/developer-platform";
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
    const user = await requireDeveloperIdentity(request);
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
    await consumeRateLimit({
      scope: "rpc-usage:read:identity",
      subjectHash: await privateHash(
        "developer-identity",
        developerIdentitySubject(user),
      ),
      limit: 600,
      windowMs: 60 * 60 * 1000,
    });
    const report = await getDeveloperRpcUsage({
      actor: developerActorFromUser(user),
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
        headers: { Vary: "Cookie" },
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
