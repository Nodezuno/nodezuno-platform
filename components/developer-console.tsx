"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { GrpcQuickstart } from "@/components/grpc-quickstart";
import { AiOperationsPanel } from "@/components/ai-operations-panel";
import { RpcAccessPolicyPanel } from "@/components/rpc-access-policy-panel";
import { RpcGuardrailPanel } from "@/components/rpc-guardrail-panel";
import { RpcObservabilityPanel } from "@/components/rpc-observability-panel";
import { ServiceAutomationQuickstart } from "@/components/service-automation-quickstart";
import { WorkspaceAuditPanel } from "@/components/workspace-audit-panel";
import { WorkspaceTeamPanel } from "@/components/workspace-team-panel";
import {
  apiKeyRotationAttemptIdentity,
  apiKeyRotationBody,
  canRotateApiKeys,
  isApiKeyActiveAndUnexpired,
  isApiKeyRotationEligible,
} from "@/lib/client/api-key-rotation";
import {
  copyStatusMessage,
  resolveConsoleServiceReadiness,
} from "@/lib/client/console-reliability";
import {
  acquireDeveloperCreationAttempt,
  isCompleteDeveloperCreationEnvelope,
  settleDeveloperCreationAttempt,
  shouldRetainDeveloperCreationAttempt,
  type DeveloperCreationAttemptRegistry,
  type DeveloperCreationOperation,
} from "@/lib/client/control-plane-idempotency";
import {
  ethereumRpcProbeHttpMessage,
  readEthereumRpcQuota,
  type EthereumRpcQuotaSnapshot,
} from "@/lib/client/ethereum-rpc-probe";
import {
  grpcRecoveryKeyPayload,
  resolveRpcCredentialState,
  rpcRecoveryKeyPayload,
} from "@/lib/client/rpc-credential-recovery";
import {
  apiKeyMatchesUnboundPurpose,
  canCreateUnboundApiKey,
  defaultUnboundApiKeyName,
  isServiceAutomationApiKey,
  unboundApiKeyAccessBoundary,
  unboundApiKeyCreationPayload,
  unboundApiKeyPurposes,
  type UnboundApiKeyPurpose,
} from "@/lib/client/service-automation";
import {
  parseServiceRenameMutationEnvelope,
  serviceRenameDraftProblem,
  serviceRenameFailure,
  serviceRenameRequestBody,
  type DeveloperServiceSnapshot,
  type ServiceRenameDraft,
  type ServiceRenameFailureKind,
} from "@/lib/client/service-rename";
import { nativeGrpcDescriptor } from "@/lib/client/grpc-quickstart";
import {
  isSelfServiceRpcNetwork,
  normalizedRpcNetwork,
  rpcConsolePath,
  rpcNetworkDescriptor,
  rpcProbePayload,
  rpcRequestExamples,
  selfServiceRpcNetworks,
  verifyRpcProbe,
  type SelfServiceRpcNetwork,
} from "@/lib/client/rpc-networks";

type Workspace = {
  id: string;
  slug: string;
  name: string;
  status: "active";
  role: "owner" | "admin" | "developer";
  createdAt: string;
  updatedAt: string;
};

type ApiKey = {
  id: string;
  name: string;
  serviceId: string | null;
  prefix: string;
  lastFour: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

type SecretReceipt = {
  apiKey: ApiKey;
  secret: string;
};

type Service = DeveloperServiceSnapshot;

type ApiEnvelope<T> = {
  data: T;
  requestId: string;
};

type MutationState = "idle" | "submitting";
type CopyState = "idle" | "copied" | "error";
type DownloadState = "idle" | "downloaded" | "error";
type SecretReceiptSurface = "contextual" | "api-keys";
type RpcLaunchState =
  | "idle"
  | "workspace"
  | "service"
  | "key"
  | "refresh";
type RpcProbeState =
  | { status: "idle" }
  | { status: "pending"; contextKey: string }
  | {
      status: "success";
      contextKey: string;
      verificationLabel: string;
      verificationDetail: string;
      latencyMs: number;
      quota: EthereumRpcQuotaSnapshot | null;
    }
  | {
      status: "error";
      contextKey: string;
      message: string;
      latencyMs: number | null;
    };

const websiteCapabilities = [
  {
    title: "Workspace identity",
    endpoint: "GET /api/v1/platform/whoami",
    description: "Verify an API key and resolve its workspace identity and scopes.",
    href: "/developers/docs",
  },
  {
    title: "Platform health",
    endpoint: "GET /api/v1/health",
    description: "Durable storage and website application health.",
    href: "/api/v1/health",
  },
  {
    title: "Service status",
    endpoint: "GET /api/v1/status",
    description: "Published website service state and maintenance notices.",
    href: "/developers/status",
  },
  {
    title: "Chain directory",
    endpoint: "GET /api/v1/chains",
    description: "Curated network metadata with explicit planning maturity.",
    href: "/developers/chain-directory",
  },
  {
    title: "Gas estimate",
    endpoint: "POST /api/v1/gas-estimate",
    description: "Validated EVM fee planning with deterministic decimal output.",
    href: "/developers/gwei-calculator",
  },
  {
    title: "OpenAPI contract",
    endpoint: "GET /api/v1/openapi",
    description: "The machine-readable contract for every public website API.",
    href: "/api/v1/openapi",
  },
] as const;

const prelaunchProducts = [
  ["Nodezuno One", "/products/one", "Control plane"],
  ["Chain Launch Cloud", "/products/rollups", "Chain infrastructure"],
  ["NFT API", "/products/nft-api", "Data"],
  ["Webhooks", "/products/webhooks", "Events"],
  ["WebSockets", "/products/websockets", "Streaming"],
  ["Transfers API", "/products/transfers-api", "Data"],
  ["Token API", "/products/token-api", "Data"],
  ["Bundler API", "/products/bundler-api", "Smart accounts"],
  ["Gas Manager API", "/products/gas-manager-api", "Smart accounts"],
  ["Vault", "/products/vault", "Trust"],
  ["Atlas", "/products/atlas", "Data plane"],
] as const;

const serviceProducts = [
  { value: "platform-api", label: "Platform API", maturity: "Live" },
  { value: "one", label: "Nodezuno One", maturity: "Prelaunch" },
  { value: "rpc-api", label: "RPC API", maturity: "Multi-chain beta" },
  {
    value: "grpc-api",
    label: "Native gRPC",
    maturity: "Ethereum beta",
  },
  {
    value: "rollups",
    label: "Chain Launch Cloud",
    maturity: "Design partner",
  },
  { value: "nft-api", label: "NFT API", maturity: "Prelaunch" },
  { value: "webhooks", label: "Webhooks", maturity: "Prelaunch" },
  { value: "websockets", label: "WebSockets", maturity: "Prelaunch" },
  { value: "transfers-api", label: "Transfers API", maturity: "Prelaunch" },
  { value: "token-api", label: "Token API", maturity: "Prelaunch" },
  { value: "bundler-api", label: "Bundler API", maturity: "Prelaunch" },
  {
    value: "gas-manager-api",
    label: "Gas Manager API",
    maturity: "Prelaunch",
  },
  { value: "vault", label: "Vault", maturity: "Prelaunch" },
  { value: "atlas", label: "Atlas", maturity: "Prelaunch" },
] as const;

const serviceNetworks = [
  ["global", "Global"],
  ["ethereum", "Ethereum"],
  ["base", "Base"],
  ["arbitrum", "Arbitrum"],
  ["optimism", "Optimism"],
  ["polygon", "Polygon"],
  ["solana", "Solana"],
  ["multi-chain", "Multi-chain"],
  ["custom-rollup", "Custom rollup"],
] as const;

const chainLaunchStackNetworks = [
  ["op-stack", "OP Stack"],
  ["arbitrum-orbit", "Arbitrum Orbit"],
  ["avalanche-l1", "Avalanche L1"],
  ["polygon-cdk", "Polygon CDK"],
  ["cosmos-evm", "Cosmos EVM"],
  ["custom-chain", "Custom chain"],
  ["custom-rollup", "Custom rollup (legacy)"],
] as const;

type ChainLaunchStackNetwork =
  (typeof chainLaunchStackNetworks)[number][0];
type ServiceNetwork = Service["network"] | ChainLaunchStackNetwork;

const serviceRegions = [
  ["global", "Global"],
  ["us-east", "US East"],
  ["eu-west", "EU West"],
  ["ap-south", "AP South"],
] as const;

function normalizedPreferredProduct(value: string | null): Service["product"] {
  return (
    serviceProducts.find((product) => product.value === value)?.value ??
    "platform-api"
  );
}

function suggestedWorkspaceName(name: string, identifier: string): string {
  const emailDomain = /^[^@\s]+@([^@\s]+)$/.exec(identifier.trim())?.[1];
  const genericDomains = new Set([
    "gmail.com",
    "googlemail.com",
    "icloud.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "proton.me",
    "protonmail.com",
    "yahoo.com",
  ]);
  if (emailDomain && !genericDomains.has(emailDomain.toLowerCase())) {
    const company = emailDomain
      .split(".")[0]
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
      .trim();
    if (company.length >= 2) return `${company} workspace`.slice(0, 60);
  }

  const person = name.replace(/\s+/g, " ").trim();
  return `${person || "Developer"} workspace`.slice(0, 60);
}

function serviceProductLabel(value: Service["product"]): string {
  return (
    serviceProducts.find((product) => product.value === value)?.label ??
    value
  );
}

function absoluteServiceEndpoint(
  origin: string,
  endpointPath: string | null,
): string | null {
  const normalizedPath = endpointPath?.trim();
  if (!normalizedPath) return null;
  if (/^https?:\/\//i.test(normalizedPath)) {
    try {
      const endpoint = new URL(normalizedPath);
      if (
        !["http:", "https:"].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password
      ) {
        return null;
      }
      return normalizedPath;
    } catch {
      return null;
    }
  }
  const normalizedOrigin = origin.replace(/\/+$/, "");
  return normalizedPath.startsWith("/")
    ? `${normalizedOrigin}${normalizedPath}`
    : `${normalizedOrigin}/${normalizedPath}`;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

function serviceTelemetryValues(service: Service) {
  const telemetry = service.telemetry;
  if (!telemetry) return null;

  const requestCount = finiteNonNegative(telemetry.requests);
  const callCount = finiteNonNegative(telemetry.calls);
  const errorCount = finiteNonNegative(telemetry.errors);
  const upstreamFailureCount = finiteNonNegative(
    telemetry.upstreamFailures,
  );
  const errorRatePercent =
    callCount !== null && callCount > 0 && errorCount !== null
      ? (errorCount / callCount) * 100
      : callCount === 0 && errorCount === 0
        ? 0
        : null;
  const averageLatencyMs = finiteNonNegative(telemetry.averageLatencyMs);

  if (
    requestCount === null &&
    callCount === null &&
    errorRatePercent === null &&
    averageLatencyMs === null &&
    upstreamFailureCount === null
  ) {
    return null;
  }

  return {
    requestCount,
    callCount,
    errorRatePercent,
    averageLatencyMs,
    upstreamFailureCount,
    measuredAt: telemetry.updatedAt,
    windowStartedAt: telemetry.windowStartedAt,
  };
}

function rpcRequiredScope(service: Service): string {
  const authentication = service.configuration.authentication;
  if (!authentication || typeof authentication !== "object") {
    return "rpc:invoke";
  }
  const requiredScope = (authentication as Record<string, unknown>)
    .requiredScope;
  return typeof requiredScope === "string" && requiredScope.trim()
    ? requiredScope.trim()
    : "rpc:invoke";
}

function rpcMethodCatalog(service: Service): string[] {
  const catalog = service.configuration.methodCatalog;
  if (!Array.isArray(catalog)) return [];
  return [
    ...new Set(
      catalog.filter(
        (value): value is string =>
          typeof value === "string" &&
          /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(value),
      ),
    ),
  ].sort();
}

function restoreActionFocus(id: string): void {
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.focus();
  });
}

function restoreServiceActionFocus(serviceId: string): void {
  window.requestAnimationFrame(() => {
    const serviceAction = document.getElementById(
      `rename-service-${serviceId}`,
    );
    const fallback = document.getElementById("services-list-title");
    (serviceAction ?? fallback)?.focus();
  });
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMetric(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits,
  }).format(value);
}

function problemMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const candidate = payload as Record<string, unknown>;
  if (candidate.code === "api_key_secret_already_issued") {
    return "This request already completed, but its one-time secret cannot be shown again. Refresh the key list. If you did not save the secret, revoke the replacement key and create or rotate to another replacement.";
  }
  if (candidate.code === "api_key_rotation_source_inactive") {
    return "The source key is already revoked or expired, so it cannot be rotated. Refresh key metadata and choose another active, unexpired key.";
  }
  for (const key of ["detail", "message", "title", "error"]) {
    if (typeof candidate[key] === "string" && candidate[key].trim()) {
      return candidate[key].trim();
    }
  }
  return fallback;
}

async function readEnvelope<T>(
  response: Response,
  fallback: string,
): Promise<ApiEnvelope<T>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(fallback);
  }
  if (response.status === 401) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(
      `/login?return_to=${encodeURIComponent(returnTo)}`,
    );
    throw new Error("Your session expired. Sign in to continue.");
  }
  if (!response.ok) {
    throw new Error(problemMessage(payload, fallback));
  }
  return payload as ApiEnvelope<T>;
}

async function postControlPlane<T>(
  path: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<ApiEnvelope<T>> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readEnvelope<T>(response, fallback);
}

class IdempotentControlPlaneError extends Error {
  readonly retryIdentityRetained: boolean;

  constructor(message: string, retryIdentityRetained: boolean) {
    super(message);
    this.name = "IdempotentControlPlaneError";
    this.retryIdentityRetained = retryIdentityRetained;
  }
}

async function postIdempotentControlPlane<T>(
  registry: DeveloperCreationAttemptRegistry,
  slot: string,
  operation: DeveloperCreationOperation,
  path: string,
  body: Record<string, unknown>,
  fallback: string,
  attemptIdentity: Record<string, unknown> = body,
): Promise<ApiEnvelope<T>> {
  const attempt = acquireDeveloperCreationAttempt(
    registry,
    slot,
    operation,
    attemptIdentity,
  );
  let response: Response | null = null;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": attempt.key,
      },
      body: JSON.stringify(body),
    });
    const envelope = await readEnvelope<T>(response, fallback);
    if (!isCompleteDeveloperCreationEnvelope(envelope, operation)) {
      throw new Error(
        `${fallback} The server returned an incomplete creation receipt.`,
      );
    }
    settleDeveloperCreationAttempt(
      registry,
      slot,
      attempt.key,
      false,
    );
    return envelope;
  } catch (error) {
    const retainForRetry =
      shouldRetainDeveloperCreationAttempt(response);
    settleDeveloperCreationAttempt(
      registry,
      slot,
      attempt.key,
      retainForRetry,
    );
    throw new IdempotentControlPlaneError(
      error instanceof Error ? error.message : fallback,
      retainForRetry,
    );
  }
}

async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

function subscribeToBrowserOrigin() {
  return () => undefined;
}

function browserOriginSnapshot() {
  return window.location.origin;
}

function serverOriginSnapshot() {
  return "$NODEZUNO_ORIGIN";
}

