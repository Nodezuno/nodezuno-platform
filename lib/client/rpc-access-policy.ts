import type { SelfServiceRpcNetwork } from "./rpc-networks";

export type RpcAccessPolicy = {
  allowedOrigins: string[];
  allowedIpCidrs: string[];
  allowedMethods: string[];
};

export type RpcAccessPolicySnapshot = {
  serviceId: string;
  network: SelfServiceRpcNetwork;
  revision: number;
  policy: RpcAccessPolicy;
  updatedAt: string | null;
};

export function parsePolicyLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isRpcMethodName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(value)
  );
}

export function rpcPolicyDraftProblem(
  policy: RpcAccessPolicy,
): string | null {
  const duplicateOrigin = duplicate(policy.allowedOrigins);
  if (duplicateOrigin) {
    return `Remove the duplicate origin ${duplicateOrigin}.`;
  }
  if (policy.allowedOrigins.some((origin) => origin.includes("*"))) {
    return "Wildcard origins are not supported. Enter each exact HTTPS origin.";
  }
  const duplicateCidr = duplicate(policy.allowedIpCidrs);
  if (duplicateCidr) {
    return `Remove the duplicate address range ${duplicateCidr}.`;
  }
  const duplicateMethod = duplicate(policy.allowedMethods);
  if (duplicateMethod) {
    return `Remove the duplicate RPC method ${duplicateMethod}.`;
  }
  if (policy.allowedMethods.some((method) => !isRpcMethodName(method))) {
    return "Use exact RPC method names with letters, numbers, dots, colons, underscores, or hyphens.";
  }
  return null;
}

export function rpcPolicyUpdatePayload(
  revision: number,
  policy: RpcAccessPolicy,
) {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("A non-negative policy revision is required.");
  }
  return {
    revision,
    allowedOrigins: [...policy.allowedOrigins],
    allowedIpCidrs: [...policy.allowedIpCidrs],
    allowedMethods: [...policy.allowedMethods],
  };
}

export function parseRpcAccessPolicyEnvelope(
  payload: unknown,
  serviceId: string,
  network: SelfServiceRpcNetwork,
): RpcAccessPolicySnapshot {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The policy response was not a JSON object.");
  }
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The policy response did not include service data.");
  }
  const candidate = data as Record<string, unknown>;
  const policy = candidate.policy;
  if (
    candidate.serviceId !== serviceId ||
    candidate.network !== network ||
    !Number.isSafeInteger(candidate.revision) ||
    (candidate.revision as number) < 0 ||
    (candidate.updatedAt !== null &&
      typeof candidate.updatedAt !== "string") ||
    !policy ||
    typeof policy !== "object" ||
    Array.isArray(policy)
  ) {
    throw new Error(
      "The policy response did not match the selected RPC service.",
    );
  }
  const policyRecord = policy as Record<string, unknown>;
  if (
    !isStringArray(policyRecord.allowedOrigins) ||
    !isStringArray(policyRecord.allowedIpCidrs) ||
    !isStringArray(policyRecord.allowedMethods)
  ) {
    throw new Error("The policy response contained invalid access lists.");
  }
  return {
    serviceId,
    network,
    revision: candidate.revision as number,
    updatedAt: candidate.updatedAt as string | null,
    policy: {
      allowedOrigins: [...policyRecord.allowedOrigins],
      allowedIpCidrs: [...policyRecord.allowedIpCidrs],
      allowedMethods: [...policyRecord.allowedMethods],
    },
  };
}

function duplicate(values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
  );
}
