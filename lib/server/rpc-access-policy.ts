const MAX_ALLOWED_ORIGINS = 20;
const MAX_ALLOWED_IP_CIDRS = 50;
const MAX_ALLOWED_METHODS = 100;
const MAX_ORIGIN_LENGTH = 2_048;
const MAX_METHOD_LENGTH = 128;
const METHOD_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]*$/;
const IPV4_COMPONENT_PATTERN = /^(?:0|[1-9][0-9]{0,2})$/;
const IPV6_COMPONENT_PATTERN = /^[0-9A-Fa-f]{1,4}$/;

export type RpcAccessPolicy = {
  allowedOrigins: string[];
  allowedIpCidrs: string[];
  allowedMethods: string[];
};

export type RpcAccessPolicyNetwork = "ethereum" | "base" | "solana";

export type RpcAccessPolicyRecord = {
  serviceId: string;
  workspaceId: string;
  network: RpcAccessPolicyNetwork;
  revision: number;
  policy: RpcAccessPolicy;
  updatedAt: number | null;
};

export type RpcAccessPolicyValidation =
  | { ok: true; value: RpcAccessPolicy }
  | { ok: false; fields: Record<string, string> };

export type RpcAccessPolicyUpdate = RpcAccessPolicy & {
  revision: number;
};

export type RpcAccessPolicyUpdateValidation =
  | { ok: true; value: RpcAccessPolicyUpdate }
  | { ok: false; fields: Record<string, string> };

export function serializeRpcAccessPolicyRecord(
  record: RpcAccessPolicyRecord,
) {
  return {
    serviceId: record.serviceId,
    network: record.network,
    revision: record.revision,
    policy: record.policy,
    updatedAt:
      record.updatedAt === null
        ? null
        : new Date(record.updatedAt).toISOString(),
  };
}

export type RpcAccessPolicyDenialCode =
  | "rpc_origin_not_allowed"
  | "rpc_ip_not_allowed"
  | "rpc_method_not_allowed";

export type RpcAccessPolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: RpcAccessPolicyDenialCode;
      detail: string;
    };

export type RpcAccessPolicyCall = {
  method: string;
  blocked: boolean;
  policyError?: {
    jsonRpcCode?: number;
    message: string;
    data: {
      code:
        | RpcAccessPolicyDenialCode
        | "rpc_params_out_of_policy";
      detail: string;
    };
  };
};

type ParsedIpAddress = {
  family: 4 | 6;
  value: bigint;
};

type ParsedIpCidr = ParsedIpAddress & {
  prefixLength: number;
};

export function validateRpcAccessPolicy(
  payload: unknown,
): RpcAccessPolicyValidation {
  if (!isPlainRecord(payload)) {
    return {
      ok: false,
      fields: { body: "Send a JSON object." },
    };
  }

  const allowedFields = new Set([
    "allowedOrigins",
    "allowedIpCidrs",
    "allowedMethods",
  ]);
  if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }

  const fields: Record<string, string> = {};
  const allowedOrigins = normalizeOrigins(
    payload.allowedOrigins,
    fields,
  );
  const allowedIpCidrs = normalizeIpCidrs(
    payload.allowedIpCidrs,
    fields,
  );
  const allowedMethods = normalizeMethods(
    payload.allowedMethods,
    fields,
  );

  return Object.keys(fields).length > 0
    ? { ok: false, fields }
    : {
        ok: true,
        value: {
          allowedOrigins,
          allowedIpCidrs,
          allowedMethods,
        },
      };
}

export function validateRpcAccessPolicyUpdate(
  payload: unknown,
): RpcAccessPolicyUpdateValidation {
  if (!isPlainRecord(payload)) {
    return {
      ok: false,
      fields: { body: "Send a JSON object." },
    };
  }
  const allowedFields = new Set([
    "revision",
    "allowedOrigins",
    "allowedIpCidrs",
    "allowedMethods",
  ]);
  if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }

  const policy = validateRpcAccessPolicy({
    allowedOrigins: payload.allowedOrigins,
    allowedIpCidrs: payload.allowedIpCidrs,
    allowedMethods: payload.allowedMethods,
  });
  const fields = policy.ok ? {} : { ...policy.fields };
  const revisionValid =
    Number.isSafeInteger(payload.revision) &&
    (payload.revision as number) >= 0 &&
    (payload.revision as number) <= 2_147_483_647;
  if (!revisionValid) {
    fields.revision =
      "Use the non-negative revision returned by the policy endpoint.";
  }
  if (!policy.ok || !revisionValid) {
    return { ok: false, fields };
  }
  return {
    ok: true,
    value: {
      revision: payload.revision as number,
      ...policy.value,
    },
  };
}

