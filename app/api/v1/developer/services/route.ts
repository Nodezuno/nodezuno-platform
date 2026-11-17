import {
  consumeRateLimit,
  createDeveloperService,
  listDeveloperServices,
} from "@/lib/server/database";
import {
  privateHash,
  sha256Hex,
  stableStringify,
} from "@/lib/server/crypto";
import {
  developerActorFromUser,
  developerIdentitySubject,
  requireDeveloperIdentity,
  serializeDeveloperService,
  validateDeveloperServicePayload,
} from "@/lib/server/developer-platform";
import { reconcileDeveloperServiceProvisioning } from "@/lib/server/developer-service-provisioning";
import {
  apiJson,
  assertSameOrigin,
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
    const user = await requireDeveloperIdentity(request);
    const [services, rpcProvisioning, grpcProvisioning] = await Promise.all([
      listDeveloperServices(developerActorFromUser(user)),
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
    assertSameOrigin(request);
    const user = await requireDeveloperIdentity(request);
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
    await consumeRateLimit({
      scope: "developer-service:create:identity",
      subjectHash: await privateHash(
        "developer-identity",
        developerIdentitySubject(user),
      ),
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
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
      actor: developerActorFromUser(user),
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
