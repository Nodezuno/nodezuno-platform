import { HttpProblem } from "./http.ts";
import { sha256Hex } from "./crypto.ts";
import {
  isContainerRuntime,
  runtimeEnvironmentValue,
} from "./runtime-config.ts";

export const ETHEREUM_RPC_MAX_REQUEST_BYTES = 256 * 1024;
export const ETHEREUM_RPC_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const ETHEREUM_RPC_MAX_BATCH_SIZE = 20;
export const ETHEREUM_RPC_DEFAULT_TIMEOUT_MS = 8_000;
export const ETHEREUM_RPC_DEFAULT_HOURLY_CALL_QUOTA = 1_000;
export const ETHEREUM_RPC_DEFAULT_WORKSPACE_HOURLY_CALL_QUOTA = 10_000;
export const ETHEREUM_RPC_MAX_LOG_BLOCK_RANGE = 2_000;
export const ETHEREUM_RPC_MAX_CALL_DATA_BYTES = 64 * 1024;
export const ETHEREUM_RPC_MAX_FEE_HISTORY_BLOCKS = 1_024;
export const ETHEREUM_RPC_MAX_PROOF_STORAGE_KEYS = 64;
export const SOLANA_MAINNET_GENESIS_HASH =
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

export const rpcNetworks = ["ethereum", "base", "solana"] as const;
export type RpcNetwork = (typeof rpcNetworks)[number];

const MAX_UPSTREAM_CONFIGURATION_BYTES = 32 * 1024;
const MAX_UPSTREAMS = 4;
const MAX_UPSTREAM_HEADERS = 12;
const MIN_UPSTREAM_TIMEOUT_MS = 1_000;
const MAX_UPSTREAM_TIMEOUT_MS = 15_000;
const MIN_HOURLY_CALL_QUOTA = 100;
const MAX_HOURLY_CALL_QUOTA = 1_000_000;
const MIN_WORKSPACE_HOURLY_CALL_QUOTA = 1_000;
const MAX_WORKSPACE_HOURLY_CALL_QUOTA = 10_000_000;
const MAINNET_PROBE_TIMEOUT_MS = 5_000;
const MAINNET_PROBE_MAX_RESPONSE_BYTES = 16 * 1024;
const MAINNET_PROBE_SUCCESS_CACHE_MS = 60 * 1000;
const MAINNET_PROBE_FAILURE_CACHE_MS = 10 * 1000;
const PULSE_CIRCUIT_FAILURE_THRESHOLD = 2;
const PULSE_CIRCUIT_BASE_COOLDOWN_MS = 15 * 1000;
const PULSE_CIRCUIT_MAX_COOLDOWN_MS = 2 * 60 * 1000;
const PULSE_ROUTING_STATE_TTL_MS = 60 * 60 * 1000;
const PULSE_ROUTING_STATE_LIMIT = 64;
const PULSE_LATENCY_EWMA_ALPHA = 0.25;
const PULSE_FAILURE_SCORE_PENALTY_MS = 1_000;
const METHOD_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const UPSTREAM_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HEADER_VALUE_PATTERN = /^[\u0020-\u007e]*$/;
const RAW_UPSTREAM_URL_UNSAFE_CHARACTERS =
  /[\u0000-\u0020\u007f\\]/;
const JSON_CONTENT_TYPE_PATTERN =
  /^application\/(?:json|json-rpc|[a-z0-9!#$&^_.+-]+\+json)$/i;
const REDACTED_UPSTREAM_VALUE = "[redacted]";
const ETHEREUM_HTTP_LOOPBACK_FLAG =
  "NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK";
// Workerd does not implement redirect "error". Manual mode plus the explicit
// 3xx checks below prevents provider credentials from reaching a redirect.
const UPSTREAM_REDIRECT_MODE = "manual";
const BLOCKED_UPSTREAM_HOSTNAME_SUFFIXES = [
  "arpa",
  "example",
  "home",
  "internal",
  "invalid",
  "lan",
  "local",
  "localdomain",
  "localhost",
  "onion",
  "test",
] as const;

const BLOCKED_NAMESPACE_PREFIXES = [
  "admin_",
  "anvil_",
  "debug_",
  "engine_",
  "evm_",
  "hardhat_",
  "miner_",
  "parity_",
  "personal_",
  "trace_",
  "txpool_",
  "wallet_",
] as const;

const BLOCKED_ETHEREUM_METHODS = new Set([
  "eth_accounts",
  "eth_coinbase",
  "eth_getFilterChanges",
  "eth_getFilterLogs",
  "eth_newBlockFilter",
  "eth_newFilter",
  "eth_newPendingTransactionFilter",
  "eth_sendTransaction",
  "eth_sign",
  "eth_signTransaction",
  "eth_signTypedData",
  "eth_signTypedData_v1",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "eth_submitHashrate",
  "eth_submitWork",
  "eth_subscribe",
  "eth_uninstallFilter",
  "eth_unsubscribe",
]);

const SAFE_RETRY_ETHEREUM_METHODS = new Set([
  "eth_blobBaseFee",
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockReceipts",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getProof",
  "eth_getStorageAt",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getUncleByBlockHashAndIndex",
  "eth_getUncleByBlockNumberAndIndex",
  "eth_getUncleCountByBlockHash",
  "eth_getUncleCountByBlockNumber",
  "eth_hashrate",
  "eth_maxPriorityFeePerGas",
  "eth_mining",
  "eth_protocolVersion",
  "eth_syncing",
  "net_listening",
  "net_peerCount",
  "net_version",
  "web3_clientVersion",
  "web3_sha3",
]);

const SAFE_RETRY_SOLANA_METHODS = new Set([
  "getAccountInfo",
  "getBalance",
  "getBlock",
  "getBlockCommitment",
  "getBlockHeight",
  "getBlockProduction",
  "getBlockTime",
  "getBlocks",
  "getBlocksWithLimit",
  "getEpochInfo",
  "getEpochSchedule",
  "getFeeForMessage",
  "getFirstAvailableBlock",
  "getGenesisHash",
  "getHealth",
  "getHighestSnapshotSlot",
  "getInflationGovernor",
  "getInflationRate",
  "getInflationReward",
  "getLargestAccounts",
  "getLatestBlockhash",
  "getLeaderSchedule",
  "getMaxRetransmitSlot",
  "getMaxShredInsertSlot",
  "getMinimumBalanceForRentExemption",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getRecentPerformanceSamples",
  "getRecentPrioritizationFees",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getSlot",
  "getSlotLeader",
  "getStakeActivation",
  "getSupply",
  "getTokenAccountBalance",
  "getTokenAccountsByDelegate",
  "getTokenAccountsByOwner",
  "getTokenLargestAccounts",
  "getTokenSupply",
  "getTransaction",
  "getTransactionCount",
  "getVersion",
  "getVoteAccounts",
  "isBlockhashValid",
  "minimumLedgerSlot",
  "simulateTransaction",
]);

const ALLOWED_SOLANA_METHODS = new Set([
  ...SAFE_RETRY_SOLANA_METHODS,
  "sendTransaction",
]);

const FORBIDDEN_UPSTREAM_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "baggage",
  "cache-control",
  "cdn-loop",
  "cf-connecting-ip",
  "client-ip",
  "connection",
  "content-length",
  "content-type",
  "cookie",
  "expect",
  "forwarded",
  "host",
  "keep-alive",
  "origin",
  "pragma",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "range",
  "referer",
  "set-cookie",
  "te",
  "traceparent",
  "tracestate",
  "trailer",
  "transfer-encoding",
  "true-client-ip",
  "upgrade",
  "user-agent",
  "via",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-host",
  "x-http-method-override",
  "x-method-override",
  "x-original-url",
  "x-real-ip",
  "x-request-id",
  "x-rewrite-url",
]);

const mainnetProbeCache = new Map<
  string,
  { expiresAt: number; verified: boolean }
>();
const pulseRoutingState = new Map<
  string,
  {
    consecutiveFailures: number;
    latencyEwmaMs: number | null;
    openUntil: number;
    successfulObservations: number;
    lastObservedAt: number;
  }
>();

export type EthereumJsonRpcId = string | number | null;

export type EthereumJsonRpcCall = {
  request: Record<string, unknown>;
  method: string;
  hasId: boolean;
  id: EthereumJsonRpcId | undefined;
  blocked: boolean;
  policyError?: {
    jsonRpcCode?: number;
    message: string;
    data: {
      code:
        | "rpc_params_out_of_policy"
        | "rpc_origin_not_allowed"
        | "rpc_ip_not_allowed"
        | "rpc_method_not_allowed";
      detail: string;
    };
  };
};

type EthereumJsonRpcEnvelopeEntry =
  | {
      kind: "call";
      call: EthereumJsonRpcCall;
    }
  | {
      kind: "error";
      response: EthereumJsonRpcResponse;
    };

class EthereumJsonRpcInvalidRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EthereumJsonRpcInvalidRequest";
  }
}

