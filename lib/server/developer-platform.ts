import type { ParsedUser } from "./http.ts";
import { HttpProblem } from "./http.ts";
import { accountIdentityFromRequest } from "./account-identity.ts";
import { isOperationalEmailAddress } from "./runtime-config.ts";

export const developerApiKeyScopes = [
  "platform:identity",
  "services:manage",
  "rpc:invoke",
  "grpc:invoke",
] as const;
export type DeveloperApiKeyScope =
  (typeof developerApiKeyScopes)[number];
export const developerApiKeyLifetimeMs = 365 * 24 * 60 * 60 * 1000;
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
export const chainLaunchStackNetworks = [
  "op-stack",
  "arbitrum-orbit",
  "avalanche-l1",
  "polygon-cdk",
  "cosmos-evm",
  "custom-chain",
  "custom-rollup",
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
  ...chainLaunchStackNetworks,
] as const;
export const developerServiceRegions = [
  "global",
  "us-east",
  "eu-west",
  "ap-south",
] as const;

export type DeveloperWorkspaceRole = "owner" | "admin" | "developer";

export type DeveloperWorkspaceRecord = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "closed";
  role: DeveloperWorkspaceRole;
  createdAt: number;
  updatedAt: number;
};

export type DeveloperWorkspaceMemberRole = Exclude<
  DeveloperWorkspaceRole,
  "owner"
>;

export type DeveloperWorkspaceMemberRecord = {
  id: string;
  workspaceId: string;
  accountId: string | null;
  email: string | null;
  role: DeveloperWorkspaceRole;
  state: "active" | "pending";
  createdAt: number;
  updatedAt: number;
};

export type SerializedDeveloperWorkspaceMember = Omit<
  DeveloperWorkspaceMemberRecord,
  "workspaceId" | "accountId" | "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};

export type DeveloperApiKeyRecord = {
  id: string;
  workspaceId: string;
  serviceId: string | null;
  name: string;
  prefix: string;
  lastFour: string;
  scopes: string[];
  secretHash: string;
  createdByAccountId: string | null;
  createdByEmail: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number;
  revokedAt: number | null;
};

export type DeveloperApiKeyMetadata = Omit<
  DeveloperApiKeyRecord,
  | "workspaceId"
  | "secretHash"
  | "createdByAccountId"
  | "createdByEmail"
>;

export type DeveloperApiKeyMaterial = {
  id: string;
  secret: string;
  prefix: string;
  lastFour: string;
};

export type DeveloperApiKeyIdentity = {
  workspace: {
    id: string;
    slug: string;
    name: string;
  };
  apiKey: {
    id: string;
    name: string;
    prefix: string;
    lastFour: string;
    scopes: string[];
    serviceId: string | null;
    expiresAt: number;
  };
  secretHash: string;
};

export type DeveloperServiceProduct =
  (typeof developerServiceProducts)[number];
export type DeveloperServiceEnvironment =
  (typeof developerServiceEnvironments)[number];
export type DeveloperServiceNetwork =
  (typeof developerServiceNetworks)[number];
export type ChainLaunchStackNetwork =
  (typeof chainLaunchStackNetworks)[number];
export type DeveloperServiceRegion =
  (typeof developerServiceRegions)[number];

const chainLaunchStackLabels: Record<ChainLaunchStackNetwork, string> = {
  "op-stack": "OP Stack",
  "arbitrum-orbit": "Arbitrum Orbit",
  "avalanche-l1": "Avalanche L1",
  "polygon-cdk": "Polygon CDK",
  "cosmos-evm": "Cosmos EVM",
  "custom-chain": "Custom chain",
  "custom-rollup": "Custom rollup",
};

export function isChainLaunchStackNetwork(
  value: unknown,
): value is ChainLaunchStackNetwork {
  return (
    typeof value === "string" &&
    chainLaunchStackNetworks.includes(value as ChainLaunchStackNetwork)
  );
}

export function chainLaunchStackIdentity(
  value: DeveloperServiceNetwork,
): { id: ChainLaunchStackNetwork; label: string } | null {
  if (!isChainLaunchStackNetwork(value)) return null;
  return { id: value, label: chainLaunchStackLabels[value] };
}
export type DeveloperServiceStatus =
  | "active"
  | "configuration_saved"
  | "archived";
export type DeveloperServiceTelemetry = {
  requests: number;
  calls: number;
  errors: number;
  upstreamFailures: number;
  averageLatencyMs: number | null;
  windowStartedAt: number | null;
  updatedAt: number | null;
};
export type DeveloperServiceRecord = {
  id: string;
  workspaceId: string;
  product: DeveloperServiceProduct;
  name: string;
  environment: DeveloperServiceEnvironment;
  network: DeveloperServiceNetwork;
  region: DeveloperServiceRegion;
  status: DeveloperServiceStatus;
  endpointPath: string | null;
  configuration: Record<string, unknown>;
  telemetry: DeveloperServiceTelemetry | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
};

