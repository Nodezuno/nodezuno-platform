import { HttpProblem } from "./http.ts";
import type { RpcNetwork } from "./ethereum-rpc.ts";

export const developerRpcUsageWindows = [
  "24h",
  "7d",
  "30d",
] as const;

export type DeveloperRpcUsageWindow =
  (typeof developerRpcUsageWindows)[number];
export type DeveloperRpcUsageResolution = "1h" | "6h" | "1d";

export type DeveloperRpcUsageWindowDefinition = {
  durationMs: number;
  intervalMs: number;
  resolution: DeveloperRpcUsageResolution;
  pointCount: number;
};

export type DeveloperRpcUsageMetrics = {
  quotaUnits: number;
  requests: number;
  calls: number;
  errors: number;
  upstreamFailures: number;
  latencyMsTotal: number;
  bytesIn: number;
  bytesOut: number;
  lastRequestAt: number | null;
};

export type DeveloperRpcUsageSeriesPoint =
  DeveloperRpcUsageMetrics & {
    startAt: number;
  };

export type DeveloperRpcUsageApiKey = DeveloperRpcUsageMetrics & {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  revokedAt: number | null;
};

export type DeveloperRpcUsageReport = {
  service: {
    id: string;
    name: string;
    network: RpcNetwork;
  };
  window: DeveloperRpcUsageWindow;
  resolution: DeveloperRpcUsageResolution;
  generatedAt: number;
  startAt: number;
  endAt: number;
  summary: DeveloperRpcUsageMetrics;
  currentHourQuota: {
    serviceUnits: number;
    workspaceUnits: number;
    workspaceLimit: number | null;
    workspaceRemaining: number | null;
    resetAt: number;
  };
  series: DeveloperRpcUsageSeriesPoint[];
  apiKeys: DeveloperRpcUsageApiKey[];
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const definitions: Record<
  DeveloperRpcUsageWindow,
  DeveloperRpcUsageWindowDefinition
> = {
  "24h": {
    durationMs: DAY_MS,
    intervalMs: HOUR_MS,
    resolution: "1h",
    pointCount: 24,
  },
  "7d": {
    durationMs: 7 * DAY_MS,
    intervalMs: 6 * HOUR_MS,
    resolution: "6h",
    pointCount: 28,
  },
  "30d": {
    durationMs: 30 * DAY_MS,
    intervalMs: DAY_MS,
    resolution: "1d",
    pointCount: 30,
  },
};

export function parseDeveloperRpcUsageWindow(
  value: string | null,
): DeveloperRpcUsageWindow {
  const candidate = value ?? "24h";
  if (
    !developerRpcUsageWindows.includes(
      candidate as DeveloperRpcUsageWindow,
    )
  ) {
    throw new HttpProblem(
      400,
      "rpc_usage_window_invalid",
      "Choose a supported RPC usage window.",
      { window: "Use 24h, 7d, or 30d." },
    );
  }
  return candidate as DeveloperRpcUsageWindow;
}

export function developerRpcUsageWindowDefinition(
  window: DeveloperRpcUsageWindow,
): DeveloperRpcUsageWindowDefinition {
  return definitions[window];
}

export function emptyDeveloperRpcUsageMetrics(): DeveloperRpcUsageMetrics {
  return {
    quotaUnits: 0,
    requests: 0,
    calls: 0,
    errors: 0,
    upstreamFailures: 0,
    latencyMsTotal: 0,
    bytesIn: 0,
    bytesOut: 0,
    lastRequestAt: null,
  };
}

export function serializeDeveloperRpcUsage(
  report: DeveloperRpcUsageReport,
) {
  return {
    service: report.service,
    window: report.window,
    resolution: report.resolution,
    generatedAt: new Date(report.generatedAt).toISOString(),
    startAt: new Date(report.startAt).toISOString(),
    endAt: new Date(report.endAt).toISOString(),
    summary: serializeMetrics(report.summary),
    currentHourQuota: {
      serviceUnits: report.currentHourQuota.serviceUnits,
      workspaceUnits: report.currentHourQuota.workspaceUnits,
      workspaceLimit: report.currentHourQuota.workspaceLimit,
      workspaceRemaining: report.currentHourQuota.workspaceRemaining,
      resetAt: new Date(
        report.currentHourQuota.resetAt,
      ).toISOString(),
    },
    series: report.series.map((point) => ({
      startAt: new Date(point.startAt).toISOString(),
      ...serializeMetrics(point),
    })),
    apiKeys: report.apiKeys.map((apiKey) => ({
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      lastFour: apiKey.lastFour,
      revokedAt:
        apiKey.revokedAt === null
          ? null
          : new Date(apiKey.revokedAt).toISOString(),
      ...serializeMetrics(apiKey),
    })),
  };
}

function serializeMetrics(metrics: DeveloperRpcUsageMetrics) {
  return {
    quotaUnits: metrics.quotaUnits,
    requests: metrics.requests,
    calls: metrics.calls,
    errors: metrics.errors,
    upstreamFailures: metrics.upstreamFailures,
    averageLatencyMs:
      metrics.requests === 0
        ? null
        : Math.round(
            (metrics.latencyMsTotal / metrics.requests) * 100,
          ) / 100,
    successRate:
      metrics.calls === 0
        ? null
        : Math.round(
            Math.max(
              0,
              Math.min(1, 1 - metrics.errors / metrics.calls),
            ) * 10_000,
          ) / 10_000,
    bytesIn: metrics.bytesIn,
    bytesOut: metrics.bytesOut,
    lastRequestAt:
      metrics.lastRequestAt === null
        ? null
        : new Date(metrics.lastRequestAt).toISOString(),
  };
}
