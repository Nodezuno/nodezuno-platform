import {
  allValuesAreDistinct,
  normalizedRuntimeSecret,
  runtimeEnvironmentValue,
} from "./runtime-config.ts";

export const GRPC_HEALTH_SERVICE =
  "nodezuno.ethereum.v1.EthereumProxy";
export const GRPC_HEALTH_TIMEOUT_MS = 3_000;
export const GRPC_HEALTH_MAX_RESPONSE_BYTES = 1_024;

export type GrpcRuntimeConfiguration = {
  endpoint: string | null;
  authenticationConfigured: boolean;
  configurationValid: boolean;
};

export type GrpcProvisioningSnapshot = {
  available: boolean;
  endpoint: string | null;
};

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type ProvisioningCacheEntry = {
  expiresAt: number;
  snapshot: GrpcProvisioningSnapshot;
};

let provisioningCache: ProvisioningCacheEntry | null = null;

export async function loadGrpcRuntimeConfiguration(): Promise<GrpcRuntimeConfiguration> {
  const [
    endpointValue,
    grpcSecretValue,
    rateLimitSecretValue,
    apiKeyPepperValue,
    betterAuthSecretValue,
    originSecretValue,
  ] = await Promise.all([
    runtimeEnvironmentValue("NODEZUNO_GRPC_PUBLIC_ENDPOINT"),
    runtimeEnvironmentValue("NODEZUNO_GRPC_AUTH_SECRET"),
    runtimeEnvironmentValue("RATE_LIMIT_SECRET"),
    runtimeEnvironmentValue("API_KEY_PEPPER"),
    runtimeEnvironmentValue("BETTER_AUTH_SECRET"),
    runtimeEnvironmentValue("NODEZUNO_ORIGIN_SECRET"),
  ]);
  const endpoint = normalizeGrpcPublicEndpoint(endpointValue);
  const grpcSecret = normalizeGrpcControlPlaneSecret(grpcSecretValue);
  const otherSecrets = [
    normalizedRuntimeSecret(rateLimitSecretValue),
    normalizedRuntimeSecret(apiKeyPepperValue),
    normalizedRuntimeSecret(betterAuthSecretValue),
    normalizedRuntimeSecret(originSecretValue),
  ].filter((value): value is string => value !== null);
  const authenticationConfigured =
    grpcSecret !== null &&
    allValuesAreDistinct([grpcSecret, ...otherSecrets]);

  return {
    endpoint,
    authenticationConfigured,
    configurationValid:
      endpoint !== null && authenticationConfigured,
  };
}

export async function grpcProvisioningSnapshot(options: {
  fetcher?: Fetcher;
  now?: number;
  bypassCache?: boolean;
} = {}): Promise<GrpcProvisioningSnapshot> {
  const now = options.now ?? Date.now();
  if (
    !options.bypassCache &&
    provisioningCache &&
    provisioningCache.expiresAt > now
  ) {
    return provisioningCache.snapshot;
  }

  const configuration = await loadGrpcRuntimeConfiguration();
  if (!configuration.configurationValid || !configuration.endpoint) {
    return cacheProvisioning(
      { available: false, endpoint: null },
      now,
      5_000,
    );
  }

  const available = await verifyGrpcHealth({
    endpoint: configuration.endpoint,
    fetcher: options.fetcher,
  });
  return cacheProvisioning(
    {
      available,
      endpoint: available ? configuration.endpoint : null,
    },
    now,
    available ? 30_000 : 5_000,
  );
}

export function normalizeGrpcControlPlaneSecret(
  value: string | undefined,
): string | null {
  const secret = normalizedRuntimeSecret(value);
  return secret && /^[A-Za-z0-9._~-]{32,256}$/.test(secret)
    ? secret
    : null;
}

