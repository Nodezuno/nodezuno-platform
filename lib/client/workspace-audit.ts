export type WorkspaceAuditRole = "owner" | "admin" | "developer";

export type WorkspaceAuditActor = {
  accountId: string | null;
  email: string | null;
  apiKeyId: string | null;
};

export type WorkspaceAuditEntity = {
  type: string;
  id: string;
};

export type WorkspaceAuditFact = {
  label: string;
  value: string;
  kind: "text" | "code" | "timestamp";
};

export type WorkspaceAuditEvent = {
  id: string;
  actor: WorkspaceAuditActor;
  action: string;
  actionLabel: string;
  entity: WorkspaceAuditEntity;
  facts: WorkspaceAuditFact[];
  createdAt: string;
};

export type WorkspaceAuditPage = {
  events: WorkspaceAuditEvent[];
  nextCursor: string | null;
  requestId: string;
};

const auditEndpoint =
  "/api/v1/developer/workspace/audit-events";
const resourceIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const safeIdentifierPattern = /^[A-Za-z0-9._:-]+$/;
const cursorPattern = /^[A-Za-z0-9_-]+$/;
const requestIdPattern = /^[A-Za-z0-9-]{8,80}$/;
const actionPattern = /^[a-z_]+\.[a-z_]+$/;
const entityTypePattern = /^[a-z_]{1,64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const prefixPattern = /^nzu_live_[0-9a-f]{8}$/;
const lastFourPattern = /^[A-Za-z0-9_-]{4}$/;

const knownActions = {
  "workspace.created": {
    label: "Workspace created",
    fields: ["role"],
  },
  "workspace_member.invited": {
    label: "Workspace member invited",
    fields: ["role", "state"],
  },
  "workspace_member.role_updated": {
    label: "Workspace member role updated",
    fields: ["previousRole", "role"],
  },
  "workspace_member.removed": {
    label: "Workspace member removed",
    fields: ["previousRole", "previousState"],
  },
  "api_key.created": {
    label: "API key created",
    fields: [
      "prefix",
      "lastFour",
      "scopes",
      "serviceId",
      "expiresAt",
    ],
  },
  "api_key.revoked": {
    label: "API key revoked",
    fields: [],
  },
  "api_key.rotated": {
    label: "API key rotated",
    fields: [
      "sourceKeyId",
      "prefix",
      "lastFour",
      "scopes",
      "serviceId",
      "expiresAt",
    ],
  },
  "service.created": {
    label: "Service created",
    fields: [
      "product",
      "environment",
      "network",
      "region",
      "status",
    ],
  },
  "service.updated": {
    label: "Service updated",
    fields: ["field"],
  },
  "service.archived": {
    label: "Service archived",
    fields: [],
  },
  "rpc_access_policy.updated": {
    label: "RPC access policy updated",
    fields: [
      "revision",
      "allowedOriginsCount",
      "allowedIpCidrsCount",
      "allowedMethodsCount",
    ],
  },
} as const;

const workspaceRoles = new Set(["owner", "admin", "developer"]);
const workspaceMemberStates = new Set(["active", "pending"]);
const apiKeyScopes = new Set([
  "platform:identity",
  "services:manage",
  "rpc:invoke",
  "grpc:invoke",
]);
const serviceProducts = new Set([
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
]);
const serviceEnvironments = new Set([
  "development",
  "staging",
  "production",
]);
const serviceNetworks = new Set([
  "global",
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "polygon",
  "solana",
  "multi-chain",
  "custom-rollup",
]);
const serviceRegions = new Set([
  "global",
  "us-east",
  "eu-west",
  "ap-south",
]);
const serviceStatuses = new Set([
  "active",
  "configuration_saved",
  "archived",
]);
const serviceUpdateFields = new Set(["name"]);

export function canViewWorkspaceAudit(
  role: WorkspaceAuditRole | null | undefined,
): boolean {
  return role === "owner" || role === "admin";
}

export function workspaceAuditPagePath(
  cursor: string | null,
  limit = 25,
): string {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw contractError();
  }
  if (
    cursor !== null &&
    (cursor.length < 1 ||
      cursor.length > 128 ||
      !cursorPattern.test(cursor))
  ) {
    throw contractError();
  }

  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return `${auditEndpoint}?${query.toString()}`;
}

export function parseWorkspaceAuditEnvelope(
  value: unknown,
): WorkspaceAuditPage {
  const envelope = exactRecord(value, ["data", "requestId"]);
  const requestId = requiredString(
    envelope.requestId,
    requestIdPattern,
    80,
  );
  const data = exactRecord(envelope.data, [
    "events",
    "nextCursor",
  ]);
  if (!Array.isArray(data.events) || data.events.length > 100) {
    throw contractError();
  }

  const events = data.events.map(parseWorkspaceAuditEvent);
  assertDescendingEvents(events);

  const nextCursor =
    data.nextCursor === null
      ? null
      : requiredString(
          data.nextCursor,
          cursorPattern,
          128,
        );
  if (events.length === 0 && nextCursor !== null) {
    throw contractError();
  }

  return { events, nextCursor, requestId };
}

