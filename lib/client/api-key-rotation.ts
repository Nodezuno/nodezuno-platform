export type ApiKeyRotationRole = "owner" | "admin" | "developer";

export type ApiKeyRotationSource = {
  expiresAt: string | null;
  revokedAt: string | null;
};

export type ApiKeyRotationBody = Record<string, never> | {
  name: string;
};

export function canRotateApiKeys(
  role: ApiKeyRotationRole | null | undefined,
): boolean {
  return role === "owner" || role === "admin";
}

export function isApiKeyActiveAndUnexpired(
  apiKey: ApiKeyRotationSource,
  now = Date.now(),
): boolean {
  if (apiKey.revokedAt) return false;
  if (!apiKey.expiresAt) return true;

  const expiration = Date.parse(apiKey.expiresAt);
  return Number.isFinite(expiration) && expiration > now;
}

export function isApiKeyRotationEligible(
  role: ApiKeyRotationRole | null | undefined,
  apiKey: ApiKeyRotationSource,
  now = Date.now(),
): boolean {
  return (
    canRotateApiKeys(role) &&
    isApiKeyActiveAndUnexpired(apiKey, now)
  );
}

export function apiKeyRotationBody(name: string): ApiKeyRotationBody {
  const normalizedName = name.trim();
  return normalizedName ? { name: normalizedName } : {};
}

export function apiKeyRotationAttemptIdentity(
  sourceApiKeyId: string,
  body: ApiKeyRotationBody,
): Record<string, unknown> {
  return {
    sourceApiKeyId,
    requestBody: body,
  };
}
