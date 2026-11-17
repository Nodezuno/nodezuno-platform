export const rpcUsageWindows = ["24h", "7d", "30d"] as const;

export type RpcUsageWindow = (typeof rpcUsageWindows)[number];
export type RpcUsageResolution = "1h" | "6h" | "1d";
export type RpcUsageNetwork = "ethereum" | "base" | "solana";

export type RpcUsageMetrics = {
  quotaUnits: number;
  requests: number;
  calls: number;
  errors: number;
  upstreamFailures: number;
  averageLatencyMs: number | null;
  successRate: number | null;
  bytesIn: number;
  bytesOut: number;
  lastRequestAt: string | null;
};

export type RpcUsageSeriesPoint = RpcUsageMetrics & {
  startAt: string;
};

export type RpcUsageApiKey = RpcUsageMetrics & {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  revokedAt: string | null;
};

export type RpcUsageReport = {
  service: {
    id: string;
    name: string;
    network: RpcUsageNetwork;
  };
  window: RpcUsageWindow;
  resolution: RpcUsageResolution;
  generatedAt: string;
  startAt: string;
  endAt: string;
  summary: RpcUsageMetrics;
  currentHourQuota: {
    serviceUnits: number;
    workspaceUnits: number;
    workspaceLimit: number | null;
    workspaceRemaining: number | null;
    resetAt: string;
  };
  series: RpcUsageSeriesPoint[];
  apiKeys: RpcUsageApiKey[];
};

export type RpcUsageEnvelope = {
  report: RpcUsageReport;
  requestId: string;
};

export type RpcUsageChartModel = {
  callPoints: string;
  errorPoints: string;
  maximum: number;
  hasTraffic: boolean;
};

const resolutionByWindow: Record<
  RpcUsageWindow,
  RpcUsageResolution
> = {
  "24h": "1h",
  "7d": "6h",
  "30d": "1d",
};

export function parseRpcUsageEnvelope(
  payload: unknown,
): RpcUsageEnvelope {
  const envelope = objectRecord(
    payload,
    "The usage response was not a JSON object.",
  );
  const requestId = nonemptyString(
    envelope.requestId,
    "The usage response did not include a request identifier.",
  );
  const data = objectRecord(
    envelope.data,
    "The usage response did not include a report.",
  );
  const window = enumValue(
    data.window,
    rpcUsageWindows,
    "The usage response contained an unsupported window.",
  );
  const resolution = enumValue(
    data.resolution,
    ["1h", "6h", "1d"] as const,
    "The usage response contained an unsupported resolution.",
  );
  if (resolutionByWindow[window] !== resolution) {
    throw new Error(
      "The usage response resolution did not match its window.",
    );
  }
  const series = arrayValue(
    data.series,
    "The usage response did not include a time series.",
  ).map(parseSeriesPoint);
  const apiKeys = arrayValue(
    data.apiKeys,
    "The usage response did not include an API key breakdown.",
  ).map(parseApiKey);

  return {
    requestId,
    report: {
      service: parseService(data.service),
      window,
      resolution,
      generatedAt: timestamp(
        data.generatedAt,
        "The usage response contained an invalid generation time.",
      ),
      startAt: timestamp(
        data.startAt,
        "The usage response contained an invalid start time.",
      ),
      endAt: timestamp(
        data.endAt,
        "The usage response contained an invalid end time.",
      ),
      summary: parseMetrics(data.summary),
      currentHourQuota: parseCurrentHourQuota(
        data.currentHourQuota,
      ),
      series,
      apiKeys,
    },
  };
}

