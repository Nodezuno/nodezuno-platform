import {
  archiveDeveloperService,
  consumeRateLimit,
  getDeveloperService,
  updateDeveloperService,
} from "@/lib/server/database";
import { privateHash } from "@/lib/server/crypto";
import { reconcileDeveloperServiceProvisioning } from "@/lib/server/developer-service-provisioning";
import {
  developerActorFromUser,
  developerIdentitySubject,
  isDeveloperResourceId,
  requireDeveloperIdentity,
  serializeDeveloperService,
  validateDeveloperServiceUpdatePayload,
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
import { rpcProvisioningSnapshots } from "@/lib/server/ethereum-rpc";
import { grpcProvisioningSnapshot } from "@/lib/server/grpc";

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
    await consumeRateLimit({
      scope: "developer-service:read:identity",
      subjectHash: await privateHash(
        "developer-identity",
        developerIdentitySubject(user),
      ),
      limit: 600,
      windowMs: 60 * 60 * 1000,
    });
    const [service, rpcProvisioning, grpcProvisioning] =
      await Promise.all([
        getDeveloperService({
          actor: developerActorFromUser(user),
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
        headers: { Vary: "Cookie" },
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const user = await requireDeveloperIdentity(request);
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
    await consumeRateLimit({
      scope: "developer-service:update:identity",
      subjectHash: await privateHash(
        "developer-identity",
        developerIdentitySubject(user),
      ),
      limit: 120,
      windowMs: 60 * 60 * 1000,
    });
    const service = await updateDeveloperService({
      actor: developerActorFromUser(user),
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
    assertSameOrigin(request);
    const user = await requireDeveloperIdentity(request);
    const { id } = await context.params;
    if (!isDeveloperResourceId(id)) {
      throw new HttpProblem(
        400,
        "invalid_service_id",
        "Use a valid service identifier.",
      );
    }
    await consumeRateLimit({
      scope: "developer-service:archive:identity",
      subjectHash: await privateHash(
        "developer-identity",
        developerIdentitySubject(user),
      ),
      limit: 60,
      windowMs: 60 * 60 * 1000,
    });
    const service = await archiveDeveloperService({
      actor: developerActorFromUser(user),
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