export type DeveloperWorkspaceInput = { name: string | null };
export type DeveloperWorkspaceMemberInviteInput = {
  email: string;
  role: DeveloperWorkspaceMemberRole;
};
export type DeveloperWorkspaceMemberRoleInput = {
  role: DeveloperWorkspaceMemberRole;
};
export type DeveloperApiKeyInput = {
  name: string;
  serviceId: string | null;
  scopes: DeveloperApiKeyScope[] | null;
};
export type DeveloperApiKeyRotationInput = {
  name: string | null;
};
export type DeveloperServiceInput = {
  product: DeveloperServiceProduct;
  name: string;
  environment: DeveloperServiceEnvironment;
  network: DeveloperServiceNetwork;
  region: DeveloperServiceRegion;
};
export type DeveloperServiceUpdateInput = {
  name: string;
  updatedAt: number;
};
export type DeveloperActor = {
  accountId: string | null;
  email: string | null;
};

export type DeveloperValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; fields: Record<string, string> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API_KEY_PATTERN =
  /^nzu_live_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;
const CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export async function requireDeveloperIdentity(
  request: Request,
): Promise<ParsedUser> {
  const user = await accountIdentityFromRequest(request);
  if (!user) {
    throw new HttpProblem(
      401,
      "authentication_required",
      "Sign in to access your developer workspace.",
    );
  }
  return user;
}

export function validateDeveloperWorkspacePayload(
  payload: unknown,
): DeveloperValidationResult<DeveloperWorkspaceInput> {
  if (!isPlainRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  if (Object.keys(payload).some((key) => key !== "name")) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }
  if (payload.name === undefined || payload.name === null) {
    return { ok: true, value: { name: null } };
  }
  const fields: Record<string, string> = {};
  const name = cleanName(payload.name, "name", 2, 80, fields);
  return Object.keys(fields).length > 0
    ? { ok: false, fields }
    : { ok: true, value: { name } };
}

export function validateDeveloperWorkspaceMemberInvitePayload(
  payload: unknown,
): DeveloperValidationResult<DeveloperWorkspaceMemberInviteInput> {
  if (!isPlainRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  if (
    Object.keys(payload).some(
      (key) => key !== "email" && key !== "role",
    )
  ) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }
  const fields: Record<string, string> = {};
  const email = normalizeWorkspaceMemberEmail(payload.email);
  if (!email) {
    fields.email = "Enter a valid team member email address.";
  }
  const role =
    payload.role === "admin" || payload.role === "developer"
      ? payload.role
      : null;
  if (!role) {
    fields.role = "Choose the admin or developer role.";
  }
  return Object.keys(fields).length > 0
    ? { ok: false, fields }
    : { ok: true, value: { email: email!, role: role! } };
}

export function validateDeveloperWorkspaceMemberRolePayload(
  payload: unknown,
): DeveloperValidationResult<DeveloperWorkspaceMemberRoleInput> {
  if (!isPlainRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  if (Object.keys(payload).some((key) => key !== "role")) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }
  if (payload.role !== "admin" && payload.role !== "developer") {
    return {
      ok: false,
      fields: { role: "Choose the admin or developer role." },
    };
  }
  return { ok: true, value: { role: payload.role } };
}

export function validateDeveloperApiKeyPayload(
  payload: unknown,
): DeveloperValidationResult<DeveloperApiKeyInput> {
  if (!isPlainRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  if (
    Object.keys(payload).some(
      (key) =>
        key !== "name" &&
        key !== "serviceId" &&
        key !== "scopes",
    )
  ) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }
  const fields: Record<string, string> = {};
  const name = cleanName(payload.name, "name", 2, 60, fields);
  let serviceId: string | null = null;
  if (payload.serviceId !== undefined && payload.serviceId !== null) {
    if (
      typeof payload.serviceId !== "string" ||
      !isDeveloperResourceId(payload.serviceId)
    ) {
      fields.serviceId =
        "Use a valid service identifier or omit serviceId.";
    } else {
      serviceId = payload.serviceId;
    }
  }
  let scopes: DeveloperApiKeyScope[] | null = null;
  if (payload.scopes !== undefined && payload.scopes !== null) {
    const allowedScopes = new Set<string>(developerApiKeyScopes);
    if (
      !Array.isArray(payload.scopes) ||
      payload.scopes.length !== 1 ||
      typeof payload.scopes[0] !== "string" ||
      !allowedScopes.has(payload.scopes[0])
    ) {
      fields.scopes =
        "Choose exactly one supported least-privilege API key scope.";
    } else {
      scopes = [payload.scopes[0] as DeveloperApiKeyScope];
    }
  }
  return Object.keys(fields).length > 0
    ? { ok: false, fields }
    : { ok: true, value: { name, serviceId, scopes } };
}

