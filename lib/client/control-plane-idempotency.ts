export type DeveloperCreationOperation =
  | "service.create"
  | "api-key.create"
  | "api-key.rotate";

export type DeveloperCreationAttempt = {
  fingerprint: string;
  key: string;
};

export type DeveloperCreationAttemptRegistry = Map<
  string,
  DeveloperCreationAttempt
>;

type SecureUuidSource = {
  randomUUID(): string;
};

export function acquireDeveloperCreationAttempt(
  registry: DeveloperCreationAttemptRegistry,
  slot: string,
  operation: DeveloperCreationOperation,
  body: Record<string, unknown>,
  secureUuidSource: SecureUuidSource = globalThis.crypto,
): DeveloperCreationAttempt {
  const fingerprint = developerCreationFingerprint(operation, body);
  const current = registry.get(slot);
  if (current?.fingerprint === fingerprint) return current;

  const attempt = {
    fingerprint,
    key: createDeveloperIdempotencyKey(operation, secureUuidSource),
  };
  registry.set(slot, attempt);
  return attempt;
}

export function settleDeveloperCreationAttempt(
  registry: DeveloperCreationAttemptRegistry,
  slot: string,
  key: string,
  retainForRetry: boolean,
): void {
  const current = registry.get(slot);
  if (!current || current.key !== key || retainForRetry) return;
  registry.delete(slot);
}

export function shouldRetainDeveloperCreationAttempt(
  response: Pick<Response, "ok" | "status"> | null,
): boolean {
  if (!response || response.ok) return true;
  return (
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500
  );
}

export function isCompleteDeveloperCreationEnvelope(
  envelope: unknown,
  operation: DeveloperCreationOperation,
): boolean {
  if (
    !envelope ||
    typeof envelope !== "object" ||
    Array.isArray(envelope)
  ) {
    return false;
  }
  const candidate = envelope as Record<string, unknown>;
  if (
    typeof candidate.requestId !== "string" ||
    !candidate.requestId ||
    !candidate.data ||
    typeof candidate.data !== "object" ||
    Array.isArray(candidate.data)
  ) {
    return false;
  }
  const data = candidate.data as Record<string, unknown>;
  const resource =
    operation === "service.create" ? data.service : data.apiKey;
  if (
    !resource ||
    typeof resource !== "object" ||
    Array.isArray(resource) ||
    typeof (resource as Record<string, unknown>).id !== "string" ||
    !(resource as Record<string, unknown>).id
  ) {
    return false;
  }
  return (
    operation === "service.create" ||
    (typeof data.secret === "string" && data.secret.length > 0)
  );
}

export function createDeveloperIdempotencyKey(
  operation: DeveloperCreationOperation,
  secureUuidSource: SecureUuidSource = globalThis.crypto,
): string {
  if (
    !secureUuidSource ||
    typeof secureUuidSource.randomUUID !== "function"
  ) {
    throw new Error(
      "Secure request identity is unavailable. Reload this page in a secure browser context.",
    );
  }
  const operationLabel =
    operation === "service.create"
      ? "service"
      : operation === "api-key.rotate"
        ? "api-key-rotate"
        : "api-key";
  const key = `nzu.${operationLabel}.${secureUuidSource.randomUUID()}`;
  if (
    key.length < 16 ||
    key.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(key)
  ) {
    throw new Error(
      "Secure request identity could not be created. Reload the page before retrying.",
    );
  }
  return key;
}

export function developerCreationFingerprint(
  operation: DeveloperCreationOperation,
  body: Record<string, unknown>,
): string {
  return `${operation}:${stableJson(body)}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(record[key])}`,
    )
    .join(",")}}`;
}