export function appendWorkspaceAuditEvents(
  existing: readonly WorkspaceAuditEvent[],
  incoming: readonly WorkspaceAuditEvent[],
): WorkspaceAuditEvent[] {
  const combined = [...existing, ...incoming];
  assertDescendingEvents(combined);
  return combined;
}

export function workspaceAuditActorPresentation(
  actor: WorkspaceAuditActor,
): { label: string; context: string } {
  if (actor.email) {
    return {
      label: actor.email,
      context: actor.apiKeyId
        ? `Authenticated with API key ${shortIdentifier(actor.apiKeyId)}`
        : "Authenticated workspace user",
    };
  }
  if (actor.accountId) {
    return {
      label: `Account ${shortIdentifier(actor.accountId)}`,
      context: actor.apiKeyId
        ? `Authenticated with API key ${shortIdentifier(actor.apiKeyId)}`
        : "Authenticated workspace account",
    };
  }
  if (actor.apiKeyId) {
    return {
      label: `API key ${shortIdentifier(actor.apiKeyId)}`,
      context: "Workspace API credential",
    };
  }
  return {
    label: "Workspace system",
    context: "No user identity was recorded",
  };
}

export function workspaceAuditEntityLabel(type: string): string {
  const labels: Record<string, string> = {
    workspace: "Workspace",
    workspace_member: "Workspace member",
    api_key: "API key",
    service: "Service",
  };
  return labels[type] ?? "Recorded entity";
}

function parseWorkspaceAuditEvent(value: unknown): WorkspaceAuditEvent {
  const event = exactRecord(value, [
    "id",
    "actor",
    "action",
    "entity",
    "detail",
    "createdAt",
  ]);
  const id = requiredString(event.id, resourceIdPattern, 36);
  const actorRecord = exactRecord(event.actor, [
    "accountId",
    "email",
    "apiKeyId",
  ]);
  const actor: WorkspaceAuditActor = {
    accountId: nullableSafeIdentifier(actorRecord.accountId),
    email: nullableEmail(actorRecord.email),
    apiKeyId: nullableResourceId(actorRecord.apiKeyId),
  };
  const action = requiredString(
    event.action,
    actionPattern,
    128,
  );
  const entityRecord = exactRecord(event.entity, ["type", "id"]);
  const entity: WorkspaceAuditEntity = {
    type: requiredString(
      entityRecord.type,
      entityTypePattern,
      64,
    ),
    id: requiredString(
      entityRecord.id,
      safeIdentifierPattern,
      128,
    ),
  };
  const detail = plainRecord(event.detail);
  const createdAt = exactIsoTimestamp(event.createdAt);
  const actionContract =
    knownActions[action as keyof typeof knownActions];
  const allowedFields = actionContract?.fields ?? [];
  assertOnlyAllowedKeys(detail, allowedFields);

  return {
    id,
    actor,
    action,
    actionLabel:
      actionContract?.label ?? "Workspace activity recorded",
    entity,
    facts: detailFacts(action, detail),
    createdAt,
  };
}

function assertDescendingEvents(
  events: readonly WorkspaceAuditEvent[],
): void {
  const ids = new Set<string>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (ids.has(event.id)) throw contractError();
    ids.add(event.id);

    const previous = events[index - 1];
    if (
      previous &&
      (previous.createdAt < event.createdAt ||
        (previous.createdAt === event.createdAt &&
          previous.id <= event.id))
    ) {
      throw contractError();
    }
  }
}

function detailFacts(
  action: string,
  detail: Record<string, unknown>,
): WorkspaceAuditFact[] {
  switch (action) {
    case "workspace.created":
      return optionalEnumFact(detail, "role", "Initial role", workspaceRoles);
    case "workspace_member.invited":
      return [
        ...optionalEnumFact(detail, "role", "Assigned role", workspaceRoles),
        ...optionalEnumFact(
          detail,
          "state",
          "Membership state",
          workspaceMemberStates,
        ),
      ];
    case "workspace_member.role_updated":
      return [
        ...optionalEnumFact(
          detail,
          "previousRole",
          "Previous role",
          workspaceRoles,
        ),
        ...optionalEnumFact(detail, "role", "New role", workspaceRoles),
      ];
    case "workspace_member.removed":
      return [
        ...optionalEnumFact(
          detail,
          "previousRole",
          "Previous role",
          workspaceRoles,
        ),
        ...optionalEnumFact(
          detail,
          "previousState",
          "Previous state",
          workspaceMemberStates,
        ),
      ];
    case "api_key.created":
      return apiKeyFacts(detail, false);
    case "api_key.revoked":
      return [];
    case "api_key.rotated":
      return apiKeyFacts(detail, true);
    case "service.created":
      return [
        ...optionalEnumFact(
          detail,
          "product",
          "Product",
          serviceProducts,
          "code",
        ),
        ...optionalEnumFact(
          detail,
          "environment",
          "Environment",
          serviceEnvironments,
          "code",
        ),
        ...optionalEnumFact(
          detail,
          "network",
          "Network",
          serviceNetworks,
          "code",
        ),
        ...optionalEnumFact(
          detail,
          "region",
          "Region",
          serviceRegions,
          "code",
        ),
        ...optionalEnumFact(
          detail,
          "status",
          "Initial status",
          serviceStatuses,
          "code",
        ),
      ];
    case "service.archived":
      return [];
    case "service.updated":
      return optionalEnumFact(
        detail,
        "field",
        "Changed field",
        serviceUpdateFields,
        "code",
      );
    case "rpc_access_policy.updated":
      return [
        ...optionalCountFact(detail, "revision", "Policy revision"),
        ...optionalCountFact(
          detail,
          "allowedOriginsCount",
          "Allowed origins",
        ),
        ...optionalCountFact(
          detail,
          "allowedIpCidrsCount",
          "Allowed IP ranges",
        ),
        ...optionalCountFact(
          detail,
          "allowedMethodsCount",
          "Allowed methods",
        ),
      ];
    default:
      return [];
  }
}