export type EthereumJsonRpcEnvelope = {
  batch: boolean;
  calls: EthereumJsonRpcCall[];
  entries: EthereumJsonRpcEnvelopeEntry[];
  protocolErrorCount: number;
};

export type EthereumJsonRpcResponse = {
  jsonrpc: "2.0";
  id: EthereumJsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type EthereumRpcUpstream = {
  name: string;
  url: string;
  timeoutMs: number;
  headers: Record<string, string>;
};

export type EthereumRpcRuntimeConfiguration = {
  upstreams: EthereumRpcUpstream[];
  upstreamsByNetwork: Record<RpcNetwork, EthereumRpcUpstream[]>;
  hourlyCallQuota: number;
  workspaceHourlyCallQuota: number;
  configurationValid: boolean;
};

export type EthereumRpcProvisioningSnapshot = {
  network?: RpcNetwork;
  available: boolean;
  upstreamCount: number;
};

export type RpcProvisioningSnapshot = EthereumRpcProvisioningSnapshot & {
  network: RpcNetwork;
};

export type PulseRpcUpstreamSnapshot = {
  slot: number;
  primary: boolean;
  state: "cold" | "closed" | "half_open" | "open";
  latencyEwmaMs: number | null;
  consecutiveFailures: number;
  successfulObservations: number;
  cooldownRemainingMs: number;
  lastObservedAt: number | null;
};

export type EthereumRpcForwardResult = {
  responses: Map<string, EthereumJsonRpcResponse>;
  latencyMs: number;
  upstreamFailures: number;
  responseBytes: number;
  errorCalls: number;
};

export type EthereumRpcUpstreamFailureKind =
  | "content_type"
  | "http_status"
  | "invalid_configuration"
  | "invalid_response"
  | "network"
  | "redirect"
  | "response_too_large"
  | "timeout";

type UpstreamSensitiveValue = {
  caseInsensitive: boolean;
  value: string;
};

export class EthereumRpcUpstreamError extends Error {
  readonly status: 502 | 504;
  readonly code: "rpc_upstream_failed" | "rpc_upstream_timeout";
  readonly latencyMs: number;
  readonly upstreamFailures: number;
  readonly failureKind: EthereumRpcUpstreamFailureKind;
  readonly network: RpcNetwork;

  constructor(options: {
    timedOut: boolean;
    latencyMs: number;
    upstreamFailures: number;
    failureKind?: EthereumRpcUpstreamFailureKind;
    network?: RpcNetwork;
  }) {
    const network = options.network ?? "ethereum";
    const networkLabel = rpcNetworkLabel(network);
    super(
      options.timedOut
        ? `The ${networkLabel} upstream timed out.`
        : `The ${networkLabel} upstream could not complete the request.`,
    );
    this.name = "EthereumRpcUpstreamError";
    this.status = options.timedOut ? 504 : 502;
    this.code = options.timedOut
      ? "rpc_upstream_timeout"
      : "rpc_upstream_failed";
    this.latencyMs = options.latencyMs;
    this.upstreamFailures = options.upstreamFailures;
    this.failureKind =
      options.failureKind ??
      (options.timedOut ? "timeout" : "network");
    this.network = network;
  }
}

export async function loadEthereumRpcRuntimeConfiguration(): Promise<EthereumRpcRuntimeConfiguration> {
  const [upstreamValue, quotaValue, workspaceQuotaValue] = await Promise.all([
    runtimeEnvironmentValue("NODEZUNO_RPC_UPSTREAMS_JSON"),
    runtimeEnvironmentValue("NODEZUNO_RPC_HOURLY_CALL_QUOTA"),
    runtimeEnvironmentValue("NODEZUNO_RPC_WORKSPACE_HOURLY_CALL_QUOTA"),
  ]);
  const parsed = parseRpcUpstreamsJson(upstreamValue);
  return {
    ...parsed,
    upstreams: parsed.upstreamsByNetwork.ethereum,
    hourlyCallQuota: parseHourlyCallQuota(quotaValue),
    workspaceHourlyCallQuota:
      parseWorkspaceHourlyCallQuota(workspaceQuotaValue),
  };
}

export async function ethereumRpcProvisioningSnapshot(): Promise<EthereumRpcProvisioningSnapshot> {
  return rpcProvisioningSnapshot("ethereum");
}

export async function rpcProvisioningSnapshot(
  network: RpcNetwork,
): Promise<RpcProvisioningSnapshot> {
  const configuration = await loadEthereumRpcRuntimeConfiguration();
  const configured = configuration.upstreamsByNetwork[network];
  const upstreams =
    configuration.configurationValid &&
    configured.length > 0
      ? await verifiedRpcUpstreams({
          network,
          upstreams: configured,
        })
      : [];
  return {
    network,
    available: upstreams.length > 0,
    upstreamCount: upstreams.length,
  };
}

export async function rpcProvisioningSnapshots(): Promise<
  Record<RpcNetwork, RpcProvisioningSnapshot>
> {
  const configuration = await loadEthereumRpcRuntimeConfiguration();
  const snapshots = await Promise.all(
    rpcNetworks.map(async (network) => {
      const configured = configuration.upstreamsByNetwork[network];
      const verified =
        configuration.configurationValid && configured.length > 0
          ? await verifiedRpcUpstreams({
              network,
              upstreams: configured,
            })
          : [];
      return [
        network,
        {
          network,
          available: verified.length > 0,
          upstreamCount: verified.length,
        },
      ] as const;
    }),
  );
  return Object.fromEntries(snapshots) as Record<
    RpcNetwork,
    RpcProvisioningSnapshot
  >;
}

export async function verifiedEthereumMainnetUpstreams(options: {
  upstreams: EthereumRpcUpstream[];
  fetcher?: typeof fetch;
  now?: () => number;
}): Promise<EthereumRpcUpstream[]> {
  return verifiedRpcUpstreams({
    ...options,
    network: "ethereum",
  });
}

export async function verifiedRpcUpstreams(options: {
  network: RpcNetwork;
  upstreams: EthereumRpcUpstream[];
  fetcher?: typeof fetch;
  now?: () => number;
}): Promise<EthereumRpcUpstream[]> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  pruneMainnetProbeCache(now());
  const checks = await Promise.all(
    options.upstreams.map(async (upstream) => {
      const cacheKey = await rpcUpstreamCacheKey(
        options.network,
        upstream,
      );
      const cached = mainnetProbeCache.get(cacheKey);
      if (!options.fetcher && cached && cached.expiresAt > now()) {
        return cached.verified;
      }
      let result = await probeRpcUpstream(
        options.network,
        upstream,
        fetcher,
      );
      if (!result.verified && result.retryable) {
        result = await probeRpcUpstream(
          options.network,
          upstream,
          fetcher,
        );
      }
      const verified = result.verified;
      if (!options.fetcher) {
        mainnetProbeCache.set(cacheKey, {
          verified,
          expiresAt:
            now() +
            (verified
              ? MAINNET_PROBE_SUCCESS_CACHE_MS
              : MAINNET_PROBE_FAILURE_CACHE_MS),
        });
      }
      return verified;
    }),
  );
  return options.upstreams.filter((_, index) => checks[index]);
}

export function parseEthereumRpcUpstreamsJson(
  value: string | undefined,
): Pick<
  EthereumRpcRuntimeConfiguration,
  "upstreams" | "configurationValid"
> {
  const parsed = parseRpcUpstreamsJson(value);
  return {
    upstreams: parsed.upstreamsByNetwork.ethereum,
    configurationValid: parsed.configurationValid,
  };
}

export function parseRpcUpstreamsJson(
  value: string | undefined,
): Pick<
  EthereumRpcRuntimeConfiguration,
  "upstreamsByNetwork" | "configurationValid"
