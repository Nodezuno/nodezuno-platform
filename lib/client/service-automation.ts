export type UnboundApiKeyPurpose =
  | "platform-identity"
  | "service-automation";

export type ApiKeyPurposeRole = "owner" | "admin" | "developer";

export type ApiKeyAccessMetadata = {
  serviceId: string | null;
  scopes: string[];
};

export type ServiceAutomationCommandId =
  | "environment"
  | "list"
  | "create"
  | "archive"
  | "usage"
  | "policy-read"
  | "policy-update";

export type ServiceAutomationCommand = {
  id: ServiceAutomationCommandId;
  method: "ENV" | "GET" | "POST" | "DELETE" | "PUT";
  title: string;
  description: string;
  command: string;
  caution: string | null;
};

export const unboundApiKeyPurposes = [
  {
    id: "platform-identity",
    label: "Platform identity",
    scope: "platform:identity",
    description:
      "Identify this workspace through the platform identity API. This key cannot create, archive, or inspect services.",
  },
  {
    id: "service-automation",
    label: "Service automation",
    scope: "services:manage",
    description:
      "Create, list, inspect, configure, and archive workspace services through the programmatic control plane.",
  },
] as const satisfies readonly {
  id: UnboundApiKeyPurpose;
  label: string;
  scope: string;
  description: string;
}[];

export function canCreateUnboundApiKey(
  role: ApiKeyPurposeRole | null | undefined,
): boolean {
  return role === "owner" || role === "admin";
}

export function defaultUnboundApiKeyName(
  purpose: UnboundApiKeyPurpose,
): string {
  return purpose === "service-automation"
    ? "Service automation"
    : "Platform identity";
}

export function unboundApiKeyCreationPayload(
  name: string,
  purpose: UnboundApiKeyPurpose,
):
  | { name: string }
  | { name: string; scopes: ["services:manage"] } {
  const normalizedName = name.trim();
  if (normalizedName.length < 2 || normalizedName.length > 60) {
    throw new Error("Choose a key name from 2 through 60 characters.");
  }
  if (purpose === "platform-identity") {
    return { name: normalizedName };
  }
  if (purpose === "service-automation") {
    return {
      name: normalizedName,
      scopes: ["services:manage"],
    };
  }
  throw new Error("Choose a supported unbound API key purpose.");
}

export function isServiceAutomationApiKey(
  apiKey: ApiKeyAccessMetadata,
): boolean {
  return (
    apiKey.serviceId === null &&
    apiKey.scopes.length === 1 &&
    apiKey.scopes[0] === "services:manage"
  );
}

export function apiKeyMatchesUnboundPurpose(
  apiKey: ApiKeyAccessMetadata,
  purpose: UnboundApiKeyPurpose,
): boolean {
  if (apiKey.serviceId !== null || apiKey.scopes.length !== 1) {
    return false;
  }
  return apiKey.scopes[0] ===
    (purpose === "service-automation"
      ? "services:manage"
      : "platform:identity");
}

export function unboundApiKeyAccessBoundary(
  apiKey: ApiKeyAccessMetadata,
): string {
  if (apiKey.serviceId !== null) return "one bound service";
  return isServiceAutomationApiKey(apiKey)
    ? "service automation only"
    : "platform identity only";
}