export function validateDeveloperApiKeyRotationPayload(
  payload: unknown,
): DeveloperValidationResult<DeveloperApiKeyRotationInput> {
  if (!isPlainRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  if (Object.keys(payload).some((key) => key !== "name")) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }
  const fields: Record<string, string> = {};
  const name =
    payload.name === undefined || payload.name === null
      ? null
      : cleanName(payload.name, "name", 2, 60, fields);
  return Object.keys(fields).length > 0
    ? { ok: false, fields }
    : { ok: true, value: { name } };
}

function normalizeWorkspaceMemberEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    CONTROL_CHARACTERS.test(email) ||
    !isOperationalEmailAddress(email) ||
    !/^[^@\s]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(
      email,
    ) ||
    email.includes("..")
  ) {
    return null;
  }
  return email;
}

export function validateDeveloperServicePayload(
  payload: unknown,
): DeveloperValidationResult<DeveloperServiceInput> {
  if (!isPlainRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  const allowedFields = new Set([
    "product",
    "name",
    "environment",
    "network",
    "region",
  ]);
  if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }
  const fields: Record<string, string> = {};
  const name = cleanName(payload.name, "name", 2, 80, fields);
  const product = enumValue(
    payload.product,
    developerServiceProducts,
    "product",
    fields,
  );
  const environment = enumValue(
    payload.environment,
    developerServiceEnvironments,
    "environment",
    fields,
  );
  const network = enumValue(
    payload.network,
    developerServiceNetworks,
    "network",
    fields,
  );
  const region = enumValue(
    payload.region,
    developerServiceRegions,
    "region",
    fields,
  );
  if (
    product === "platform-api" &&
    (network !== "global" || region !== "global")
  ) {
    fields.network =
      "The live platform API uses the global network and region.";
  }
  if (
    product === "rpc-api" &&
    !["ethereum", "base", "solana"].includes(network ?? "")
  ) {
    fields.network =
      "Choose Ethereum, Base, or Solana for the RPC API.";
  }
  if (product === "grpc-api" && network !== "ethereum") {
    fields.network =
      "Ethereum is the supported native gRPC network in this release.";
  }
  if (
    product === "rollups" &&
    !isChainLaunchStackNetwork(network)
  ) {
    fields.network =
      "Choose a supported chain stack for Chain Launch Cloud.";
  }
  return Object.keys(fields).length > 0
    ? { ok: false, fields }
    : {
        ok: true,
        value: {
          product: product!,
          name,
          environment: environment!,
          network: network!,
          region: region!,
        },
      };
}

export function validateDeveloperServiceUpdatePayload(
  payload: unknown,
): DeveloperValidationResult<DeveloperServiceUpdateInput> {
  if (!isPlainRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  if (
    Object.keys(payload).some(
      (key) => key !== "name" && key !== "updatedAt",
    )
  ) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }
  const fields: Record<string, string> = {};
  const name = cleanName(payload.name, "name", 2, 80, fields);
  let updatedAt = -1;
  if (
    typeof payload.updatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      payload.updatedAt,
    )
  ) {
    fields.updatedAt =
      "Use the exact updatedAt timestamp returned with the service.";
  } else {
    updatedAt = Date.parse(payload.updatedAt);
    if (
      !Number.isSafeInteger(updatedAt) ||
      updatedAt < 0 ||
      new Date(updatedAt).toISOString() !== payload.updatedAt
    ) {
      fields.updatedAt =
        "Use the exact updatedAt timestamp returned with the service.";
    }
  }
  return Object.keys(fields).length > 0
    ? { ok: false, fields }
    : { ok: true, value: { name, updatedAt } };
}

export function defaultDeveloperWorkspaceName(user: ParsedUser): string {
  const candidate = user.fullName?.trim() || user.displayName;
  const bounded = candidate.replace(/\s+/g, " ").slice(0, 66).trim();
  return `${bounded || "Developer"} workspace`;
}

export function developerActorFromUser(user: ParsedUser): DeveloperActor {
  const walletOnly =
    user.authMethod === "evm" || user.authMethod === "solana";
  return {
    accountId: user.accountId ?? null,
    email: walletOnly ? null : user.contactEmail ?? user.email,
  };
}

export function developerIdentitySubject(user: ParsedUser): string {
  return user.accountId ? `account:${user.accountId}` : `email:${user.email}`;
}

