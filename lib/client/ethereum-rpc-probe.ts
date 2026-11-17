export type EthereumMainnetVerification =
  | {
      ok: true;
      chainId: "1";
      chainLabel: "Ethereum mainnet";
    }
  | {
      ok: false;
      message: string;
    };

export type EthereumRpcQuotaSnapshot = {
  limit: number;
  remaining: number;
  resetAt: string | null;
  serviceLimit: number | null;
  serviceRemaining: number | null;
  serviceWarning: boolean | null;
  serviceWarningThresholdPercent: number | null;
  workspaceLimit: number | null;
  workspaceRemaining: number | null;
};

export function ethereumRpcApiKeyAllowsService(
  apiKey: { serviceId: string | null },
  serviceId: string,
): boolean {
  return apiKey.serviceId === null || apiKey.serviceId === serviceId;
}

function nonNegativeIntegerHeader(
  headers: Headers,
  name: string,
): number | null {
  const value = headers.get(name);
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function readEthereumRpcQuota(
  headers: Headers,
): EthereumRpcQuotaSnapshot | null {
  const limit = nonNegativeIntegerHeader(headers, "X-RateLimit-Limit");
  const remaining = nonNegativeIntegerHeader(
    headers,
    "X-RateLimit-Remaining",
  );
  if (limit === null || limit < 1 || remaining === null) return null;

  const resetSeconds = nonNegativeIntegerHeader(
    headers,
    "X-RateLimit-Reset",
  );
  const resetDate =
    resetSeconds === null ? null : new Date(resetSeconds * 1_000);
  const resetAt =
    resetDate && !Number.isNaN(resetDate.getTime())
      ? resetDate.toISOString()
      : null;
  const workspaceLimit = nonNegativeIntegerHeader(
    headers,
    "X-Nodezuno-Workspace-RateLimit-Limit",
  );
  const workspaceRemaining = nonNegativeIntegerHeader(
    headers,
    "X-Nodezuno-Workspace-RateLimit-Remaining",
  );
  const hasWorkspaceQuota =
    workspaceLimit !== null &&
    workspaceLimit > 0 &&
    workspaceRemaining !== null;
  const serviceLimit = nonNegativeIntegerHeader(
    headers,
    "X-Nodezuno-Service-RateLimit-Limit",
  );
  const serviceRemaining = nonNegativeIntegerHeader(
    headers,
    "X-Nodezuno-Service-RateLimit-Remaining",
  );
  const hasServiceQuota =
    serviceLimit !== null &&
    serviceLimit > 0 &&
    serviceRemaining !== null;
  const boundedServiceRemaining = hasServiceQuota
    ? Math.min(serviceRemaining, serviceLimit)
    : null;
  const serviceWarningThresholdPercent = nonNegativeIntegerHeader(
    headers,
    "X-Nodezuno-Service-Quota-Warning-Threshold",
  );
  const rawServiceWarning = headers.get(
    "X-Nodezuno-Service-Quota-Warning",
  );
  const serviceWarning =
    rawServiceWarning === "true"
      ? true
      : rawServiceWarning === "false"
        ? false
        : null;
  const hasConsistentServiceWarning =
    serviceLimit !== null &&
    boundedServiceRemaining !== null &&
    serviceWarningThresholdPercent !== null &&
    serviceWarningThresholdPercent >= 50 &&
    serviceWarningThresholdPercent <= 95 &&
    serviceWarning !== null &&
    serviceWarning ===
      ((serviceLimit - boundedServiceRemaining) * 100 >=
        serviceLimit * serviceWarningThresholdPercent);

  return {
    limit,
    remaining: Math.min(remaining, limit),
    resetAt,
    serviceLimit: hasServiceQuota ? serviceLimit : null,
    serviceRemaining: boundedServiceRemaining,
    serviceWarning: hasConsistentServiceWarning
      ? serviceWarning
      : null,
    serviceWarningThresholdPercent: hasConsistentServiceWarning
      ? serviceWarningThresholdPercent
      : null,
    workspaceLimit: hasWorkspaceQuota ? workspaceLimit : null,
    workspaceRemaining: hasWorkspaceQuota
      ? Math.min(workspaceRemaining, workspaceLimit)
      : null,
  };
}

function retryAfterSeconds(
  value: string | null,
  nowMs: number,
): number | null {
  if (!value) return null;
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    return Number.isSafeInteger(seconds) && seconds >= 0
      ? Math.min(seconds, 86_400)
      : null;
  }

  const retryAt = Date.parse(normalized);
  if (!Number.isFinite(retryAt)) return null;
  return Math.min(
    Math.max(0, Math.ceil((retryAt - nowMs) / 1_000)),
    86_400,
  );
}

export function ethereumRpcProbeHttpMessage(
  status: number,
  retryAfter: string | null,
  nowMs = Date.now(),
): string {
  if (status === 401) {
    return "The one-time key was rejected. Create a new key and try again.";
  }
  if (status === 403) {
    return "This key cannot invoke RPC. Create a key with rpc:invoke and try again.";
  }
  if (status === 429) {
    const delay = retryAfterSeconds(retryAfter, nowMs);
    return delay === null
      ? "The RPC limit was reached. Retry shortly."
      : `The RPC limit was reached. Retry in ${delay} second${
          delay === 1 ? "" : "s"
        }.`;
  }
  if (status === 502) {
    return "The gateway could not complete the upstream request. Retry shortly.";
  }
  if (status === 503) {
    return "The Ethereum gateway is temporarily unavailable. Retry shortly.";
  }
  if (status === 504) {
    return "The Ethereum upstream timed out. Retry shortly.";
  }
  return `The RPC test failed with HTTP ${status}. Retry or use the copyable curl request.`;
}

export function verifyEthereumMainnetChainId(
  payload: unknown,
): EthereumMainnetVerification {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      message:
        "The gateway replied, but the response did not verify Ethereum mainnet.",
    };
  }

  const response = payload as Record<string, unknown>;
  const result = response.result;
  if (
    response.jsonrpc !== "2.0" ||
    response.id !== 1 ||
    response.error != null ||
    typeof result !== "string" ||
    !/^0x[0-9a-f]+$/i.test(result)
  ) {
    return {
      ok: false,
      message:
        "The gateway replied, but the response did not verify Ethereum mainnet.",
    };
  }

  try {
    if (BigInt(result) !== 1n) {
      return {
        ok: false,
        message:
          "The endpoint answered, but its chain ID was not Ethereum mainnet.",
      };
    }
  } catch {
    return {
      ok: false,
      message:
        "The gateway replied, but the response did not verify Ethereum mainnet.",
    };
  }

  return {
    ok: true,
    chainId: "1",
    chainLabel: "Ethereum mainnet",
  };
}
