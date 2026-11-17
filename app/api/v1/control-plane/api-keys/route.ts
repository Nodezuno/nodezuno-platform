import {
  consumeRateLimit,
  createDeveloperApiKey,
  listDeveloperApiKeysForApiKey,
} from "@/lib/server/database";
import {
  developerApiKeyHash,
  privateHash,
  sha256Hex,
  stableStringify,
} from "@/lib/server/crypto";
import { requireDeveloperApiKeyScope } from "@/lib/server/developer-api-key-auth";
import {
  createDeveloperApiKeyMaterial,
  developerApiKeyLifetimeMs,
  serializeDeveloperApiKey,
  validateDeveloperApiKeyPayload,
} from "@/lib/server/developer-platform";
import {
  apiJson,
  problemResponse,
  readIdempotencyKey,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const identity = await requireDeveloperApiKeyScope(
      request,
      "services:manage",
    );
    await Promise.all([
      consumeRateLimit({
        scope: "control-plane-api-keys:list:key",
        subjectHash: identity.secretHash,
        limit: 300,
        windowMs: 60 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: "control-plane-api-keys:list:workspace",
        subjectHash: identity.workspace.id,
        limit: 600,
        windowMs: 60 * 60 * 1000,
      }),
    ]);
    const apiKeys = await listDeveloperApiKeysForApiKey({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
    });
    return apiJson(
      {
        data: { apiKeys: apiKeys.map(serializeDeveloperApiKey) },
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

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const identity = await requireDeveloperApiKeyScope(
      request,
      "services:manage",
    );
    const idempotencyKey = readIdempotencyKey(request);
    const validation = validateDeveloperApiKeyPayload(
      await readJsonBody(request),
    );
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the API key details.",
        fields: validation.fields,
        requestId,
      });
    }
    await Promise.all([
      consumeRateLimit({
        scope: "control-plane-api-keys:create:key",
        subjectHash: identity.secretHash,
        limit: 20,
        windowMs: 60 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: "control-plane-api-keys:create:workspace",
        subjectHash: identity.workspace.id,
        limit: 40,
        windowMs: 60 * 60 * 1000,
      }),
    ]);

    const now = Date.now();
    const material = createDeveloperApiKeyMaterial();
    const apiKey = await createDeveloperApiKey({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
      id: material.id,
      name: validation.value.name,
      serviceId: validation.value.serviceId,
      scopes: validation.value.scopes,
      idempotencyHash: await privateHash(
        "developer-idempotency",
        idempotencyKey,
      ),
      requestHash: await sha256Hex(
        stableStringify(
          validation.value as unknown as Record<string, unknown>,
        ),
      ),
      prefix: material.prefix,
      lastFour: material.lastFour,
      secretHash: await developerApiKeyHash(material.secret),
      expiresAt: now + developerApiKeyLifetimeMs,
      now,
    });
    return apiJson(
      {
        data: {
          apiKey: serializeDeveloperApiKey(apiKey),
          secret: material.secret,
        },
        requestId,
      },
      {
        requestId,
        status: 201,
        headers: {
          Expires: "0",
          Pragma: "no-cache",
          Vary: "Authorization",
        },
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
