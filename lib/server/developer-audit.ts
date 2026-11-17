import { HttpProblem } from "./http.ts";
import { isDeveloperResourceId } from "./developer-platform.ts";

export type DeveloperAuditCursor = {
  createdAt: number;
  id: string;
};

export type DeveloperAuditEventRecord = {
  id: string;
  actorAccountId: string | null;
  actorEmail: string | null;
  apiKeyId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  detail: Record<string, unknown>;
  createdAt: number;
};

export type DeveloperAuditPage = {
  events: DeveloperAuditEventRecord[];
  nextCursor: string | null;
};

const detailFieldsByAction: Record<string, readonly string[]> = {
  "workspace.created": ["role"],
  "workspace_member.invited": ["role", "state"],
  "workspace_member.role_updated": ["previousRole", "role"],
  "workspace_member.removed": ["previousRole", "previousState"],
  "api_key.created": [
    "prefix",
    "lastFour",
    "scopes",
    "serviceId",
    "expiresAt",
  ],
  "api_key.revoked": [],
  "api_key.rotated": [
    "sourceKeyId",
    "prefix",
    "lastFour",
    "scopes",
    "serviceId",
    "expiresAt",
  ],
  "service.created": [
    "product",
    "environment",
    "network",
    "region",
    "status",
  ],
  "service.updated": ["field"],
  "service.archived": [],
  "rpc_access_policy.updated": [
    "revision",
    "allowedOriginsCount",
    "allowedIpCidrsCount",
    "allowedMethodsCount",
  ],
};

export function parseDeveloperAuditLimit(value: string | null): number {
  if (value === null || value === "") return 25;
  if (!/^[1-9][0-9]{0,2}$/.test(value)) {
    throw invalidDeveloperAuditLimitProblem();
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw invalidDeveloperAuditLimitProblem();
  }
  return limit;
}

export function encodeDeveloperAuditCursor(
  cursor: DeveloperAuditCursor,
): string {
  if (
    !Number.isSafeInteger(cursor.createdAt) ||
    cursor.createdAt < 0 ||
    !isDeveloperResourceId(cursor.id)
  ) {
    throw invalidDeveloperAuditCursorProblem();
  }
  return encodeBase64Url(`${cursor.createdAt}.${cursor.id}`);
}

export function parseDeveloperAuditCursor(
  value: string | null,
): DeveloperAuditCursor | null {
  if (value === null || value === "") return null;
  if (value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalidDeveloperAuditCursorProblem();
  }
  let decoded: string;
  try {
    decoded = decodeBase64Url(value);
  } catch {
    throw invalidDeveloperAuditCursorProblem();
  }
  const separator = decoded.indexOf(".");
  if (separator < 1 || decoded.indexOf(".", separator + 1) !== -1) {
    throw invalidDeveloperAuditCursorProblem();
  }
  const createdAtValue = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (!/^[0-9]{1,16}$/.test(createdAtValue)) {
    throw invalidDeveloperAuditCursorProblem();
  }
  const createdAt = Number(createdAtValue);
  if (
    !Number.isSafeInteger(createdAt) ||
    createdAt < 0 ||
    !isDeveloperResourceId(id)
  ) {
    throw invalidDeveloperAuditCursorProblem();
  }
  return { createdAt, id };
}

export function sanitizeDeveloperAuditDetail(
  action: string,
  detailJson: string,
): Record<string, unknown> {
  if (detailJson.length > 4096) {
    throw developerAuditUnavailableProblem();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(detailJson) as unknown;
  } catch {
    throw developerAuditUnavailableProblem();
  }
  if (!isPlainRecord(parsed)) {
    throw developerAuditUnavailableProblem();
  }
  const allowedFields = detailFieldsByAction[action];
  if (!allowedFields) return {};
  const detail: Record<string, unknown> = {};
  for (const field of allowedFields) {
    const value = parsed[field];
    if (value !== undefined && safeDeveloperAuditValue(value)) {
      detail[field] = value;
    }
  }
  return detail;
}

export function serializeDeveloperAuditEvent(
  event: DeveloperAuditEventRecord,
) {
  return {
    id: event.id,
    actor: {
      accountId: event.actorAccountId,
      email: event.actorEmail,
      apiKeyId: event.apiKeyId,
    },
    action: event.action,
    entity: {
      type: event.entityType,
      id: event.entityId,
    },
    detail: event.detail,
    createdAt: new Date(event.createdAt).toISOString(),
  };
}

export function developerAuditUnavailableProblem(): HttpProblem {
  return new HttpProblem(
    503,
    "developer_audit_unavailable",
    "The workspace audit trail could not be read safely.",
  );
}

function safeDeveloperAuditValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0;
  }
  return (
    Array.isArray(value) &&
    value.length <= 10 &&
    value.every(
      (item) => typeof item === "string" && item.length <= 128,
    )
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

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(value: string): string {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(
    value.replaceAll("-", "+").replaceAll("_", "/") + padding,
  );
  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function invalidDeveloperAuditLimitProblem(): HttpProblem {
  return new HttpProblem(
    400,
    "developer_audit_limit_invalid",
    "Choose an audit page size from 1 through 100.",
    { limit: "Use an integer from 1 through 100." },
  );
}

function invalidDeveloperAuditCursorProblem(): HttpProblem {
  return new HttpProblem(
    400,
    "developer_audit_cursor_invalid",
    "The workspace audit cursor is invalid.",
    { cursor: "Restart from the first audit page." },
  );
}