export function serviceAutomationCommands(
  browserOrigin: string,
): ServiceAutomationCommand[] {
  const origin = exactHttpOrigin(browserOrigin);
  const authorization =
    '-H "Authorization: Bearer $NODEZUNO_API_KEY"';
  const accept = '-H "Accept: application/json"';

  return [
    {
      id: "environment",
      method: "ENV",
      title: "Set safe placeholders",
      description:
        "Load the saved secret through your deployment secret store. The value below is intentionally a placeholder and is not the one-time secret.",
      command: `export NODEZUNO_ORIGIN="${origin}"
export NODEZUNO_API_KEY="<load-from-your-secret-manager>"
export SERVICE_ID="<service-id-from-list-or-create>"
export IDEMPOTENCY_KEY="replace-with-a-unique-request-id"`,
      caution:
        "Do not commit, log, or paste the real key into source files. Use a new idempotency value for changed service input.",
    },
    {
      id: "list",
      method: "GET",
      title: "List workspace services",
      description:
        "Return only services in the management key's workspace, with current endpoint readiness.",
      command: `curl --fail-with-body --silent --show-error \\
  "$NODEZUNO_ORIGIN/api/v1/control-plane/services" \\
  ${authorization} \\
  ${accept}`,
      caution: null,
    },
    {
      id: "create",
      method: "POST",
      title: "Create a Base RPC service",
      description:
        "Create one durable service using an idempotency value that is reused only for an exact retry of this body.",
      command: `curl --fail-with-body --silent --show-error \\
  -X POST "$NODEZUNO_ORIGIN/api/v1/control-plane/services" \\
  ${authorization} \\
  ${accept} \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \\
  --data-binary '{
    "product": "rpc-api",
    "name": "Automated Base RPC",
    "environment": "production",
    "network": "base",
    "region": "global"
  }'`,
      caution:
        "A successful response returns the service ID. Store it as SERVICE_ID for the remaining requests.",
    },
    {
      id: "archive",
      method: "DELETE",
      title: "Archive a service",
      description:
        "Archive the tenant-bound service identified by SERVICE_ID. This stops a callable endpoint and is not a temporary pause.",
      command: `curl --fail-with-body --silent --show-error \\
  -X DELETE "$NODEZUNO_ORIGIN/api/v1/control-plane/services/$SERVICE_ID" \\
  ${authorization} \\
  ${accept}`,
      caution:
        "Move traffic and confirm the service ID before sending this destructive request.",
    },
    {
      id: "usage",
      method: "GET",
      title: "Read RPC usage",
      description:
        "Read the retained 24-hour traffic, quota, latency, error, and non-secret per-key aggregates for one RPC service.",
      command: `curl --fail-with-body --silent --show-error \\
  "$NODEZUNO_ORIGIN/api/v1/control-plane/services/$SERVICE_ID/usage?window=24h" \\
  ${authorization} \\
  ${accept}`,
      caution:
        "The window can be 24h, 7d, or 30d. RPC bodies and API-key secrets are not returned.",
    },
    {
      id: "policy-read",
      method: "GET",
      title: "Read RPC access policy",
      description:
        "Read the complete policy snapshot and its current revision before making a replacement update.",
      command: `curl --fail-with-body --silent --show-error \\
  "$NODEZUNO_ORIGIN/api/v1/control-plane/services/$SERVICE_ID/rpc-access-policy" \\
  ${authorization} \\
  ${accept}`,
      caution: null,
    },
    {
      id: "policy-update",
      method: "PUT",
      title: "Replace RPC access policy",
      description:
        "Replace the complete policy only when revision matches the latest GET response.",
      command: `curl --fail-with-body --silent --show-error \\
  -X PUT "$NODEZUNO_ORIGIN/api/v1/control-plane/services/$SERVICE_ID/rpc-access-policy" \\
  ${authorization} \\
  ${accept} \\
  -H "Content-Type: application/json" \\
  --data-binary '{
    "revision": 0,
    "allowedOrigins": ["https://app.example.com"],
    "allowedIpCidrs": [],
    "allowedMethods": ["eth_chainId", "eth_blockNumber"]
  }'`,
      caution:
        "Replace revision 0 with the latest returned revision. A stale revision is rejected instead of overwriting a newer policy.",
    },
  ];
}

function exactHttpOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "A valid Nodezuno HTTP or HTTPS origin is required.",
    );
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "A valid Nodezuno HTTP or HTTPS origin is required.",
    );
  }
  return parsed.origin;
}
