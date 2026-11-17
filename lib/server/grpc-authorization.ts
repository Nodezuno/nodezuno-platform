import {
  authenticateDeveloperApiKey,
  consumeRpcQuota,
  findEthereumGrpcServiceForApiKey,
  findRpcServiceGuardrailForAdmission,
} from "./database.ts";
import { developerApiKeyHash } from "./crypto.ts";
import { loadEthereumRpcRuntimeConfiguration } from "./ethereum-rpc.ts";
import {
  constantTimeStringEqual,
  isDeveloperResourceId,
  parseDeveloperApiKey,
} from "./developer-platform.ts";
import { HttpProblem } from "./http.ts";
import {
  effectiveRpcServiceHourlyQuota,
} from "./rpc-guardrail.ts";
import { normalizeGrpcControlPlaneSecret } from "./grpc.ts";
import {
  allValuesAreDistinct,
  normalizedRuntimeSecret,
  runtimeEnvironmentValue,
} from "./runtime-config.ts";

export const GRPC_AUTHORIZATION_BODY_LIMIT = 768;
export const GRPC_AUTHORIZATION_TIMEOUT_MS = 1_800;
export const GRPC_AUTHORIZATION_MAX_QUOTA_UNITS = 10;

export type GrpcAuthorizationInput = {
  serviceId: string;
  apiKey: string;
  quotaUnits: number;
};

export async function requireGrpcControlPlaneSecret(
  request: Request,
): Promise<string> {
  const [
    rawSecret,
    rateLimitSecret,
    apiKeyPepper,
    betterAuthSecret,
    originSecret,
  ] = await Promise.all([
    runtimeEnvironmentValue("NODEZUNO_GRPC_AUTH_SECRET"),
    runtimeEnvironmentValue("RATE_LIMIT_SECRET"),
    runtimeEnvironmentValue("API_KEY_PEPPER"),
    runtimeEnvironmentValue("BETTER_AUTH_SECRET"),
    runtimeEnvironmentValue("NODEZUNO_ORIGIN_SECRET"),
  ]);
  const expected = normalizeGrpcControlPlaneSecret(rawSecret);
  const otherSecrets = [
    normalizedRuntimeSecret(rateLimitSecret),
    normalizedRuntimeSecret(apiKeyPepper),
    normalizedRuntimeSecret(betterAuthSecret),
    normalizedRuntimeSecret(originSecret),
  ].filter((value): value is string => value !== null);
  if (
    !expected ||
    !allValuesAreDistinct([expected, ...otherSecrets])
  ) {
    throw new HttpProblem(
      503,
      "grpc_authorization_unavailable",
      "Native gRPC authorization is temporarily unavailable.",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.length > 320) throw internalAuthenticationProblem();
  const presented =
    /^Bearer ([A-Za-z0-9._~-]{32,256})$/.exec(authorization)?.[1] ??
    "";
  if (!constantTimeStringEqual(presented, expected)) {
    throw internalAuthenticationProblem();
  }
  return expected;
}

export function validateGrpcAuthorizationPayload(
  payload: unknown,
): GrpcAuthorizationInput | null {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype
  ) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 ||
    !Object.hasOwn(record, "serviceId") ||
    !Object.hasOwn(record, "apiKey") ||
    !Object.hasOwn(record, "quotaUnits") ||
    typeof record.serviceId !== "string" ||
    typeof record.apiKey !== "string" ||
    typeof record.quotaUnits !== "number" ||
    !Number.isSafeInteger(record.quotaUnits) ||
    record.quotaUnits < 1 ||
    record.quotaUnits >
      GRPC_AUTHORIZATION_MAX_QUOTA_UNITS ||
    !isDeveloperResourceId(record.serviceId) ||
    record.apiKey.length > 128
  ) {
    return null;
  }
  return {
    serviceId: record.serviceId,
    apiKey: record.apiKey,
    quotaUnits: record.quotaUnits,
  };
}

export async function authorizeGrpcDeveloperApiKey(options: {
  input: GrpcAuthorizationInput;
  database: D1Database;
  now?: number;
}): Promise<boolean> {
  const presented = parseDeveloperApiKey(options.input.apiKey);
  if (!presented) return false;
  const secretHash = await developerApiKeyHash(presented.secret);
  const identity = await authenticateDeveloperApiKey({
    id: presented.id,
    secretHash,
    now: options.now,
    database: options.database,
  });
  if (
    !identity ||
    !identity.apiKey.scopes.includes("grpc:invoke") ||
    identity.apiKey.serviceId !== options.input.serviceId
  ) {
    return false;
  }
  const service = await findEthereumGrpcServiceForApiKey({
    serviceId: options.input.serviceId,
    workspaceId: identity.workspace.id,
    database: options.database,
  });
  if (!service) return false;

  const runtime = await loadEthereumRpcRuntimeConfiguration();
  const guardrail = await findRpcServiceGuardrailForAdmission({
    serviceId: service.id,
    workspaceId: identity.workspace.id,
    database: options.database,
  });
  const serviceLimit = effectiveRpcServiceHourlyQuota({
    guardrail,
    platformWorkspaceHourlyQuotaLimit:
      runtime.workspaceHourlyCallQuota,
  });
  await consumeRpcQuota({
    workspaceId: identity.workspace.id,
    serviceId: service.id,
    apiKeyId: identity.apiKey.id,
    callCount: 1,
    quotaUnits: options.input.quotaUnits,
    limit: runtime.hourlyCallQuota,
    workspaceLimit: runtime.workspaceHourlyCallQuota,
    serviceLimit,
    network: "ethereum",
    now: options.now,
    database: options.database,
  });
  return true;
}

function internalAuthenticationProblem(): HttpProblem {
  return new HttpProblem(
    401,
    "grpc_control_plane_unauthorized",
    "Valid control-plane authentication is required.",
    undefined,
    { "WWW-Authenticate": 'Bearer realm="nodezuno-grpc-control-plane"' },
  );
}
