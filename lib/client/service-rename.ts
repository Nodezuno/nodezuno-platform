export const developerServiceProducts = [
  "platform-api",
  "one",
  "rpc-api",
  "grpc-api",
  "rollups",
  "nft-api",
  "webhooks",
  "websockets",
  "transfers-api",
  "token-api",
  "bundler-api",
  "gas-manager-api",
  "vault",
  "atlas",
] as const;

export const developerServiceEnvironments = [
  "development",
  "staging",
  "production",
] as const;

export const developerServiceNetworks = [
  "global",
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "polygon",
  "solana",
  "multi-chain",
  "custom-rollup",
] as const;

export const developerServiceRegions = [
  "global",
  "us-east",
  "eu-west",
  "ap-south",
] as const;

export const developerServiceStatuses = [
  "active",
  "configuration_saved",
  "archived",
] as const;

export type DeveloperServiceTelemetrySnapshot = {
  requests: number;
  calls: number;
  errors: number;
  upstreamFailures: number;
  averageLatencyMs: number | null;
  windowStartedAt: string | null;
  updatedAt: string | null;
};

export type DeveloperServiceSnapshot = {
  id: string;
  product: (typeof developerServiceProducts)[number];
  name: string;
  environment: (typeof developerServiceEnvironments)[number];
  network: (typeof developerServiceNetworks)[number];
  region: (typeof developerServiceRegions)[number];
  status: (typeof developerServiceStatuses)[number];
  endpointPath: string | null;
  configuration: Record<string, unknown>;
  telemetry: DeveloperServiceTelemetrySnapshot | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type ServiceRenameDraft = {
  serviceId: string;
  originalName: string;
  name: string;
  updatedAt: string;
};

export type ServiceRenameFailureKind =
  | "conflict"
  | "not-found"
  | "unauthorized"
  | "other";

export type ServiceRenameFailure = {
  kind: ServiceRenameFailureKind;
  message: string;
};

const CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const RESOURCE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function normalizeServiceRenameName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function serviceRenameDraftProblem(
  name: string,
  currentName: string,
): string | null {
  const normalized = normalizeServiceRenameName(name);
  if (normalized.length < 2) {
    return "Use at least 2 characters for the service name.";
  }
  if (normalized.length > 80) {
    return "Use no more than 80 characters for the service name.";
  }
  if (CONTROL_CHARACTERS.test(normalized)) {
    return "Remove unsupported control characters from the service name.";
  }
  if (normalized === currentName) {
    return "Enter a different service name before saving.";
  }
  return null;
}

export function serviceRenameRequestBody(
  name: string,
  updatedAt: string,
): { name: string; updatedAt: string } {
  const normalizedName = normalizeServiceRenameName(name);
  if (
    normalizedName.length < 2 ||
    normalizedName.length > 80 ||
    CONTROL_CHARACTERS.test(normalizedName)
  ) {
    throw new Error("Choose a valid service name from 2 through 80 characters.");
  }
  if (!isCanonicalIsoTimestamp(updatedAt)) {
    throw new Error(
      "Reload the service before renaming it because its update timestamp is invalid.",
    );
  }
  return {
    name: normalizedName,
    updatedAt,
  };
}

export function parseServiceRenameMutationEnvelope(
  payload: unknown,
  expected: {
    serviceId: string;
    name: string;
    previousUpdatedAt: string;
  },
): {
  service: DeveloperServiceSnapshot;
  requestId: string;
} {
  const envelope = exactRecord(
    payload,
    ["data", "requestId"],
    "The service rename response envelope was invalid.",
  );
  const data = exactRecord(
    envelope.data,
    ["service"],
    "The service rename response did not include one service.",
  );
  if (
    typeof envelope.requestId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,160}$/.test(envelope.requestId)
  ) {
    throw new Error(
      "The service rename response did not include a valid request ID.",
    );
  }
  const service = parseDeveloperService(data.service);
  const expectedName = normalizeServiceRenameName(expected.name);
  if (
    service.id !== expected.serviceId ||
    service.name !== expectedName ||
    service.status === "archived" ||
    service.archivedAt !== null ||
    !isCanonicalIsoTimestamp(expected.previousUpdatedAt) ||
    Date.parse(service.updatedAt) <=
      Date.parse(expected.previousUpdatedAt)
  ) {
    throw new Error(
      "The service rename response did not match the edited service snapshot.",
    );
  }
  return {
    service,
    requestId: envelope.requestId,
  };
}

