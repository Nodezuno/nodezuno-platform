import {
  consumeRateLimit,
  rotateDeveloperApiKey,
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
  isDeveloperResourceId,
  requireDeveloperIdentity,
  serializeDeveloperApiKey,
  validateDeveloperApiKeyRotationPayload,
} from "@/lib/server/developer-platform";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  problemResponse,
  readIdempotencyKey,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const user = await requireDeveloperIdentity(request);
    const { id } = await context.params;
    if (!isDeveloperResourceId(id)) {
      throw new HttpProblem(
        400,
        "invalid_api_key_id",
        "Use a valid API key identifier.",
      );
    }
    const idempotencyKey = readIdempotencyKey(request);
    const validation = validateDeveloperApiKeyRotationPayload(
      await readJsonBody(request),
    );
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the replacement API key details.",
        fields: validation.fields,
        requestId,
      });
    }
    await consumeRateLimit({
      scope: "developer-api-key:rotate:identity",
      subjectHash: await privateHash(
        "developer-identity",
        developerIdentitySubject(user),
      ),
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });

    const now = Date.now();
    const material = createDeveloperApiKeyMaterial();
    const apiKey = await rotateDeveloperApiKey({
      actor: developerActorFromUser(user),
      sourceId: id,
      id: material.id,
      name: validation.value.name,
      prefix: material.prefix,
      lastFour: material.lastFour,
      secretHash: await developerApiKeyHash(material.secret),
      expiresAt: now + developerApiKeyLifetimeMs,
      idempotencyHash: await privateHash(
        "developer-idempotency",
        idempotencyKey,
      ),
      requestHash: await sha256Hex(
        stableStringify({
          sourceId: id,
          name: validation.value.name,
        }),
      ),
      now,
    });
    if (!apiKey) {
      throw new HttpProblem(
        404,
        "api_key_not_found",
        "The API key was not found in this workspace.",
      );
    }
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