export function DeveloperConsole({
  authMethod,
  identifier,
  name,
  preferredNetwork,
  preferredProduct,
  signOutPath,
}: {
  authMethod: "email" | "google" | "evm" | "solana" | "chatgpt";
  identifier: string;
  name: string;
  preferredNetwork: SelfServiceRpcNetwork | null;
  preferredProduct: string | null;
  signOutPath: string | null;
}) {
  const preferredServiceProduct =
    normalizedPreferredProduct(preferredProduct);
  const rpcIntent = preferredServiceProduct === "rpc-api";
  const grpcIntent = preferredServiceProduct === "grpc-api";
  const chainLaunchIntent = preferredServiceProduct === "rollups";
  const selectedRpcNetwork = normalizedRpcNetwork(preferredNetwork);
  const selectedRpcDescriptor = rpcNetworkDescriptor(selectedRpcNetwork);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const browserOrigin = useSyncExternalStore(
    subscribeToBrowserOrigin,
    browserOriginSnapshot,
    serverOriginSnapshot,
  );
  const [workspaceName, setWorkspaceName] = useState(() =>
    suggestedWorkspaceName(name, identifier),
  );
  const [keyName, setKeyName] = useState("Platform identity");
  const [keyPurpose, setKeyPurpose] =
    useState<UnboundApiKeyPurpose>("platform-identity");
  const [serviceName, setServiceName] = useState(
    rpcIntent
      ? selectedRpcDescriptor.serviceName
      : grpcIntent
        ? "Ethereum native gRPC"
        : chainLaunchIntent
          ? "Chain launch project"
          : "Primary",
  );
  const [serviceProduct, setServiceProduct] = useState<Service["product"]>(
    preferredServiceProduct,
  );
  const [serviceEnvironment, setServiceEnvironment] =
    useState<Service["environment"]>("development");
  const [serviceNetwork, setServiceNetwork] =
    useState<ServiceNetwork>(
      rpcIntent
        ? selectedRpcNetwork
        : grpcIntent
          ? "ethereum"
          : chainLaunchIntent
            ? "op-stack"
            : "global",
    );
  const [serviceRegion, setServiceRegion] =
    useState<Service["region"]>("global");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshState, setRefreshState] =
    useState<MutationState>("idle");
  const [lastRefreshedAt, setLastRefreshedAt] =
    useState<string | null>(null);
  const [keyStatusNow, setKeyStatusNow] = useState(() => Date.now());
  const [workspaceState, setWorkspaceState] =
    useState<MutationState>("idle");
  const [keyState, setKeyState] = useState<MutationState>("idle");
  const [serviceState, setServiceState] =
    useState<MutationState>("idle");
  const [archivingServiceId, setArchivingServiceId] =
    useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] =
    useState<string | null>(null);
  const [serviceRenameDraft, setServiceRenameDraft] =
    useState<ServiceRenameDraft | null>(null);
  const [serviceRenameState, setServiceRenameState] =
    useState<MutationState>("idle");
  const [serviceRenameReloadState, setServiceRenameReloadState] =
    useState<MutationState>("idle");
  const [serviceRenameError, setServiceRenameError] = useState("");
  const [serviceRenameFailureKind, setServiceRenameFailureKind] =
    useState<ServiceRenameFailureKind | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [confirmRotateId, setConfirmRotateId] = useState<string | null>(null);
  const [rotationName, setRotationName] = useState("");
  const [rotationError, setRotationError] = useState("");
  const [locallyRotatedSourceIds, setLocallyRotatedSourceIds] =
    useState<Set<string>>(() => new Set());
  const [secretReceipt, setSecretReceipt] =
    useState<SecretReceipt | null>(null);
  const [secretReceiptSurface, setSecretReceiptSurface] =
    useState<SecretReceiptSurface>("contextual");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [downloadState, setDownloadState] =
    useState<DownloadState>("idle");
  const [rpcCopyState, setRpcCopyState] = useState<
    Record<string, CopyState>
  >({});
  const [rpcEndpointCopyState, setRpcEndpointCopyState] = useState<
    Record<string, CopyState>
  >({});
  const [rpcLaunchState, setRpcLaunchState] =
    useState<RpcLaunchState>("idle");
  const [rpcLaunchError, setRpcLaunchError] = useState("");
  const [grpcLaunchState, setGrpcLaunchState] =
    useState<RpcLaunchState>("idle");
  const [grpcLaunchError, setGrpcLaunchError] = useState("");
  const [confirmedRpcRecoveryContext, setConfirmedRpcRecoveryContext] =
    useState<string | null>(null);
  const [rpcProbeState, setRpcProbeState] =
    useState<RpcProbeState>({ status: "idle" });
  const rpcProbeAbortController = useRef<AbortController | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const focusedSecretIdRef = useRef<string | null>(null);
  const developerCreationAttemptsRef =
    useRef<DeveloperCreationAttemptRegistry>(new Map());

  async function signOut() {
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error("Your session could not be revoked.");
      }
      window.location.assign("/");
    } catch (caught) {
      setNotice({
        tone: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "Your session could not be revoked.",
      });
    }
  }

  function dismissNotice() {
    setNotice(null);
    restoreActionFocus("developer-console-title");
  }

  const loadConsole = useCallback(
    async (preserveExisting = false): Promise<string | null> => {
    if (!preserveExisting) setLoadError("");
    try {
      const workspaceResponse = await fetch("/api/v1/developer/workspace", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const workspaceEnvelope = await readEnvelope<{
        workspace: Workspace | null;
      }>(workspaceResponse, "We could not load your workspace.");
      const nextWorkspace = workspaceEnvelope.data.workspace;
      setWorkspace(nextWorkspace);

      if (!nextWorkspace) {
        setApiKeys([]);
        setServices([]);
        setLocallyRotatedSourceIds(new Set());
        setKeyStatusNow(Date.now());
        setLastRefreshedAt(new Date().toISOString());
        return null;
      }

      const [keysResponse, servicesResponse] = await Promise.all([
        fetch("/api/v1/developer/api-keys", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
        fetch("/api/v1/developer/services", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
      ]);
      const keysEnvelope = await readEnvelope<{ apiKeys: ApiKey[] }>(
        keysResponse,
        "We could not load your API keys.",
      );
      const servicesEnvelope = await readEnvelope<{ services: Service[] }>(
        servicesResponse,
        "We could not load your services.",
      );
      setApiKeys(keysEnvelope.data.apiKeys);
      setServices(servicesEnvelope.data.services);
      setLocallyRotatedSourceIds(new Set());
      setKeyStatusNow(Date.now());
      setLastRefreshedAt(new Date().toISOString());
      return null;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We could not load the developer console.";
      if (!preserveExisting) setLoadError(message);
      return message;
    } finally {
      if (!preserveExisting) setLoading(false);
    }
  },
  [],
  );

  async function retryConsoleLoad() {
    setLoading(true);
    setLoadError("");
    const error = await loadConsole();
    const targetId = error
      ? "console-retry-button"
      : rpcIntent
        ? "rpc-launch-title"
        : grpcIntent
          ? "grpc-launch-title"
          : "workspace-title";
    restoreActionFocus(targetId);
  }

  useEffect(() => {
    const task = window.setTimeout(() => {
      void loadConsole();
    }, 0);
    return () => window.clearTimeout(task);
  }, [loadConsole]);

  const activeKeys = useMemo(
    () =>
      apiKeys.filter(
        (apiKey) =>
          !locallyRotatedSourceIds.has(apiKey.id) &&
          isApiKeyActiveAndUnexpired(apiKey, keyStatusNow),
      ),
    [apiKeys, keyStatusNow, locallyRotatedSourceIds],
  );
  const canCreateAdvancedKey =
    canCreateUnboundApiKey(workspace?.role);
  const legacyRpcKeys = useMemo(
    () => {
      const rpcServiceIds = new Set(
        services
          .filter((service) => service.product === "rpc-api")
          .map((service) => service.id),
      );
      return activeKeys.filter(
        (apiKey) =>
          !apiKey.scopes.includes("rpc:invoke") &&
          apiKey.serviceId !== null &&
          rpcServiceIds.has(apiKey.serviceId),
      );
    },
    [activeKeys, services],
  );
  const callableServices = useMemo(
    () =>
      services.filter(
        (service) => {
          if (service.product === "grpc-api") {
            return Boolean(nativeGrpcDescriptor(service));
          }
          return (
            resolveConsoleServiceReadiness(
              service.status,
              absoluteServiceEndpoint(browserOrigin, service.endpointPath),
            ) === "callable"
          );
        },
      ),
    [browserOrigin, services],
  );
  const selectedRpcService = useMemo(() => {
    const selectedNetwork =
      normalizedRpcNetwork(preferredNetwork);
    const candidates = services.filter(
      (service) =>
        service.product === "rpc-api" &&
        service.network === selectedNetwork,
    );
    return (
      candidates.find(
        (service) =>
          service.status === "active" &&
          Boolean(
            absoluteServiceEndpoint(
              browserOrigin,
              service.endpointPath,
            ),
          ),
      ) ??
      candidates.find((service) => service.status === "active") ??
      candidates[0] ??
      null
    );
  }, [browserOrigin, preferredNetwork, services]);
  const activeRpcKey = useMemo(
    () =>
      selectedRpcService
        ? activeKeys.find(
            (apiKey) =>
              apiKey.scopes.includes("rpc:invoke") &&
              apiKey.serviceId === selectedRpcService.id,
          ) ?? null
        : null,
    [activeKeys, selectedRpcService],
  );
  const ethereumGrpcService = useMemo(() => {
    const candidates = services.filter(
      (service) =>
        service.product === "grpc-api" &&
        service.network === "ethereum",
    );
    return (
      candidates.find((service) =>
        Boolean(nativeGrpcDescriptor(service)),
      ) ??
      candidates.find(
        (service) =>
          service.status === "active" && Boolean(service.endpointPath),
      ) ??
      candidates.find((service) => service.status === "active") ??
      candidates[0] ??
      null
    );
  }, [services]);
  const activeGrpcKey = useMemo(
    () =>
      ethereumGrpcService
        ? activeKeys.find(
            (apiKey) =>
              apiKey.scopes.includes("grpc:invoke") &&
              apiKey.serviceId === ethereumGrpcService.id,
          ) ?? null
        : null,
    [activeKeys, ethereumGrpcService],
  );
  const grpcCredential =
    secretReceiptSurface === "contextual" &&
    secretReceipt &&
    ethereumGrpcService &&
    activeKeys.some(
      (apiKey) =>
        apiKey.id === secretReceipt.apiKey.id &&
        apiKey.scopes.includes("grpc:invoke") &&
        !apiKey.revokedAt &&
        apiKey.serviceId === ethereumGrpcService.id,
    )
      ? secretReceipt
      : null;
  const serviceNamesById = useMemo(
    () =>
      new Map(services.map((service) => [service.id, service.name])),
    [services],
  );
  const selectedRpcEndpoint = selectedRpcService
    ? absoluteServiceEndpoint(browserOrigin, selectedRpcService.endpointPath)
    : null;
  const selectedRpcReady =
    selectedRpcService?.status === "active" &&
    Boolean(selectedRpcEndpoint);
  const rpcProbeCredential =
    secretReceiptSurface === "contextual" &&
    secretReceipt &&
    selectedRpcService &&
    activeKeys.some(
      (apiKey) =>
        apiKey.id === secretReceipt.apiKey.id &&
        apiKey.scopes.includes("rpc:invoke") &&
        !apiKey.revokedAt &&
        apiKey.serviceId === selectedRpcService.id,
    )
      ? secretReceipt
      : null;
  const automationSecretReceipt =
    secretReceiptSurface === "api-keys" &&
    secretReceipt &&
    isServiceAutomationApiKey(secretReceipt.apiKey)
      ? secretReceipt
      : null;

  useEffect(() => {
    if (
      !secretReceipt ||
      focusedSecretIdRef.current === secretReceipt.apiKey.id
    ) {
      return;
    }
    focusedSecretIdRef.current = secretReceipt.apiKey.id;
    const targetId = secretReceiptSurface === "api-keys"
      ? "api-one-time-secret-title"
      : rpcProbeCredential
      ? "rpc-one-time-secret-title"
      : grpcCredential
        ? "grpc-one-time-secret-title"
        : "api-one-time-secret-title";
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    grpcCredential,
    rpcProbeCredential,
    secretReceipt,
    secretReceiptSurface,
  ]);

  const rpcCredentialState = resolveRpcCredentialState({
    activeKeyExists: Boolean(activeRpcKey),
    gatewayReady: selectedRpcReady,
    rawSecretAvailable: Boolean(rpcProbeCredential),
  });
  const rpcSetupReady = rpcCredentialState !== "setup-incomplete";
  const rpcFirstRequestReady =
    rpcCredentialState === "credential-in-tab";
  const rpcSavedKeyRequired =
    rpcCredentialState === "saved-key-required";
  const rpcRecoveryContextKey =
    rpcSavedKeyRequired && selectedRpcService && activeRpcKey
      ? `${selectedRpcService.id}:${activeRpcKey.id}`
      : null;
  const confirmRpcRecovery =
    rpcRecoveryContextKey !== null &&
    confirmedRpcRecoveryContext === rpcRecoveryContextKey;
  const rpcProbeContextKey =
    selectedRpcService && selectedRpcEndpoint && rpcProbeCredential
      ? `${selectedRpcNetwork}:${selectedRpcService.id}:${rpcProbeCredential.apiKey.id}:${selectedRpcEndpoint}`
      : null;
  const rpcProbeReady =
    selectedRpcReady &&
    Boolean(selectedRpcEndpoint) &&
    Boolean(rpcProbeCredential);
  const selectedRpcExamples = selectedRpcEndpoint
    ? rpcRequestExamples(selectedRpcNetwork, selectedRpcEndpoint)
    : [];
  const currentRpcProbeState: RpcProbeState =
    rpcProbeContextKey &&
    rpcProbeState.status !== "idle" &&
    rpcProbeState.contextKey === rpcProbeContextKey
      ? rpcProbeState
      : { status: "idle" };
  const rpcLaunchBusy = rpcLaunchState !== "idle";
  const grpcLaunchBusy = grpcLaunchState !== "idle";
  const rpcLaunchActionLabel =
    rpcLaunchState === "workspace"
      ? "Creating workspace..."
      : rpcLaunchState === "service"
        ? `Creating ${selectedRpcDescriptor.label} gateway...`
        : rpcLaunchState === "key"
          ? "Creating API key..."
          : !workspace
            ? "Create workspace, gateway, and key"
            : !selectedRpcService && !activeRpcKey
              ? "Create gateway and key"
              : !selectedRpcService
                ? `Create ${selectedRpcDescriptor.label} gateway`
                : !activeRpcKey
                  ? "Create API key"
                  : "RPC setup complete";
  const rpcCurrentStep = !workspace
    ? "workspace"
    : !selectedRpcService
      ? "gateway"
      : !activeRpcKey
        ? "key"
        : !selectedRpcReady
          ? "gateway"
          : "request";
  const supportedRpcSelected =
    serviceProduct === "rpc-api" &&
    isSelfServiceRpcNetwork(serviceNetwork);
  const grpcBuilderSelected = serviceProduct === "grpc-api";
  const chainLaunchBuilderSelected = serviceProduct === "rollups";
  const builderRpcDescriptor = supportedRpcSelected
    ? rpcNetworkDescriptor(serviceNetwork)
    : null;

  useEffect(() => {
    if (
      rpcProbeState.status === "pending" &&
      rpcProbeState.contextKey !== rpcProbeContextKey
    ) {
      rpcProbeAbortController.current?.abort();
      rpcProbeAbortController.current = null;
    }
  }, [rpcProbeContextKey, rpcProbeState]);

  useEffect(
    () => () => {
      rpcProbeAbortController.current?.abort();
    },
    [],
  );

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceState("submitting");
    setNotice(null);
    try {
      const envelope = await postControlPlane<{
        workspace: Workspace;
        created: boolean;
      }>(
        "/api/v1/developer/workspace",
        { name: workspaceName.trim() },
        "We could not create your workspace.",
      );
      setWorkspace(envelope.data.workspace);
      setApiKeys([]);
      setServices([]);
      setNotice({
        tone: "success",
        message: envelope.data.created
          ? "Workspace created. You can create your first API key now."
          : "Your existing workspace is ready.",
      });
      restoreActionFocus("workspace-summary-title");
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not create your workspace.",
      });
    } finally {
      setWorkspaceState("idle");
    }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setServiceState("submitting");
    setNotice(null);
    try {
      const envelope = await postIdempotentControlPlane<{
        service: Service;
      }>(
        developerCreationAttemptsRef.current,
        "service-form",
        "service.create",
        "/api/v1/developer/services",
        {
          product: serviceProduct,
          name: serviceName.trim(),
          environment: serviceEnvironment,
          network:
            serviceProduct === "platform-api"
              ? "global"
              : serviceProduct === "grpc-api"
                ? "ethereum"
                : serviceNetwork,
          region:
            serviceProduct === "platform-api" ||
            serviceProduct === "grpc-api"
              ? "global"
              : serviceRegion,
        },
        "We could not create the service.",
      );
      setServices((current) => [
        envelope.data.service,
        ...current.filter((item) => item.id !== envelope.data.service.id),
      ]);
      setServiceName("");
      const createdService = envelope.data.service;
      const createdRpcNetwork =
        createdService.product === "rpc-api" &&
        isSelfServiceRpcNetwork(createdService.network)
          ? createdService.network
          : null;
      const rpcCreated = createdRpcNetwork !== null;
      const createdRpcDescriptor = createdRpcNetwork
        ? rpcNetworkDescriptor(createdRpcNetwork)
        : null;
      const createdEndpoint = absoluteServiceEndpoint(
        browserOrigin,
        createdService.endpointPath,
      );
      const createdReadiness = resolveConsoleServiceReadiness(
        createdService.status,
        createdEndpoint,
      );
      const activeRpcGateway =
        rpcCreated &&
        createdReadiness === "callable";
      setNotice({
        tone: "success",
        message: activeRpcGateway
          ? `Your ${createdRpcDescriptor?.label} RPC gateway is active. Use an active API key to call the endpoint.`
          : rpcCreated
            ? createdService.status === "active"
              ? `The ${createdRpcDescriptor?.label} RPC service reports active, but no endpoint was returned. Do not send traffic until an endpoint appears.`
              : `${createdRpcDescriptor?.label} RPC configuration is saved. The operator-managed upstream is not verified, so no live endpoint is available yet.`
            : createdService.product === "grpc-api"
              ? nativeGrpcDescriptor(createdService)
                ? "Your native Ethereum gRPC endpoint passed the control-plane contract checks. Use a service-bound key for grpcurl."
                : "Your native Ethereum gRPC configuration is saved. No endpoint is shown as callable until the control plane verifies the HTTP/2 gateway contract."
              : createdService.product === "rollups"
                ? "Your Chain Launch Cloud project brief is saved. It records the selected stack and requested infrastructure only. No nodes, RPC, explorer, indexing, monitoring, or snapshots were deployed."
              : createdReadiness === "callable"
                ? "Your platform API configuration is saved. Its returned endpoint is ready for an authorized request."
              : createdReadiness === "endpoint-missing"
                ? "The service record reports active, but no endpoint was returned. Do not send traffic until an endpoint appears."
                : `${serviceProductLabel(createdService.product)} setup saved. No product endpoint has been created.`,
      });
      restoreActionFocus(`service-record-${createdService.id}`);
    } catch (caught) {
      setNotice({
        tone: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "We could not create the service.",
      });
    } finally {
      setServiceState("idle");
    }
  }

  async function launchRpcSetup() {
    if (rpcLaunchBusy || rpcSetupReady) return;
    if (!workspace && workspaceName.trim().length < 2) {
      setRpcLaunchError("Enter a company or workspace name to continue.");
      return;
    }
    if (!activeRpcKey && secretReceipt) {
      setRpcLaunchError(
        "Save or dismiss the current one-time secret before creating another key.",
      );
      return;
    }

    setNotice(null);
    setRpcLaunchError("");
    let nextWorkspace = workspace;
    let nextService = selectedRpcService;
    let nextKey = activeRpcKey;

    try {
      if (!nextWorkspace) {
        setRpcLaunchState("workspace");
        const workspaceEnvelope = await postControlPlane<{
          workspace: Workspace;
          created: boolean;
        }>(
          "/api/v1/developer/workspace",
          { name: workspaceName.trim() },
          "We could not create your workspace.",
        );
        nextWorkspace = workspaceEnvelope.data.workspace;
        setWorkspace(nextWorkspace);
      }

      if (!nextService) {
        setRpcLaunchState("service");
        const serviceEnvelope = await postIdempotentControlPlane<{
          service: Service;
        }>(
          developerCreationAttemptsRef.current,
          "rpc-guided-service",
          "service.create",
          "/api/v1/developer/services",
          {
            product: "rpc-api",
            name: selectedRpcDescriptor.serviceName,
            environment: "development",
            network: selectedRpcNetwork,
            region: "global",
          },
          `We could not create your ${selectedRpcDescriptor.label} RPC service.`,
        );
        nextService = serviceEnvelope.data.service;
        setServices((current) => [
          serviceEnvelope.data.service,
          ...current.filter(
            (service) => service.id !== serviceEnvelope.data.service.id,
          ),
        ]);
      }

      if (!nextKey) {
        setRpcLaunchState("key");
        const keyEnvelope =
          await postIdempotentControlPlane<SecretReceipt>(
            developerCreationAttemptsRef.current,
            "rpc-guided-key",
            "api-key.create",
            "/api/v1/developer/api-keys",
            {
              name: selectedRpcDescriptor.quickstartKeyName,
              serviceId: nextService.id,
            },
            `We could not create your ${selectedRpcDescriptor.label} API key.`,
          );
        nextKey = keyEnvelope.data.apiKey;
        setSecretReceipt(keyEnvelope.data);
        setCopyState("idle");
        setApiKeys((current) => [
          keyEnvelope.data.apiKey,
          ...current.filter(
            (apiKey) => apiKey.id !== keyEnvelope.data.apiKey.id,
          ),
        ]);
      }

      const endpoint = absoluteServiceEndpoint(
        browserOrigin,
        nextService.endpointPath,
      );
      const ready =
        nextService.status === "active" && Boolean(endpoint) && Boolean(nextKey);
      setNotice({
        tone: "success",
        message: ready
          ? `Your ${selectedRpcDescriptor.label} RPC setup is ready. Save the one-time key, then copy your endpoint and first request.`
          : `Your workspace, ${selectedRpcDescriptor.label} service, and service-bound API key are saved. The gateway needs a verified operator-managed upstream before it can accept requests. No sales approval is required.`,
      });
    } catch (caught) {
      const reconciliationError = await loadConsole(true);
      const detail =
        caught instanceof Error
          ? caught.message
          : `We could not finish the ${selectedRpcDescriptor.label} RPC setup.`;
      setRpcLaunchError(
        reconciliationError
          ? `${detail} We also could not reconcile the latest resource state. Retry refresh before creating anything else.`
          : `${detail} Nodezuno reloaded your resource records so a safe retry reuses anything the server already saved.`,
      );
    } finally {
      setRpcLaunchState("idle");
    }
  }

  async function refreshRpcSetup() {
    if (rpcLaunchBusy) return;
    setRpcLaunchState("refresh");
    setRpcLaunchError("");
    const error = await loadConsole(true);
    if (error) {
      setRpcLaunchError(
        `The latest gateway status could not be loaded. ${error}`,
      );
    }
    setRpcLaunchState("idle");
    if (!error) restoreActionFocus("rpc-launch-ready-title");
  }

  function cancelRpcRecoveryConfirmation() {
    setConfirmedRpcRecoveryContext(null);
    restoreActionFocus("rpc-recovery-key-trigger");
  }

  function dismissOneTimeSecret(
    focusTargetId: string,
    abortRpcProbe = false,
  ) {
    if (abortRpcProbe) {
      rpcProbeAbortController.current?.abort();
      rpcProbeAbortController.current = null;
      setRpcProbeState({ status: "idle" });
    }
    setSecretReceipt(null);
    setSecretReceiptSurface("contextual");
    setCopyState("idle");
    setDownloadState("idle");
    restoreActionFocus(focusTargetId);
  }

  async function createRpcRecoveryKey() {
    if (
      rpcLaunchBusy ||
      !workspace ||
      !selectedRpcService ||
      !activeRpcKey ||
      !rpcSavedKeyRequired
    ) {
      return;
    }
    if (secretReceipt) {
      setRpcLaunchError(
        "Save or dismiss the current one-time secret before creating another key.",
      );
      return;
    }

    setRpcLaunchState("key");
    setRpcLaunchError("");
    setNotice(null);
    try {
      const keyEnvelope =
        await postIdempotentControlPlane<SecretReceipt>(
          developerCreationAttemptsRef.current,
          "rpc-recovery-key",
          "api-key.create",
          "/api/v1/developer/api-keys",
          rpcRecoveryKeyPayload(
            selectedRpcService.id,
            selectedRpcDescriptor.recoveryKeyName,
          ),
          `We could not create a new ${selectedRpcDescriptor.label} API key.`,
        );
      setSecretReceipt(keyEnvelope.data);
      setCopyState("idle");
      setRpcProbeState({ status: "idle" });
      setApiKeys((current) => [
        keyEnvelope.data.apiKey,
        ...current.filter(
          (apiKey) => apiKey.id !== keyEnvelope.data.apiKey.id,
        ),
      ]);
      setConfirmedRpcRecoveryContext(null);
      setNotice({
        tone: "success",
        message:
          "A new service-bound key was created. Existing keys remain active until you explicitly revoke them.",
      });
      window.requestAnimationFrame(() => {
        document.getElementById("rpc-one-time-secret-title")?.focus();
      });
    } catch (caught) {
      setRpcLaunchError(
        caught instanceof Error
          ? caught.message
          : `We could not create a new ${selectedRpcDescriptor.label} API key.`,
      );
    } finally {
      setRpcLaunchState("idle");
    }
  }

  async function launchNativeGrpcSetup() {
    if (grpcLaunchBusy) return;
    if (!workspace && workspaceName.trim().length < 2) {
      setGrpcLaunchError(
        "Enter a company or workspace name to continue.",
      );
      return;
    }
    if (!activeGrpcKey && secretReceipt) {
      setGrpcLaunchError(
        "Save or dismiss the current one-time secret before creating another key.",
      );
      return;
    }

    setNotice(null);
    setGrpcLaunchError("");
    let nextWorkspace = workspace;
    let nextService = ethereumGrpcService;
    let nextKey = activeGrpcKey;

    try {
      if (!nextWorkspace) {
        setGrpcLaunchState("workspace");
        const workspaceEnvelope = await postControlPlane<{
          workspace: Workspace;
          created: boolean;
        }>(
          "/api/v1/developer/workspace",
          { name: workspaceName.trim() },
          "We could not create your workspace.",
        );
        nextWorkspace = workspaceEnvelope.data.workspace;
        setWorkspace(nextWorkspace);
      }

      if (!nextService) {
        setGrpcLaunchState("service");
        const serviceEnvelope = await postIdempotentControlPlane<{
          service: Service;
        }>(
          developerCreationAttemptsRef.current,
          "grpc-guided-service",
          "service.create",
          "/api/v1/developer/services",
          {
            product: "grpc-api",
            name: "Ethereum native gRPC",
            environment: "development",
            network: "ethereum",
            region: "global",
          },
          "We could not create your native Ethereum gRPC service.",
        );
        nextService = serviceEnvelope.data.service;
        setServices((current) => [
          nextService!,
          ...current.filter(
            (service) => service.id !== nextService!.id,
          ),
        ]);
      }

      if (!nextKey) {
        setGrpcLaunchState("key");
        const keyEnvelope =
          await postIdempotentControlPlane<SecretReceipt>(
            developerCreationAttemptsRef.current,
            "grpc-guided-key",
            "api-key.create",
            "/api/v1/developer/api-keys",
            {
              name: "Ethereum gRPC quickstart",
              serviceId: nextService.id,
            },
            "We could not create your native gRPC API key.",
          );
        nextKey = keyEnvelope.data.apiKey;
        setSecretReceipt(keyEnvelope.data);
        setCopyState("idle");
        setApiKeys((current) => [
          keyEnvelope.data.apiKey,
          ...current.filter(
            (apiKey) => apiKey.id !== keyEnvelope.data.apiKey.id,
          ),
        ]);
      }

      const ready = Boolean(
        nativeGrpcDescriptor(nextService) && nextKey,
      );
      setNotice({
        tone: "success",
        message: ready
          ? "Your native Ethereum gRPC setup is ready. Save the one-time key, then copy the verified grpcurl command."
          : "Your workspace, native gRPC configuration, and service-bound key are saved. No endpoint is shown until the control plane verifies the shared HTTP/2 gateway.",
      });
    } catch (caught) {
      const reconciliationError = await loadConsole(true);
      const detail =
        caught instanceof Error
          ? caught.message
          : "We could not finish the native gRPC setup.";
      setGrpcLaunchError(
        reconciliationError
          ? `${detail} We also could not reconcile the latest resource state. Retry refresh before creating anything else.`
          : `${detail} Nodezuno reloaded your resource records so a safe retry reuses anything the server already saved.`,
      );
    } finally {
      setGrpcLaunchState("idle");
    }
  }

  async function refreshNativeGrpcSetup() {
    if (grpcLaunchBusy) return;
    setGrpcLaunchState("refresh");
    setGrpcLaunchError("");
    const error = await loadConsole(true);
    if (error) {
      setGrpcLaunchError(
        `The latest native gRPC status could not be loaded. ${error}`,
      );
    }
    setGrpcLaunchState("idle");
    if (!error) restoreActionFocus("grpc-first-call-title");
  }

  async function createGrpcRecoveryKey() {
    if (
      grpcLaunchBusy ||
      !workspace ||
      !ethereumGrpcService ||
      !activeGrpcKey
    ) {
      return;
    }
    if (secretReceipt) {
      setGrpcLaunchError(
        "Save or dismiss the current one-time secret before creating another key.",
      );
      return;
    }

    setGrpcLaunchState("key");
    setGrpcLaunchError("");
    setNotice(null);
    try {
      const keyEnvelope =
        await postIdempotentControlPlane<SecretReceipt>(
          developerCreationAttemptsRef.current,
          "grpc-recovery-key",
          "api-key.create",
          "/api/v1/developer/api-keys",
          grpcRecoveryKeyPayload(ethereumGrpcService.id),
          "We could not create a new native gRPC key.",
        );
      setSecretReceipt(keyEnvelope.data);
      setCopyState("idle");
      setApiKeys((current) => [
        keyEnvelope.data.apiKey,
        ...current.filter(
          (apiKey) => apiKey.id !== keyEnvelope.data.apiKey.id,
        ),
      ]);
      setNotice({
        tone: "success",
        message:
          "A new service-bound native gRPC key was created. Existing keys remain active until you explicitly revoke them.",
      });
      window.requestAnimationFrame(() => {
        document.getElementById("grpc-one-time-secret-title")?.focus();
      });
    } catch (caught) {
      setGrpcLaunchError(
        caught instanceof Error
          ? caught.message
          : "We could not create a new native gRPC key.",
      );
    } finally {
      setGrpcLaunchState("idle");
    }
  }

  async function refreshOperatorData() {
    if (
      refreshState === "submitting" ||
      serviceRenameDraft !== null
    ) {
      return;
    }
    setRefreshState("submitting");
    setNotice(null);
    const error = await loadConsole(true);
    setNotice(
      error
        ? {
            tone: "error",
            message: `Your existing console data is still visible, but the refresh failed. ${error}`,
          }
        : {
            tone: "success",
            message: "Services, usage, and API keys are up to date.",
          },
    );
    setRefreshState("idle");
  }

  function beginServiceRename(service: Service) {
    if (
      serviceRenameState === "submitting" ||
      serviceRenameReloadState === "submitting" ||
      service.status === "archived"
    ) {
      return;
    }
    setConfirmArchiveId(null);
    setServiceRenameDraft({
      serviceId: service.id,
      originalName: service.name,
      name: service.name,
      updatedAt: service.updatedAt,
    });
    setServiceRenameError("");
    setServiceRenameFailureKind(null);
    setNotice(null);
    window.requestAnimationFrame(() => {
      const input = document.getElementById(
        `rename-service-input-${service.id}`,
      );
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    });
  }

  function updateServiceRenameName(name: string) {
    setServiceRenameDraft((current) =>
      current ? { ...current, name } : current,
    );
    setServiceRenameError("");
    setServiceRenameFailureKind(null);
  }

  function cancelServiceRename(serviceId: string) {
    if (
      serviceRenameState === "submitting" ||
      serviceRenameReloadState === "submitting"
    ) {
      return;
    }
    setServiceRenameDraft(null);
    setServiceRenameError("");
    setServiceRenameFailureKind(null);
    restoreServiceActionFocus(serviceId);
  }

  async function renameService(
    event: FormEvent<HTMLFormElement>,
    service: Service,
  ) {
    event.preventDefault();
    const draft = serviceRenameDraft;
    if (
      !draft ||
      draft.serviceId !== service.id ||
      serviceRenameState === "submitting" ||
      serviceRenameReloadState === "submitting"
    ) {
      return;
    }
    const draftProblem = serviceRenameDraftProblem(
      draft.name,
      draft.originalName,
    );
    if (draftProblem) {
      setServiceRenameError(draftProblem);
      setServiceRenameFailureKind("other");
      return;
    }

    setServiceRenameState("submitting");
    setServiceRenameError("");
    setServiceRenameFailureKind(null);
    setNotice(null);
    try {
      const body = serviceRenameRequestBody(
        draft.name,
        draft.updatedAt,
      );
      const response = await fetch(
        `/api/v1/developer/services/${encodeURIComponent(service.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const failure = serviceRenameFailure(
          response.status,
          payload,
        );
        setServiceRenameError(failure.message);
        setServiceRenameFailureKind(failure.kind);
        if (failure.kind === "unauthorized") {
          const returnTo =
            `${window.location.pathname}${window.location.search}`;
          window.location.assign(
            `/login?return_to=${encodeURIComponent(returnTo)}`,
          );
        }
        return;
      }

      const envelope = parseServiceRenameMutationEnvelope(
        payload,
        {
          serviceId: service.id,
          name: body.name,
          previousUpdatedAt: body.updatedAt,
        },
      );
      setServices((current) =>
        current.map((item) =>
          item.id === service.id
            ? {
                ...item,
                name: envelope.service.name,
                updatedAt: envelope.service.updatedAt,
              }
            : item,
        ),
      );
      setServiceRenameDraft(null);
      setServiceRenameError("");
      setServiceRenameFailureKind(null);
      setNotice({
        tone: "success",
        message: `${envelope.service.name} was renamed successfully.`,
      });
      restoreServiceActionFocus(service.id);
    } catch (caught) {
      setServiceRenameError(
        caught instanceof Error
          ? caught.message
          : "We could not rename the service.",
      );
      setServiceRenameFailureKind("other");
    } finally {
      setServiceRenameState("idle");
    }
  }

  async function reloadServiceAfterRenameIssue(serviceId: string) {
    if (
      !serviceRenameDraft ||
      serviceRenameDraft.serviceId !== serviceId ||
      serviceRenameState === "submitting" ||
      serviceRenameReloadState === "submitting"
    ) {
      return;
    }
    setServiceRenameReloadState("submitting");
    setServiceRenameError("");
    setNotice(null);
    const error = await loadConsole(true);
    if (error) {
      setServiceRenameError(
        `The latest service could not be loaded. ${error}`,
      );
      setServiceRenameReloadState("idle");
      return;
    }
    setServiceRenameDraft(null);
    setServiceRenameFailureKind(null);
    setNotice({
      tone: "success",
      message:
        "The latest service records were loaded. Choose Rename to start again from the current timestamp.",
    });
    setServiceRenameReloadState("idle");
    restoreServiceActionFocus(serviceId);
  }

  function cancelArchiveConfirmation(serviceId: string) {
    setConfirmArchiveId(null);
    restoreActionFocus(`archive-service-${serviceId}`);
  }

  function cancelRevokeConfirmation(apiKeyId: string) {
    setConfirmRevokeId(null);
    restoreActionFocus(`revoke-key-${apiKeyId}`);
  }

  function beginRevokeConfirmation(apiKeyId: string) {
    setConfirmRotateId(null);
    setRotationName("");
    setRotationError("");
    setConfirmRevokeId(apiKeyId);
  }

  function beginRotateConfirmation(apiKey: ApiKey) {
    if (
      !workspace ||
      locallyRotatedSourceIds.has(apiKey.id) ||
      !isApiKeyRotationEligible(workspace.role, apiKey)
    ) {
      setNotice({
        tone: "error",
        message:
          "Only workspace owners and admins can rotate an active, unexpired key.",
      });
      return;
    }
    if (secretReceipt) {
      setNotice({
        tone: "error",
        message:
          "Save or dismiss the current one-time secret before rotating another key.",
      });
      restoreActionFocus(
        secretReceiptSurface === "api-keys"
          ? "api-one-time-secret-title"
          : rpcProbeCredential
            ? "rpc-one-time-secret-title"
            : grpcCredential
              ? "grpc-one-time-secret-title"
              : "api-one-time-secret-title",
      );
      return;
    }

    setConfirmRevokeId(null);
    setConfirmRotateId(apiKey.id);
    setRotationName("");
    setRotationError("");
    setNotice(null);
  }

  function cancelRotateConfirmation(apiKeyId: string) {
    if (rotatingId === apiKeyId) return;
    setConfirmRotateId(null);
    setRotationName("");
    setRotationError("");
    restoreActionFocus(`rotate-key-${apiKeyId}`);
  }

  async function archiveService(service: Service) {
    if (serviceRenameDraft) return;
    setArchivingServiceId(service.id);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/v1/developer/services/${encodeURIComponent(service.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        },
      );
      await readEnvelope<{ service: Service }>(
        response,
        "We could not archive the service.",
      );
      setServices((current) =>
        current.filter((item) => item.id !== service.id),
      );
      setNotice({
        tone: "success",
        message: `${service.name} was archived. Service-bound keys remain visible for audit, but they cannot be used with another service.`,
      });
      restoreActionFocus("services-list-title");
      setConfirmArchiveId(null);
    } catch (caught) {
      setNotice({
        tone: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "We could not archive the service.",
      });
    } finally {
      setArchivingServiceId(null);
    }
  }

  async function createApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    if (!canCreateAdvancedKey) {
      setNotice({
        tone: "error",
        message:
          "Only a workspace owner or admin can create an unbound API key.",
      });
      return;
    }
    if (secretReceipt) {
      setNotice({
        tone: "error",
        message: "Save or dismiss the current one-time secret before creating another key.",
      });
      return;
    }
    setKeyState("submitting");
    setNotice(null);
    setCopyState("idle");
    try {
      const body = unboundApiKeyCreationPayload(
        keyName,
        keyPurpose,
      );
      const envelope =
        await postIdempotentControlPlane<SecretReceipt>(
          developerCreationAttemptsRef.current,
          "api-key-form",
          "api-key.create",
          "/api/v1/developer/api-keys",
          body,
          "We could not create the API key.",
        );
      setSecretReceiptSurface("api-keys");
      setSecretReceipt(envelope.data);
      setDownloadState("idle");
      setApiKeys((current) => [
        envelope.data.apiKey,
        ...current.filter((item) => item.id !== envelope.data.apiKey.id),
      ]);
      setKeyName(defaultUnboundApiKeyName(keyPurpose));
      const purposeConfirmed = apiKeyMatchesUnboundPurpose(
        envelope.data.apiKey,
        keyPurpose,
      );
      setNotice({
        tone: purposeConfirmed ? "success" : "error",
        message: purposeConfirmed
          ? keyPurpose === "service-automation"
            ? "The unbound service automation key was created with exactly services:manage. Save its one-time secret before using the direct HTTPS quickstart."
            : "The unbound platform identity key was created with the default platform:identity scope."
          : "The API key was created and its one-time secret is visible, but the returned metadata does not match the requested purpose. Save the secret, review the key scope, and revoke it if the access boundary is unexpected.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not create the API key.",
      });
    } finally {
      setKeyState("idle");
    }
  }

  function chooseKeyPurpose(nextPurpose: UnboundApiKeyPurpose) {
    const previousDefault = defaultUnboundApiKeyName(keyPurpose);
    setKeyPurpose(nextPurpose);
    setKeyName((current) =>
      current === previousDefault
        ? defaultUnboundApiKeyName(nextPurpose)
        : current,
    );
  }

  async function copySecret() {
    if (!secretReceipt) return;
    try {
      await writeClipboard(secretReceipt.secret);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  function downloadSecret() {
    if (!secretReceipt) return;
    try {
      const safeName =
        secretReceipt.apiKey.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48) || "api-key";
      const accessBoundary = secretReceipt.apiKey.serviceId
        ? serviceNamesById.get(secretReceipt.apiKey.serviceId) ??
          secretReceipt.apiKey.serviceId
        : unboundApiKeyAccessBoundary(secretReceipt.apiKey);
      const contents = [
        "Nodezuno one-time API key secret",
        "",
        `Key name: ${secretReceipt.apiKey.name}`,
        `Key ID: ${secretReceipt.apiKey.id}`,
        `Access boundary: ${accessBoundary}`,
        `Scopes: ${secretReceipt.apiKey.scopes.join(", ")}`,
        `Created: ${secretReceipt.apiKey.createdAt}`,
        "",
        "Secret:",
        secretReceipt.secret,
        "",
        "Store this file in a secure vault. Delete local copies after import.",
        "Nodezuno cannot recover this secret after this page is dismissed.",
        "",
      ].join("\n");
      const blob = new Blob([contents], {
        type: "text/plain;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `nodezuno-${safeName}-${secretReceipt.apiKey.id.slice(
        0,
        12,
      )}-secret.txt`;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setDownloadState("downloaded");
    } catch {
      setDownloadState("error");
    }
  }

  async function copyRpcEndpoint(service: Service, endpoint: string) {
    try {
      await writeClipboard(endpoint);
      setRpcEndpointCopyState((current) => ({
        ...current,
        [service.id]: "copied",
      }));
    } catch {
      setRpcEndpointCopyState((current) => ({
        ...current,
        [service.id]: "error",
      }));
    }
  }

  async function runRpcProbe() {
    if (
      !rpcProbeReady ||
      !selectedRpcEndpoint ||
      !rpcProbeCredential ||
      !rpcProbeContextKey ||
      currentRpcProbeState.status === "pending"
    ) {
      return;
    }

    const endpoint = selectedRpcEndpoint;
    const credential = rpcProbeCredential;
    const contextKey = rpcProbeContextKey;
    const controller = new AbortController();
    let timedOut = false;
    const startedAt = window.performance.now();
    const latency = () =>
      Math.max(0, Math.round(window.performance.now() - startedAt));

    rpcProbeAbortController.current?.abort();
    rpcProbeAbortController.current = controller;
    setRpcProbeState({ status: "pending", contextKey });

    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${credential.secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(rpcProbePayload(selectedRpcNetwork)),
      });

      if (!response.ok) {
        try {
          await response.body?.cancel();
        } catch {
          // The body is intentionally discarded.
        }
        setRpcProbeState({
          status: "error",
          contextKey,
          message: ethereumRpcProbeHttpMessage(
            response.status,
            response.headers.get("Retry-After"),
          ),
          latencyMs: latency(),
        });
        return;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        setRpcProbeState({
          status: "error",
          contextKey,
          message:
            "The gateway replied, but its response was not valid JSON.",
          latencyMs: latency(),
        });
        return;
      }

      const verification = verifyRpcProbe(selectedRpcNetwork, payload);
      payload = null;
      if (!verification.ok) {
        setRpcProbeState({
          status: "error",
          contextKey,
          message: verification.message,
          latencyMs: latency(),
        });
        return;
      }

      setRpcProbeState({
        status: "success",
        contextKey,
        verificationLabel: verification.label,
        verificationDetail: verification.detail,
        latencyMs: latency(),
        quota: readEthereumRpcQuota(response.headers),
      });
    } catch {
      setRpcProbeState({
        status: "error",
        contextKey,
        message: timedOut
          ? "The verification request timed out. Retry shortly."
          : `The browser could not reach the ${selectedRpcDescriptor.label} gateway. Check your connection and retry.`,
        latencyMs: latency(),
      });
    } finally {
      window.clearTimeout(timeout);
      if (rpcProbeAbortController.current === controller) {
        rpcProbeAbortController.current = null;
      }
    }
  }

  async function copyRpcExample(copyKey: string, value: string) {
    try {
      await writeClipboard(value);
      setRpcCopyState((current) => ({
        ...current,
        [copyKey]: "copied",
      }));
    } catch {
      setRpcCopyState((current) => ({
        ...current,
        [copyKey]: "error",
      }));
    }
  }

  async function rotateApiKey(apiKey: ApiKey) {
    if (
      !workspace ||
      locallyRotatedSourceIds.has(apiKey.id) ||
      !isApiKeyRotationEligible(workspace.role, apiKey)
    ) {
      setRotationError(
        "This source key is not eligible. Refresh metadata and choose an active, unexpired key as an owner or admin.",
      );
      return;
    }
    if (secretReceipt) {
      setRotationError(
        "Save or dismiss the current one-time secret before rotating another key.",
      );
      return;
    }

    const body = apiKeyRotationBody(rotationName);
    setRotatingId(apiKey.id);
    setRotationError("");
    setNotice(null);
    setCopyState("idle");
    setDownloadState("idle");
    try {
      const envelope =
        await postIdempotentControlPlane<SecretReceipt>(
          developerCreationAttemptsRef.current,
          "api-key-rotation",
          "api-key.rotate",
          `/api/v1/developer/api-keys/${encodeURIComponent(apiKey.id)}/rotate`,
          body,
          "We could not rotate the API key.",
          apiKeyRotationAttemptIdentity(apiKey.id, body),
        );

      setSecretReceiptSurface("api-keys");
      setSecretReceipt(envelope.data);
      setApiKeys((current) => [
        envelope.data.apiKey,
        ...current.filter(
          (item) => item.id !== envelope.data.apiKey.id,
        ),
      ]);
      setLocallyRotatedSourceIds((current) => {
        const next = new Set(current);
        next.add(apiKey.id);
        return next;
      });
      setConfirmRotateId(null);
      setRotationName("");
      setRotationError("");

      const refreshError = await loadConsole(true);
      setNotice({
        tone: "success",
        message: refreshError
          ? `${apiKey.name} was rotated atomically. The source key was revoked, and the replacement preserved its service binding and scopes. The replacement secret remains visible. Metadata refresh failed, so refresh before another key action. ${refreshError}`
          : `${apiKey.name} was rotated atomically. The source key was revoked, and the replacement preserved its service binding and scopes. Save the replacement secret shown below now.`,
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "We could not rotate the API key.";
      setRotationError(
        caught instanceof IdempotentControlPlaneError &&
          caught.retryIdentityRetained
          ? `${message} No automatic retry was made. Refresh key metadata first. An exact manual retry keeps the same request identity; changing the source key or replacement name creates a new one.`
          : message,
      );
    } finally {
      setRotatingId(null);
    }
  }

  async function revokeApiKey(apiKey: ApiKey) {
    setRevokingId(apiKey.id);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/v1/developer/api-keys/${encodeURIComponent(apiKey.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        },
      );
      const envelope = await readEnvelope<{ apiKey: ApiKey }>(
        response,
        "We could not revoke the API key.",
      );
      setApiKeys((current) =>
        current.map((item) =>
          item.id === envelope.data.apiKey.id ? envelope.data.apiKey : item,
        ),
      );
      if (secretReceipt?.apiKey.id === envelope.data.apiKey.id) {
        rpcProbeAbortController.current?.abort();
        rpcProbeAbortController.current = null;
        setSecretReceipt(null);
        setRpcProbeState({ status: "idle" });
      }
      setConfirmRevokeId(null);
      setNotice({
        tone: "success",
        message: `${apiKey.name} was revoked.`,
      });
      restoreActionFocus("api-keys-list-title");
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not revoke the API key.",
      });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <main id="main-content" className="developer-console-page">
      <section className="developer-console-hero">
        <div className="developer-console-grid" aria-hidden="true" />
        <div className="container">
          <nav className="console-navigation" aria-label="Developer account">
            <Link aria-current="page" href="/console">
              Developer console
            </Link>
            <Link href="/account">Requests</Link>
            <Link href="/developers/docs">Documentation</Link>
          </nav>

          <div className="developer-console-heading">
            <div>
              <span className="section-kicker">
                {rpcIntent
                  ? `${selectedRpcDescriptor.label} RPC quickstart`
                  : grpcIntent
                    ? "Native Ethereum gRPC quickstart"
                  : "Self-service workspace"}
              </span>
              <h1 id="developer-console-title" tabIndex={-1}>
                {rpcIntent
                  ? `Make your first ${selectedRpcDescriptor.label} request.`
                  : grpcIntent
                    ? "Make your first native gRPC request."
                  : "Build without waiting."}
              </h1>
              <p>
                {rpcIntent
                  ? "Launch the workspace, gateway, and API key here. Copy the endpoint and first request without an access form, approval queue, or sales call."
                  : grpcIntent
                    ? "Create the workspace, native HTTP/2 service, and service-bound key here. A grpcurl command appears only when the control plane returns a verified endpoint."
                  : "Create your company workspace, issue scoped API keys, and activate Ethereum, Base, Solana RPC, or native Ethereum gRPC without a sales gate. Callable endpoints appear only after the attached infrastructure passes verification."}
              </p>
            </div>
            <div className="console-identity-card">
              <span>Signed in as</span>
              <strong>{name}</strong>
              <small>{identifier}</small>
              <i>{authMethod} account</i>
              {signOutPath ? (
                <Link href={signOutPath}>Sign out</Link>
              ) : (
                <button onClick={() => void signOut()} type="button">
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="developer-console-content">
        <div className="container">
          {notice ? (
            <div
              className={`console-notice console-notice-${notice.tone}`}
              role={notice.tone === "error" ? "alert" : "status"}
            >
              <span aria-hidden="true" />
              {notice.message}
              <button
                aria-label="Dismiss message"
                onClick={dismissNotice}
                type="button"
              >
                ×
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="console-loading" role="status">
              <span className="console-loading-mark" aria-hidden="true" />
              <div>
                <strong>Loading your workspace</strong>
                <small>Checking identity and developer resources</small>
              </div>
            </div>
          ) : loadError ? (
            <div className="console-load-error" role="alert">
              <span className="section-kicker">Console unavailable</span>
              <h2>We could not load your developer workspace.</h2>
              <p>{loadError}</p>
              <button
                className="button button-solid"
                id="console-retry-button"
                onClick={() => void retryConsoleLoad()}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {rpcIntent ? (
                <section
                  aria-busy={rpcLaunchBusy}
                  aria-labelledby="rpc-launch-title"
                  className="rpc-launchpad"
                  id="rpc-launchpad"
                >
                  <div className="rpc-launchpad-header">
                    <div>
                      <span className="section-kicker">
                        Step 2 of 2 / Multi-chain RPC
                      </span>
                      <h2 id="rpc-launch-title" tabIndex={-1}>
                        From new account to first request.
                      </h2>
                    </div>
                    <p>
                      One guided action creates only what is missing. It resumes
                      safely if a previous attempt stopped, and it never opens a
                      sales request. This console marks a gateway ready only
                      when the server returns both active status and an exact
                      endpoint. Beta does not imply a production SLA.
                    </p>
                  </div>

                  <nav
                    aria-label="Choose an RPC network"
                    className="rpc-network-picker"
                  >
                    {selfServiceRpcNetworks.map((network) => {
                      const descriptor = rpcNetworkDescriptor(network);
                      return (
                        <Link
                          aria-current={
                            network === selectedRpcNetwork
                              ? "page"
                              : undefined
                          }
                          href={`${rpcConsolePath(network)}#rpc-launchpad`}
                          key={network}
                        >
                          <span>{descriptor.label}</span>
                          <small>
                            {network === "solana"
                              ? "Solana JSON-RPC"
                              : "EVM JSON-RPC"}
                          </small>
                        </Link>
                      );
                    })}
                  </nav>

                  <ol
                    aria-label={`${selectedRpcDescriptor.label} RPC setup progress`}
                    className="rpc-launch-progress"
                    tabIndex={0}
                  >
                    <li className="is-complete">
                      <span>1</span>
                      <div>
                        <strong>Account</strong>
                        <small>Signed in</small>
                      </div>
                    </li>
                    <li
                      aria-current={
                        rpcCurrentStep === "workspace" ? "step" : undefined
                      }
                      className={workspace ? "is-complete" : "is-current"}
                    >
                      <span>2</span>
                      <div>
                        <strong>Workspace</strong>
                        <small>{workspace ? "Ready" : "Next"}</small>
                      </div>
                    </li>
                    <li
                      aria-current={
                        rpcCurrentStep === "gateway" ? "step" : undefined
                      }
                      className={
                        selectedRpcReady
                          ? "is-complete"
                          : selectedRpcService
                            ? "is-waiting"
                            : rpcCurrentStep === "gateway"
                              ? "is-current"
                              : ""
                      }
                    >
                      <span>3</span>
                      <div>
                        <strong>Gateway</strong>
                        <small>
                          {selectedRpcReady
                            ? "Active beta"
                            : selectedRpcService
                              ? "Configuration saved"
                              : "Not created"}
                        </small>
                      </div>
                    </li>
                    <li
                      aria-current={
                        rpcCurrentStep === "key" ? "step" : undefined
                      }
                      className={
                        activeRpcKey
                          ? "is-complete"
                          : rpcCurrentStep === "key"
                            ? "is-current"
                            : ""
                      }
                    >
                      <span>4</span>
                      <div>
                        <strong>API key</strong>
                        <small>
                          {rpcProbeCredential
                            ? "Available in tab"
                            : activeRpcKey
                              ? "Record exists"
                              : "Not created"}
                        </small>
                      </div>
                    </li>
                    <li
                      aria-current={
                        rpcSetupReady &&
                        currentRpcProbeState.status !== "success"
                          ? "step"
                          : undefined
                      }
                      className={
                        currentRpcProbeState.status === "success"
                          ? "is-complete"
                          : rpcFirstRequestReady
                            ? "is-current"
                            : rpcSavedKeyRequired
                              ? "is-waiting"
                            : ""
                      }
                    >
                      <span>5</span>
                      <div>
                        <strong>First call</strong>
                        <small>
                          {currentRpcProbeState.status === "success"
                            ? "Verified"
                            : rpcFirstRequestReady
                              ? "Ready in this tab"
                              : rpcSavedKeyRequired
                                ? "Saved key required"
                              : "Waiting"}
                        </small>
                      </div>
                    </li>
                  </ol>

                  <div className="rpc-launchpad-body">
                    <div className="rpc-launch-action">
                      <span className="docs-state docs-state-live">
                        No sales gate
                      </span>
                      <h3>
                        {rpcFirstRequestReady
                          ? "Your endpoint and key are ready in this tab."
                          : rpcSetupReady
                            ? "Your gateway is ready. Use your saved key."
                            : "Launch with safe quickstart defaults."}
                      </h3>
                      <p>
                        Development environment,{" "}
                        {selectedRpcDescriptor.mainnetLabel}, global routing,
                        and a service-bound key with{" "}
                        <code>rpc:invoke</code>. You can create additional
                        environments and keys below.
                      </p>

                      {!workspace ? (
                        <label>
                          <span>Company or workspace name</span>
                          <input
                            autoComplete="organization"
                            disabled={rpcLaunchBusy}
                            maxLength={60}
                            minLength={2}
                            onChange={(event) =>
                              setWorkspaceName(event.target.value)
                            }
                            required
                            value={workspaceName}
                          />
                        </label>
                      ) : (
                        <div className="rpc-launch-workspace">
                          <span>Workspace</span>
                          <strong>{workspace.name}</strong>
                          <small>{workspace.slug}</small>
                        </div>
                      )}

                      <div className="rpc-launch-defaults" aria-label="Quickstart defaults">
                        <span>{selectedRpcDescriptor.mainnetLabel}</span>
                        <span>Development</span>
                        <span>Global routing</span>
                      </div>

                      {!rpcSetupReady &&
                      (!selectedRpcService || !activeRpcKey || !workspace) ? (
                        <button
                          className="button button-solid button-large"
                          disabled={
                            rpcLaunchBusy ||
                            (!workspace && workspaceName.trim().length < 2)
                          }
                          onClick={() => void launchRpcSetup()}
                          type="button"
                        >
                          {rpcLaunchActionLabel}
                        </button>
                      ) : !rpcSetupReady ? (
                        <button
                          className="button button-outline"
                          disabled={rpcLaunchBusy}
                          onClick={() => void refreshRpcSetup()}
                          type="button"
                        >
                          {rpcLaunchState === "refresh"
                            ? "Checking gateway..."
                            : "Refresh gateway status"}
                        </button>
                      ) : null}

                      {rpcLaunchError ? (
                        <p className="rpc-launch-error" role="alert">
                          {rpcLaunchError}
                        </p>
                      ) : null}
                    </div>

                    <div
                      className={`rpc-launch-result ${
                        rpcSetupReady ? "is-ready" : ""
                      }`}
                    >
                      {rpcProbeCredential ? (
                        <aside
                          aria-labelledby="rpc-one-time-secret-title"
                          className="rpc-launch-secret"
                          role="region"
                        >
                          <div>
                            <span>One-time API key</span>
                            <strong
                              id="rpc-one-time-secret-title"
                              tabIndex={-1}
                            >
                              Copy and save this secret now.
                            </strong>
                            <p>
                              Keep it server-side. Nodezuno stores only its
                              digest and cannot show it again.
                            </p>
                            <small className="api-secret-scope">
                              Access boundary:{" "}
                              {rpcProbeCredential.apiKey.serviceId
                                ? serviceNamesById.get(
                                  rpcProbeCredential.apiKey.serviceId,
                                  ) ?? "one bound service"
                                : "platform identity only"}
                            </small>
                          </div>
                          <code>{rpcProbeCredential.secret}</code>
                          <div>
                            <button
                              className="button button-solid"
                              onClick={() => void copySecret()}
                              type="button"
                            >
                              {copyState === "copied"
                                ? "Secret copied"
                                : "Copy secret"}
                            </button>
                            <button
                              className="button button-outline"
                              onClick={() =>
                                dismissOneTimeSecret(
                                  selectedRpcReady
                                    ? "rpc-credential-recovery-title"
                                    : "rpc-waiting-title",
                                  true,
                                )
                              }
                              type="button"
                            >
                              I saved it
                            </button>
                          </div>
                          <span
                            aria-atomic="true"
                            className="sr-only"
                            role="status"
                          >
                            {copyStatusMessage(copyState, "API key secret")}
                          </span>
                          {copyState === "error" ? (
                            <p className="rpc-launch-error" role="alert">
                              Clipboard access failed. Select and copy the
                              secret before dismissing it.
                            </p>
                          ) : null}
                        </aside>
                      ) : null}

                      {selectedRpcService &&
                      selectedRpcEndpoint &&
                      rpcSetupReady ? (
                        <>
                          <div className="rpc-launch-ready-heading">
                            <span>
                              {selectedRpcDescriptor.label} active endpoint
                            </span>
                            <strong
                              id="rpc-launch-ready-title"
                              tabIndex={-1}
                            >
                              {rpcFirstRequestReady
                                ? "Make the first request."
                                : "Continue with your saved key."}
                            </strong>
                            <p>
                              Export the API key you saved as{" "}
                              <code>NODEZUNO_API_KEY</code>. Keep the key out of
                              browser code, source control, and shell history.
                            </p>
                          </div>
                          {rpcSavedKeyRequired ? (
                            <section
                              aria-labelledby="rpc-credential-recovery-title"
                              className="rpc-credential-recovery"
                            >
                              <span>Credential not held in this tab</span>
                              <h4
                                id="rpc-credential-recovery-title"
                                tabIndex={-1}
                              >
                                The existing raw secret cannot be shown again.
                              </h4>
                              <p>
                                If you saved that key in a vault, keep using it.
                                Export it as{" "}
                                <code>NODEZUNO_API_KEY</code> and run the
                                request below in your terminal.
                              </p>
                              <p>
                                If the secret was lost, create a new
                                service-bound key. Existing keys stay active
                                until you separately revoke them in the key
                                list.
                              </p>
                              {confirmRpcRecovery ? (
                                <div
                                  aria-label={`Create new ${selectedRpcDescriptor.label} key confirmation`}
                                  className="rpc-credential-recovery-confirm"
                                  onKeyDown={(event) => {
                                    if (
                                      event.key === "Escape" &&
                                      !rpcLaunchBusy
                                    ) {
                                      event.preventDefault();
                                      cancelRpcRecoveryConfirmation();
                                    }
                                  }}
                                  role="group"
                                >
                                  <p id="rpc-recovery-warning">
                                    Confirm creation of one new key for this
                                    gateway. This does not reveal, revoke, or
                                    modify any existing key.
                                  </p>
                                  <button
                                    aria-describedby="rpc-recovery-warning"
                                    autoFocus
                                    className="button button-solid"
                                    disabled={rpcLaunchBusy}
                                    onClick={() =>
                                      void createRpcRecoveryKey()
                                    }
                                    type="button"
                                  >
                                    {rpcLaunchState === "key"
                                      ? "Creating new key..."
                                      : "Confirm new key"}
                                  </button>
                                  <button
                                    className="button button-outline"
                                    disabled={rpcLaunchBusy}
                                    onClick={cancelRpcRecoveryConfirmation}
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="rpc-credential-recovery-actions">
                                  <button
                                    className="button button-outline"
                                    id="rpc-recovery-key-trigger"
                                    onClick={() =>
                                      setConfirmedRpcRecoveryContext(
                                        rpcRecoveryContextKey,
                                      )
                                    }
                                    type="button"
                                  >
                                    Create a new service-bound key
                                  </button>
                                  <a
                                    href="#api-keys-title"
                                    onClick={() =>
                                      restoreActionFocus("api-keys-title")
                                    }
                                  >
                                    Review existing keys
                                  </a>
                                </div>
                              )}
                            </section>
                          ) : null}
                          <div className="rpc-launch-endpoint">
                            <span>
                              {selectedRpcDescriptor.protocolLabel} endpoint
                            </span>
                            <code>{selectedRpcEndpoint}</code>
                            <button
                              onClick={() =>
                                void copyRpcEndpoint(
                                  selectedRpcService,
                                  selectedRpcEndpoint,
                                )
                              }
                              type="button"
                            >
                              {rpcEndpointCopyState[selectedRpcService.id] ===
                              "copied"
                                ? "Endpoint copied"
                                : rpcEndpointCopyState[
                                      selectedRpcService.id
                                    ] === "error"
                                  ? "Copy failed, retry"
                                : "Copy endpoint"}
                            </button>
                            <span
                              aria-atomic="true"
                              className="sr-only"
                              role="status"
                            >
                              {copyStatusMessage(
                                rpcEndpointCopyState[
                                  selectedRpcService.id
                                ],
                                `${selectedRpcDescriptor.label} endpoint`,
                              )}
                            </span>
                          </div>
                          <section
                            aria-busy={
                              currentRpcProbeState.status === "pending"
                            }
                            aria-labelledby="rpc-probe-title"
                            className={`rpc-launch-probe is-${currentRpcProbeState.status}`}
                          >
                            <div className="rpc-launch-probe-heading">
                              <div>
                                <span>One-click verification</span>
                                <strong id="rpc-probe-title">
                                  Verify this endpoint
                                </strong>
                              </div>
                              <button
                                aria-describedby="rpc-probe-help"
                                disabled={
                                  !rpcProbeReady ||
                                  currentRpcProbeState.status === "pending"
                                }
                                onClick={() =>
                                  void runRpcProbe()
                                }
                                type="button"
                              >
                                {currentRpcProbeState.status === "pending"
                                  ? `Verifying ${selectedRpcDescriptor.label}...`
                                  : selectedRpcDescriptor.probeButtonLabel}
                              </button>
                            </div>
                            <p id="rpc-probe-help">
                              {rpcProbeReady
                                ? "Sends one read-only request. The secret stays in this tab's memory, and only the verified chain, elapsed time, and rate-limit headers are shown."
                                : "One-click verification needs the active one-time RPC key still held in this tab. The copyable curl request remains available below."}
                            </p>
                            <div
                              aria-live="polite"
                              className="rpc-launch-probe-feedback"
                            >
                              {currentRpcProbeState.status === "pending" ? (
                                <p
                                  className="rpc-probe-pending"
                                  role="status"
                                >
                                  Checking the gateway with{" "}
                                  {selectedRpcDescriptor.probeMethod}.
                                </p>
                              ) : currentRpcProbeState.status ===
                                "success" ? (
                                <div
                                  className="rpc-probe-success"
                                  role="status"
                                >
                                  <strong>
                                    {
                                      currentRpcProbeState.verificationLabel
                                    }
                                  </strong>
                                  <span>
                                    {
                                      currentRpcProbeState.verificationDetail
                                    }
                                  </span>
                                  <span>
                                    {currentRpcProbeState.latencyMs} ms round
                                    trip
                                  </span>
                                  {currentRpcProbeState.quota ? (
                                    <>
                                      <span>
                                        {formatMetric(
                                          currentRpcProbeState.quota.remaining,
                                          0,
                                        )}{" "}
                                        of{" "}
                                        {formatMetric(
                                          currentRpcProbeState.quota.limit,
                                          0,
                                        )}{" "}
                                        hourly key units remaining
                                      </span>
                                      {currentRpcProbeState.quota
                                        .serviceLimit !== null &&
                                      currentRpcProbeState.quota
                                        .serviceRemaining !== null ? (
                                        <span>
                                          {formatMetric(
                                            currentRpcProbeState.quota
                                              .serviceRemaining,
                                            0,
                                          )}{" "}
                                          of{" "}
                                          {formatMetric(
                                            currentRpcProbeState.quota
                                              .serviceLimit,
                                            0,
                                          )}{" "}
                                          service units remaining
                                        </span>
                                      ) : null}
                                      {currentRpcProbeState.quota
                                        .serviceWarning !== null &&
                                      currentRpcProbeState.quota
                                        .serviceWarningThresholdPercent !==
                                        null ? (
                                        <span>
                                          Service warning threshold{" "}
                                          {currentRpcProbeState.quota
                                            .serviceWarning
                                            ? "reached"
                                            : "not reached"}{" "}
                                          at{" "}
                                          {
                                            currentRpcProbeState.quota
                                              .serviceWarningThresholdPercent
                                          }
                                          %
                                        </span>
                                      ) : null}
                                      {currentRpcProbeState.quota
                                        .workspaceLimit !== null &&
                                      currentRpcProbeState.quota
                                        .workspaceRemaining !== null ? (
                                        <span>
                                          {formatMetric(
                                            currentRpcProbeState.quota
                                              .workspaceRemaining,
                                            0,
                                          )}{" "}
                                          of{" "}
                                          {formatMetric(
                                            currentRpcProbeState.quota
                                              .workspaceLimit,
                                            0,
                                          )}{" "}
                                          workspace units remaining
                                        </span>
                                      ) : null}
                                      {currentRpcProbeState.quota.resetAt ? (
                                        <span>
                                          Resets{" "}
                                          {formatDate(
                                            currentRpcProbeState.quota
                                              .resetAt,
                                          )}
                                        </span>
                                      ) : null}
                                    </>
                                  ) : (
                                    <span>
                                      Live quota headers were not available on
                                      this response.
                                    </span>
                                  )}
                                </div>
                              ) : currentRpcProbeState.status === "error" ? (
                                <div
                                  className="rpc-probe-error"
                                  role="alert"
                                >
                                  <strong>Verification did not pass</strong>
                                  <span>
                                    {currentRpcProbeState.message}
                                  </span>
                                  {currentRpcProbeState.latencyMs !== null ? (
                                    <span>
                                      Request ended after{" "}
                                      {currentRpcProbeState.latencyMs} ms.
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </section>
                          <div
                            aria-label={`${selectedRpcDescriptor.label} first request examples`}
                            className="rpc-launch-requests"
                          >
                            {selectedRpcExamples.map((example) => {
                              const copyKey = `${selectedRpcService.id}:${example.id}`;
                              return (
                                <div
                                  className="rpc-launch-request"
                                  key={example.id}
                                >
                                  <div>
                                    <span>{example.method}</span>
                                    <strong>{example.title}</strong>
                                    <button
                                      aria-label={`Copy ${example.method} curl request`}
                                      onClick={() =>
                                        void copyRpcExample(
                                          copyKey,
                                          example.curl,
                                        )
                                      }
                                      type="button"
                                    >
                                      {rpcCopyState[copyKey] === "copied"
                                        ? "Request copied"
                                        : rpcCopyState[copyKey] === "error"
                                          ? "Copy failed, retry"
                                          : "Copy first request"}
                                    </button>
                                  </div>
                                  <pre tabIndex={0}>
                                    <code>{example.curl}</code>
                                  </pre>
                                  <span
                                    aria-atomic="true"
                                    className="sr-only"
                                    role="status"
                                  >
                                    {copyStatusMessage(
                                      rpcCopyState[copyKey],
                                      `${example.method} request`,
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="rpc-launch-waiting">
                          <span aria-hidden="true">NZ</span>
                          <strong id="rpc-waiting-title" tabIndex={-1}>
                            {!selectedRpcService
                              ? "Your endpoint will appear here."
                              : !activeRpcKey
                                ? "Create a key for this gateway."
                                : "Gateway verification is pending."}
                          </strong>
                          <p>
                            {!selectedRpcService
                              ? "Finish the guided setup to create the service and API key. If infrastructure is ready, the endpoint and copyable first request appear immediately."
                              : !activeRpcKey
                                ? `The service record is saved. Create a service-bound key while Nodezuno verifies the ${selectedRpcDescriptor.mainnetLabel} gateway.`
                                : `Your configuration is saved. Nodezuno will expose the endpoint only after this deployment verifies its operator-managed ${selectedRpcDescriptor.mainnetLabel} upstream. You do not need to contact sales.`}
                          </p>
                          <section
                            aria-labelledby="rpc-probe-unavailable-title"
                            className="rpc-launch-probe is-unavailable"
                          >
                            <div className="rpc-launch-probe-heading">
                              <div>
                                <span>One-click verification</span>
                                <strong id="rpc-probe-unavailable-title">
                                  Verify this endpoint
                                </strong>
                              </div>
                              <button disabled type="button">
                                {selectedRpcDescriptor.probeButtonLabel}
                              </button>
                            </div>
                            <p>
                              This test unlocks when an active gateway and its
                              one-time RPC key are available in this tab.
                            </p>
                          </section>
                        </div>
                      )}
                      {selectedRpcService ? (
                        <RpcAccessPolicyPanel
                          methodCatalog={rpcMethodCatalog(
                            selectedRpcService,
                          )}
                          network={selectedRpcNetwork}
                          serviceId={selectedRpcService.id}
                          serviceName={selectedRpcService.name}
                        />
                      ) : null}
                    </div>
                  </div>
                  {selectedRpcService ? (
                    <>
                      <RpcGuardrailPanel
                        network={selectedRpcNetwork}
                        product="rpc-api"
                        serviceId={selectedRpcService.id}
                        serviceName={selectedRpcService.name}
                        workspaceRole={workspace?.role ?? "developer"}
                      />
                      <RpcObservabilityPanel
                        network={selectedRpcNetwork}
                        serviceId={selectedRpcService.id}
                        serviceName={selectedRpcService.name}
                      />
                    </>
                  ) : null}
                </section>
              ) : null}

              {grpcIntent ? (
                <>
                  <GrpcQuickstart
                    activeKey={activeGrpcKey}
                    browserOrigin={browserOrigin}
                    copyState={copyState}
                    credential={grpcCredential}
                    error={grpcLaunchError}
                    launchState={grpcLaunchState}
                    onCopySecret={copySecret}
                    onCreateRecoveryKey={createGrpcRecoveryKey}
                    onDismissSecret={() =>
                      dismissOneTimeSecret(
                        nativeGrpcDescriptor(ethereumGrpcService)
                          ? "grpc-credential-recovery-title"
                          : "grpc-saved-state-title",
                      )
                    }
                    onLaunch={launchNativeGrpcSetup}
                    onRefresh={refreshNativeGrpcSetup}
                    onWorkspaceNameChange={setWorkspaceName}
                    service={ethereumGrpcService}
                    workspace={workspace}
                    workspaceName={workspaceName}
                  />
                  {ethereumGrpcService ? (
                    <RpcGuardrailPanel
                      network="ethereum"
                      product="grpc-api"
                      serviceId={ethereumGrpcService.id}
                      serviceName={ethereumGrpcService.name}
                      workspaceRole={workspace?.role ?? "developer"}
                    />
                  ) : null}
                </>
              ) : null}

              {rpcIntent ? (
                <div className="console-advanced-heading">
                  <span>Advanced controls</span>
                  <p>
                    Manage additional environments, service records, and key
                    rotation below.
                  </p>
                </div>
              ) : null}

              <section className="workspace-control-section" aria-labelledby="workspace-title">
                <div className="console-section-heading">
                  <div>
                    <span className="section-kicker">01 / Workspace</span>
                    <h2 id="workspace-title" tabIndex={-1}>
                      Your company control surface.
                    </h2>
                  </div>
                  <p>
                    One stable account owns one workspace. Sales is available
                    if you want help, but it is never required to create or use
                    your workspace.
                  </p>
                </div>

                {workspace ? (
                  <div className="workspace-summary">
                    <div className="workspace-summary-primary">
                      <span className="workspace-status">
                        <i aria-hidden="true" />
                        Active workspace
                      </span>
                      <h3 id="workspace-summary-title" tabIndex={-1}>
                        {workspace.name}
                      </h3>
                      <p>
                        Workspace slug <code>{workspace.slug}</code>
                      </p>
                    </div>
                    <dl>
                      <div>
                        <dt>Your role</dt>
                        <dd>{workspace.role}</dd>
                      </div>
                      <div>
                        <dt>Active keys</dt>
                        <dd>{activeKeys.length}</dd>
                      </div>
                      <div>
                        <dt>Callable endpoints</dt>
                        <dd>{callableServices.length}</dd>
                      </div>
                      <div>
                        <dt>Created</dt>
                        <dd>{formatDate(workspace.createdAt)}</dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <form
                    aria-busy={workspaceState === "submitting"}
                    className="workspace-create-card"
                    onSubmit={createWorkspace}
                  >
                    <div>
                      <span className="docs-state docs-state-live">
                        Ready now
                      </span>
                      <h3>Create your workspace.</h3>
                      <p>
                        Name it for your company or team. You will become the
                        workspace owner immediately.
                      </p>
                    </div>
                    <label>
                      <span>Workspace name</span>
                      <input
                        autoComplete="organization"
                        maxLength={60}
                        minLength={2}
                        onChange={(event) => setWorkspaceName(event.target.value)}
                        placeholder="Acme Wallet"
                        required
                        value={workspaceName}
                      />
                    </label>
                    <button
                      className="button button-solid"
                      disabled={workspaceState === "submitting"}
                      type="submit"
                    >
                      {workspaceState === "submitting"
                        ? "Creating workspace…"
                        : "Create workspace"}
                    </button>
                  </form>
                )}

                {workspace ? (
                  <WorkspaceTeamPanel
                    workspaceName={workspace.name}
                    workspaceRole={workspace.role}
                  />
                ) : null}

                {workspace && workspace.role !== "developer" ? (
                  <WorkspaceAuditPanel
                    workspaceName={workspace.name}
                    workspaceRole={workspace.role}
                  />
                ) : null}
              </section>

              <section
                className="service-control-section"
                aria-labelledby="services-title"
              >
                <div className="console-section-heading">
                  <div>
                    <span className="section-kicker">02 / Services</span>
                    <h2 id="services-title" tabIndex={-1}>
                      Create services without an access gate.
                    </h2>
                  </div>
                  <p>
                    The platform identity API is implemented now. Ethereum,
                    Base, and Solana RPC gateways activate here only when an
                    operator-configured upstream is verified. Other products
                    save setup intent without claiming an endpoint or
                    capacity.
                  </p>
                </div>

                <div className="service-builder-layout">
                  <form
                    aria-busy={serviceState === "submitting"}
                    className="service-create-card"
                    onSubmit={createService}
                  >
                    <div className="service-create-heading">
                      <span
                        className={`docs-state ${
                          serviceProduct === "platform-api"
                            ? "docs-state-live"
                            : supportedRpcSelected || grpcBuilderSelected
                              ? "docs-state-preview"
                            : "docs-state-proposed"
                        }`}
                      >
                        {serviceProduct === "platform-api"
                          ? "Implemented API"
                          : supportedRpcSelected
                            ? `${builderRpcDescriptor?.label} gateway setup`
                            : grpcBuilderSelected
                              ? "Ethereum native gRPC setup"
                              : chainLaunchBuilderSelected
                                ? "Design-partner project brief"
                                : "Configuration only"}
                      </span>
                      <h3>Configure a service.</h3>
                      <p>
                        {chainLaunchBuilderSelected
                          ? "Record the proposed stack and infrastructure scope for a commercial or ecosystem partnership. Saving this brief does not deploy infrastructure."
                          : "No form review and no sales approval. RPC becomes live only after the server returns both an active status and an exact endpoint for the selected network."}
                      </p>
                    </div>

                    <div className="service-form-grid">
                      <label>
                        <span>Product</span>
                        <select
                          disabled={
                            !workspace || serviceState === "submitting"
                          }
                          onChange={(event) => {
                            const value = event.target
                              .value as Service["product"];
                            setServiceProduct(value);
                            if (value === "platform-api") {
                              setServiceNetwork("global");
                              setServiceRegion("global");
                            } else if (value === "grpc-api") {
                              setServiceNetwork("ethereum");
                              setServiceRegion("global");
                            } else if (value === "rpc-api") {
                              setServiceNetwork(selectedRpcNetwork);
                            } else if (value === "rollups") {
                              setServiceNetwork("op-stack");
                            }
                          }}
                          value={serviceProduct}
                        >
                          {serviceProducts.map((product) => (
                            <option
                              key={product.value}
                              value={product.value}
                            >
                              {product.label} · {product.maturity}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Service name</span>
                        <input
                          disabled={
                            !workspace || serviceState === "submitting"
                          }
                          maxLength={80}
                          minLength={2}
                          onChange={(event) =>
                            setServiceName(event.target.value)
                          }
                          placeholder="Primary production"
                          required
                          value={serviceName}
                        />
                      </label>
                      <label>
                        <span>Environment</span>
                        <select
                          disabled={
                            !workspace || serviceState === "submitting"
                          }
                          onChange={(event) =>
                            setServiceEnvironment(
                              event.target.value as Service["environment"],
                            )
                          }
                          value={serviceEnvironment}
                        >
                          <option value="development">Development</option>
                          <option value="staging">Staging</option>
                          <option value="production">
                            {serviceProduct === "rpc-api" ||
                            serviceProduct === "grpc-api"
                              ? "Production workload (beta service)"
                              : "Production"}
                          </option>
                        </select>
                      </label>
                      <label>
                        <span>
                          {chainLaunchBuilderSelected
                            ? "Chain stack"
                            : "Network"}
                        </span>
                        <select
                          disabled={
                            !workspace ||
                            serviceState === "submitting" ||
                            serviceProduct === "platform-api" ||
                            serviceProduct === "grpc-api"
                          }
                          onChange={(event) =>
                            setServiceNetwork(
                              event.target.value as ServiceNetwork,
                            )
                          }
                          value={
                            serviceProduct === "platform-api"
                              ? "global"
                              : serviceProduct === "grpc-api"
                                ? "ethereum"
                              : serviceNetwork
                          }
                        >
                          {(chainLaunchBuilderSelected
                            ? chainLaunchStackNetworks
                            : serviceNetworks
                          )
                            .filter(([value]) =>
                              serviceProduct === "rpc-api"
                                ? isSelfServiceRpcNetwork(value)
                                : true,
                            )
                            .map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                        </select>
                        {serviceProduct === "rpc-api" ? (
                          <small>
                            Self-service RPC is available for Ethereum, Base,
                            and Solana. Endpoint availability follows verified
                            upstream readiness.
                          </small>
                        ) : serviceProduct === "grpc-api" ? (
                          <small>
                            Native gRPC targets the shared Ethereum mainnet
                            gateway with global routing. The endpoint appears
                            only after control-plane verification.
                          </small>
                        ) : chainLaunchBuilderSelected ? (
                          <small>
                            This choice records the proposed chain stack for a
                            design-partner project brief. It does not deploy a
                            chain, nodes, RPC, explorer, indexer, monitoring,
                            or snapshots.
                          </small>
                        ) : null}
                      </label>
                      <label>
                        <span>Region</span>
                        <select
                          disabled={
                            !workspace ||
                            serviceState === "submitting" ||
                            serviceProduct === "platform-api" ||
                            serviceProduct === "grpc-api"
                          }
                          onChange={(event) =>
                            setServiceRegion(
                              event.target.value as Service["region"],
                            )
                          }
                          value={
                            serviceProduct === "platform-api" ||
                            serviceProduct === "grpc-api"
                              ? "global"
                              : serviceRegion
                          }
                        >
                          {serviceRegions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="service-create-summary">
                      <span>
                        {serviceProduct === "platform-api"
                          ? "Saves an active record for the implemented platform identity API."
                          : supportedRpcSelected
                            ? `Creates an API-key-protected ${builderRpcDescriptor?.label} gateway when the operator-managed upstream verifies. Otherwise it saves configuration with no endpoint.`
                            : grpcBuilderSelected
                              ? "Creates the native Ethereum gRPC service. A callable endpoint appears only after the control plane verifies the shared HTTP/2 gateway contract."
                              : chainLaunchBuilderSelected
                                ? "Saves a Chain Launch Cloud design-partner project brief with the selected stack and requested RPC, explorer, indexing, monitoring, and snapshot components. This action does not deploy infrastructure or create an endpoint."
                                : "Saves durable setup intent. No endpoint or capacity is claimed."}
                      </span>
                      <button
                        className="button button-solid"
                        disabled={
                          !workspace ||
                          serviceState === "submitting" ||
                          serviceName.trim().length < 2
                        }
                        type="submit"
                      >
                        {serviceState === "submitting"
                          ? "Creating service…"
                          : serviceProduct === "platform-api"
                            ? "Save API configuration"
                            : supportedRpcSelected
                              ? `Create ${builderRpcDescriptor?.label} RPC service`
                              : grpcBuilderSelected
                                ? "Create native gRPC service"
                                : chainLaunchBuilderSelected
                                  ? "Save chain launch project brief"
                                  : "Save setup intent"}
                      </button>
                    </div>
                    {!workspace ? (
                      <small>Create your workspace first.</small>
                    ) : null}
                  </form>

                  <div
                    aria-busy={
                      refreshState === "submitting" ||
                      serviceRenameState === "submitting" ||
                      serviceRenameReloadState === "submitting"
                    }
                    aria-labelledby="services-list-title"
                    className="service-list"
                    role="region"
                  >
                    <div className="service-list-head">
                      <div>
                        <strong id="services-list-title" tabIndex={-1}>
                          Your services
                        </strong>
                        <span>
                          {services.length} configured
                          {lastRefreshedAt
                            ? ` · checked ${formatDate(lastRefreshedAt)}`
                            : ""}
                        </span>
                      </div>
                      <button
                        aria-describedby="service-refresh-status"
                        disabled={
                          refreshState === "submitting" ||
                          serviceRenameDraft !== null
                        }
                        onClick={() => void refreshOperatorData()}
                        type="button"
                      >
                        {refreshState === "submitting"
                          ? "Refreshing..."
                          : "Refresh data"}
                      </button>
                      <span
                        aria-live="polite"
                        className="sr-only"
                        id="service-refresh-status"
                        role="status"
                      >
                        {refreshState === "submitting"
                          ? "Refreshing services, usage, and API keys."
                          : ""}
                      </span>
                    </div>
                    <div
                      aria-label="Service lifecycle states"
                      className="service-lifecycle-legend"
                      role="note"
                    >
                      <span className="is-active">
                        Callable means active with an exact endpoint
                      </span>
                      <span className="is-pending">
                        Not callable means endpoint missing or not verified
                      </span>
                      <span className="is-configuration">
                        Configuration saved means no released capacity
                      </span>
                    </div>
                    {services.length === 0 ? (
                      <div className="service-empty">
                        <span aria-hidden="true">S</span>
                        <strong>No services yet.</strong>
                        <p>
                          Create a platform API, Ethereum RPC, Base RPC, or
                          Solana RPC service. Other products save setup intent
                          until they are available.
                        </p>
                      </div>
                    ) : (
                      services.map((service) => {
                        const endpoint = absoluteServiceEndpoint(
                          browserOrigin,
                          service.endpointPath,
                        );
                        const serviceRpcNetwork =
                          service.product === "rpc-api" &&
                          isSelfServiceRpcNetwork(service.network)
                            ? service.network
                            : null;
                        const isSupportedRpc =
                          serviceRpcNetwork !== null;
                        const baseServiceReadiness =
                          resolveConsoleServiceReadiness(
                            service.status,
                            endpoint,
                          );
                        const serviceReadiness =
                          service.product === "grpc-api" &&
                          baseServiceReadiness === "callable" &&
                          !nativeGrpcDescriptor(service)
                            ? "endpoint-missing"
                            : baseServiceReadiness;
                        const serviceRpcDescriptor = serviceRpcNetwork
                          ? rpcNetworkDescriptor(serviceRpcNetwork)
                          : null;
                        const isActiveRpcGateway =
                          isSupportedRpc &&
                          serviceReadiness === "callable";
                        const requiredRpcScope = rpcRequiredScope(service);
                        const requestExamples =
                          isActiveRpcGateway &&
                          endpoint &&
                          serviceRpcNetwork
                            ? rpcRequestExamples(serviceRpcNetwork, endpoint)
                            : [];
                        const telemetry = serviceTelemetryValues(service);
                        const serviceBoundRpcKeys = isSupportedRpc
                          ? activeKeys.filter(
                              (apiKey) =>
                                apiKey.scopes.includes(requiredRpcScope) &&
                                apiKey.serviceId === service.id,
                            )
                          : [];
                        const editingService =
                          serviceRenameDraft?.serviceId === service.id;
                        const renameProblem = editingService
                          ? serviceRenameDraftProblem(
                              serviceRenameDraft.name,
                              serviceRenameDraft.originalName,
                            )
                          : null;
                        const renameBusy =
                          editingService &&
                          (serviceRenameState === "submitting" ||
                            serviceRenameReloadState === "submitting");

                        return (
                          <article
                            aria-labelledby={`service-record-${service.id}`}
                            className="service-row"
                            key={service.id}
                          >
                            <div className="service-row-top">
                              <span
                                className={`docs-state ${
                                  serviceReadiness === "callable"
                                    ? "docs-state-live"
                                    : serviceReadiness ===
                                        "endpoint-missing"
                                      ? "docs-state-preview"
                                    : "docs-state-proposed"
                                }`}
                              >
                                {serviceReadiness === "callable"
                                  ? isSupportedRpc
                                    ? "Active beta gateway"
                                    : "Callable endpoint"
                                  : serviceReadiness ===
                                      "endpoint-missing"
                                    ? service.product === "grpc-api"
                                      ? "Gateway not verified"
                                      : "Endpoint missing"
                                  : isSupportedRpc
                                    ? "Beta setup pending"
                                    : service.product === "rollups"
                                      ? "Project brief saved"
                                    : "Configuration saved"}
                              </span>
                              {confirmArchiveId === service.id ? (
                                <span
                                  aria-label={`Archive ${service.name} confirmation`}
                                  className="service-archive-confirm"
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      cancelArchiveConfirmation(service.id);
                                    }
                                  }}
                                  role="group"
                                >
                                  <span
                                    id={`archive-warning-${service.id}`}
                                  >
                                    {serviceReadiness === "callable"
                                      ? "Archive stops this endpoint and cannot be undone."
                                      : "Archive removes this saved service record and cannot be undone."}
                                  </span>
                                  <button
                                    aria-label={`Confirm archiving ${service.name}`}
                                    aria-describedby={`archive-warning-${service.id}`}
                                    autoFocus
                                    disabled={
                                      archivingServiceId === service.id ||
                                      serviceRenameDraft !== null
                                    }
                                    onClick={() =>
                                      void archiveService(service)
                                    }
                                    type="button"
                                  >
                                    {archivingServiceId === service.id
                                      ? "Archiving…"
                                      : "Confirm"}
                                  </button>
                                  <button
                                    aria-label={`Cancel archiving ${service.name}`}
                                    disabled={
                                      archivingServiceId === service.id ||
                                      serviceRenameDraft !== null
                                    }
                                    onClick={() =>
                                      cancelArchiveConfirmation(service.id)
                                    }
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  aria-label={`Archive ${service.name}`}
                                  disabled={
                                    archivingServiceId === service.id ||
                                    serviceRenameDraft !== null
                                  }
                                  id={`archive-service-${service.id}`}
                                  onClick={() =>
                                    setConfirmArchiveId(service.id)
                                  }
                                  type="button"
                                >
                                  Archive
                                </button>
                              )}
                            </div>
                            <div className="service-name-heading">
                              <h3
                                id={`service-record-${service.id}`}
                                tabIndex={-1}
                              >
                                {service.name}
                              </h3>
                              {editingService ? (
                                <span>Editing name</span>
                              ) : (
                                <button
                                  aria-label={`Rename ${service.name}`}
                                  disabled={
                                    serviceRenameDraft !== null ||
                                    archivingServiceId !== null ||
                                    confirmArchiveId !== null ||
                                    refreshState === "submitting"
                                  }
                                  id={`rename-service-${service.id}`}
                                  onClick={() =>
                                    beginServiceRename(service)
                                  }
                                  type="button"
                                >
                                  Rename
                                </button>
                              )}
                            </div>
                            {editingService ? (
                              <form
                                aria-busy={renameBusy}
                                aria-label={`Rename ${service.name}`}
                                className="service-rename-form"
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelServiceRename(service.id);
                                  }
                                }}
                                onSubmit={(event) =>
                                  void renameService(event, service)
                                }
                              >
                                <label
                                  htmlFor={`rename-service-input-${service.id}`}
                                >
                                  <span>New service name</span>
                                  <input
                                    aria-describedby={[
                                      `rename-service-help-${service.id}`,
                                      serviceRenameError
                                        ? `rename-service-error-${service.id}`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                    aria-invalid={Boolean(
                                      serviceRenameError,
                                    )}
                                    autoComplete="off"
                                    autoFocus
                                    disabled={renameBusy}
                                    id={`rename-service-input-${service.id}`}
                                    maxLength={80}
                                    minLength={2}
                                    onBlur={() => {
                                      if (renameProblem) {
                                        setServiceRenameError(
                                          renameProblem,
                                        );
                                        setServiceRenameFailureKind(
                                          "other",
                                        );
                                      }
                                    }}
                                    onChange={(event) =>
                                      updateServiceRenameName(
                                        event.target.value,
                                      )
                                    }
                                    required
                                    value={serviceRenameDraft.name}
                                  />
                                  <small
                                    id={`rename-service-help-${service.id}`}
                                  >
                                    Use 2 through 80 characters. This changes
                                    only the display name. Endpoints, keys,
                                    policies, usage, and service configuration
                                    stay unchanged.
                                  </small>
                                </label>
                                <div className="service-rename-actions">
                                  <button
                                    className="button button-solid"
                                    disabled={
                                      renameBusy ||
                                      renameProblem !== null
                                    }
                                    type="submit"
                                  >
                                    {serviceRenameState === "submitting"
                                      ? "Saving name..."
                                      : "Save name"}
                                  </button>
                                  <button
                                    className="button button-outline"
                                    disabled={renameBusy}
                                    onClick={() =>
                                      cancelServiceRename(service.id)
                                    }
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {serviceRenameError ? (
                                  <p
                                    className="service-rename-error"
                                    id={`rename-service-error-${service.id}`}
                                    role="alert"
                                  >
                                    {serviceRenameError}
                                  </p>
                                ) : null}
                                {serviceRenameFailureKind === "conflict" ||
                                serviceRenameFailureKind === "not-found" ? (
                                  <aside
                                    className="service-rename-reload"
                                    role="note"
                                  >
                                    <strong>Reload required</strong>
                                    <p>
                                      Nodezuno will not retry this rename
                                      automatically. Reloading discards this
                                      unsaved draft so the next edit starts
                                      from the latest service timestamp.
                                    </p>
                                    <button
                                      className="button button-outline"
                                      disabled={renameBusy}
                                      onClick={() =>
                                        void reloadServiceAfterRenameIssue(
                                          service.id,
                                        )
                                      }
                                      type="button"
                                    >
                                      {serviceRenameReloadState ===
                                      "submitting"
                                        ? "Reloading service..."
                                        : "Reload current service"}
                                    </button>
                                  </aside>
                                ) : null}
                                <span
                                  aria-atomic="true"
                                  className="sr-only"
                                  role="status"
                                >
                                  {serviceRenameState === "submitting"
                                    ? `Saving the new name for ${service.name}.`
                                    : serviceRenameReloadState ===
                                        "submitting"
                                      ? `Reloading ${service.name}.`
                                      : ""}
                                </span>
                              </form>
                            ) : null}
                            <p>
                              {serviceProductLabel(service.product)} ·{" "}
                              {service.environment} · {service.network} ·{" "}
                              {service.region}
                            </p>
                            <div className="service-record-meta">
                              <span>
                                Service ID <code>{service.id}</code>
                              </span>
                              <span>
                                Created {formatDate(service.createdAt)}
                              </span>
                              <span>
                                Updated {formatDate(service.updatedAt)}
                              </span>
                            </div>

                            {isSupportedRpc ? (
                              isActiveRpcGateway &&
                              endpoint &&
                              requestExamples.length > 0 ? (
                                <section
                                  aria-label={`${service.name} ${serviceRpcDescriptor?.label} RPC access`}
                                  className="rpc-service-panel"
                                >
                                  <dl className="rpc-service-facts">
                                    <div>
                                      <dt>Service status</dt>
                                      <dd>
                                        <code>active</code>
                                        <small>
                                          Endpoint is callable. Archive only
                                          after traffic has moved elsewhere.
                                        </small>
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Release maturity</dt>
                                      <dd>
                                        <code>
                                          {serviceRpcDescriptor?.label} beta
                                        </code>
                                        <small>
                                          The server returned an active
                                          endpoint. Bounded methods and quotas
                                          apply. No production SLA is claimed.
                                        </small>
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Service-bound active keys</dt>
                                      <dd>
                                        <code>
                                          {serviceBoundRpcKeys.length}
                                        </code>
                                        <small>
                                          Each key is assigned to this service
                                          and has{" "}
                                          <code>{requiredRpcScope}</code>.
                                          Unbound identity keys and keys bound
                                          to another service are rejected.
                                        </small>
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Authentication</dt>
                                      <dd>
                                        <code>
                                          Authorization: Bearer
                                          $NODEZUNO_API_KEY
                                        </code>
                                        <small>
                                          Required scope:{" "}
                                          <code>{requiredRpcScope}</code>. Keys
                                          created before RPC access was
                                          introduced must be revoked and
                                          replaced below.
                                        </small>
                                      </dd>
                                    </div>
                                  </dl>

                                  <div className="rpc-service-endpoint">
                                    <span>
                                      {serviceRpcDescriptor?.protocolLabel}{" "}
                                      endpoint
                                    </span>
                                    <code>{endpoint}</code>
                                    <button
                                      onClick={() =>
                                        void copyRpcEndpoint(service, endpoint)
                                      }
                                      type="button"
                                    >
                                      {rpcEndpointCopyState[service.id] ===
                                      "copied"
                                        ? "Endpoint copied"
                                        : rpcEndpointCopyState[service.id] ===
                                            "error"
                                          ? "Copy failed, retry"
                                        : "Copy endpoint"}
                                    </button>
                                    <span
                                      aria-atomic="true"
                                      className="sr-only"
                                      role="status"
                                    >
                                      {copyStatusMessage(
                                        rpcEndpointCopyState[service.id],
                                        `${serviceRpcDescriptor?.label ?? "RPC"} endpoint`,
                                      )}
                                    </span>
                                    <small>
                                      A Nodezuno API key is required on every
                                      request.
                                    </small>
                                  </div>

                                  <div
                                    aria-label={`${serviceRpcDescriptor?.label} curl examples`}
                                    className="rpc-curl-examples"
                                  >
                                    {requestExamples.map((example) => {
                                      const copyKey = `${service.id}:${example.id}`;
                                      const currentCopyState =
                                        rpcCopyState[copyKey] ?? "idle";
                                      return (
                                        <div
                                          className="rpc-curl-example"
                                          key={example.id}
                                        >
                                          <div className="rpc-curl-heading">
                                            <div>
                                              <span>{example.method}</span>
                                              <strong>
                                                {example.title}
                                              </strong>
                                            </div>
                                            <button
                                              aria-label={`Copy ${example.method} curl example for ${service.name}`}
                                              onClick={() =>
                                                void copyRpcExample(
                                                  copyKey,
                                                  example.curl,
                                                )
                                              }
                                              type="button"
                                            >
                                              {currentCopyState === "copied"
                                                ? "Copied"
                                                : "Copy curl"}
                                            </button>
                                          </div>
                                          <pre tabIndex={0}>
                                            <code>{example.curl}</code>
                                          </pre>
                                          <span
                                            aria-live="polite"
                                            className="rpc-copy-status"
                                            role="status"
                                          >
                                            {currentCopyState === "copied"
                                              ? "Curl example copied."
                                              : currentCopyState === "error"
                                                ? "Copy failed. Select the example and copy it manually."
                                                : ""}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {telemetry ? (
                                    <div className="rpc-telemetry">
                                      <div className="rpc-telemetry-heading">
                                        <strong>Measured usage</strong>
                                        {telemetry.windowStartedAt ||
                                        telemetry.measuredAt ? (
                                          <small>
                                            {[
                                              telemetry.windowStartedAt
                                                ? `Since ${formatDate(
                                                    telemetry.windowStartedAt,
                                                  )}`
                                                : null,
                                              telemetry.measuredAt
                                                ? `Updated ${formatDate(
                                                    telemetry.measuredAt,
                                                  )}`
                                                : null,
                                            ]
                                              .filter(Boolean)
                                              .join(" · ")}
                                          </small>
                                        ) : null}
                                      </div>
                                      <dl>
                                        {telemetry.requestCount !== null ? (
                                          <div>
                                            <dt>Requests</dt>
                                            <dd>
                                              {formatMetric(
                                                telemetry.requestCount,
                                                0,
                                              )}
                                            </dd>
                                          </div>
                                        ) : null}
                                        {telemetry.callCount !== null ? (
                                          <div>
                                            <dt>RPC calls</dt>
                                            <dd>
                                              {formatMetric(
                                                telemetry.callCount,
                                                0,
                                              )}
                                            </dd>
                                          </div>
                                        ) : null}
                                        {telemetry.errorRatePercent !== null ? (
                                          <div>
                                            <dt>Error rate</dt>
                                            <dd>
                                              {formatMetric(
                                                telemetry.errorRatePercent,
                                              )}
                                              %
                                            </dd>
                                          </div>
                                        ) : null}
                                        {telemetry.averageLatencyMs !== null ? (
                                          <div>
                                            <dt>Average latency</dt>
                                            <dd>
                                              {formatMetric(
                                                telemetry.averageLatencyMs,
                                              )}{" "}
                                              ms
                                            </dd>
                                          </div>
                                        ) : null}
                                        {telemetry.upstreamFailureCount !==
                                        null ? (
                                          <div>
                                            <dt>Upstream failures</dt>
                                            <dd>
                                              {formatMetric(
                                                telemetry.upstreamFailureCount,
                                                0,
                                              )}
                                            </dd>
                                          </div>
                                        ) : null}
                                      </dl>
                                    </div>
                                  ) : (
                                    <small className="rpc-telemetry-empty">
                                      No measured request, error, or latency
                                      telemetry has been returned for this
                                      service yet.
                                    </small>
                                  )}
                                  <div className="rpc-quota-guidance">
                                    <div>
                                      <strong>Hourly quota visibility</strong>
                                      <span>Response headers are authoritative</span>
                                    </div>
                                    <p>
                                      RPC methods consume weighted quota units,
                                      so the retained call totals above are not
                                      a live remaining balance. Read{" "}
                                      <code>X-RateLimit-Limit</code>,{" "}
                                      <code>X-RateLimit-Remaining</code>, and{" "}
                                      <code>X-RateLimit-Reset</code> on each
                                      successful response. The one-click test
                                      in the network quickstart presents those
                                      values when the key is still in memory.
                                    </p>
                                    <Link
                                      href={`${rpcConsolePath(serviceRpcNetwork)}#rpc-launchpad`}
                                    >
                                      Open {serviceRpcDescriptor?.label} RPC
                                      quickstart
                                    </Link>
                                  </div>
                                </section>
                              ) : (
                                <div
                                  className="rpc-setup-state"
                                  role="status"
                                >
                                  <strong>
                                    {service.status === "active"
                                      ? "Gateway endpoint unavailable"
                                      : `${serviceRpcDescriptor?.label} configuration saved`}
                                  </strong>
                                  <p>
                                    {service.status === "active"
                                      ? "This service reports active, but its response did not include an endpoint. Do not send production traffic until an endpoint appears."
                                      : `This deployment has not verified its operator-managed ${serviceRpcDescriptor?.mainnetLabel} upstream. The configuration is saved with no endpoint and needs no sales approval.`}
                                  </p>
                                  <small>
                                    Service status:{" "}
                                    <code>{service.status}</code>
                                  </small>
                                </div>
                              )
                            ) : serviceReadiness === "callable" && endpoint ? (
                              <code className="service-endpoint">
                                {endpoint}
                              </code>
                            ) : (
                              <small className="service-unavailable">
                                {service.product === "rollups"
                                  ? "This is a design-partner project brief, not a deployment. No chain, nodes, RPC, explorer, indexing, monitoring, snapshots, or callable endpoint were created."
                                  : "No callable endpoint is available for this product. Your setup is saved for future self-service activation."}
                              </small>
                            )}
                            <Link
                              href={
                                service.product === "platform-api"
                                  ? "/developers/docs"
                                  : service.product === "grpc-api"
                                    ? "/console?product=grpc-api#grpc-launchpad"
                                  : `/products/${service.product}`
                              }
                            >
                              {service.product === "grpc-api"
                                ? "Open native gRPC quickstart"
                                : "View product details"}{" "}
                              <span aria-hidden="true">↗</span>
                            </Link>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              </section>

              <AiOperationsPanel services={services} />

              <section className="api-key-section" aria-labelledby="api-keys-title">
                <div className="console-section-heading">
                  <div>
                    <span className="section-kicker">03 / Credentials</span>
                    <h2 id="api-keys-title" tabIndex={-1}>
                      API keys under your control.
                    </h2>
                  </div>
                  <p>
                    Create separate keys for each environment. Store every
                    secret in a secure vault and revoke it here when it is no
                    longer needed.
                  </p>
                </div>

                {secretReceipt &&
                !rpcProbeCredential &&
                !grpcCredential ? (
                  <aside
                    aria-labelledby="api-one-time-secret-title"
                    className="api-secret-receipt"
                    role="region"
                  >
                    <div>
                      <span className="docs-state docs-state-preview">
                        Shown once
                      </span>
                      <h3
                        id="api-one-time-secret-title"
                        tabIndex={-1}
                      >
                        Save this secret now.
                      </h3>
                      <p>
                        Nodezuno cannot recover it after you dismiss this card
                        or leave the page.
                      </p>
                      <small className="api-secret-scope">
                        Access boundary:{" "}
                        {secretReceipt.apiKey.serviceId
                          ? serviceNamesById.get(
                            secretReceipt.apiKey.serviceId,
                          ) ?? "one bound service"
                          : unboundApiKeyAccessBoundary(
                              secretReceipt.apiKey,
                            )}
                      </small>
                    </div>
                    <code>{secretReceipt.secret}</code>
                    <div className="api-secret-actions">
                      <button
                        className="button button-solid"
                        onClick={() => void copySecret()}
                        type="button"
                      >
                        {copyState === "copied" ? "Copied" : "Copy secret"}
                      </button>
                      <button
                        className="button button-outline"
                        onClick={downloadSecret}
                        type="button"
                      >
                        {downloadState === "downloaded"
                          ? "Downloaded"
                          : "Download secret"}
                      </button>
                      <button
                        className="button button-outline"
                        onClick={() =>
                          dismissOneTimeSecret("api-keys-list-title")
                        }
                        type="button"
                      >
                        I have saved it
                      </button>
                    </div>
                    <span
                      aria-atomic="true"
                      className="sr-only"
                      role="status"
                    >
                      {copyStatusMessage(copyState, "API key secret")}
                      {downloadState === "downloaded"
                        ? " API key secret downloaded."
                        : downloadState === "error"
                          ? " API key secret was not downloaded."
                          : ""}
                    </span>
                    {copyState === "error" ? (
                      <p className="api-secret-copy-error" role="alert">
                        Clipboard access failed. Select and copy the secret
                        manually before dismissing it.
                      </p>
                    ) : null}
                    {downloadState === "error" ? (
                      <p className="api-secret-copy-error" role="alert">
                        The secure file could not be created. Copy the secret
                        manually before dismissing it.
                      </p>
                    ) : null}
                  </aside>
                ) : null}

                {automationSecretReceipt ? (
                  <ServiceAutomationQuickstart
                    apiKeyName={automationSecretReceipt.apiKey.name}
                    browserOrigin={browserOrigin}
                  />
                ) : null}

                {legacyRpcKeys.length > 0 ? (
                  <aside className="api-key-scope-warning" role="status">
                    <div>
                      <strong>Replace older keys for RPC access.</strong>
                      <p>
                        {legacyRpcKeys.length} active{" "}
                        {legacyRpcKeys.length === 1 ? "key does" : "keys do"}{" "}
                        not include <code>rpc:invoke</code> and cannot call the
                        gateway. Revoke each older key and create a replacement.
                      </p>
                    </div>
                    <span>{legacyRpcKeys.length} to replace</span>
                  </aside>
                ) : null}

                <div className="api-key-layout">
                  <form
                    aria-busy={keyState === "submitting"}
                    className="api-key-create"
                    onSubmit={createApiKey}
                  >
                    <span className="docs-state docs-state-live">
                      Self-service
                    </span>
                    <h3>Create an API key.</h3>
                    <p>
                      The full secret is returned once. This advanced form
                      creates an unbound key for one explicit workspace
                      purpose. Use an RPC or native gRPC quickstart for a
                      least-privilege key bound to one callable service.
                    </p>
                    <fieldset
                      aria-describedby="api-key-purpose-help"
                      className="api-key-purpose"
                      disabled={
                        !workspace ||
                        !canCreateAdvancedKey ||
                        Boolean(secretReceipt) ||
                        keyState === "submitting"
                      }
                    >
                      <legend>Unbound key purpose</legend>
                      <div>
                        {unboundApiKeyPurposes.map((purpose) => (
                          <label
                            className={
                              keyPurpose === purpose.id
                                ? "is-selected"
                                : ""
                            }
                            key={purpose.id}
                          >
                            <input
                              checked={keyPurpose === purpose.id}
                              name="unbound-api-key-purpose"
                              onChange={() =>
                                chooseKeyPurpose(purpose.id)
                              }
                              type="radio"
                              value={purpose.id}
                            />
                            <span>
                              <strong>{purpose.label}</strong>
                              <code>{purpose.scope}</code>
                              <small>{purpose.description}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <p
                      className="api-key-purpose-help"
                      id="api-key-purpose-help"
                    >
                      Platform identity omits the scopes field so the server
                      keeps its default. Service automation sends exactly{" "}
                      <code>services:manage</code>. Neither unbound purpose is
                      accepted as an RPC or native gRPC bearer credential.
                    </p>
                    <label className="api-key-name-field">
                      <span>Key name</span>
                      <input
                        disabled={
                          !workspace ||
                          !canCreateAdvancedKey ||
                          Boolean(secretReceipt)
                        }
                        maxLength={60}
                        minLength={2}
                        onChange={(event) => setKeyName(event.target.value)}
                        placeholder={defaultUnboundApiKeyName(keyPurpose)}
                        required
                        value={keyName}
                      />
                    </label>
                    <button
                      className="button button-solid"
                      disabled={
                        !workspace ||
                        !canCreateAdvancedKey ||
                        Boolean(secretReceipt) ||
                        keyState === "submitting" ||
                        keyName.trim().length < 2
                      }
                      type="submit"
                    >
                      {keyState === "submitting"
                        ? "Creating key…"
                        : keyPurpose === "service-automation"
                          ? "Create automation key"
                          : "Create identity key"}
                    </button>
                    {!workspace ? (
                      <small>Create your workspace first.</small>
                    ) : !canCreateAdvancedKey ? (
                      <small>
                        Only a workspace owner or admin can create unbound
                        keys.
                      </small>
                    ) : null}
                  </form>

                  <div
                    aria-busy={
                      refreshState === "submitting" ||
                      rotatingId !== null
                    }
                    aria-labelledby="api-keys-list-title"
                    className="api-key-list"
                    role="region"
                  >
                    <div className="api-key-list-head">
                      <strong id="api-keys-list-title" tabIndex={-1}>
                        Workspace keys
                      </strong>
                      <span>
                        {activeKeys.length} active / {apiKeys.length} total
                      </span>
                    </div>
                    {workspace &&
                    !canRotateApiKeys(workspace.role) &&
                    activeKeys.length > 0 ? (
                      <p className="api-key-role-note">
                        An owner or admin can rotate active keys. Developers
                        can inspect key metadata and access boundaries.
                      </p>
                    ) : null}
                    {apiKeys.length === 0 ? (
                      <div className="api-key-empty">
                        <span aria-hidden="true">NZ</span>
                        <strong>No API keys yet.</strong>
                        <p>Create a named key when your workspace is ready.</p>
                      </div>
                    ) : (
                      apiKeys.map((apiKey) => {
                        const rotatedLocally =
                          locallyRotatedSourceIds.has(apiKey.id);
                        const activeAndUnexpired =
                          isApiKeyActiveAndUnexpired(
                            apiKey,
                            keyStatusNow,
                          );
                        const rotationEligible =
                          !rotatedLocally &&
                          isApiKeyRotationEligible(
                            workspace?.role,
                            apiKey,
                            keyStatusNow,
                          );
                        const inactive =
                          Boolean(apiKey.revokedAt) ||
                          rotatedLocally ||
                          !activeAndUnexpired;
                        const serviceAutomationKey =
                          isServiceAutomationApiKey(apiKey);

                        return (
                          <article
                            aria-labelledby={`api-key-name-${apiKey.id}`}
                            className={`api-key-row ${
                              inactive ? "api-key-revoked" : ""
                            }`}
                            key={apiKey.id}
                          >
                          <div className="api-key-icon" aria-hidden="true">
                            K
                          </div>
                          <div className="api-key-copy">
                            <strong id={`api-key-name-${apiKey.id}`}>
                              {apiKey.name}
                            </strong>
                            <code>
                              {apiKey.prefix}••••{apiKey.lastFour}
                            </code>
                            <div
                              className={`api-key-binding ${
                                apiKey.serviceId
                                  ? "is-service-bound"
                                  : serviceAutomationKey
                                    ? "is-unbound-automation"
                                    : "is-unbound-identity"
                              }`}
                            >
                              <span>
                                {apiKey.serviceId
                                  ? "Service-bound"
                                  : serviceAutomationKey
                                    ? "Unbound automation key"
                                    : "Unbound identity key"}
                              </span>
                              <strong>
                                {apiKey.serviceId
                                  ? serviceNamesById.get(apiKey.serviceId) ??
                                    "Bound service unavailable"
                                  : serviceAutomationKey
                                    ? "Service automation"
                                    : "Platform identity only"}
                              </strong>
                              {!apiKey.serviceId ? (
                                <small>
                                  {serviceAutomationKey
                                    ? "Accepted only by the programmatic service control plane. Not accepted by RPC or native gRPC services."
                                    : "Not accepted by RPC or native gRPC services."}
                                </small>
                              ) : null}
                              {apiKey.serviceId &&
                              !serviceNamesById.has(apiKey.serviceId) ? (
                                <small>
                                  The bound service may be archived. This key
                                  cannot be reassigned to another service.
                                </small>
                              ) : null}
                            </div>
                            <span className="api-key-scopes">
                              {apiKey.scopes.map((scope) => (
                                <i key={scope}>{scope}</i>
                              ))}
                            </span>
                            <small>
                              Created {formatDate(apiKey.createdAt)}
                              {" · "}
                              Last used {formatDate(apiKey.lastUsedAt)}
                              {" · "}
                              Expires {formatDate(apiKey.expiresAt)}
                            </small>
                          </div>
                          {apiKey.revokedAt || rotatedLocally ? (
                            <span className="key-revoked-label">
                              {rotatedLocally
                                ? "Revoked by rotation"
                                : "Revoked"}
                            </span>
                          ) : !activeAndUnexpired ? (
                            <span className="key-revoked-label">Expired</span>
                          ) : confirmRotateId === apiKey.id ? (
                            <div
                              aria-busy={rotatingId === apiKey.id}
                              aria-label={`Rotate ${apiKey.name} confirmation`}
                              className="key-rotate-confirm"
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Escape" &&
                                  rotatingId !== apiKey.id
                                ) {
                                  event.preventDefault();
                                  cancelRotateConfirmation(apiKey.id);
                                }
                              }}
                              role="group"
                            >
                              <p id={`rotate-warning-${apiKey.id}`}>
                                Rotation is atomic. Success revokes this source
                                and creates one replacement with the same
                                service binding and scopes.
                              </p>
                              <label>
                                <span>Replacement name (optional)</span>
                                <input
                                  aria-describedby={`rotate-warning-${apiKey.id}`}
                                  autoComplete="off"
                                  autoFocus
                                  disabled={rotatingId === apiKey.id}
                                  maxLength={60}
                                  onChange={(event) => {
                                    setRotationName(event.target.value);
                                    setRotationError("");
                                  }}
                                  placeholder={apiKey.name}
                                  value={rotationName}
                                />
                                <small>
                                  Leave blank to use the source key name.
                                </small>
                              </label>
                              {rotationError ? (
                                <p
                                  className="key-rotate-error"
                                  role="alert"
                                >
                                  {rotationError}
                                </p>
                              ) : null}
                              <div className="key-rotate-actions">
                                <button
                                  aria-describedby={`rotate-warning-${apiKey.id}`}
                                  className="key-rotate-confirm-button"
                                  disabled={
                                    rotatingId === apiKey.id ||
                                    (rotationName.trim().length > 0 &&
                                      rotationName.trim().length < 2)
                                  }
                                  onClick={() =>
                                    void rotateApiKey(apiKey)
                                  }
                                  type="button"
                                >
                                  {rotatingId === apiKey.id
                                    ? "Rotating key..."
                                    : "Rotate and revoke source"}
                                </button>
                                <button
                                  disabled={rotatingId === apiKey.id}
                                  onClick={() =>
                                    cancelRotateConfirmation(apiKey.id)
                                  }
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : confirmRevokeId === apiKey.id ? (
                            <div
                              aria-label={`Revoke ${apiKey.name} confirmation`}
                              className="key-revoke-confirm"
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelRevokeConfirmation(apiKey.id);
                                }
                              }}
                              role="group"
                            >
                              <span id={`revoke-warning-${apiKey.id}`}>
                                Revoke immediately? Requests using this key will
                                fail.
                              </span>
                              <button
                                aria-label={`Confirm revoking ${apiKey.name}`}
                                aria-describedby={`revoke-warning-${apiKey.id}`}
                                autoFocus
                                disabled={revokingId === apiKey.id}
                                onClick={() => void revokeApiKey(apiKey)}
                                type="button"
                              >
                                {revokingId === apiKey.id
                                  ? "Revoking…"
                                  : "Confirm"}
                              </button>
                              <button
                                aria-label={`Cancel revoking ${apiKey.name}`}
                                disabled={revokingId === apiKey.id}
                                onClick={() =>
                                  cancelRevokeConfirmation(apiKey.id)
                                }
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="key-action-buttons">
                              {rotationEligible ? (
                                <button
                                  aria-label={`Rotate ${apiKey.name}`}
                                  className="key-rotate-button"
                                  id={`rotate-key-${apiKey.id}`}
                                  onClick={() =>
                                    beginRotateConfirmation(apiKey)
                                  }
                                  type="button"
                                >
                                  Rotate
                                </button>
                              ) : null}
                              <button
                                aria-label={`Revoke ${apiKey.name}`}
                                className="key-revoke-button"
                                id={`revoke-key-${apiKey.id}`}
                                onClick={() =>
                                  beginRevokeConfirmation(apiKey.id)
                                }
                                type="button"
                              >
                                Revoke
                              </button>
                            </div>
                          )}
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="api-auth-quickstart">
                  <div>
                    <span className="docs-state docs-state-live">
                      Live authentication
                    </span>
                    <h3>Verify a key against your workspace.</h3>
                    <p>
                      The identity endpoint confirms the workspace, key, and
                      scopes represented by a Nodezuno API key. Check the
                      listed scopes before use. RPC calls require{" "}
                      <code>rpc:invoke</code>, and a service-bound key works
                      only with its assigned Ethereum, Base, or Solana gateway.
                      Unbound identity keys have{" "}
                      <code>platform:identity</code>. Unbound automation keys
                      have <code>services:manage</code> and work only with the
                      programmatic service control plane. Neither unbound key
                      is accepted by RPC or native gRPC services.
                    </p>
                  </div>
                  <pre aria-label="API key authentication curl example">
                    <code>{`curl "${browserOrigin}/api/v1/platform/whoami" \\
  -H "Authorization: Bearer $NODEZUNO_API_KEY"`}</code>
                  </pre>
                </div>
              </section>
            </>
          )}

          <section className="console-product-section" aria-labelledby="available-products-title">
            <div className="console-section-heading">
              <div>
                <span className="section-kicker">04 / Product access</span>
                <h2 id="available-products-title">Use what is live. See what comes next.</h2>
              </div>
              <p>
                Availability is published plainly. Your workspace is the access
                point, with no sales gate between your company and a released
                product.
              </p>
            </div>

            <div className="console-catalog-block">
              <div className="console-catalog-title">
                <div>
                  <span className="docs-state docs-state-live">
                    Available now
                  </span>
                  <h3>Website developer APIs</h3>
                </div>
                <Link href="/developers/docs">
                  Read API documentation <span aria-hidden="true">↗</span>
                </Link>
              </div>
              <div className="available-api-grid">
                {websiteCapabilities.map((capability) => (
                  <Link href={capability.href} key={capability.title}>
                    <span>{capability.endpoint}</span>
                    <h4>{capability.title}</h4>
                    <p>{capability.description}</p>
                    <i aria-hidden="true">↗</i>
                  </Link>
                ))}
              </div>
            </div>

            <div className="console-catalog-block console-rpc-block">
              <div className="console-catalog-title">
                <div>
                  <span className="docs-state docs-state-preview">
                    Self-service setup
                  </span>
                  <h3>Multi-chain RPC API</h3>
                </div>
                <p>
                  Create the service here. A callable endpoint appears only
                  after this deployment confirms an upstream configuration.
                </p>
              </div>
              <Link
                className="rpc-catalog-action"
                href="/console?product=rpc-api#services-title"
              >
                <div>
                  <span>Ethereum · Base · Solana JSON-RPC</span>
                  <h4>Provision an API-key-protected gateway.</h4>
                  <p>
                    No sales review. Callable services include the exact
                    endpoint, required scope, request example, and measured
                    usage when the server returns it.
                  </p>
                </div>
                <strong>
                  Configure an RPC gateway <span aria-hidden="true">↗</span>
                </strong>
              </Link>
            </div>

            <div className="console-catalog-block console-prelaunch-block">
              <div className="console-catalog-title">
                <div>
                  <span className="docs-state docs-state-proposed">
                    Prelaunch
                  </span>
                  <h3>Infrastructure products in development</h3>
                </div>
                <p>
                  Architecture is published. Endpoints are not connected yet,
                  so these products cannot honestly be activated today.
                </p>
              </div>
              <div className="prelaunch-product-grid">
                {prelaunchProducts.map(([title, href, plane], index) => {
                  const product = href.replace("/products/", "");
                  return (
                    <Link
                      href={`/console?product=${encodeURIComponent(product)}#services-title`}
                      key={href}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <small>{plane}</small>
                        <h4>{title}</h4>
                      </div>
                      <strong>Configure</strong>
                    </Link>
                  );
                })}
              </div>
              <div className="prelaunch-note">
                <span aria-hidden="true">i</span>
                <p>
                  Product activation will appear in this console as each
                  service becomes operational. You will not need to contact
                  sales to start using a released self-service product.
                </p>
              </div>
            </div>
          </section>

          <section className="console-help-section">
            <div>
              <span className="section-kicker">Build independently</span>
              <h2>Everything starts here.</h2>
              <p>
                Use the console, API contracts, and operating guides without
                waiting for an introduction, review, or commercial call.
              </p>
            </div>
            <Link className="button button-outline button-large" href="/developers/docs">
              Open developer docs
            </Link>
          </section>
        </div>
      </section>
    </main>
  );
}
