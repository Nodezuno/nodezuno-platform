import {
  consumeRateLimit,
  getDeveloperRpcServiceGuardrail,
  updateDeveloperRpcServiceGuardrail,
  type DeveloperRpcServiceGuardrailState,
} from "@/lib/server/database";
import { privateHash } from "@/lib/server/crypto";
import {
  developerActorFromUser,
  developerIdentitySubject,
  isDeveloperResourceId,
  requireDeveloperIdentity,
} from "@/lib/server/developer-platform";
import { loadEthereumRpcRuntimeConfiguration } from "@/lib/server/ethereum-rpc";
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
  serializeRpcServiceGuardrail,
  validateRpcServiceGuardrailUpdate,
} from "@/lib/server/rpc-guardrail";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    const user = await requireDeveloperIdentity(request);
    const { id } = await context.params;
    assertServiceId(id);
    await developerGuardrailRateLimit(user, "read");
    const state = await getDeveloperRpcServiceGuardrail({
      actor: developerActorFromUser(user),
      serviceId: id,
    });
    if (!state) throw serviceNotFoundProblem();
    return await guardrailResponse(state, requestId, "Cookie");
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
    await developerGuardrailRateLimit(user, "update");
    const state = await updateDeveloperRpcServiceGuardrail({
      actor: developerActorFromUser(user),
      serviceId: id,
      guardrail: validation.value,
    });
    if (!state) throw serviceNotFoundProblem();
    return await guardrailResponse(state, requestId, "Cookie");
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

async function developerGuardrailRateLimit(
  user: Awaited<ReturnType<typeof requireDeveloperIdentity>>,
  operation: "read" | "update",
): Promise<void> {
  await consumeRateLimit({
    scope: `rpc-service-guardrail:${operation}:identity`,
    subjectHash: await privateHash(
      "developer-identity",
      developerIdentitySubject(user),
    ),
    limit: operation === "read" ? 600 : 120,
    windowMs: 60 * 60 * 1000,
  });
}

async function guardrailResponse(
  state: DeveloperRpcServiceGuardrailState,
  requestId: string,
  vary: "Cookie" | "Authorization",
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
      headers: { Vary: vary },
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
