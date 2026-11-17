import {
  consumeRateLimit,
  createDeveloperApiKey,
  listDeveloperApiKeysForIdentity,
} from "@/lib/server/database";
import {
  developerApiKeyHash,
  privateHash,
  sha256Hex,
  stableStringify,
} from "@/lib/server/crypto";
import {
  createDeveloperApiKeyMaterial,
  developerActorFromUser,
  developerApiKeyLifetimeMs,
  developerIdentitySubject,
  requireDeveloperIdentity,
  serializeDeveloperApiKey,
  validateDeveloperApiKeyPayload,
} from "@/lib/server/developer-platform";
import {
  apiJson,
  assertSameOrigin,
  problemResponse,
  readIdempotencyKey,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const user = await requireDeveloperIdentity(request);
    const apiKeys = await listDeveloperApiKeysForIdentity(
      developerActorFromUser(user),
    );
    return apiJson(
      {
        data: { apiKeys: apiKeys.map(serializeDeveloperApiKey) },
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
    const identityHash = await privateHash(
      "developer-identity",
      developerIdentitySubject(user),
    );
    await consumeRateLimit({
      scope: "developer-api-key:create:identity",
      subjectHash: identityHash,
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });

    const now = Date.now();
    const material = createDeveloperApiKeyMaterial();
    const secretHash = await developerApiKeyHash(material.secret);
    const apiKey = await createDeveloperApiKey({
      actorAccountId: user.accountId ?? null,
      actorEmail: developerActorFromUser(user).email,
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
      secretHash,
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
        },
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