> {
  const empty = emptyRpcUpstreams();
  const raw = value?.trim() ?? "";
  if (!raw) {
    return {
      upstreamsByNetwork: empty,
      configurationValid: true,
    };
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_UPSTREAM_CONFIGURATION_BYTES) {
    return {
      upstreamsByNetwork: empty,
      configurationValid: false,
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return {
      upstreamsByNetwork: empty,
      configurationValid: false,
    };
  }
  if (!isPlainRecord(payload)) {
    return {
      upstreamsByNetwork: empty,
      configurationValid: false,
    };
  }
  const configuredNetworks = Object.keys(payload);
  if (
    configuredNetworks.length < 1 ||
    configuredNetworks.some(
      (key) => !rpcNetworks.includes(key as RpcNetwork),
    )
  ) {
    return {
      upstreamsByNetwork: empty,
      configurationValid: false,
    };
  }

  const upstreamsByNetwork = emptyRpcUpstreams();
  for (const network of configuredNetworks as RpcNetwork[]) {
    const candidates = payload[network];
    if (
      !Array.isArray(candidates) ||
      candidates.length < 1 ||
      candidates.length > MAX_UPSTREAMS
    ) {
      return {
        upstreamsByNetwork: empty,
        configurationValid: false,
      };
    }
    const names = new Set<string>();
    for (const candidate of candidates) {
      const upstream = parseUpstream(candidate, network);
      if (!upstream || names.has(upstream.name)) {
        return {
          upstreamsByNetwork: empty,
          configurationValid: false,
        };
      }
      names.add(upstream.name);
      upstreamsByNetwork[network].push(upstream);
    }
  }
  return { upstreamsByNetwork, configurationValid: true };
}

export function parseEthereumJsonRpcText(
  body: string,
): EthereumJsonRpcEnvelope {
  return parseRpcJsonText(body, "ethereum");
}

export function parseRpcJsonText(
  body: string,
  network: RpcNetwork,
): EthereumJsonRpcEnvelope {
  if (!body.trim()) {
    return protocolErrorEnvelope(
      -32700,
      "Parse error",
      "The request body is empty.",
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    return protocolErrorEnvelope(
      -32700,
      "Parse error",
      "The request body is not valid JSON.",
    );
  }

  const batchPayload = Array.isArray(payload) ? payload : null;
  const batch = batchPayload !== null;
  if (batchPayload?.length === 0) {
    return protocolErrorEnvelope(
      -32600,
      "Invalid Request",
      "A JSON-RPC batch must contain at least one request.",
    );
  }
  if (
    batchPayload &&
    batchPayload.length > ETHEREUM_RPC_MAX_BATCH_SIZE
  ) {
    throw new HttpProblem(
      413,
      "rpc_batch_too_large",
      `A JSON-RPC batch can contain at most ${ETHEREUM_RPC_MAX_BATCH_SIZE} calls.`,
    );
  }

  const candidates: unknown[] = batchPayload ?? [payload];
  const calls: EthereumJsonRpcCall[] = [];
  const entries: EthereumJsonRpcEnvelopeEntry[] = [];
  let protocolErrorCount = 0;
  const seenIds = new Set<string>();
  for (const candidate of candidates) {
    let call: EthereumJsonRpcCall;
    try {
      call = parseCall(candidate, network);
    } catch (error) {
      if (!(error instanceof EthereumJsonRpcInvalidRequest)) throw error;
      entries.push({
        kind: "error",
        response: ethereumJsonRpcError(
          null,
          -32600,
          "Invalid Request",
          {
            code: "rpc_invalid_request",
            detail: error.message,
          },
        ),
      });
      protocolErrorCount += 1;
      continue;
    }
    if (call.hasId) {
      const key = ethereumJsonRpcIdKey(
        call.id as EthereumJsonRpcId,
      );
      if (seenIds.has(key)) {
        entries.push({
          kind: "error",
          response: ethereumJsonRpcError(
            null,
            -32600,
            "Invalid Request",
            {
              code: "rpc_duplicate_id",
              detail:
                "Each request ID in a JSON-RPC batch must be unique.",
            },
          ),
        });
        protocolErrorCount += 1;
        continue;
      }
      seenIds.add(key);
    }
    calls.push(call);
    entries.push({ kind: "call", call });
  }
  return { batch, calls, entries, protocolErrorCount };
}

export function allowedEthereumRpcCalls(
  envelope: EthereumJsonRpcEnvelope,
): EthereumJsonRpcCall[] {
  return envelope.calls.filter((call) => !call.blocked);
}

export function isSafeEthereumRpcRetry(method: string): boolean {
  return isSafeRpcRetry("ethereum", method);
}

export function isSafeRpcRetry(
  network: RpcNetwork,
  method: string,
): boolean {
  return network === "solana"
    ? SAFE_RETRY_SOLANA_METHODS.has(method)
    : SAFE_RETRY_ETHEREUM_METHODS.has(method);
}

export function rpcMethodIsPlatformAllowed(
  network: RpcNetwork,
  method: string,
): boolean {
  if (!METHOD_PATTERN.test(method)) return false;
  return network === "solana"
    ? ALLOWED_SOLANA_METHODS.has(method)
    : !isBlockedEthereumRpcMethod(method);
}

export function rpcPlatformMethodCatalog(
  network: RpcNetwork,
): readonly string[] | null {
  return network === "solana"
    ? [...ALLOWED_SOLANA_METHODS].sort()
    : null;
}

export function ethereumRpcMethodQuotaWeight(method: string): number {
  return rpcMethodQuotaWeight("ethereum", method);
}

export function rpcMethodQuotaWeight(
  network: RpcNetwork,
  method: string,
): number {
  if (network === "solana") {
    switch (method) {
      case "getProgramAccounts":
        return 10;
      case "getBlock":
      case "getTransaction":
      case "getTokenAccountsByDelegate":
      case "getTokenAccountsByOwner":
      case "simulateTransaction":
        return 5;
      case "getBlocks":
      case "getBlocksWithLimit":
        return 3;
      default:
        return 1;
    }
  }
  switch (method) {
    case "eth_getLogs":
      return 10;
    case "eth_getProof":
      return 5;
    case "eth_call":
    case "eth_feeHistory":
      return 3;
    default:
      return 1;
  }
}

export function ethereumRpcQuotaUnits(
  calls: readonly EthereumJsonRpcCall[],
): number {
  return rpcQuotaUnits("ethereum", calls);
}

export function rpcQuotaUnits(
  network: RpcNetwork,
  calls: readonly EthereumJsonRpcCall[],
): number {
  return calls.reduce(
    (total, call) =>
      total + rpcMethodQuotaWeight(network, call.method),
    0,
  );
}

export function renderEthereumRpcResponses(options: {
  envelope: EthereumJsonRpcEnvelope;
  upstreamResponses?: Map<string, EthereumJsonRpcResponse>;
  allowedError?: {
    code: number;
    message: string;
    data?: unknown;
  };
}): EthereumJsonRpcResponse | EthereumJsonRpcResponse[] | null {
  const responses: EthereumJsonRpcResponse[] = [];
  for (const entry of options.envelope.entries) {
    if (entry.kind === "error") {
      responses.push(entry.response);
      continue;
    }
    const call = entry.call;
    if (!call.hasId) continue;
    const id = call.id as EthereumJsonRpcId;
    if (call.policyError) {
      responses.push(
        ethereumJsonRpcError(
          id,
          call.policyError.jsonRpcCode ?? -32602,
          call.policyError.message,
          call.policyError.data,
        ),
      );
      continue;
    }
    if (call.blocked) {
      responses.push(
        ethereumJsonRpcError(
          id,
          -32004,
          "This method is not available through the Nodezuno RPC gateway.",
          { code: "rpc_method_blocked" },
        ),
      );
      continue;
    }
    const upstream = options.upstreamResponses?.get(
      ethereumJsonRpcIdKey(id),
    );
    if (upstream) {
      responses.push(upstream);
      continue;
    }
    if (options.allowedError) {
      responses.push(
        ethereumJsonRpcError(
          id,
          options.allowedError.code,
          options.allowedError.message,
          options.allowedError.data,
        ),
      );
    }
  }

  if (responses.length === 0) return null;
  return options.envelope.batch ? responses : responses[0];
}

export async function forwardEthereumRpc(options: {
  calls: EthereumJsonRpcCall[];
  batch: boolean;
  upstreams: EthereumRpcUpstream[];
  fetcher?: typeof fetch;
  now?: () => number;
}): Promise<EthereumRpcForwardResult> {
  return forwardRpc({
    ...options,
    network: "ethereum",
  });
}

export async function forwardRpc(options: {
  network: RpcNetwork;
  calls: EthereumJsonRpcCall[];
  batch: boolean;
  upstreams: EthereumRpcUpstream[];
  fetcher?: typeof fetch;
  now?: () => number;
}): Promise<EthereumRpcForwardResult> {
  if (options.calls.length === 0 || options.upstreams.length === 0) {
    throw new TypeError("At least one call and upstream are required.");
  }
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const body = JSON.stringify(
    options.batch
      ? options.calls.map((call) => call.request)
      : options.calls[0].request,
  );
  const expectedIds = new Map<string, EthereumJsonRpcId>();
  for (const call of options.calls) {
    if (!call.hasId) continue;
    const id = call.id as EthereumJsonRpcId;
    expectedIds.set(ethereumJsonRpcIdKey(id), id);
  }

  const retryable = options.calls.every((call) =>
    isSafeRpcRetry(options.network, call.method),
  );
  const availableUpstreams = await pulseRouteCandidates({
    network: options.network,
    upstreams: options.upstreams,
    retryable,
    now: now(),
  });
  const startedAt = now();
  let upstreamFailures = 0;
  let finalFailureKind: EthereumRpcUpstreamFailureKind = "network";

  for (const candidate of availableUpstreams) {
    const attemptStartedAt = now();
    const attempt = await requestUpstream({
      network: options.network,
      upstream: candidate.upstream,
      body,
      fetcher,
      expectedIds,
      batch: options.batch,
    });
    const attemptCompletedAt = now();
    const attemptLatencyMs = Math.max(
      0,
      attemptCompletedAt - attemptStartedAt,
    );
    if (attempt.ok) {
      recordPulseRoutingSuccess(
        candidate.key,
        attemptCompletedAt,
        attemptLatencyMs,
      );
      const latencyMs = Math.max(0, attemptCompletedAt - startedAt);
      return {
        responses: attempt.responses,
        latencyMs,
        upstreamFailures,
        responseBytes: attempt.responseBytes,
        errorCalls: [...attempt.responses.values()].filter(
          (response) => response.error !== undefined,
        ).length,
      };
    }
    recordPulseRoutingFailure(
      candidate.key,
      Math.max(attemptStartedAt, attemptCompletedAt),
    );
    upstreamFailures += 1;
    finalFailureKind = attempt.failureKind;
  }

  throw new EthereumRpcUpstreamError({
    timedOut: finalFailureKind === "timeout",
    latencyMs: Math.max(0, now() - startedAt),
    upstreamFailures,
    failureKind: finalFailureKind,
    network: options.network,
  });
}

export function clearEthereumRpcRoutingStateForTests(): void {
  pulseRoutingState.clear();
}

export async function pulseRpcRoutingSnapshot(options: {
  network: RpcNetwork;
  upstreams: EthereumRpcUpstream[];
  now?: number;
}): Promise<PulseRpcUpstreamSnapshot[]> {
  const now = options.now ?? Date.now();
  prunePulseRoutingState(now);
  return Promise.all(
    options.upstreams.map(async (upstream, index) => {
      const key = await rpcUpstreamCacheKey(
        options.network,
        upstream,
      );
      const observed = pulseRoutingState.get(key);
      const state =
        observed === undefined
          ? "cold"
          : observed.openUntil > now
            ? "open"
            : observed.openUntil > 0
              ? "half_open"
              : "closed";
      return {
        slot: index + 1,
        primary: index === 0,
        state,
        latencyEwmaMs:
          observed?.latencyEwmaMs === null ||
          observed?.latencyEwmaMs === undefined
            ? null
            : Math.round(observed.latencyEwmaMs * 100) / 100,
        consecutiveFailures: observed?.consecutiveFailures ?? 0,
        successfulObservations:
          observed?.successfulObservations ?? 0,
        cooldownRemainingMs: observed
          ? Math.max(0, observed.openUntil - now)
          : 0,
        lastObservedAt: observed?.lastObservedAt ?? null,
      };
    }),
  );
}

async function pulseRouteCandidates(options: {
  network: RpcNetwork;
  upstreams: EthereumRpcUpstream[];
  retryable: boolean;
  now: number;
}): Promise<Array<{ key: string; upstream: EthereumRpcUpstream }>> {
  prunePulseRoutingState(options.now);
  const candidates = await Promise.all(
    options.upstreams.map(async (upstream, index) => {
      const key = await rpcUpstreamCacheKey(
        options.network,
        upstream,
      );
      return {
        index,
        key,
        state: pulseRoutingState.get(key),
        upstream,
      };
    }),
  );
  if (!options.retryable) {
    const primary = candidates[0];
    return primary
      ? [{ key: primary.key, upstream: primary.upstream }]
      : [];
  }

  const closed = candidates.filter(
    (candidate) =>
      !candidate.state || candidate.state.openUntil <= options.now,
  );
  const open = candidates
    .filter(
      (candidate) =>
        candidate.state && candidate.state.openUntil > options.now,
    )
    .sort(
      (left, right) =>
        left.state!.openUntil - right.state!.openUntil ||
        left.index - right.index,
    );
  const halfOpen = closed
    .filter(
      (candidate) =>
        candidate.state !== undefined &&
        candidate.state.openUntil > 0 &&
        candidate.state.openUntil <= options.now,
    )
    .sort(
      (left, right) =>
        left.state!.openUntil - right.state!.openUntil ||
        left.index - right.index,
    );
  const healthy = closed
    .filter((candidate) => !halfOpen.includes(candidate))
    .sort((left, right) => {
      const leftScore = pulseRoutingScore(left.state, left.index);
      const rightScore = pulseRoutingScore(right.state, right.index);
      return leftScore - rightScore || left.index - right.index;
    });
  const ordered =
    closed.length === 0
      ? open.slice(0, 1)
      : [...halfOpen, ...healthy, ...open].slice(0, 2);
  return ordered.map(({ key, upstream }) => ({ key, upstream }));
}

function pulseRoutingScore(
  state:
    | {
        consecutiveFailures: number;
        latencyEwmaMs: number | null;
      }
    | undefined,
  index: number,
): number {
  if (!state || state.latencyEwmaMs === null) {
    return index * 0.001;
  }
  return (
    state.latencyEwmaMs +
    state.consecutiveFailures * PULSE_FAILURE_SCORE_PENALTY_MS
  );
}

function recordPulseRoutingSuccess(
  key: string,
  now: number,
  latencyMs: number,
): void {
  const previous = pulseRoutingState.get(key);
  const boundedLatencyMs = Math.max(
    0,
    Math.min(MAX_UPSTREAM_TIMEOUT_MS, latencyMs),
  );
  const latencyEwmaMs =
    previous?.latencyEwmaMs === null ||
    previous?.latencyEwmaMs === undefined
      ? boundedLatencyMs
      : previous.latencyEwmaMs +
        PULSE_LATENCY_EWMA_ALPHA *
          (boundedLatencyMs - previous.latencyEwmaMs);
  pulseRoutingState.set(key, {
    consecutiveFailures: 0,
    latencyEwmaMs,
    openUntil: 0,
    successfulObservations: Math.min(
      Number.MAX_SAFE_INTEGER,
      (previous?.successfulObservations ?? 0) + 1,
    ),
    lastObservedAt: now,
  });
  enforcePulseRoutingStateLimit();
}

function recordPulseRoutingFailure(key: string, now: number): void {
  const previous = pulseRoutingState.get(key);
  const consecutiveFailures =
    (previous?.consecutiveFailures ?? 0) + 1;
  const cooldownExponent = Math.max(
    0,
    consecutiveFailures - PULSE_CIRCUIT_FAILURE_THRESHOLD,
  );
  const cooldownMs =
    consecutiveFailures >= PULSE_CIRCUIT_FAILURE_THRESHOLD
      ? Math.min(
          PULSE_CIRCUIT_MAX_COOLDOWN_MS,
          PULSE_CIRCUIT_BASE_COOLDOWN_MS *
            2 ** Math.min(cooldownExponent, 8),
        )
      : 0;
  pulseRoutingState.set(key, {
    consecutiveFailures,
    latencyEwmaMs: previous?.latencyEwmaMs ?? null,
    openUntil: cooldownMs > 0 ? now + cooldownMs : 0,
    successfulObservations: previous?.successfulObservations ?? 0,
    lastObservedAt: now,
  });
  enforcePulseRoutingStateLimit();
}

function prunePulseRoutingState(now: number): void {
  for (const [key, state] of pulseRoutingState) {
    if (state.lastObservedAt + PULSE_ROUTING_STATE_TTL_MS <= now) {
      pulseRoutingState.delete(key);
    }
  }
}

function enforcePulseRoutingStateLimit(): void {
  while (pulseRoutingState.size > PULSE_ROUTING_STATE_LIMIT) {
    let oldestKey: string | null = null;
    let oldestObservedAt = Number.POSITIVE_INFINITY;
    for (const [key, state] of pulseRoutingState) {
      if (state.lastObservedAt < oldestObservedAt) {
        oldestKey = key;
        oldestObservedAt = state.lastObservedAt;
      }
    }
    if (oldestKey === null) return;
    pulseRoutingState.delete(oldestKey);
  }
}

export function ethereumJsonRpcIdKey(id: EthereumJsonRpcId): string {
  if (id === null) return "null";
  return typeof id === "string" ? `string:${id}` : `number:${id}`;
}

function parseCall(
  candidate: unknown,
  network: RpcNetwork,
): EthereumJsonRpcCall {
  if (!isPlainRecord(candidate)) {
    throw new EthereumJsonRpcInvalidRequest(
      "Each JSON-RPC call must be an object.",
    );
  }
  const allowedKeys = new Set(["jsonrpc", "method", "params", "id"]);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) {
    throw new EthereumJsonRpcInvalidRequest(
      "Remove unsupported JSON-RPC request fields.",
    );
  }
  if (candidate.jsonrpc !== "2.0") {
    throw new EthereumJsonRpcInvalidRequest(
      'The jsonrpc field must be "2.0".',
    );
  }
  if (
    typeof candidate.method !== "string" ||
    !METHOD_PATTERN.test(candidate.method)
  ) {
    throw new EthereumJsonRpcInvalidRequest(
      "Provide a valid JSON-RPC method name.",
    );
  }
  if (
    Object.hasOwn(candidate, "params") &&
    !Array.isArray(candidate.params) &&
    !isPlainRecord(candidate.params)
  ) {
    throw new EthereumJsonRpcInvalidRequest(
      "JSON-RPC params must be an array or object.",
    );
  }
  const policyDetail =
    network === "solana"
      ? solanaRpcParameterPolicyDetail(
          candidate.method,
          candidate.params,
        )
      : ethereumRpcParameterPolicyDetail(
          candidate.method,
          candidate.params,
        );

  const hasId = Object.hasOwn(candidate, "id");
  const id = hasId ? parseId(candidate.id) : undefined;
  const request: Record<string, unknown> = {
    jsonrpc: "2.0",
    method: candidate.method,
  };
  if (Object.hasOwn(candidate, "params")) request.params = candidate.params;
  if (hasId) request.id = id;

  return {
    request,
    method: candidate.method,
    hasId,
    id,
    blocked:
      !rpcMethodIsPlatformAllowed(network, candidate.method) ||
      policyDetail !== null,
    ...(policyDetail === null
      ? {}
      : {
          policyError: {
            message: "Invalid params",
            data: {
              code: "rpc_params_out_of_policy" as const,
              detail: policyDetail,
            },
          },
        }),
  };
}

function solanaRpcParameterPolicyDetail(
  method: string,
  params: unknown,
): string | null {
  if (
    (method === "getBlocks" || method === "getBlocksWithLimit") &&
    !validSolanaBlockRange(method, params)
  ) {
    return `${method} accepts at most ${ETHEREUM_RPC_MAX_LOG_BLOCK_RANGE} slots per request.`;
  }
  if (
    method === "getMultipleAccounts" &&
    (!Array.isArray(params) ||
      !Array.isArray(params[0]) ||
      params[0].length < 1 ||
      params[0].length > 100 ||
      !params[0].every(isSolanaPublicKey))
  ) {
    return "getMultipleAccounts accepts between 1 and 100 public keys.";
  }
  if (
    method === "getSignatureStatuses" &&
    (!Array.isArray(params) ||
      !Array.isArray(params[0]) ||
      params[0].length < 1 ||
      params[0].length > 256 ||
      !params[0].every(isSolanaSignature))
  ) {
    return "getSignatureStatuses accepts between 1 and 256 signatures.";
  }
  if (
    method === "getSignaturesForAddress" &&
    !validSolanaSignatureHistoryParameters(params)
  ) {
    return "getSignaturesForAddress accepts a valid address and a limit no larger than 1,000.";
  }
  if (
    method === "getProgramAccounts" &&
    !validSolanaProgramAccountsParameters(params)
  ) {
    return "getProgramAccounts requires a valid program address, at most 8 filters, and a data slice no larger than 65,536 bytes.";
  }
  if (
    method === "getRecentPerformanceSamples" &&
    (!Array.isArray(params) ||
      params.length > 1 ||
      (params.length === 1 &&
        (!Number.isSafeInteger(params[0]) ||
          (params[0] as number) < 1 ||
          (params[0] as number) > 720)))
  ) {
    return "getRecentPerformanceSamples accepts a limit from 1 to 720.";
  }
  return null;
}

function validSolanaBlockRange(
  method: "getBlocks" | "getBlocksWithLimit",
  params: unknown,
): boolean {
  if (!Array.isArray(params) || params.length < 1 || params.length > 3) {
    return false;
  }
  const start = params[0];
  if (!Number.isSafeInteger(start) || (start as number) < 0) return false;
  if (method === "getBlocksWithLimit") {
    const limit = params[1];
    return (
      Number.isSafeInteger(limit) &&
      (limit as number) >= 1 &&
      (limit as number) <= ETHEREUM_RPC_MAX_LOG_BLOCK_RANGE
    );
  }
  const end = params[1];
  return (
    Number.isSafeInteger(end) &&
    (end as number) >= (start as number) &&
    (end as number) - (start as number) <
      ETHEREUM_RPC_MAX_LOG_BLOCK_RANGE
  );
}

function validSolanaSignatureHistoryParameters(params: unknown): boolean {
  if (
    !Array.isArray(params) ||
    params.length < 1 ||
    params.length > 2 ||
    !isSolanaPublicKey(params[0])
  ) {
    return false;
  }
  if (params.length === 1) return true;
  if (!isPlainRecord(params[1])) return false;
  const allowedKeys = new Set([
    "before",
    "commitment",
    "limit",
    "minContextSlot",
    "until",
  ]);
  if (Object.keys(params[1]).some((key) => !allowedKeys.has(key))) {
    return false;
  }
  const limit = params[1].limit;
  return (
    limit === undefined ||
    (Number.isSafeInteger(limit) &&
      (limit as number) >= 1 &&
      (limit as number) <= 1_000)
  );
}

function validSolanaProgramAccountsParameters(params: unknown): boolean {
  if (
    !Array.isArray(params) ||
    params.length < 1 ||
    params.length > 2 ||
    !isSolanaPublicKey(params[0])
  ) {
    return false;
  }
  if (params.length === 1) return true;
  const configuration = params[1];
  if (!isPlainRecord(configuration)) return false;
  const allowedKeys = new Set([
    "commitment",
    "dataSlice",
    "encoding",
    "filters",
    "minContextSlot",
    "withContext",
  ]);
  if (Object.keys(configuration).some((key) => !allowedKeys.has(key))) {
    return false;
  }
  if (
    configuration.filters !== undefined &&
    (!Array.isArray(configuration.filters) ||
      configuration.filters.length > 8 ||
      !configuration.filters.every(validSolanaProgramFilter))
  ) {
    return false;
  }
  if (configuration.dataSlice !== undefined) {
    const dataSlice = configuration.dataSlice;
    if (
      !isPlainRecord(dataSlice) ||
      Object.keys(dataSlice).some(
        (key) => key !== "offset" && key !== "length",
      ) ||
      !Number.isSafeInteger(dataSlice.offset) ||
      (dataSlice.offset as number) < 0 ||
      !Number.isSafeInteger(dataSlice.length) ||
      (dataSlice.length as number) < 0 ||
      (dataSlice.length as number) > ETHEREUM_RPC_MAX_CALL_DATA_BYTES
    ) {
      return false;
    }
  }
  return true;
}

function validSolanaProgramFilter(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1) return false;
  if (Object.hasOwn(value, "dataSize")) {
    return (
      Number.isSafeInteger(value.dataSize) &&
      (value.dataSize as number) >= 0 &&
      (value.dataSize as number) <= 10 * 1024 * 1024
    );
  }
  if (!Object.hasOwn(value, "memcmp") || !isPlainRecord(value.memcmp)) {
    return false;
  }
  const allowedKeys = new Set(["bytes", "encoding", "offset"]);
  return (
    !Object.keys(value.memcmp).some((key) => !allowedKeys.has(key)) &&
    Number.isSafeInteger(value.memcmp.offset) &&
    (value.memcmp.offset as number) >= 0 &&
    typeof value.memcmp.bytes === "string" &&
    value.memcmp.bytes.length >= 1 &&
    value.memcmp.bytes.length <= 256
  );
}

