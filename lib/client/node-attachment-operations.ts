export type OperatorRpcAttachment = {
  network: "ethereum" | "base" | "solana";
  name: string;
  configuredUpstreams: number;
  verifiedUpstreams: number;
  ready: boolean;
  state:
    | "invalid_configuration"
    | "not_configured"
    | "verification_failed"
    | "ready";
  expectedIdentity: string;
  safeReads: string;
  writes: string;
  pulse: {
    scope: "process-local";
    upstreams: OperatorPulseUpstream[];
  };
};

export type OperatorPulseUpstream = {
  slot: number;
  primary: boolean;
  state: "cold" | "closed" | "half_open" | "open";
  latencyEwmaMs: number | null;
  consecutiveFailures: number;
  successfulObservations: number;
  cooldownRemainingMs: number;
  lastObservedAt: string | null;
};

export type OperatorNodeAttachmentSnapshot = {
  rpc: OperatorRpcAttachment[];
  nativeGrpc: {
    configured: boolean;
    endpointConfigured: boolean;
    authenticationConfigured: boolean;
    ready: boolean;
    state: "not_configured" | "verification_failed" | "ready";
    serviceName: string;
  };
  checkedAt: string;
  requestId: string;
};

const rpcContract = {
  ethereum: {
    name: "Ethereum",
    expectedIdentity: "eth_chainId = 0x1",
  },
  base: {
    name: "Base",
    expectedIdentity: "eth_chainId = 0x2105",
  },
  solana: {
    name: "Solana",
    expectedIdentity:
      "mainnet-beta genesis plus getHealth = ok",
  },
} as const;

const safeReads =
  "Pulse verified-latency adaptive failover, at most two attempts";
const writes = "Configured primary, exactly one attempt";

export function parseOperatorNodeAttachmentSnapshot(
  value: unknown,
): OperatorNodeAttachmentSnapshot | null {
  if (
    !isExactRecord(value, ["data", "requestId"]) ||
    typeof value.requestId !== "string" ||
    !/^[A-Za-z0-9-]{8,128}$/.test(value.requestId) ||
    !isExactRecord(value.data, [
      "rpc",
      "nativeGrpc",
      "checkedAt",
    ]) ||
    !Array.isArray(value.data.rpc) ||
    value.data.rpc.length !== 3 ||
    !isCanonicalIsoTimestamp(value.data.checkedAt)
  ) {
    return null;
  }
  const expectedNetworks = ["ethereum", "base", "solana"] as const;
  const rpc: OperatorRpcAttachment[] = [];
  for (let index = 0; index < expectedNetworks.length; index += 1) {
    const network = expectedNetworks[index];
    const item = value.data.rpc[index];
    const parsed = parseRpcAttachment(item, network);
    if (!parsed) return null;
    rpc.push(parsed);
  }
  const nativeGrpc = parseGrpcAttachment(value.data.nativeGrpc);
  if (!nativeGrpc) return null;
  return {
    rpc,
    nativeGrpc,
    checkedAt: value.data.checkedAt,
    requestId: value.requestId,
  };
}

function parseRpcAttachment(
  value: unknown,
  network: keyof typeof rpcContract,
): OperatorRpcAttachment | null {
  if (
    !isExactRecord(value, [
      "network",
      "name",
      "configuredUpstreams",
      "verifiedUpstreams",
      "ready",
      "state",
      "expectedIdentity",
      "safeReads",
      "writes",
      "pulse",
    ]) ||
    value.network !== network ||
    value.name !== rpcContract[network].name ||
    value.expectedIdentity !==
      rpcContract[network].expectedIdentity ||
    value.safeReads !== safeReads ||
    value.writes !== writes ||
    !boundedCount(value.configuredUpstreams) ||
    !boundedCount(value.verifiedUpstreams) ||
    value.verifiedUpstreams > value.configuredUpstreams ||
    typeof value.ready !== "boolean" ||
    ![
      "invalid_configuration",
      "not_configured",
      "verification_failed",
      "ready",
    ].includes(value.state as string) ||
    (value.ready !== (value.state === "ready")) ||
    (value.ready && value.verifiedUpstreams < 1) ||
    !isExactRecord(value.pulse, ["scope", "upstreams"]) ||
    value.pulse.scope !== "process-local" ||
    !Array.isArray(value.pulse.upstreams) ||
    value.pulse.upstreams.length !== value.configuredUpstreams ||
    !value.pulse.upstreams.every((item, index) =>
      validPulseUpstream(item, index),
    )
  ) {
    return null;
  }
  return value as OperatorRpcAttachment;
}

function validPulseUpstream(value: unknown, index: number): boolean {
  if (
    !isExactRecord(value, [
      "slot",
      "primary",
      "state",
      "latencyEwmaMs",
      "consecutiveFailures",
      "successfulObservations",
      "cooldownRemainingMs",
      "lastObservedAt",
    ]) ||
    value.slot !== index + 1 ||
    value.primary !== (index === 0) ||
    !["cold", "closed", "half_open", "open"].includes(
      value.state as string,
    ) ||
    !boundedMetric(value.consecutiveFailures) ||
    !boundedMetric(value.successfulObservations) ||
    !boundedCooldown(value.cooldownRemainingMs) ||
    !(
      value.latencyEwmaMs === null ||
      (typeof value.latencyEwmaMs === "number" &&
        Number.isFinite(value.latencyEwmaMs) &&
        value.latencyEwmaMs >= 0 &&
        value.latencyEwmaMs <= 15_000)
    ) ||
    !(
      value.lastObservedAt === null ||
      isCanonicalIsoTimestamp(value.lastObservedAt)
    ) ||
    (value.state === "cold" &&
      (value.latencyEwmaMs !== null ||
        value.consecutiveFailures !== 0 ||
        value.successfulObservations !== 0 ||
        value.cooldownRemainingMs !== 0 ||
        value.lastObservedAt !== null)) ||
    (value.state === "open" && value.cooldownRemainingMs < 1) ||
    (value.state !== "open" && value.cooldownRemainingMs !== 0)
  ) {
    return false;
  }
  return true;
}

function parseGrpcAttachment(
  value: unknown,
): OperatorNodeAttachmentSnapshot["nativeGrpc"] | null {
  if (
    !isExactRecord(value, [
      "configured",
      "endpointConfigured",
      "authenticationConfigured",
      "ready",
      "state",
      "serviceName",
    ]) ||
    typeof value.configured !== "boolean" ||
    typeof value.endpointConfigured !== "boolean" ||
    typeof value.authenticationConfigured !== "boolean" ||
    typeof value.ready !== "boolean" ||
    !["not_configured", "verification_failed", "ready"].includes(
      value.state as string,
    ) ||
    value.serviceName !==
      "nodezuno.ethereum.v1.EthereumProxy" ||
    value.ready !== (value.state === "ready") ||
    (value.configured !==
      (value.endpointConfigured &&
        value.authenticationConfigured)) ||
    (value.ready && !value.configured)
  ) {
    return null;
  }
  return value as OperatorNodeAttachmentSnapshot["nativeGrpc"];
}

function boundedCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 &&
    (value as number) <= 4;
}

function boundedMetric(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0
  );
}

function boundedCooldown(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 2 * 60 * 1000
  );
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
