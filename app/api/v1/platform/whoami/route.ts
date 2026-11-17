import {
  authenticateDeveloperApiKey,
  consumeRateLimit,
} from "@/lib/server/database";
import {
  developerApiKeyHash,
  requestFingerprint,
} from "@/lib/server/crypto";
import {
  apiKeyAuthenticationProblem,
  readDeveloperApiKey,
} from "@/lib/server/developer-platform";
import {
  apiJson,
  HttpProblem,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const fingerprint = await requestFingerprint(request);
    await consumeRateLimit({
      scope: "platform-auth:ip",
      subjectHash: fingerprint.ipHash,
      limit: 120,
      windowMs: 60 * 1000,
    });

    const presented = readDeveloperApiKey(request);
    const secretHash = await developerApiKeyHash(presented.secret);
    const identity = await authenticateDeveloperApiKey({
      id: presented.id,
      secretHash,
    });
    if (!identity) throw apiKeyAuthenticationProblem();
    if (!identity.apiKey.scopes.includes("platform:identity")) {
      throw new HttpProblem(
        403,
        "api_key_scope_denied",
        "This API key cannot access platform identity.",
      );
    }
    await Promise.all([
      consumeRateLimit({
        scope: "platform-whoami:key",
        subjectHash: identity.secretHash,
        limit: 300,
        windowMs: 60 * 1000,
      }),
      consumeRateLimit({
        scope: "platform-whoami:workspace",
        subjectHash: identity.workspace.id,
        limit: 1_000,
        windowMs: 60 * 1000,
      }),
    ]);

    return apiJson(
      {
        data: {
          workspace: identity.workspace,
          apiKey: {
            id: identity.apiKey.id,
            name: identity.apiKey.name,
            prefix: identity.apiKey.prefix,
            lastFour: identity.apiKey.lastFour,
            scopes: identity.apiKey.scopes,
            serviceId: identity.apiKey.serviceId,
            expiresAt: new Date(
              identity.apiKey.expiresAt,
            ).toISOString(),
          },
        },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