function isSolanaPublicKey(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 44 &&
    /^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  );
}

function isSolanaSignature(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length >= 80 &&
    value.length <= 88 &&
    /^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  );
}

function parseId(value: unknown): EthereumJsonRpcId {
  if (value === null || typeof value === "string") {
    if (typeof value === "string" && value.length > 256) {
      throw new EthereumJsonRpcInvalidRequest(
        "JSON-RPC string IDs cannot exceed 256 characters.",
      );
    }
    return value;
  }
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Number.isFinite(value)
  ) {
    return value;
  }
  throw new EthereumJsonRpcInvalidRequest(
    "A JSON-RPC ID must be a string, safe integer, or null.",
  );
}

function isBlockedEthereumRpcMethod(method: string): boolean {
  return (
    !["eth_", "net_", "web3_"].some((prefix) =>
      method.startsWith(prefix),
    ) ||
    BLOCKED_ETHEREUM_METHODS.has(method) ||
    BLOCKED_NAMESPACE_PREFIXES.some((prefix) => method.startsWith(prefix))
  );
}

function ethereumRpcParameterPolicyDetail(
  method: string,
  params: unknown,
): string | null {
  if (method === "eth_getLogs" && !validLogParameters(params)) {
    return `eth_getLogs requires a block hash or a range no larger than ${ETHEREUM_RPC_MAX_LOG_BLOCK_RANGE} blocks.`;
  }
  if (method === "eth_feeHistory" && !validFeeHistoryParameters(params)) {
    return `eth_feeHistory accepts at most ${ETHEREUM_RPC_MAX_FEE_HISTORY_BLOCKS} blocks and 20 reward percentiles.`;
  }
  if (method === "eth_getProof" && !validProofParameters(params)) {
    return `eth_getProof accepts at most ${ETHEREUM_RPC_MAX_PROOF_STORAGE_KEYS} storage keys.`;
  }
  if (
    (method === "eth_call" || method === "eth_estimateGas") &&
    !validCallParameters(params)
  ) {
    return `Call data cannot exceed ${ETHEREUM_RPC_MAX_CALL_DATA_BYTES} bytes and an explicit gas limit cannot exceed 30,000,000.`;
  }
  return null;
}

