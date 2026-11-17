import {
  consumeRateLimit,
  getDeveloperRpcAccessPolicy,
  updateDeveloperRpcAccessPolicy,
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
  assertSameOrigin,
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
    const user = await requireDeveloperIdentity(request);
    const { id } = await context.params;
    assertServiceId(id);
    const policy = await getDeveloperRpcAccessPolicy({
      actor: developerActorFromUser(user),
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
    assertSameOrigin(request);
    const user = await requireDeveloperIdentity(request);
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
    await consumeRateLimit({
      scope: "rpc-access-policy:update:identity",
      subjectHash: await privateHash(
        "developer-identity",
        developerIdentitySubject(user),
      ),
      limit: 120,
      windowMs: 60 * 60 * 1000,
    });
    const policy = await updateDeveloperRpcAccessPolicy({
      actor: developerActorFromUser(user),
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

function policyResponse(
  record: RpcAccessPolicyRecord,
  requestId: string,
): Response {
  return apiJson(
    {
      data: serializeRpcAccessPolicyRecord(record),
      requestId,
    },
    { requestId },
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