export function buildRpcUsageChartModel(
  series: RpcUsageSeriesPoint[],
  width = 720,
  height = 240,
): RpcUsageChartModel {
  const left = 48;
  const right = 18;
  const top = 20;
  const bottom = 36;
  const plotWidth = Math.max(1, width - left - right);
  const plotHeight = Math.max(1, height - top - bottom);
  const maximum = series.reduce(
    (current, point) =>
      Math.max(current, point.calls, point.errors),
    0,
  );
  const denominator = Math.max(1, maximum);
  const xFor = (index: number) =>
    series.length <= 1
      ? left + plotWidth / 2
      : left + (index / (series.length - 1)) * plotWidth;
  const yFor = (value: number) =>
    top + plotHeight - (value / denominator) * plotHeight;
  const pointsFor = (metric: "calls" | "errors") =>
    series
      .map(
        (point, index) =>
          `${roundCoordinate(xFor(index))},${roundCoordinate(
            yFor(point[metric]),
          )}`,
      )
      .join(" ");

  return {
    callPoints: pointsFor("calls"),
    errorPoints: pointsFor("errors"),
    maximum,
    hasTraffic: maximum > 0,
  };
}

export function hasRecordedRpcUsage(
  metrics: RpcUsageMetrics,
): boolean {
  return (
    metrics.requests > 0 ||
    metrics.calls > 0 ||
    metrics.quotaUnits > 0 ||
    metrics.bytesIn > 0 ||
    metrics.bytesOut > 0
  );
}

export function rpcUsageWindowLabel(
  window: RpcUsageWindow,
): string {
  if (window === "24h") return "Last 24 hours";
  if (window === "7d") return "Last 7 days";
  return "Last 30 days";
}

function parseService(value: unknown): RpcUsageReport["service"] {
  const service = objectRecord(
    value,
    "The usage response contained an invalid service.",
  );
  return {
    id: nonemptyString(
      service.id,
      "The usage response contained an invalid service identifier.",
    ),
    name: nonemptyString(
      service.name,
      "The usage response contained an invalid service name.",
    ),
    network: enumValue(
      service.network,
      ["ethereum", "base", "solana"] as const,
      "The usage response contained an unsupported RPC network.",
    ),
  };
}

function parseSeriesPoint(value: unknown): RpcUsageSeriesPoint {
  const point = objectRecord(
    value,
    "The usage response contained an invalid series point.",
  );
  return {
    startAt: timestamp(
      point.startAt,
      "The usage response contained an invalid series time.",
    ),
    ...parseMetrics(point),
  };
}

function parseApiKey(value: unknown): RpcUsageApiKey {
  const apiKey = objectRecord(
    value,
    "The usage response contained an invalid API key breakdown.",
  );
  return {
    id: nonemptyString(
      apiKey.id,
      "The usage response contained an invalid API key identifier.",
    ),
    name: nonemptyString(
      apiKey.name,
      "The usage response contained an invalid API key name.",
    ),
    prefix: nonemptyString(
      apiKey.prefix,
      "The usage response contained an invalid API key prefix.",
    ),
    lastFour: nonemptyString(
      apiKey.lastFour,
      "The usage response contained an invalid API key suffix.",
    ),
    revokedAt: nullableTimestamp(
      apiKey.revokedAt,
      "The usage response contained an invalid API key revocation time.",
    ),
    ...parseMetrics(apiKey),
  };
}