function validLogParameters(params: unknown): boolean {
  if (!Array.isArray(params) || params.length !== 1) return false;
  const filter = params[0];
  if (!isPlainRecord(filter)) return false;
  const allowedKeys = new Set([
    "address",
    "blockHash",
    "fromBlock",
    "toBlock",
    "topics",
  ]);
  if (Object.keys(filter).some((key) => !allowedKeys.has(key))) {
    return false;
  }
  if (!validLogAddress(filter.address) || !validLogTopics(filter.topics)) {
    return false;
  }
  if (filter.blockHash !== undefined) {
    return (
      filter.fromBlock === undefined &&
      filter.toBlock === undefined &&
      isHash(filter.blockHash)
    );
  }
  if (filter.fromBlock === undefined || filter.toBlock === undefined) {
    return false;
  }
  const from = blockQuantity(filter.fromBlock);
  const to = blockQuantity(filter.toBlock);
  if (from !== null && to !== null) {
    return (
      to >= from &&
      to - from <= BigInt(ETHEREUM_RPC_MAX_LOG_BLOCK_RANGE - 1)
    );
  }
  return (
    typeof filter.fromBlock === "string" &&
    filter.fromBlock === filter.toBlock &&
    BLOCK_TAGS.has(filter.fromBlock)
  );
}

