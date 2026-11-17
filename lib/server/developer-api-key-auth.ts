import {
  authenticateDeveloperApiKey,
  consumeRateLimit,
} from "./database.ts";
import {
  developerApiKeyHash,
  requestFingerprint,
} from "./crypto.ts";
import {
  apiKeyAuthenticationProblem,
  readDeveloperApiKey,
  type DeveloperApiKeyIdentity,
  type DeveloperApiKeyScope,
} from "./developer-platform.ts";
import { HttpProblem } from "./http.ts";

export async function requireDeveloperApiKeyScope(
  request: Request,
  requiredScope: DeveloperApiKeyScope,
): Promise<DeveloperApiKeyIdentity> {
  const fingerprint = await requestFingerprint(request);
  await consumeRateLimit({
    scope: "developer-api-key-auth:ip",
    subjectHash: fingerprint.ipHash,
    limit: 300,
    windowMs: 60 * 1000,
  });

  const presented = readDeveloperApiKey(request);
  const secretHash = await developerApiKeyHash(presented.secret);
  const identity = await authenticateDeveloperApiKey({
    id: presented.id,
    secretHash,
  });
  if (!identity) throw apiKeyAuthenticationProblem();
  assertDeveloperApiKeyScope(identity, requiredScope);

  await Promise.all([
    consumeRateLimit({
      scope: "developer-api-key-auth:key",
      subjectHash: identity.secretHash,
      limit: 600,
      windowMs: 60 * 1000,
    }),
    consumeRateLimit({
      scope: "developer-api-key-auth:workspace",
      subjectHash: identity.workspace.id,
      limit: 1_500,
      windowMs: 60 * 1000,
    }),
  ]);
  return identity;
}

export function assertDeveloperApiKeyScope(
  identity: DeveloperApiKeyIdentity,
  requiredScope: DeveloperApiKeyScope,
): void {
  if (!identity.apiKey.scopes.includes(requiredScope)) {
    throw new HttpProblem(
      403,
      "api_key_scope_denied",
      `This API key requires the ${requiredScope} scope.`,
    );
  }
  if (
    requiredScope === "services:manage" &&
    identity.apiKey.serviceId !== null
  ) {
    throw new HttpProblem(
      403,
      "api_key_service_binding_denied",
      "Service management keys must not be bound to a callable service.",
    );
  }
}
