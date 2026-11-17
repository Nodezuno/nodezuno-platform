import {
  consumeRateLimit,
  getDeveloperRpcServiceGuardrail,
  updateDeveloperRpcServiceGuardrail,
  type DeveloperRpcServiceGuardrailState,
} from "@/lib/server/database";
import { requireDeveloperApiKeyScope } from "@/lib/server/developer-api-key-auth";
import { isDeveloperResourceId } from "@/lib/server/developer-platform";
import { loadEthereumRpcRuntimeConfiguration } from "@/lib/server/ethereum-rpc";
import {
  apiJson,
  HttpProblem,
  problemResponse,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";
import {
  serializeRpcServiceGuardrail,
  validateRpcServiceGuardrailUpdate,
} from "@/lib/server/rpc-guardrail";

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
    await controlPlaneGuardrailRateLimit(identity, "read");
    const state = await getDeveloperRpcServiceGuardrail({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
      serviceId: id,
    });
    if (!state) throw serviceNotFoundProblem();
    return await guardrailResponse(state, requestId);
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
    const validation = validateRpcServiceGuardrailUpdate(
      await readJsonBody(request),
    );
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the RPC service guardrail.",
        fields: validation.fields,
        requestId,
      });
    }
    await controlPlaneGuardrailRateLimit(identity, "update");
    const state = await updateDeveloperRpcServiceGuardrail({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
      serviceId: id,
      guardrail: validation.value,
    });
    if (!state) throw serviceNotFoundProblem();
    return await guardrailResponse(state, requestId);
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

async function controlPlaneGuardrailRateLimit(
  identity: Awaited<
    ReturnType<typeof requireDeveloperApiKeyScope>
  >,
  operation: "read" | "update",
): Promise<void> {
  const limit = operation === "read" ? 600 : 120;
  await Promise.all([
    consumeRateLimit({
      scope: `control-plane-rpc-service-guardrail:${operation}:key`,
      subjectHash: identity.secretHash,
      limit,
      windowMs: 60 * 60 * 1000,
    }),
    consumeRateLimit({
      scope: `control-plane-rpc-service-guardrail:${operation}:workspace`,
      subjectHash: identity.workspace.id,
      limit: limit * 2,
      windowMs: 60 * 60 * 1000,
    }),
  ]);
}

async function guardrailResponse(
  state: DeveloperRpcServiceGuardrailState,
  requestId: string,
): Promise<Response> {
  const runtime = await loadEthereumRpcRuntimeConfiguration();
  return apiJson(
    {
      data: {
        serviceId: state.service.id,
        product: state.service.product,
        network: state.service.network,
        ...serializeRpcServiceGuardrail({
          guardrail: state.guardrail,
          platformWorkspaceHourlyQuotaLimit:
            runtime.workspaceHourlyCallQuota,
        }),
      },
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
    "The RPC or gRPC service was not found in this workspace.",
  );
}