export function evaluateRpcAccessPolicy(options: {
  policy: RpcAccessPolicy;
  method: string;
  origin: string | null;
  clientAddress: string | null;
}): RpcAccessPolicyDecision {
  if (
    options.policy.allowedMethods.length > 0 &&
    !options.policy.allowedMethods.includes(options.method)
  ) {
    return {
      allowed: false,
      code: "rpc_method_not_allowed",
      detail: "The RPC method is not enabled for this service.",
    };
  }

  if (options.policy.allowedOrigins.length > 0) {
    const origin = normalizeRpcRequestOrigin(options.origin);
    if (!origin || !options.policy.allowedOrigins.includes(origin)) {
      return {
        allowed: false,
        code: "rpc_origin_not_allowed",
        detail:
          "The request Origin is missing or is not enabled for this service.",
      };
    }
  }

  if (
    options.policy.allowedIpCidrs.length > 0 &&
    !ipAddressMatchesAnyCidr(
      options.clientAddress,
      options.policy.allowedIpCidrs,
    )
  ) {
    return {
      allowed: false,
      code: "rpc_ip_not_allowed",
      detail:
        "The request address is not enabled for this service.",
    };
  }

  return { allowed: true };
}

export function applyRpcAccessPolicyToCalls(options: {
  calls: RpcAccessPolicyCall[];
  policy: RpcAccessPolicy;
  origin: string | null;
  clientAddress: string | null;
}): void {
  const transportDecision = evaluateRpcAccessPolicy({
    policy: {
      ...options.policy,
      allowedMethods: [],
    },
    method: "rpc_transport_check",
    origin: options.origin,
    clientAddress: options.clientAddress,
  });
  if (!transportDecision.allowed) {
    for (const call of options.calls) {
      denyRpcAccessPolicyCall(
        call,
        transportDecision.code,
        transportDecision.detail,
      );
    }
    return;
  }

  const methodPolicy: RpcAccessPolicy = {
    allowedOrigins: [],
    allowedIpCidrs: [],
    allowedMethods: options.policy.allowedMethods,
  };
  for (const call of options.calls) {
    if (call.blocked) continue;
    const decision = evaluateRpcAccessPolicy({
      policy: methodPolicy,
      method: call.method,
      origin: null,
      clientAddress: null,
    });
    if (!decision.allowed) {
      denyRpcAccessPolicyCall(call, decision.code, decision.detail);
    }
  }
}

function denyRpcAccessPolicyCall(
  call: RpcAccessPolicyCall,
  code: RpcAccessPolicyDenialCode,
  detail: string,
): void {
  call.blocked = true;
  call.policyError = {
    jsonRpcCode: -32003,
    message: "RPC access denied",
    data: { code, detail },
  };
}

export function ipAddressMatchesAnyCidr(
  address: string | null,
  cidrs: string[],
): boolean {
  if (!address) return false;
  const parsedAddress = parseIpAddress(address);
  if (!parsedAddress) return false;

  return cidrs.some((cidr) => {
    const parsedCidr = parseIpCidr(cidr);
    if (!parsedCidr || parsedCidr.family !== parsedAddress.family) {
      return false;
    }
    const totalBits = parsedCidr.family === 4 ? 32 : 128;
    const hostBits = BigInt(totalBits - parsedCidr.prefixLength);
    return (
      parsedAddress.value >> hostBits ===
      parsedCidr.value >> hostBits
    );
  });
}

function normalizeOrigins(
  value: unknown,
  fields: Record<string, string>,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    fields.allowedOrigins = "Send an array of exact HTTPS origins.";
    return [];
  }
  if (value.length > MAX_ALLOWED_ORIGINS) {
    fields.allowedOrigins = `Use at most ${MAX_ALLOWED_ORIGINS} origins.`;
    return [];
  }

  const normalized = value.map(normalizeConfiguredOrigin);
  if (normalized.some((origin) => origin === null)) {
    fields.allowedOrigins =
      "Use exact HTTPS origins without paths, credentials, wildcards, queries, or fragments.";
    return [];
  }
  const unique = [...new Set(normalized as string[])];
  if (unique.length !== value.length) {
    fields.allowedOrigins = "Remove duplicate origins.";
    return [];
  }
  return unique.sort();
}