function validFeeHistoryParameters(params: unknown): boolean {
  if (
    !Array.isArray(params) ||
    params.length < 2 ||
    params.length > 3
  ) {
    return false;
  }
  const count = blockQuantity(params[0]);
  if (
    count === null ||
    count < 1n ||
    count > BigInt(ETHEREUM_RPC_MAX_FEE_HISTORY_BLOCKS) ||
    !isBlockReference(params[1])
  ) {
    return false;
  }
  if (params.length === 2) return true;
  if (!Array.isArray(params[2]) || params[2].length > 20) return false;
  let previous = -1;
  for (const percentile of params[2]) {
    if (
      typeof percentile !== "number" ||
      !Number.isFinite(percentile) ||
      percentile < 0 ||
      percentile > 100 ||
      percentile < previous
    ) {
      return false;
    }
    previous = percentile;
  }
  return true;
}

function validProofParameters(params: unknown): boolean {
  return Boolean(
    Array.isArray(params) &&
      (params.length === 2 || params.length === 3) &&
      isAddress(params[0]) &&
      Array.isArray(params[1]) &&
      params[1].length <= ETHEREUM_RPC_MAX_PROOF_STORAGE_KEYS &&
      params[1].every(isHash) &&
      (params.length === 2 || isBlockReference(params[2])),
  );
}

function validCallParameters(params: unknown): boolean {
  if (
    !Array.isArray(params) ||
    params.length < 1 ||
    params.length > 3 ||
    !isPlainRecord(params[0])
  ) {
    return false;
  }
  const transaction = params[0];
  for (const field of ["data", "input"]) {
    if (
      transaction[field] !== undefined &&
      !isBoundedHexData(
        transaction[field],
        ETHEREUM_RPC_MAX_CALL_DATA_BYTES,
      )
    ) {
      return false;
    }
  }
  if (
    transaction.gas !== undefined &&
    !isQuantityAtMost(transaction.gas, 30_000_000n)
  ) {
    return false;
  }
  return true;
}

const BLOCK_TAGS = new Set([
  "earliest",
  "finalized",
  "latest",
  "pending",
  "safe",
]);

function isBlockReference(value: unknown): boolean {
  return blockQuantity(value) !== null ||
    (typeof value === "string" && BLOCK_TAGS.has(value));
}

function blockQuantity(value: unknown): bigint | null {
  if (
    typeof value !== "string" ||
    !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(value)
  ) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function isQuantityAtMost(
  value: unknown,
  maximum: bigint,
): boolean {
  const quantity = blockQuantity(value);
  return quantity !== null && quantity <= maximum;
}

function isAddress(value: unknown): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isHash(value: unknown): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isBoundedHexData(
  value: unknown,
  maximumBytes: number,
): boolean {
  return (
    typeof value === "string" &&
    /^0x(?:[0-9a-fA-F]{2})*$/.test(value) &&
    (value.length - 2) / 2 <= maximumBytes
  );
}

function validLogAddress(value: unknown): boolean {
  return (
    value === undefined ||
    isAddress(value) ||
    (Array.isArray(value) &&
      value.length >= 1 &&
      value.length <= 20 &&
      value.every(isAddress))
  );
}

function validLogTopics(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 4) return false;
  return value.every(
    (topic) =>
      topic === null ||
      isHash(topic) ||
      (Array.isArray(topic) &&
        topic.length >= 1 &&
        topic.length <= 20 &&
        topic.every(isHash)),
  );
}

function ethereumJsonRpcError(
  id: EthereumJsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): EthereumJsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function protocolErrorEnvelope(
  code: -32700 | -32600,
  message: "Parse error" | "Invalid Request",
  detail: string,
): EthereumJsonRpcEnvelope {
  const response = ethereumJsonRpcError(null, code, message, {
    code:
      code === -32700 ? "rpc_parse_error" : "rpc_invalid_request",
    detail,
  });
  return {
    batch: false,
    calls: [],
    entries: [{ kind: "error", response }],
    protocolErrorCount: 1,
  };
}

