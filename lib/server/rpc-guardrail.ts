export const RPC_GUARDRAIL_MIN_HOURLY_QUOTA = 100;
export const RPC_GUARDRAIL_MAX_HOURLY_QUOTA = 10_000_000;
export const RPC_GUARDRAIL_DEFAULT_WARNING_PERCENT = 80;
export const RPC_GUARDRAIL_MIN_WARNING_PERCENT = 50;
export const RPC_GUARDRAIL_MAX_WARNING_PERCENT = 95;

export type RpcServiceGuardrailRecord = {
  serviceId: string;
  workspaceId: string;
  hourlyQuotaLimit: number | null;
  warningThresholdPercent: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type RpcServiceGuardrailInput = {
  hourlyQuotaLimit: number | null;
  warningThresholdPercent: number;
  revision: number;
};

export type RpcServiceGuardrailValidation =
  | { ok: true; value: RpcServiceGuardrailInput }
  | { ok: false; fields: Record<string, string> };

export function validateRpcServiceGuardrailUpdate(
  payload: unknown,
): RpcServiceGuardrailValidation {
  if (!isPlainRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  const allowedFields = new Set([
    "hourlyQuotaLimit",
    "warningThresholdPercent",
    "revision",
  ]);
  if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }

  const fields: Record<string, string> = {};
  const hourlyQuotaLimit =
    payload.hourlyQuotaLimit === null
      ? null
      : boundedInteger(
          payload.hourlyQuotaLimit,
          RPC_GUARDRAIL_MIN_HOURLY_QUOTA,
          RPC_GUARDRAIL_MAX_HOURLY_QUOTA,
        );
  if (
    payload.hourlyQuotaLimit !== null &&
    hourlyQuotaLimit === null
  ) {
    fields.hourlyQuotaLimit =
      `Use null to inherit the workspace limit or an integer from ` +
      `${RPC_GUARDRAIL_MIN_HOURLY_QUOTA} through ` +
      `${RPC_GUARDRAIL_MAX_HOURLY_QUOTA}.`;
  }
  const warningThresholdPercent = boundedInteger(
    payload.warningThresholdPercent,
    RPC_GUARDRAIL_MIN_WARNING_PERCENT,
    RPC_GUARDRAIL_MAX_WARNING_PERCENT,
  );
  if (warningThresholdPercent === null) {
    fields.warningThresholdPercent =
      `Use an integer from ${RPC_GUARDRAIL_MIN_WARNING_PERCENT} through ` +
      `${RPC_GUARDRAIL_MAX_WARNING_PERCENT}.`;
  }
  const revision = boundedInteger(
    payload.revision,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (revision === null) {
    fields.revision = "Use the nonnegative revision returned by the API.";
  }
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      hourlyQuotaLimit,
      warningThresholdPercent: warningThresholdPercent!,
      revision: revision!,
    },
  };
}

export function effectiveRpcServiceHourlyQuota(options: {
  guardrail: RpcServiceGuardrailRecord | null;
  platformWorkspaceHourlyQuotaLimit: number;
}): number {
  const platformLimit = options.platformWorkspaceHourlyQuotaLimit;
  if (
    !Number.isSafeInteger(platformLimit) ||
    platformLimit < RPC_GUARDRAIL_MIN_HOURLY_QUOTA ||
    platformLimit > RPC_GUARDRAIL_MAX_HOURLY_QUOTA
  ) {
    throw new TypeError(
      "The platform workspace hourly quota is outside the guardrail range.",
    );
  }
  return Math.min(
    options.guardrail?.hourlyQuotaLimit ?? platformLimit,
    platformLimit,
  );
}

export function serializeRpcServiceGuardrail(options: {
  guardrail: RpcServiceGuardrailRecord | null;
  platformWorkspaceHourlyQuotaLimit: number;
}) {
  return {
    hourlyQuotaLimit: options.guardrail?.hourlyQuotaLimit ?? null,
    effectiveHourlyQuotaLimit: effectiveRpcServiceHourlyQuota(options),
    platformWorkspaceHourlyQuotaLimit:
      options.platformWorkspaceHourlyQuotaLimit,
    warningThresholdPercent:
      options.guardrail?.warningThresholdPercent ??
      RPC_GUARDRAIL_DEFAULT_WARNING_PERCENT,
    revision: options.guardrail?.revision ?? 0,
    inherited:
      options.guardrail === null ||
      options.guardrail.hourlyQuotaLimit === null,
    updatedAt:
      options.guardrail === null
        ? null
        : new Date(options.guardrail.updatedAt).toISOString(),
  };
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  )
    ? (value as number)
    : null;
}

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
