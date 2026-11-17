import {
  allowsLocalUnverifiedEmailAuthentication,
  runtimeEnvironmentValue,
} from "./runtime-config.ts";

export const ETHEREUM_MAINNET_CHAIN_ID = 1 as const;
export const MINIMUM_PAYMENT_RPC_ENDPOINTS = 2 as const;
export const LATE_PAYMENT_CLAIM_GRACE_MS = 6 * 60 * 60 * 1000;
export const NODEZUNO_PAYMENT_RECIPIENT =
  "0x07218C8E2B01fbff950Af65A0f36D3305520aC3b" as const;
export const ETHEREUM_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

export const STABLECOIN_ASSETS = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
  },
  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
  },
} as const;

export type StablecoinAsset = keyof typeof STABLECOIN_ASSETS;
export type StablecoinPaymentMode =
  | "disabled"
  | "manual_ethereum"
  | "ethereum_mainnet";

export type EthereumRpcEndpoint = {
  name: string;
  provider: string;
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
};

export type StablecoinPaymentConfiguration = {
  mode: StablecoinPaymentMode;
  ready: boolean;
  legalLaunchApproved: boolean;
  localPreview: boolean;
  recipient: typeof NODEZUNO_PAYMENT_RECIPIENT;
  confirmationsRequired: number;
  endpoints: EthereumRpcEndpoint[];
};

export async function stablecoinPaymentConfiguration(): Promise<StablecoinPaymentConfiguration> {
  const [
    modeRaw,
    endpointsRaw,
    confirmationsRaw,
    legalApprovalRaw,
    localPreviewRaw,
    publicOriginRaw,
    authenticationOriginRaw,
  ] = await Promise.all([
    runtimeEnvironmentValue("NODEZUNO_STABLECOIN_PAYMENT_MODE"),
    runtimeEnvironmentValue("NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON"),
    runtimeEnvironmentValue("NODEZUNO_PAYMENT_CONFIRMATIONS"),
    runtimeEnvironmentValue("NODEZUNO_LEGAL_LAUNCH_APPROVED"),
    runtimeEnvironmentValue("NODEZUNO_LOCAL_PREVIEW"),
    runtimeEnvironmentValue("PUBLIC_ORIGIN"),
    runtimeEnvironmentValue("BETTER_AUTH_URL"),
  ]);
  const mode: StablecoinPaymentMode = modeRaw === "manual_ethereum"
    ? "manual_ethereum"
    : modeRaw === "ethereum_mainnet"
      ? "ethereum_mainnet"
      : "disabled";
  const endpoints = parseEthereumRpcEndpoints(endpointsRaw);
  const confirmationsRequired = parseConfirmations(confirmationsRaw);
  const legalLaunchApproved = legalApprovalRaw === "true";
  const localPreview = allowsLocalUnverifiedEmailAuthentication(
    publicOriginRaw ?? authenticationOriginRaw,
    localPreviewRaw,
  );
  return {
    mode,
    ready:
      mode === "disabled" ||
      ((legalLaunchApproved || localPreview) &&
        (mode === "manual_ethereum" ||
          (mode === "ethereum_mainnet" &&
            endpoints.length >= MINIMUM_PAYMENT_RPC_ENDPOINTS))),
    legalLaunchApproved,
    localPreview,
    recipient: NODEZUNO_PAYMENT_RECIPIENT,
    confirmationsRequired,
    endpoints,
  };
}

export function parseEthereumRpcEndpoints(
  raw: string | undefined,
): EthereumRpcEndpoint[] {
  if (!raw?.trim()) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return [];
  const endpoints: EthereumRpcEndpoint[] = [];
  const names = new Set<string>();
  const providers = new Set<string>();
  const hosts = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) return [];
    const keys = Object.keys(entry);
    if (keys.some((key) => !["name", "provider", "url", "headers", "timeoutMs"].includes(key))) {
      return [];
    }
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!/^[a-z][a-z0-9-]{2,39}$/.test(name) || names.has(name)) return [];
    const provider = typeof entry.provider === "string" ? entry.provider.trim() : "";
    if (!/^[a-z][a-z0-9-]{2,39}$/.test(provider) || providers.has(provider)) return [];
    const url = normalizedRpcUrl(entry.url);
    if (!url) return [];
    const host = new URL(url).host.toLowerCase();
    if (hosts.has(host)) return [];
    const headers = normalizedRpcHeaders(entry.headers);
    if (!headers) return [];
    const timeoutMs = entry.timeoutMs === undefined ? 8_000 : entry.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || (timeoutMs as number) < 2_000 || (timeoutMs as number) > 15_000) {
      return [];
    }
    names.add(name);
    providers.add(provider);
    hosts.add(host);
    endpoints.push({ name, provider, url, headers, timeoutMs: timeoutMs as number });
  }
  return endpoints;
}

function parseConfirmations(raw: string | undefined): number {
  if (!raw?.trim()) return 12;
  if (!/^\d{1,2}$/.test(raw.trim())) return 12;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 6 && value <= 64 ? value : 12;
}

function normalizedRpcUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.protocol === "https:") return parsed.toString();
    if (parsed.protocol !== "http:" || !isPrivateRpcHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function isPrivateRpcHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".internal")) return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  return octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

function normalizedRpcHeaders(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length > 8) return null;
  const headers: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.trim();
    if (
      !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(name) ||
      ["host", "cookie", "content-length", "transfer-encoding", "connection"].includes(name.toLowerCase()) ||
      typeof rawValue !== "string" ||
      rawValue.length < 1 ||
      rawValue.length > 2_048 ||
      /[\r\n]/.test(rawValue)
    ) {
      return null;
    }
    headers[name] = rawValue;
  }
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
