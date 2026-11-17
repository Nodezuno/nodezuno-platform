import { sha256Hex, stableStringify } from "./crypto.ts";
import { getDatabase } from "./database-binding.ts";
import {
  ETHEREUM_MAINNET_CHAIN_ID,
  MINIMUM_PAYMENT_RPC_ENDPOINTS,
  type EthereumRpcEndpoint,
  type StablecoinPaymentConfiguration,
  stablecoinPaymentConfiguration,
} from "./stablecoin-payment-config.ts";

export const PAYMENT_VERIFIER_HEALTH_MAX_AGE_MS = 150_000;
const MAX_HEAD_SPREAD = 8n;
const MAX_CHAIN_AGE_MS = 5 * 60_000;

type EndpointProbe = {
  name: string;
  provider: string;
  healthy: boolean;
  latestBlock: bigint | null;
  failureCode: string | null;
};

type PaymentVerifierHealthRow = {
  configurationHash: string;
  configuredEndpointCount: number;
  healthyEndpointCount: number;
  latestBlock: string | null;
  state: "healthy" | "unavailable";
  failureCode: string | null;
  checkedAt: number;
};

export async function paymentVerifierConfigurationHash(
  configuration: StablecoinPaymentConfiguration,
): Promise<string> {
  return sha256Hex(stableStringify({
    mode: configuration.mode,
    confirmationsRequired: configuration.confirmationsRequired,
    endpoints: configuration.endpoints.map((endpoint) => ({
      name: endpoint.name,
      provider: endpoint.provider,
      url: endpoint.url,
    })),
  }));
}

export async function refreshStablecoinPaymentVerifierHealth(): Promise<{
  healthy: boolean;
  configured: number;
  responding: number;
  latestBlock: string | null;
  failureCode: string | null;
  checkedAt: number;
}> {
  const configuration = await stablecoinPaymentConfiguration();
  const db = await getDatabase();
  const checkedAt = Date.now();
  const configurationHash = await paymentVerifierConfigurationHash(configuration);
  const probes = configuration.mode === "ethereum_mainnet" && configuration.ready
    ? await Promise.all(configuration.endpoints.map(probeEndpoint))
    : [];
  const healthyProbes = probes.filter((probe) => probe.healthy && probe.latestBlock !== null);
  const heads = healthyProbes.map((probe) => probe.latestBlock as bigint);
  const spreadHealthy = heads.length > 0 && (maxBigInt(heads) - minBigInt(heads)) <= MAX_HEAD_SPREAD;
  const healthy =
    configuration.mode === "ethereum_mainnet" &&
    configuration.endpoints.length >= MINIMUM_PAYMENT_RPC_ENDPOINTS &&
    healthyProbes.length === configuration.endpoints.length &&
    spreadHealthy;
  const failureCode = healthy
    ? null
    : configuration.mode !== "ethereum_mainnet" || !configuration.ready
      ? "configuration_unavailable"
      : healthyProbes.length !== configuration.endpoints.length
        ? "endpoint_unavailable"
        : "chain_head_disagreement";
  const latestBlock = heads.length > 0 ? minBigInt(heads).toString() : null;
  await db.prepare(`INSERT INTO payment_verifier_health
    (id, configuration_hash, configured_endpoint_count,
     healthy_endpoint_count, latest_block, state, failure_code,
     checked_at, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      configuration_hash = excluded.configuration_hash,
      configured_endpoint_count = excluded.configured_endpoint_count,
      healthy_endpoint_count = excluded.healthy_endpoint_count,
      latest_block = excluded.latest_block,
      state = excluded.state,
      failure_code = excluded.failure_code,
      checked_at = excluded.checked_at,
      updated_at = excluded.updated_at`).bind(
        configurationHash,
        configuration.endpoints.length,
        healthyProbes.length,
        latestBlock,
        healthy ? "healthy" : "unavailable",
        failureCode,
        checkedAt,
        checkedAt,
      ).run();
  return {
    healthy,
    configured: configuration.endpoints.length,
    responding: healthyProbes.length,
    latestBlock,
    failureCode,
    checkedAt,
  };
}