export function createDeveloperWorkspaceSlug(
  name: string,
  workspaceId: string,
): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${base || "workspace"}-${workspaceId.slice(0, 8)}`;
}

export function serializeDeveloperWorkspaceMember(
  member: DeveloperWorkspaceMemberRecord,
): SerializedDeveloperWorkspaceMember {
  return {
    id: member.id,
    email: member.email,
    role: member.role,
    state: member.state,
    createdAt: new Date(member.createdAt).toISOString(),
    updatedAt: new Date(member.updatedAt).toISOString(),
  };
}

export function createDeveloperApiKeyMaterial(
  id = crypto.randomUUID(),
): DeveloperApiKeyMaterial {
  if (!isDeveloperResourceId(id)) {
    throw new Error("A valid version 4 UUID is required.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const randomSecret = base64UrlEncode(bytes);
  const secret = `nzu_live_${id}_${randomSecret}`;
  return {
    id,
    secret,
    prefix: `nzu_live_${id.slice(0, 8)}`,
    lastFour: randomSecret.slice(-4),
  };
}

export function readDeveloperApiKey(request: Request): {
  id: string;
  secret: string;
} {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.length > 256) throw apiKeyAuthenticationProblem();
  const bearer = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1] ?? "";
  const parsed = parseDeveloperApiKey(bearer);
  if (!parsed) throw apiKeyAuthenticationProblem();
  return parsed;
}

export function parseDeveloperApiKey(
  value: string,
): { id: string; secret: string } | null {
  const match = API_KEY_PATTERN.exec(value);
  return match ? { id: match[1], secret: value } : null;
}

export function isDeveloperResourceId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function developerApiKeyAllowsService(
  apiKey: { serviceId: string | null },
  serviceId: string,
): boolean {
  return apiKey.serviceId === null || apiKey.serviceId === serviceId;
}

export function constantTimeStringEqual(
  left: string,
  right: string,
): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export function serializeDeveloperWorkspace(
  workspace: DeveloperWorkspaceRecord,
) {
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    status: workspace.status,
    role: workspace.role,
    createdAt: new Date(workspace.createdAt).toISOString(),
    updatedAt: new Date(workspace.updatedAt).toISOString(),
  };
}

export function serializeDeveloperApiKey(
  apiKey: DeveloperApiKeyMetadata,
) {
  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    lastFour: apiKey.lastFour,
    scopes: apiKey.scopes,
    serviceId: apiKey.serviceId,
    createdAt: new Date(apiKey.createdAt).toISOString(),
    lastUsedAt:
      apiKey.lastUsedAt === null
        ? null
        : new Date(apiKey.lastUsedAt).toISOString(),
    expiresAt: new Date(apiKey.expiresAt).toISOString(),
    revokedAt:
      apiKey.revokedAt === null
        ? null
        : new Date(apiKey.revokedAt).toISOString(),
  };
}

export function serializeDeveloperService(
  service: DeveloperServiceRecord,
) {
  return {
    id: service.id,
    product: service.product,
    name: service.name,
    environment: service.environment,
    network: service.network,
    region: service.region,
    status: service.status,
    endpointPath: service.endpointPath,
    configuration: service.configuration,
    telemetry:
      service.telemetry === null
        ? null
        : {
            requests: service.telemetry.requests,
            calls: service.telemetry.calls,
            errors: service.telemetry.errors,
            upstreamFailures: service.telemetry.upstreamFailures,
            averageLatencyMs: service.telemetry.averageLatencyMs,
            windowStartedAt:
              service.telemetry.windowStartedAt === null
                ? null
                : new Date(
                    service.telemetry.windowStartedAt,
                  ).toISOString(),
            updatedAt:
              service.telemetry.updatedAt === null
                ? null
                : new Date(service.telemetry.updatedAt).toISOString(),
          },
    createdAt: new Date(service.createdAt).toISOString(),
    updatedAt: new Date(service.updatedAt).toISOString(),
    archivedAt:
      service.archivedAt === null
        ? null
        : new Date(service.archivedAt).toISOString(),
  };
}

export function apiKeyAuthenticationProblem(): HttpProblem {
  return new HttpProblem(
    401,
    "api_key_invalid",
    "Provide a valid active Nodezuno API key.",
    undefined,
    { "WWW-Authenticate": 'Bearer realm="Nodezuno platform"' },
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  fields: Record<string, string>,
): T | null {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fields[field] = `Choose a supported ${field}.`;
    return null;
  }
  return value as T;
}

function cleanName(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  fields: Record<string, string>,
): string {
  if (typeof value !== "string") {
    fields[field] = "This field is required.";
    return "";
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < minimum) {
    fields[field] = `Use at least ${minimum} characters.`;
  } else if (normalized.length > maximum) {
    fields[field] = `Use no more than ${maximum} characters.`;
  } else if (CONTROL_CHARACTERS.test(normalized)) {
    fields[field] = "Remove unsupported control characters.";
  }
  return normalized;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}
