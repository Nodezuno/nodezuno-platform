import {
  consumeRateLimit,
  createDeveloperService,
  listDeveloperServicesForApiKey,
} from "@/lib/server/database";
import {
  privateHash,
  sha256Hex,
  stableStringify,
} from "@/lib/server/crypto";
import { requireDeveloperApiKeyScope } from "@/lib/server/developer-api-key-auth";
import { reconcileDeveloperServiceProvisioning } from "@/lib/server/developer-service-provisioning";
import {
  serializeDeveloperService,
  validateDeveloperServicePayload,
} from "@/lib/server/developer-platform";
import {
  apiJson,
  problemResponse,
  readIdempotencyKey,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";
import {
  rpcProvisioningSnapshot,
  rpcProvisioningSnapshots,
  type RpcNetwork,
} from "@/lib/server/ethereum-rpc";
import { grpcProvisioningSnapshot } from "@/lib/server/grpc";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const identity = await requireDeveloperApiKeyScope(
      request,
      "services:manage",
    );
    await consumeRateLimit({
      scope: "control-plane-services:list:key",
      subjectHash: identity.secretHash,
      limit: 300,
      windowMs: 60 * 1000,
    });
    const [services, rpcProvisioning, grpcProvisioning] =
      await Promise.all([
        listDeveloperServicesForApiKey({
          workspaceId: identity.workspace.id,
          apiKeyId: identity.apiKey.id,
        }),
        rpcProvisioningSnapshots(),
        grpcProvisioningSnapshot(),
      ]);
    return apiJson(
      {
        data: {
          services: services.map((service) =>
            serializeDeveloperService(
              reconcileDeveloperServiceProvisioning(
                service,
                rpcProvisioning,
                grpcProvisioning,
              ),
            ),
          ),
        },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const identity = await requireDeveloperApiKeyScope(
      request,
      "services:manage",
    );
    const idempotencyKey = readIdempotencyKey(request);
    const validation = validateDeveloperServicePayload(
      await readJsonBody(request),
    );
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the service configuration.",
        fields: validation.fields,
        requestId,
      });
    }
    await Promise.all([
      consumeRateLimit({
        scope: "control-plane-services:create:key",
        subjectHash: identity.secretHash,
        limit: 60,
        windowMs: 60 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: "control-plane-services:create:workspace",
        subjectHash: identity.workspace.id,
        limit: 120,
        windowMs: 60 * 60 * 1000,
      }),
    ]);
    const rpcProvisioning =
      validation.value.product === "rpc-api"
        ? await rpcProvisioningSnapshot(
            validation.value.network as RpcNetwork,
          )
        : undefined;
    const grpcProvisioning =
      validation.value.product === "grpc-api"
        ? await grpcProvisioningSnapshot()
        : undefined;
    const service = await createDeveloperService({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
      input: validation.value,
      rpcProvisioning,
      grpcProvisioning,
      idempotencyHash: await privateHash(
        "developer-idempotency",
        idempotencyKey,
      ),
      requestHash: await sha256Hex(
        stableStringify(
          validation.value as unknown as Record<string, unknown>,
        ),
      ),
    });
    return apiJson(
      {
        data: { service: serializeDeveloperService(service) },
        requestId,
      },
      { requestId, status: 201 },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