function parseUpstream(
  value: unknown,
  network: RpcNetwork,
): EthereumRpcUpstream | null {
  if (!isPlainRecord(value)) return null;
  const allowedKeys = new Set(["name", "url", "timeoutMs", "headers"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
  if (
    typeof value.name !== "string" ||
    !UPSTREAM_NAME_PATTERN.test(value.name)
  ) {
    return null;
  }
  const url = parseEthereumRpcUpstreamUrl(value.url, network);
  if (url === null) return null;

  const timeoutMs =
    value.timeoutMs === undefined
      ? ETHEREUM_RPC_DEFAULT_TIMEOUT_MS
      : value.timeoutMs;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    (timeoutMs as number) < MIN_UPSTREAM_TIMEOUT_MS ||
    (timeoutMs as number) > MAX_UPSTREAM_TIMEOUT_MS
  ) {
    return null;
  }
  const headers = parseUpstreamHeaders(value.headers);
  if (
    headers === null ||
    (url.startsWith("http://") && Object.keys(headers).length > 0)
  ) {
    return null;
  }
  return {
    name: value.name,
    url,
    timeoutMs: timeoutMs as number,
    headers,
  };
}

function parseUpstreamHeaders(
  value: unknown,
): Record<string, string> | null {
  if (value === undefined) return {};
  if (!isPlainRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_UPSTREAM_HEADERS) return null;
  const parsedEntries: Array<[string, string]> = [];
  const seenNames = new Set<string>();
  for (const [name, headerValue] of entries) {
    const normalizedName = name.toLowerCase();
    if (
      !HEADER_NAME_PATTERN.test(name) ||
      name.length > 128 ||
      seenNames.has(normalizedName) ||
      FORBIDDEN_UPSTREAM_HEADERS.has(normalizedName) ||
      normalizedName.startsWith("cf-") ||
      normalizedName.startsWith("proxy-") ||
      normalizedName.startsWith("sec-") ||
      normalizedName.startsWith("x-forwarded-") ||
      typeof headerValue !== "string" ||
      new TextEncoder().encode(headerValue).byteLength > 2_048 ||
      headerValue !== headerValue.trim() ||
      !HEADER_VALUE_PATTERN.test(headerValue)
    ) {
      return null;
    }
    seenNames.add(normalizedName);
    parsedEntries.push([name, headerValue]);
  }
  return Object.fromEntries(parsedEntries);
}

function parseHourlyCallQuota(value: string | undefined): number {
  const candidate = Number(value?.trim() ?? "");
  return Number.isSafeInteger(candidate) &&
    candidate >= MIN_HOURLY_CALL_QUOTA &&
    candidate <= MAX_HOURLY_CALL_QUOTA
    ? candidate
    : ETHEREUM_RPC_DEFAULT_HOURLY_CALL_QUOTA;
}

function parseWorkspaceHourlyCallQuota(
  value: string | undefined,
): number {
  const candidate = Number(value?.trim() ?? "");
  return Number.isSafeInteger(candidate) &&
    candidate >= MIN_WORKSPACE_HOURLY_CALL_QUOTA &&
    candidate <= MAX_WORKSPACE_HOURLY_CALL_QUOTA
    ? candidate
    : ETHEREUM_RPC_DEFAULT_WORKSPACE_HOURLY_CALL_QUOTA;
}

async function requestUpstream(options: {
  network: RpcNetwork;
  upstream: EthereumRpcUpstream;
  body: string;
  fetcher: typeof fetch;
  expectedIds: Map<string, EthereumJsonRpcId>;
  batch: boolean;
}): Promise<
  | {
      ok: true;
      responses: Map<string, EthereumJsonRpcResponse>;
      responseBytes: number;
    }
  | { ok: false; failureKind: EthereumRpcUpstreamFailureKind }
> {
  const transport = validatedUpstreamTransport(
    options.upstream,
    options.network,
  );
  if (transport === null) {
    return { ok: false, failureKind: "invalid_configuration" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.upstream.timeoutMs,
  );
  try {
    const headers = new Headers(transport.headers);
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");
    headers.set("User-Agent", "Nodezuno-RPC/1.0");
    const response = await options.fetcher(transport.url, {
      method: "POST",
      headers,
      body: options.body,
      cache: "no-store",
      credentials: "omit",
      redirect: UPSTREAM_REDIRECT_MODE,
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      await cancelResponseBody(response);
      return { ok: false, failureKind: "timeout" };
    }
    if (response.status >= 300 && response.status < 400) {
      await cancelResponseBody(response);
      return { ok: false, failureKind: "redirect" };
    }
    if (!response.ok) {
      await cancelResponseBody(response);
      return {
        ok: false,
        failureKind: isUpstreamTimeoutStatus(response.status)
          ? "timeout"
          : "http_status",
      };
    }
    if (response.status === 204) {
      return options.expectedIds.size === 0
        ? { ok: true, responses: new Map(), responseBytes: 0 }
        : { ok: false, failureKind: "invalid_response" };
    }
    if (!hasJsonResponseContentType(response)) {
      await cancelResponseBody(response);
      return { ok: false, failureKind: "content_type" };
    }

    const body = await readBoundedResponseText(
      response,
      ETHEREUM_RPC_MAX_RESPONSE_BYTES,
    );
    if (controller.signal.aborted) {
      return { ok: false, failureKind: "timeout" };
    }
    const { text, byteLength: responseBytes } = body;
    if (options.expectedIds.size === 0) {
      if (!text.trim() || (options.batch && text.trim() === "[]")) {
        return { ok: true, responses: new Map(), responseBytes };
      }
      return { ok: false, failureKind: "invalid_response" };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, failureKind: "invalid_response" };
    }
    const responses = validateUpstreamResponses(
      payload,
      options.expectedIds,
      options.batch,
      upstreamSensitiveValues(transport),
    );
    return responses
      ? { ok: true, responses, responseBytes }
      : { ok: false, failureKind: "invalid_response" };
  } catch (error) {
    return {
      ok: false,
      failureKind: controller.signal.aborted
        ? "timeout"
        : error instanceof UpstreamResponseError
          ? error.failureKind
          : "network",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeRpcUpstream(
  network: RpcNetwork,
  upstream: EthereumRpcUpstream,
  fetcher: typeof fetch,
): Promise<{
  verified: boolean;
  retryable: boolean;
  failureKind?: EthereumRpcUpstreamFailureKind;
}> {
  const transport = validatedUpstreamTransport(upstream, network);
  if (transport === null) {
    return {
      verified: false,
      retryable: false,
      failureKind: "invalid_configuration",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(upstream.timeoutMs, MAINNET_PROBE_TIMEOUT_MS),
  );
  try {
    const identityProbe =
      network === "solana"
        ? {
            id: "nodezuno-solana-genesis-probe",
            method: "getGenesisHash",
          }
        : {
            id:
              network === "ethereum"
                ? "nodezuno-mainnet-probe"
                : "nodezuno-base-mainnet-probe",
            method: "eth_chainId",
          };
    const identity = await requestRpcProbe({
      transport,
      fetcher,
      controller,
      ...identityProbe,
    });
    const identityVerified =
      network === "solana"
        ? identity.result === SOLANA_MAINNET_GENESIS_HASH
        : typeof identity.result === "string" &&
          new RegExp(
            network === "ethereum" ? "^0x0*1$" : "^0x0*2105$",
            "i",
          ).test(identity.result);
    if (!identityVerified) {
      return {
        verified: false,
        retryable: false,
        failureKind: "invalid_response",
      };
    }

    if (network === "solana") {
      const health = await requestRpcProbe({
        transport,
        fetcher,
        controller,
        id: "nodezuno-solana-health-probe",
        method: "getHealth",
      });
      if (health.result !== "ok") {
        return {
          verified: false,
          retryable: false,
          failureKind: "invalid_response",
        };
      }
    }
    return {
      verified: true,
      retryable: false,
    };
  } catch (error) {
    const failureKind: EthereumRpcUpstreamFailureKind =
      controller.signal.aborted
        ? "timeout"
        : error instanceof RpcProbeError
          ? error.failureKind
          : error instanceof UpstreamResponseError
          ? error.failureKind
          : "network";
    return {
      verified: false,
      retryable:
        error instanceof RpcProbeError
          ? error.retryable
          : failureKind === "network",
      failureKind,
    };
  } finally {
    clearTimeout(timeout);
  }
}

class RpcProbeError extends Error {
  readonly failureKind: EthereumRpcUpstreamFailureKind;
  readonly retryable: boolean;

  constructor(
    failureKind: EthereumRpcUpstreamFailureKind,
    retryable: boolean,
  ) {
    super("The RPC upstream probe failed.");
    this.name = "RpcProbeError";
    this.failureKind = failureKind;
    this.retryable = retryable;
  }
}

async function requestRpcProbe(options: {
  transport: { url: string; headers: Record<string, string> };
  fetcher: typeof fetch;
  controller: AbortController;
  id: string;
  method: string;
}): Promise<Record<string, unknown>> {
  const headers = new Headers(options.transport.headers);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("User-Agent", "Nodezuno-RPC-Probe/1.0");
  const response = await options.fetcher(options.transport.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: options.id,
      method: options.method,
      params: [],
    }),
    cache: "no-store",
    credentials: "omit",
    redirect: UPSTREAM_REDIRECT_MODE,
    signal: options.controller.signal,
  });
  if (options.controller.signal.aborted) {
    await cancelResponseBody(response);
    throw new RpcProbeError("timeout", false);
  }
  if (response.status >= 300 && response.status < 400) {
    await cancelResponseBody(response);
    throw new RpcProbeError("redirect", false);
  }
  if (!response.ok) {
    await cancelResponseBody(response);
    const timeoutFailure = isUpstreamTimeoutStatus(response.status);
    throw new RpcProbeError(
      timeoutFailure ? "timeout" : "http_status",
      !timeoutFailure &&
        (response.status === 429 || response.status >= 500),
    );
  }
  if (response.status === 204) {
    await cancelResponseBody(response);
    throw new RpcProbeError("invalid_response", false);
  }
  if (!hasJsonResponseContentType(response)) {
    await cancelResponseBody(response);
    throw new RpcProbeError("content_type", false);
  }
  const { text } = await readBoundedResponseText(
    response,
    MAINNET_PROBE_MAX_RESPONSE_BYTES,
  );
  if (options.controller.signal.aborted) {
    throw new RpcProbeError("timeout", false);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new RpcProbeError("invalid_response", false);
  }
  if (
    !isPlainRecord(payload) ||
    payload.jsonrpc !== "2.0" ||
    payload.id !== options.id ||
    !Object.hasOwn(payload, "result") ||
    Object.hasOwn(payload, "error")
  ) {
    throw new RpcProbeError("invalid_response", false);
  }
  return payload;
}

function validateUpstreamResponses(
  payload: unknown,
  expectedIds: Map<string, EthereumJsonRpcId>,
  batch: boolean,
  sensitiveValues: readonly UpstreamSensitiveValue[],
): Map<string, EthereumJsonRpcResponse> | null {
  const candidates = batch ? payload : [payload];
  if (!Array.isArray(candidates) || candidates.length !== expectedIds.size) {
    return null;
  }
  const responses = new Map<string, EthereumJsonRpcResponse>();
  for (const candidate of candidates) {
    if (!isPlainRecord(candidate) || candidate.jsonrpc !== "2.0") {
      return null;
    }
    if (!Object.hasOwn(candidate, "id")) return null;
    let id: EthereumJsonRpcId;
    try {
      id = parseId(candidate.id);
    } catch {
      return null;
    }
    const idKey = ethereumJsonRpcIdKey(id);
    if (!expectedIds.has(idKey) || responses.has(idKey)) return null;

    const hasResult = Object.hasOwn(candidate, "result");
    const hasError = Object.hasOwn(candidate, "error");
    if (hasResult === hasError) return null;
    if (hasError) {
      if (
        !isPlainRecord(candidate.error) ||
        !Number.isSafeInteger(candidate.error.code) ||
        typeof candidate.error.message !== "string"
      ) {
        return null;
      }
      responses.set(idKey, {
        jsonrpc: "2.0",
        id,
        error: {
          code: candidate.error.code as number,
          message: redactUpstreamString(
            candidate.error.message,
            sensitiveValues,
          ),
          ...(Object.hasOwn(candidate.error, "data")
            ? {
                data: redactUpstreamErrorData(
                  candidate.error.data,
                  sensitiveValues,
                ),
              }
            : {}),
        },
      });
    } else {
      responses.set(idKey, {
        jsonrpc: "2.0",
        id,
        result: candidate.result,
      });
    }
  }
  return responses.size === expectedIds.size ? responses : null;
}

async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<{ text: string; byteLength: number }> {
  const declared = response.headers.get("content-length");
  if (declared) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(declared)) {
      await cancelResponseBody(response);
      throw new UpstreamResponseError("invalid_response");
    }
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length > maximumBytes) {
      await cancelResponseBody(response);
      throw new UpstreamResponseError("response_too_large");
    }
  }
  if (!response.body) return { text: "", byteLength: 0 };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        try {
          await reader.cancel("upstream response limit exceeded");
        } catch {
          // The response limit remains authoritative.
        }
        throw new UpstreamResponseError("response_too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // The original stream failure remains authoritative.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      byteLength: totalBytes,
    };
  } catch {
    throw new UpstreamResponseError("invalid_response");
  }
}