export function normalizeGrpcPublicEndpoint(
  value: string | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw || raw !== value || raw.length > 512) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (url.port !== "" && url.port !== "443") ||
      !hostname.includes(".") ||
      !/^[a-z0-9.-]+$/.test(hostname) ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
      hostname.startsWith(".") ||
      hostname.endsWith(".") ||
      hostname.includes("..") ||
      hostname === "localhost" ||
      /(?:^|\.)(?:local|internal|localhost|invalid|test|example|onion)$/.test(
        hostname,
      )
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export async function verifyGrpcHealth(options: {
  endpoint: string;
  fetcher?: Fetcher;
}): Promise<boolean> {
  const endpoint = normalizeGrpcPublicEndpoint(options.endpoint);
  if (!endpoint) return false;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("gRPC health deadline exceeded"),
    GRPC_HEALTH_TIMEOUT_MS,
  );
  try {
    const requestFrame = grpcHealthRequestFrame(GRPC_HEALTH_SERVICE);
    const requestBody = new ArrayBuffer(requestFrame.byteLength);
    new Uint8Array(requestBody).set(requestFrame);
    const response = await (options.fetcher ?? fetch)(
      `${endpoint}/grpc.health.v1.Health/Check`,
      {
        method: "POST",
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/grpc+proto",
          "Content-Type": "application/grpc+proto",
          "User-Agent": "Nodezuno-Control-Plane/1.0",
        },
        body: requestBody,
        signal: controller.signal,
      },
    );
    if (
      response.status !== 200 ||
      !isGrpcContentType(response.headers.get("content-type")) ||
      isRedirectStatus(response.status) ||
      !grpcStatusIsSuccessful(response.headers.get("grpc-status"))
    ) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    const body = await readBoundedResponseBody(
      response,
      GRPC_HEALTH_MAX_RESPONSE_BYTES,
    );
    return parseGrpcHealthServingResponse(body);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function grpcHealthRequestFrame(service: string): Uint8Array {
  const serviceBytes = new TextEncoder().encode(service);
  if (serviceBytes.byteLength > 127) {
    throw new TypeError("The gRPC health service name is too long.");
  }
  const payload = new Uint8Array(2 + serviceBytes.byteLength);
  payload[0] = 0x0a;
  payload[1] = serviceBytes.byteLength;
  payload.set(serviceBytes, 2);
  return frameGrpcMessage(payload);
}

export function parseGrpcHealthServingResponse(
  body: Uint8Array,
): boolean {
  if (body.byteLength < 7 || body[0] !== 0) return false;
  const view = new DataView(
    body.buffer,
    body.byteOffset,
    body.byteLength,
  );
  const payloadLength = view.getUint32(1, false);
  if (payloadLength !== body.byteLength - 5) return false;
  const payload = body.subarray(5);
  let offset = 0;
  let servingStatus: number | null = null;
  while (offset < payload.byteLength) {
    const key = readVarint(payload, offset);
    if (!key) return false;
    offset = key.nextOffset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 7;
    if (wireType === 0) {
      const value = readVarint(payload, offset);
      if (!value) return false;
      offset = value.nextOffset;
      if (fieldNumber === 1) servingStatus = value.value;
      continue;
    }
    if (wireType === 2) {
      const length = readVarint(payload, offset);
      if (
        !length ||
        length.value < 0 ||
        length.nextOffset + length.value > payload.byteLength
      ) {
        return false;
      }
      offset = length.nextOffset + length.value;
      continue;
    }
    return false;
  }
  return servingStatus === 1;
}

export function clearGrpcProvisioningCacheForTests(): void {
  provisioningCache = null;
}

function cacheProvisioning(
  snapshot: GrpcProvisioningSnapshot,
  now: number,
  ttlMs: number,
): GrpcProvisioningSnapshot {
  provisioningCache = { snapshot, expiresAt: now + ttlMs };
  return snapshot;
}

function frameGrpcMessage(payload: Uint8Array): Uint8Array {
  const framed = new Uint8Array(5 + payload.byteLength);
  new DataView(framed.buffer).setUint32(1, payload.byteLength, false);
  framed.set(payload, 5);
  return framed;
}

function readVarint(
  bytes: Uint8Array,
  startOffset: number,
): { value: number; nextOffset: number } | null {
  let value = 0;
  let shift = 0;
  for (
    let offset = startOffset;
    offset < bytes.byteLength && shift <= 28;
    offset += 1
  ) {
    const byte = bytes[offset];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value, nextOffset: offset + 1 };
    }
    shift += 7;
  }
  return null;
}

async function readBoundedResponseBody(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > maximumBytes)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("gRPC health response exceeds limit");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("gRPC health response exceeds limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function isGrpcContentType(value: string | null): boolean {
  return /^application\/grpc(?:\+proto)?(?:\s*;|$)/i.test(value ?? "");
}

function grpcStatusIsSuccessful(value: string | null): boolean {
  return value === null || value.trim() === "0";
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}