function normalizeIpCidrs(
  value: unknown,
  fields: Record<string, string>,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    fields.allowedIpCidrs =
      "Send an array of IPv4 or IPv6 addresses and CIDR ranges.";
    return [];
  }
  if (value.length > MAX_ALLOWED_IP_CIDRS) {
    fields.allowedIpCidrs =
      `Use at most ${MAX_ALLOWED_IP_CIDRS} address ranges.`;
    return [];
  }
  if (
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        entry !== entry.trim() ||
        !parseIpCidr(entry),
    )
  ) {
    fields.allowedIpCidrs =
      "Use valid IPv4 or IPv6 addresses and CIDR ranges.";
    return [];
  }
  const unique = [...new Set(value as string[])];
  if (unique.length !== value.length) {
    fields.allowedIpCidrs = "Remove duplicate address ranges.";
    return [];
  }
  return unique.sort();
}

function normalizeMethods(
  value: unknown,
  fields: Record<string, string>,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    fields.allowedMethods = "Send an array of exact RPC method names.";
    return [];
  }
  if (value.length > MAX_ALLOWED_METHODS) {
    fields.allowedMethods =
      `Use at most ${MAX_ALLOWED_METHODS} RPC methods.`;
    return [];
  }
  if (
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        entry !== entry.trim() ||
        entry.length < 1 ||
        entry.length > MAX_METHOD_LENGTH ||
        !METHOD_PATTERN.test(entry),
    )
  ) {
    fields.allowedMethods =
      "Use exact RPC method names with letters, numbers, dots, colons, underscores, or hyphens.";
    return [];
  }
  const unique = [...new Set(value as string[])];
  if (unique.length !== value.length) {
    fields.allowedMethods = "Remove duplicate RPC methods.";
    return [];
  }
  return unique.sort();
}

function normalizeConfiguredOrigin(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > MAX_ORIGIN_LENGTH ||
    value.includes("*")
  ) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.origin !== value
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeRpcRequestOrigin(
  value: string | null,
): string | null {
  if (!value || value.length > MAX_ORIGIN_LENGTH) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function parseIpCidr(value: string): ParsedIpCidr | null {
  const parts = value.split("/");
  if (parts.length > 2) return null;
  const address = parseIpAddress(parts[0]);
  if (!address) return null;
  const maximumPrefix = address.family === 4 ? 32 : 128;
  const prefixLength =
    parts.length === 1
      ? maximumPrefix
      : parsePrefixLength(parts[1], maximumPrefix);
  return prefixLength === null
    ? null
    : { ...address, prefixLength };
}

function parsePrefixLength(
  value: string,
  maximum: number,
): number | null {
  if (!/^(?:0|[1-9][0-9]{0,2})$/.test(value)) return null;
  const parsed = Number(value);
  return parsed <= maximum ? parsed : null;
}

function parseIpAddress(value: string): ParsedIpAddress | null {
  const ipv4 = parseIpv4(value);
  if (ipv4 !== null) return { family: 4, value: ipv4 };

  const mappedIpv4 = /^::[Ff]{4}:(.+)$/.exec(value)?.[1];
  if (mappedIpv4) {
    const parsedMappedIpv4 = parseIpv4(mappedIpv4);
    if (parsedMappedIpv4 !== null) {
      return { family: 4, value: parsedMappedIpv4 };
    }
  }

  const ipv6 = parseIpv6(value);
  return ipv6 === null ? null : { family: 6, value: ipv6 };
}

function parseIpv4(value: string): bigint | null {
  const components = value.split(".");
  if (
    components.length !== 4 ||
    components.some((component) => !IPV4_COMPONENT_PATTERN.test(component))
  ) {
    return null;
  }
  let result = 0n;
  for (const component of components) {
    const parsed = Number(component);
    if (parsed > 255) return null;
    result = (result << 8n) | BigInt(parsed);
  }
  return result;
}

function parseIpv6(value: string): bigint | null {
  if (
    !value ||
    value.includes("%") ||
    value.includes(".") ||
    value.split("::").length > 2
  ) {
    return null;
  }
  const hasCompression = value.includes("::");
  const [leftRaw, rightRaw = ""] = value.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if (
    left.some((component) => !IPV6_COMPONENT_PATTERN.test(component)) ||
    right.some((component) => !IPV6_COMPONENT_PATTERN.test(component))
  ) {
    return null;
  }
  const explicitComponents = left.length + right.length;
  if (
    (!hasCompression && explicitComponents !== 8) ||
    (hasCompression && explicitComponents >= 8)
  ) {
    return null;
  }
  const components = hasCompression
    ? [
        ...left,
        ...Array.from(
          { length: 8 - explicitComponents },
          () => "0",
        ),
        ...right,
      ]
    : left;
  let result = 0n;
  for (const component of components) {
    result = (result << 16n) | BigInt(`0x${component}`);
  }
  return result;
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