export function serviceRenameFailure(
  status: number,
  payload: unknown,
): ServiceRenameFailure {
  const code = problemCode(payload);
  if (status === 409 && code === "service_update_conflict") {
    return {
      kind: "conflict",
      message:
        "This service changed in another session. Reload the current service before editing and saving its name again.",
    };
  }
  if (status === 404) {
    return {
      kind: "not-found",
      message:
        "This service is archived or no longer exists in this workspace. Reload the service list before continuing.",
    };
  }
  if (status === 401) {
    return {
      kind: "unauthorized",
      message: "Your session expired. Sign in to continue.",
    };
  }
  if (status === 422) {
    return {
      kind: "other",
      message:
        "The service name was rejected. Use 2 through 80 supported characters and try again.",
    };
  }
  if (status === 429) {
    return {
      kind: "other",
      message:
        "Too many service rename attempts were sent. Wait before trying again.",
    };
  }
  return {
    kind: "other",
    message: "We could not rename the service.",
  };
}

export function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const timestamp = Date.parse(value);
  return (
    Number.isSafeInteger(timestamp) &&
    timestamp >= 0 &&
    new Date(timestamp).toISOString() === value
  );
}

function parseDeveloperService(
  value: unknown,
): DeveloperServiceSnapshot {
  const service = exactRecord(
    value,
    [
      "id",
      "product",
      "name",
      "environment",
      "network",
      "region",
      "status",
      "endpointPath",
      "configuration",
      "telemetry",
      "createdAt",
      "updatedAt",
      "archivedAt",
    ],
    "The service rename response contained an invalid service.",
  );
  if (
    typeof service.id !== "string" ||
    !RESOURCE_ID.test(service.id) ||
    !includesValue(developerServiceProducts, service.product) ||
    typeof service.name !== "string" ||
    normalizeServiceRenameName(service.name) !== service.name ||
    service.name.length < 2 ||
    service.name.length > 80 ||
    CONTROL_CHARACTERS.test(service.name) ||
    !includesValue(developerServiceEnvironments, service.environment) ||
    !includesValue(developerServiceNetworks, service.network) ||
    !includesValue(developerServiceRegions, service.region) ||
    !includesValue(developerServiceStatuses, service.status) ||
    (service.endpointPath !== null &&
      typeof service.endpointPath !== "string") ||
    !isPlainRecord(service.configuration) ||
    !isCanonicalIsoTimestamp(service.createdAt) ||
    !isCanonicalIsoTimestamp(service.updatedAt) ||
    (service.archivedAt !== null &&
      !isCanonicalIsoTimestamp(service.archivedAt))
  ) {
    throw new Error(
      "The service rename response contained invalid service fields.",
    );
  }
  return {
    id: service.id,
    product: service.product,
    name: service.name,
    environment: service.environment,
    network: service.network,
    region: service.region,
    status: service.status,
    endpointPath: service.endpointPath,
    configuration: { ...service.configuration },
    telemetry: parseTelemetry(service.telemetry),
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    archivedAt: service.archivedAt,
  };
}

function parseTelemetry(
  value: unknown,
): DeveloperServiceTelemetrySnapshot | null {
  if (value === null) return null;
  const telemetry = exactRecord(
    value,
    [
      "requests",
      "calls",
      "errors",
      "upstreamFailures",
      "averageLatencyMs",
      "windowStartedAt",
      "updatedAt",
    ],
    "The service rename response contained invalid telemetry.",
  );
  for (const key of [
    "requests",
    "calls",
    "errors",
    "upstreamFailures",
  ] as const) {
    if (
      !Number.isSafeInteger(telemetry[key]) ||
      (telemetry[key] as number) < 0
    ) {
      throw new Error(
        "The service rename response contained invalid telemetry.",
      );
    }
  }
  if (
    (telemetry.averageLatencyMs !== null &&
      (typeof telemetry.averageLatencyMs !== "number" ||
        !Number.isFinite(telemetry.averageLatencyMs) ||
        telemetry.averageLatencyMs < 0)) ||
    (telemetry.windowStartedAt !== null &&
      !isCanonicalIsoTimestamp(telemetry.windowStartedAt)) ||
    (telemetry.updatedAt !== null &&
      !isCanonicalIsoTimestamp(telemetry.updatedAt))
  ) {
    throw new Error(
      "The service rename response contained invalid telemetry.",
    );
  }
  return {
    requests: telemetry.requests as number,
    calls: telemetry.calls as number,
    errors: telemetry.errors as number,
    upstreamFailures: telemetry.upstreamFailures as number,
    averageLatencyMs: telemetry.averageLatencyMs as number | null,
    windowStartedAt: telemetry.windowStartedAt as string | null,
    updatedAt: telemetry.updatedAt as string | null,
  };
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  message: string,
): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new Error(message);
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(message);
  }
  return value;
}

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function includesValue<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === "string" && values.includes(value);
}

function problemCode(payload: unknown): string | null {
  if (!isPlainRecord(payload)) return null;
  return typeof payload.code === "string" ? payload.code : null;
}