function apiKeyFacts(
  detail: Record<string, unknown>,
  rotated: boolean,
): WorkspaceAuditFact[] {
  const facts: WorkspaceAuditFact[] = [];
  if (rotated && detail.sourceKeyId !== undefined) {
    facts.push({
      label: "Source key",
      value: requiredString(
        detail.sourceKeyId,
        resourceIdPattern,
        36,
      ),
      kind: "code",
    });
  }

  const prefix =
    detail.prefix === undefined
      ? null
      : requiredString(detail.prefix, prefixPattern, 17);
  const lastFour =
    detail.lastFour === undefined
      ? null
      : requiredString(detail.lastFour, lastFourPattern, 4);
  if (prefix || lastFour) {
    facts.push({
      label: rotated ? "Replacement key" : "Key fingerprint",
      value:
        prefix && lastFour
          ? `${prefix}••••${lastFour}`
          : (prefix ?? `••••${lastFour}`),
      kind: "code",
    });
  }

  if (detail.scopes !== undefined) {
    facts.push({
      label: "Scopes",
      value: stringEnumArray(detail.scopes, apiKeyScopes).join(", "),
      kind: "code",
    });
  }
  if (detail.serviceId !== undefined) {
    facts.push({
      label: "Service binding",
      value:
        detail.serviceId === null
          ? "Platform identity only"
          : requiredString(
              detail.serviceId,
              resourceIdPattern,
              36,
            ),
      kind: detail.serviceId === null ? "text" : "code",
    });
  }
  if (detail.expiresAt !== undefined) {
    facts.push({
      label: "Expires",
      value: timestampFromMilliseconds(detail.expiresAt),
      kind: "timestamp",
    });
  }
  return facts;
}

function optionalEnumFact(
  detail: Record<string, unknown>,
  field: string,
  label: string,
  allowed: ReadonlySet<string>,
  kind: WorkspaceAuditFact["kind"] = "text",
): WorkspaceAuditFact[] {
  if (detail[field] === undefined) return [];
  return [
    {
      label,
      value: enumString(detail[field], allowed),
      kind,
    },
  ];
}

function optionalCountFact(
  detail: Record<string, unknown>,
  field: string,
  label: string,
): WorkspaceAuditFact[] {
  if (detail[field] === undefined) return [];
  const value = detail[field];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw contractError();
  }
  return [{ label, value: String(value), kind: "text" }];
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const record = plainRecord(value);
  const actualKeys = Object.keys(record);
  if (
    actualKeys.length !== keys.length ||
    keys.some((key) => !Object.hasOwn(record, key))
  ) {
    throw contractError();
  }
  return record;
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw contractError();
  }
  return value as Record<string, unknown>;
}

function assertOnlyAllowedKeys(
  value: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const allowed = new Set(allowedFields);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw contractError();
  }
}

function requiredString(
  value: unknown,
  pattern: RegExp,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
    !pattern.test(value)
  ) {
    throw contractError();
  }
  return value;
}

function nullableSafeIdentifier(value: unknown): string | null {
  if (value === null) return null;
  return requiredString(value, safeIdentifierPattern, 128);
}

function nullableResourceId(value: unknown): string | null {
  if (value === null) return null;
  return requiredString(value, resourceIdPattern, 36);
}

function nullableEmail(value: unknown): string | null {
  if (value === null) return null;
  return requiredString(value, emailPattern, 254);
}

function exactIsoTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 32) {
    throw contractError();
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw contractError();
  }
  return value;
}

function timestampFromMilliseconds(value: unknown): string {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw contractError();
  }
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) throw contractError();
  return timestamp.toISOString();
}

function enumString(
  value: unknown,
  allowed: ReadonlySet<string>,
): string {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw contractError();
  }
  return value;
}

function stringEnumArray(
  value: unknown,
  allowed: ReadonlySet<string>,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 10 ||
    value.some(
      (item) =>
        typeof item !== "string" ||
        item.length > 128 ||
        !allowed.has(item),
    ) ||
    new Set(value).size !== value.length
  ) {
    throw contractError();
  }
  return [...value];
}

function shortIdentifier(value: string): string {
  return value.length <= 12 ? value : `…${value.slice(-12)}`;
}

function contractError(): Error {
  return new Error(
    "The workspace audit response did not match its safe contract.",
  );
}
