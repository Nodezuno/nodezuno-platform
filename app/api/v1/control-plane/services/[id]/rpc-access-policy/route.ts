import {
  consumeRateLimit,
  getDeveloperRpcAccessPolicy,
  updateDeveloperRpcAccessPolicy,
} from "@/lib/server/database";
import { requireDeveloperApiKeyScope } from "@/lib/server/developer-api-key-auth";
import { isDeveloperResourceId } from "@/lib/server/developer-platform";
import {
  apiJson,
  HttpProblem,
  problemResponse,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";
import {
  serializeRpcAccessPolicyRecord,
  validateRpcAccessPolicyUpdate,
  type RpcAccessPolicyRecord,
} from "@/lib/server/rpc-access-policy";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    const identity = await requireDeveloperApiKeyScope(
      request,
      "services:manage",
    );
    const { id } = await context.params;
    assertServiceId(id);
    await controlPlanePolicyRateLimit(identity, "read");
    const policy = await getDeveloperRpcAccessPolicy({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
      serviceId: id,
    });
    if (!policy) throw serviceNotFoundProblem();
    return policyResponse(policy, requestId);
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    const identity = await requireDeveloperApiKeyScope(
      request,
      "services:manage",
    );
    const { id } = await context.params;
    assertServiceId(id);
    const validation = validateRpcAccessPolicyUpdate(
      await readJsonBody(request),
    );
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the RPC access policy.",
        fields: validation.fields,
        requestId,
      });
    }
    await controlPlanePolicyRateLimit(identity, "update");
    const policy = await updateDeveloperRpcAccessPolicy({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
      serviceId: id,
      expectedRevision: validation.value.revision,
      policy: {
        allowedOrigins: validation.value.allowedOrigins,
        allowedIpCidrs: validation.value.allowedIpCidrs,
        allowedMethods: validation.value.allowedMethods,
      },
    });
    if (!policy) throw serviceNotFoundProblem();
    return policyResponse(policy, requestId);
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

async function controlPlanePolicyRateLimit(
  identity: Awaited<
    ReturnType<typeof requireDeveloperApiKeyScope>
  >,
  operation: "read" | "update",
): Promise<void> {
  const limit = operation === "read" ? 600 : 120;
  await Promise.all([
    consumeRateLimit({
      scope: `control-plane-rpc-access-policy:${operation}:key`,
      subjectHash: identity.secretHash,
      limit,
      windowMs: 60 * 60 * 1000,
    }),
    consumeRateLimit({
      scope: `control-plane-rpc-access-policy:${operation}:workspace`,
      subjectHash: identity.workspace.id,
      limit: limit * 2,
      windowMs: 60 * 60 * 1000,
    }),
  ]);
}

function policyResponse(
  record: RpcAccessPolicyRecord,
  requestId: string,
): Response {
  return apiJson(
    {
      data: serializeRpcAccessPolicyRecord(record),
      requestId,
    },
    {
      requestId,
      headers: { Vary: "Authorization" },
    },
  );
}

function assertServiceId(id: string): void {
  if (!isDeveloperResourceId(id)) {
    throw new HttpProblem(
      400,
      "invalid_service_id",
      "Use a valid service identifier.",
    );
  }
}

function serviceNotFoundProblem(): HttpProblem {
  return new HttpProblem(
    404,
    "rpc_service_not_found",
    "The RPC service was not found in this workspace.",
  );
}
