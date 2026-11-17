import {
  archiveDeveloperService,
  consumeRateLimit,
  getDeveloperService,
  updateDeveloperService,
} from "@/lib/server/database";
import { requireDeveloperApiKeyScope } from "@/lib/server/developer-api-key-auth";
import { reconcileDeveloperServiceProvisioning } from "@/lib/server/developer-service-provisioning";
import {
  isDeveloperResourceId,
  serializeDeveloperService,
  validateDeveloperServiceUpdatePayload,
} from "@/lib/server/developer-platform";
import {
  apiJson,
  HttpProblem,
  problemResponse,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";
import { rpcProvisioningSnapshots } from "@/lib/server/ethereum-rpc";
import { grpcProvisioningSnapshot } from "@/lib/server/grpc";

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
    await Promise.all([
      consumeRateLimit({
        scope: "control-plane-services:read:key",
        subjectHash: identity.secretHash,
        limit: 600,
        windowMs: 60 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: "control-plane-services:read:workspace",
        subjectHash: identity.workspace.id,
        limit: 1_200,
        windowMs: 60 * 60 * 1000,
      }),
    ]);
    const [service, rpcProvisioning, grpcProvisioning] =
      await Promise.all([
        getDeveloperService({
          workspaceId: identity.workspace.id,
          authorizationApiKeyId: identity.apiKey.id,
          serviceId: id,
        }),
        rpcProvisioningSnapshots(),
        grpcProvisioningSnapshot(),
      ]);
    if (!service) {
      throw new HttpProblem(
        404,
        "service_not_found",
        "The service was not found in this workspace.",
      );
    }
    return apiJson(
      {
        data: {
          service: serializeDeveloperService(
            reconcileDeveloperServiceProvisioning(
              service,
              rpcProvisioning,
              grpcProvisioning,
            ),
          ),
        },
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

export async function PATCH(request: Request, context: RouteContext) {
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
    const validation = validateDeveloperServiceUpdatePayload(
      await readJsonBody(request),
    );
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the service update.",
        fields: validation.fields,
        requestId,
      });
    }
    await Promise.all([
      consumeRateLimit({
        scope: "control-plane-services:update:key",
        subjectHash: identity.secretHash,
        limit: 120,
        windowMs: 60 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: "control-plane-services:update:workspace",
        subjectHash: identity.workspace.id,
        limit: 240,
        windowMs: 60 * 60 * 1000,
      }),
    ]);
    const service = await updateDeveloperService({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
      id,
      input: validation.value,
    });
    if (!service) {
      throw new HttpProblem(
        404,
        "service_not_found",
        "The service was not found in this workspace.",
      );
    }
    return apiJson(
      {
        data: { service: serializeDeveloperService(service) },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
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
    await Promise.all([
      consumeRateLimit({
        scope: "control-plane-services:archive:key",
        subjectHash: identity.secretHash,
        limit: 120,
        windowMs: 60 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: "control-plane-services:archive:workspace",
        subjectHash: identity.workspace.id,
        limit: 240,
        windowMs: 60 * 60 * 1000,
      }),
    ]);
    const service = await archiveDeveloperService({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
      id,
    });
    if (!service) {
      throw new HttpProblem(
        404,
        "service_not_found",
        "The service was not found in this workspace.",
      );
    }
    return apiJson(
      {
        data: { service: serializeDeveloperService(service) },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
