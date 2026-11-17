import {
  RPC_GUARDRAIL_MAX_HOURLY_QUOTA,
  RPC_GUARDRAIL_MAX_WARNING_PERCENT,
  RPC_GUARDRAIL_MIN_HOURLY_QUOTA,
  RPC_GUARDRAIL_MIN_WARNING_PERCENT,
} from "../server/rpc-guardrail.ts";
import type { SelfServiceRpcNetwork } from "./rpc-networks";

export type RpcGuardrailProduct = "rpc-api" | "grpc-api";

export type RpcGuardrailSnapshot = {
  serviceId: string;
  product: RpcGuardrailProduct;
  network: SelfServiceRpcNetwork;
  hourlyQuotaLimit: number | null;
  effectiveHourlyQuotaLimit: number;
  platformWorkspaceHourlyQuotaLimit: number;
  warningThresholdPercent: number;
  revision: number;
  inherited: boolean;
  updatedAt: string | null;
};

export function rpcGuardrailUpdatePayload(options: {
  hourlyQuotaLimit: number | null;
  warningThresholdPercent: number;
  revision: number;
}) {
  assertSafeInteger(
    options.hourlyQuotaLimit,
    RPC_GUARDRAIL_MIN_HOURLY_QUOTA,
    RPC_GUARDRAIL_MAX_HOURLY_QUOTA,
    true,
  );
  assertSafeInteger(
    options.warningThresholdPercent,
    RPC_GUARDRAIL_MIN_WARNING_PERCENT,
    RPC_GUARDRAIL_MAX_WARNING_PERCENT,
  );
  assertSafeInteger(options.revision, 0, Number.MAX_SAFE_INTEGER);
  return {
    hourlyQuotaLimit: options.hourlyQuotaLimit,
    warningThresholdPercent: options.warningThresholdPercent,
    revision: options.revision,
  };
}

export function parseRpcGuardrailEnvelope(
  payload: unknown,
  expected: {
    serviceId: string;
    product: RpcGuardrailProduct;
    network: SelfServiceRpcNetwork;
  },
): RpcGuardrailSnapshot {
  const envelope = plainRecord(payload, "guardrail response");
  exactKeys(envelope, ["data", "requestId"], "guardrail response");
  if (typeof envelope.requestId !== "string" || !envelope.requestId) {
    throw new Error("The guardrail response did not include a request ID.");
  }
  const data = plainRecord(envelope.data, "guardrail snapshot");
  exactKeys(
    data,
    [
      "serviceId",
      "product",
      "network",
      "hourlyQuotaLimit",
      "effectiveHourlyQuotaLimit",
      "platformWorkspaceHourlyQuotaLimit",
      "warningThresholdPercent",
      "revision",
      "inherited",
      "updatedAt",
    ],
    "guardrail snapshot",
  );
  if (
    data.serviceId !== expected.serviceId ||
    data.product !== expected.product ||
    data.network !== expected.network
  ) {
    throw new Error(
      "The guardrail response did not match the selected service.",
    );
  }
  assertSafeInteger(
    data.hourlyQuotaLimit,
    RPC_GUARDRAIL_MIN_HOURLY_QUOTA,
    RPC_GUARDRAIL_MAX_HOURLY_QUOTA,
    true,
  );
  assertSafeInteger(
    data.effectiveHourlyQuotaLimit,
    RPC_GUARDRAIL_MIN_HOURLY_QUOTA,
    RPC_GUARDRAIL_MAX_HOURLY_QUOTA,
  );
  assertSafeInteger(
    data.platformWorkspaceHourlyQuotaLimit,
    RPC_GUARDRAIL_MIN_HOURLY_QUOTA,
    RPC_GUARDRAIL_MAX_HOURLY_QUOTA,
  );
  assertSafeInteger(
    data.warningThresholdPercent,
    RPC_GUARDRAIL_MIN_WARNING_PERCENT,
    RPC_GUARDRAIL_MAX_WARNING_PERCENT,
  );
  assertSafeInteger(data.revision, 0, Number.MAX_SAFE_INTEGER);
  if (
    typeof data.inherited !== "boolean" ||
    data.inherited !== (data.hourlyQuotaLimit === null) ||
    (data.updatedAt !== null &&
      (typeof data.updatedAt !== "string" ||
        Number.isNaN(Date.parse(data.updatedAt)))) ||
    (data.hourlyQuotaLimit !== null &&
      (data.effectiveHourlyQuotaLimit as number) >
        (data.hourlyQuotaLimit as number)) ||
    (data.effectiveHourlyQuotaLimit as number) >
      (data.platformWorkspaceHourlyQuotaLimit as number)
  ) {
    throw new Error("The guardrail snapshot was internally inconsistent.");
  }
  return data as RpcGuardrailSnapshot;
}

function assertSafeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  nullable = false,
): asserts value is number | null {
  if (
    (nullable && value === null) ||
    (Number.isSafeInteger(value) &&
      (value as number) >= minimum &&
      (value as number) <= maximum)
  ) {
    return;
  }
  throw new Error("The guardrail response contained an invalid number.");
}

function plainRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`The ${label} was not a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`The ${label} contained unsupported fields.`);
  }
}