export async function stablecoinPaymentVerifierIsReady(
  configuration: StablecoinPaymentConfiguration,
  database?: D1Database,
  now = Date.now(),
): Promise<boolean> {
  if (
    configuration.mode !== "ethereum_mainnet" ||
    !configuration.ready ||
    configuration.endpoints.length < MINIMUM_PAYMENT_RPC_ENDPOINTS
  ) return false;
  const db = database ?? await getDatabase();
  const expectedHash = await paymentVerifierConfigurationHash(configuration);
  const row = await db.prepare(`SELECT
      configuration_hash AS configurationHash,
      configured_endpoint_count AS configuredEndpointCount,
      healthy_endpoint_count AS healthyEndpointCount,
      latest_block AS latestBlock, state, failure_code AS failureCode,
      checked_at AS checkedAt
    FROM payment_verifier_health WHERE id = 1 LIMIT 1`)
    .first<PaymentVerifierHealthRow>();
  return Boolean(
    row &&
    row.configurationHash === expectedHash &&
    row.state === "healthy" &&
    row.configuredEndpointCount === configuration.endpoints.length &&
    row.healthyEndpointCount === configuration.endpoints.length &&
    row.checkedAt <= now &&
    row.checkedAt >= now - PAYMENT_VERIFIER_HEALTH_MAX_AGE_MS,
  );
}

async function probeEndpoint(endpoint: EthereumRpcEndpoint): Promise<EndpointProbe> {
  try {
    const [chainId, latest, finalized] = await Promise.all([
      rpcCall(endpoint, "eth_chainId", []),
      rpcCall(endpoint, "eth_getBlockByNumber", ["latest", false]),
      rpcCall(endpoint, "eth_getBlockByNumber", ["finalized", false]),
    ]);
    if (
      chainId !== `0x${ETHEREUM_MAINNET_CHAIN_ID.toString(16)}` ||
      !blockRecord(latest) ||
      !blockRecord(finalized)
    ) throw new Error("rpc_evidence");
    const latestNumber = BigInt(latest.number);
    const finalizedNumber = BigInt(finalized.number);
    const latestTimestamp = Number(BigInt(latest.timestamp) * 1_000n);
    if (
      finalizedNumber > latestNumber ||
      Math.abs(Date.now() - latestTimestamp) > MAX_CHAIN_AGE_MS
    ) throw new Error("rpc_stale");
    return {
      name: endpoint.name,
      provider: endpoint.provider,
      healthy: true,
      latestBlock: latestNumber,
      failureCode: null,
    };
  } catch {
    return {
      name: endpoint.name,
      provider: endpoint.provider,
      healthy: false,
      latestBlock: null,
      failureCode: "rpc_unavailable",
    };
  }
}

async function rpcCall(
  endpoint: EthereumRpcEndpoint,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      ...endpoint.headers,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(endpoint.timeoutMs),
  });
  if (!response.ok) throw new Error("rpc_status");
  const entry: unknown = await response.json();
  if (
    !isRecord(entry) ||
    entry.id !== 1 ||
    entry.error !== undefined ||
    !("result" in entry)
  ) {
    throw new Error("rpc_result");
  }
  return entry.result;
}

function blockRecord(value: unknown): value is { number: string; timestamp: string } {
  return isRecord(value) && isHexQuantity(value.number) && isHexQuantity(value.timestamp);
}

function isHexQuantity(value: unknown): value is string {
  return typeof value === "string" && /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function minBigInt(values: bigint[]): bigint {
  return values.reduce((minimum, value) => value < minimum ? value : minimum);
}

function maxBigInt(values: bigint[]): bigint {
  return values.reduce((maximum, value) => value > maximum ? value : maximum);
}