class UpstreamResponseError extends Error {
  readonly failureKind:
    | "invalid_response"
    | "response_too_large";

  constructor(
    failureKind: "invalid_response" | "response_too_large",
  ) {
    super("The upstream response failed validation.");
    this.name = "UpstreamResponseError";
    this.failureKind = failureKind;
  }
}

function parseEthereumRpcUpstreamUrl(
  value: unknown,
  network: RpcNetwork,
): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    new TextEncoder().encode(value).byteLength > 4_096 ||
    RAW_UPSTREAM_URL_UNSAFE_CHARACTERS.test(value)
  ) {
    return null;
  }
  try {
    const url = new URL(value);
    if (isAllowedEthereumHttpLoopbackUrl(value, url, network)) {
      return url.toString();
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.port ||
      !isPublicUpstreamHostname(url.hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isAllowedEthereumHttpLoopbackUrl(
  raw: string,
  url: URL,
  network: RpcNetwork,
): boolean {
  if (
    network !== "ethereum" ||
    !isContainerRuntime() ||
    process.env[ETHEREUM_HTTP_LOOPBACK_FLAG] !== "true"
  ) {
    return false;
  }
  const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/?$/.exec(
    raw,
  );
  if (!match) return false;
  const port = Number(match[1]);
  return (
    port >= 1_024 &&
    port <= 65_535 &&
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    url.port === String(port) &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  );
}

function isPublicUpstreamHostname(rawHostname: string): boolean {
  const hostname = rawHostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!hostname || hostname.includes("%")) return false;

  const ipv4 = parseIpv4Address(hostname);
  if (ipv4 !== null) return isPublicIpv4Address(ipv4);

  if (hostname.includes(":")) {
    const ipv6 = parseIpv6Address(hostname);
    return ipv6 !== null && isPublicIpv6Address(ipv6);
  }

  if (
    hostname.length > 253 ||
    !hostname.includes(".") ||
    BLOCKED_UPSTREAM_HOSTNAME_SUFFIXES.some(
      (suffix) =>
        hostname === suffix || hostname.endsWith(`.${suffix}`),
    )
  ) {
    return false;
  }
  return hostname.split(".").every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  );
}

function parseIpv4Address(hostname: string): number[] | null {
  if (!/^[0-9]+(?:\.[0-9]+){3}$/.test(hostname)) return null;
  const parts = hostname.split(".").map(Number);
  return parts.every(
    (part) => Number.isInteger(part) && part >= 0 && part <= 255,
  )
    ? parts
    : null;
}

function isPublicIpv4Address(parts: number[]): boolean {
  const [first, second, third] = parts;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  );
}

function parseIpv6Address(hostname: string): number[] | null {
  if (!/^[0-9a-f:]+$/i.test(hostname)) return null;
  const halves = hostname.split("::");
  if (halves.length > 2) return null;
  const left = halves[0]
    ? halves[0].split(":").map(parseIpv6Part)
    : [];
  const right =
    halves.length === 2 && halves[1]
      ? halves[1].split(":").map(parseIpv6Part)
      : [];
  if (
    left.some((part) => part === null) ||
    right.some((part) => part === null)
  ) {
    return null;
  }
  const explicitParts = left.length + right.length;
  if (
    (halves.length === 1 && explicitParts !== 8) ||
    (halves.length === 2 && explicitParts >= 8)
  ) {
    return null;
  }
  return [
    ...(left as number[]),
    ...Array.from({ length: 8 - explicitParts }, () => 0),
    ...(right as number[]),
  ];
}

function parseIpv6Part(value: string): number | null {
  if (!/^[0-9a-f]{1,4}$/i.test(value)) return null;
  return Number.parseInt(value, 16);
}

function isPublicIpv6Address(parts: number[]): boolean {
  const [first, second, third] = parts;
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x3fff && (second & 0xf000) === 0x0000) return false;
  if (first === 0x2002) return false;
  if (first !== 0x2001) return true;
  return !(
    second === 0x0000 ||
    (second === 0x0002 && third === 0x0000) ||
    second === 0x0db8 ||
    (second & 0xfff0) === 0x0010 ||
    (second & 0xfff0) === 0x0020
  );
}

function validatedUpstreamTransport(
  upstream: EthereumRpcUpstream,
  network: RpcNetwork,
): { url: string; headers: Record<string, string> } | null {
  const url = parseEthereumRpcUpstreamUrl(upstream.url, network);
  const headers = parseUpstreamHeaders(upstream.headers);
  return url === null ||
    headers === null ||
    (url.startsWith("http://") && Object.keys(headers).length > 0)
    ? null
    : { url, headers };
}

function upstreamSensitiveValues(transport: {
  url: string;
  headers: Record<string, string>;
}): UpstreamSensitiveValue[] {
  const values = new Map<string, UpstreamSensitiveValue>();
  const add = (
    value: string,
    minimumLength = 8,
    caseInsensitive = false,
  ) => {
    if (value.length < minimumLength) return;
    const key = caseInsensitive ? `i:${value.toLowerCase()}` : `s:${value}`;
    values.set(key, { caseInsensitive, value });
  };
  const url = new URL(transport.url);
  add(url.toString(), 1);
  add(url.origin, 1, true);
  add(url.hostname, 1, true);
  for (const value of url.searchParams.values()) {
    add(value);
    add(encodeURIComponent(value));
  }
  for (const rawSegment of url.pathname.split("/")) {
    if (rawSegment.length < 12) continue;
    add(rawSegment, 12);
    try {
      add(decodeURIComponent(rawSegment), 12);
    } catch {
      // The full canonical URL is still redacted.
    }
  }
  for (const value of Object.values(transport.headers)) {
    add(value);
    for (const token of value.split(/\s+/)) add(token);
  }
  return [...values.values()].sort(
    (left, right) => right.value.length - left.value.length,
  );
}

function redactUpstreamString(
  value: string,
  sensitiveValues: readonly UpstreamSensitiveValue[],
): string {
  let redacted = value;
  for (const sensitive of sensitiveValues) {
    redacted = sensitive.caseInsensitive
      ? redacted.replace(
          new RegExp(escapeRegularExpression(sensitive.value), "gi"),
          REDACTED_UPSTREAM_VALUE,
        )
      : redacted.replaceAll(
          sensitive.value,
          REDACTED_UPSTREAM_VALUE,
        );
  }
  return redacted;
}

function redactUpstreamErrorData(
  value: unknown,
  sensitiveValues: readonly UpstreamSensitiveValue[],
  depth = 0,
): unknown {
  if (typeof value === "string") {
    return redactUpstreamString(value, sensitiveValues);
  }
  if (depth >= 32) return REDACTED_UPSTREAM_VALUE;
  if (Array.isArray(value)) {
    return value.map((item) =>
      redactUpstreamErrorData(item, sensitiveValues, depth + 1),
    );
  }
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      redactUpstreamString(key, sensitiveValues),
      redactUpstreamErrorData(item, sensitiveValues, depth + 1),
    ]),
  );
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function rpcUpstreamCacheKey(
  network: RpcNetwork,
  upstream: EthereumRpcUpstream,
): Promise<string> {
  const headerEntries = Object.entries(upstream.headers)
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return sha256Hex(
    JSON.stringify([
      network,
      upstream.url,
      upstream.timeoutMs,
      headerEntries,
    ]),
  );
}

function emptyRpcUpstreams(): Record<
  RpcNetwork,
  EthereumRpcUpstream[]
> {
  return {
    ethereum: [],
    base: [],
    solana: [],
  };
}

export function rpcNetworkLabel(network: RpcNetwork): string {
  switch (network) {
    case "ethereum":
      return "Ethereum";
    case "base":
      return "Base";
    case "solana":
      return "Solana";
  }
}

function pruneMainnetProbeCache(now: number): void {
  for (const [key, cached] of mainnetProbeCache) {
    if (cached.expiresAt <= now) mainnetProbeCache.delete(key);
  }
}

function hasJsonResponseContentType(response: Response): boolean {
  const raw = response.headers.get("content-type");
  if (!raw) return false;
  const [mediaType] = raw.split(";", 1);
  return JSON_CONTENT_TYPE_PATTERN.test(mediaType.trim());
}

function isUpstreamTimeoutStatus(status: number): boolean {
  return status === 408 ||
    status === 504 ||
    status === 522 ||
    status === 524 ||
    status === 598 ||
    status === 599;
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The caller's failure classification remains authoritative.
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