function parseMetrics(value: unknown): RpcUsageMetrics {
  const metrics = objectRecord(
    value,
    "The usage response contained invalid metrics.",
  );
  const averageLatencyMs = nullableNonnegativeNumber(
    metrics.averageLatencyMs,
    "The usage response contained invalid latency.",
  );
  const successRate = nullableNonnegativeNumber(
    metrics.successRate,
    "The usage response contained an invalid success rate.",
  );
  if (successRate !== null && successRate > 1) {
    throw new Error(
      "The usage response contained an invalid success rate.",
    );
  }
  const quotaUnits = nonnegativeInteger(
    metrics.quotaUnits,
    "The usage response contained invalid quota units.",
  );
  const requests = nonnegativeInteger(
    metrics.requests,
    "The usage response contained an invalid request count.",
  );
  const calls = nonnegativeInteger(
    metrics.calls,
    "The usage response contained an invalid call count.",
  );
  const errors = nonnegativeInteger(
    metrics.errors,
    "The usage response contained an invalid error count.",
  );
  if (
    errors > calls ||
    (calls === 0) !== (successRate === null) ||
    (requests === 0) !== (averageLatencyMs === null)
  ) {
    throw new Error(
      "The usage response contained inconsistent request metrics.",
    );
  }
  return {
    quotaUnits,
    requests,
    calls,
    errors,
    upstreamFailures: nonnegativeInteger(
      metrics.upstreamFailures,
      "The usage response contained an invalid upstream failure count.",
    ),
    averageLatencyMs,
    successRate,
    bytesIn: nonnegativeInteger(
      metrics.bytesIn,
      "The usage response contained invalid inbound traffic.",
    ),
    bytesOut: nonnegativeInteger(
      metrics.bytesOut,
      "The usage response contained invalid outbound traffic.",
    ),
    lastRequestAt: nullableTimestamp(
      metrics.lastRequestAt,
      "The usage response contained an invalid last request time.",
    ),
  };
}

function parseCurrentHourQuota(
  value: unknown,
): RpcUsageReport["currentHourQuota"] {
  const quota = objectRecord(
    value,
    "The usage response contained invalid current-hour quota data.",
  );
  const workspaceLimit = nullablePositiveInteger(
    quota.workspaceLimit,
    "The usage response contained an invalid workspace quota limit.",
  );
  const workspaceRemaining = nullableNonnegativeInteger(
    quota.workspaceRemaining,
    "The usage response contained invalid workspace quota remaining.",
  );
  const serviceUnits = nonnegativeInteger(
    quota.serviceUnits,
    "The usage response contained invalid service quota usage.",
  );
  const workspaceUnits = nonnegativeInteger(
    quota.workspaceUnits,
    "The usage response contained invalid workspace quota usage.",
  );
  if (
    (workspaceLimit === null) !==
      (workspaceRemaining === null) ||
    serviceUnits > workspaceUnits ||
    (workspaceLimit !== null &&
      workspaceRemaining !== null &&
      (workspaceUnits > workspaceLimit ||
        workspaceRemaining > workspaceLimit ||
        workspaceUnits + workspaceRemaining !== workspaceLimit))
  ) {
    throw new Error(
      "The usage response contained inconsistent workspace quota data.",
    );
  }
  return {
    serviceUnits,
    workspaceUnits,
    workspaceLimit,
    workspaceRemaining,
    resetAt: timestamp(
      quota.resetAt,
      "The usage response contained an invalid quota reset time.",
    ),
  };
}

function objectRecord(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(message);
  return value;
}

function nonemptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value;
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  message: string,
): Values[number] {
  if (
    typeof value !== "string" ||
    !values.includes(value as Values[number])
  ) {
    throw new Error(message);
  }
  return value as Values[number];
}

function nonnegativeInteger(value: unknown, message: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(message);
  }
  return Number(value);
}

function nullableNonnegativeInteger(
  value: unknown,
  message: string,
): number | null {
  return value === null ? null : nonnegativeInteger(value, message);
}

function nullablePositiveInteger(
  value: unknown,
  message: string,
): number | null {
  if (value === null) return null;
  const integer = nonnegativeInteger(value, message);
  if (integer === 0) throw new Error(message);
  return integer;
}

function nullableNonnegativeNumber(
  value: unknown,
  message: string,
): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(message);
  }
  return value;
}

function timestamp(value: unknown, message: string): string {
  if (
    typeof value !== "string" ||
    !value ||
    Number.isNaN(new Date(value).getTime())
  ) {
    throw new Error(message);
  }
  return value;
}

function nullableTimestamp(
  value: unknown,
  message: string,
): string | null {
  return value === null ? null : timestamp(value, message);
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}
