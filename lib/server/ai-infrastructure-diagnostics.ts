import { getDeveloperRpcUsage, getDeveloperService } from "./database.ts";
import type {
  DeveloperActor,
  DeveloperServiceRecord,
} from "./developer-platform.ts";
import { reconcileDeveloperServiceProvisioning } from "./developer-service-provisioning.ts";
import type {
  RpcNetwork,
  RpcProvisioningSnapshot,
} from "./ethereum-rpc.ts";
import { HttpProblem } from "./http.ts";
import {
  developerRpcUsageWindows,
  type DeveloperRpcUsageReport,
  type DeveloperRpcUsageWindow,
} from "./rpc-usage.ts";

export const AI_DIAGNOSIS_SCHEMA_VERSION = "2026-08-01" as const;
export const AI_DIAGNOSIS_RULES_PROVIDER =
  "nodezuno-evidence-rules" as const;
export const AI_DIAGNOSIS_RULES_VERSION = "1.0.0" as const;

export type AiDiagnosisSeverity =
  | "info"
  | "warning"
  | "critical";
export type AiDiagnosisState =
  | "healthy"
  | "attention"
  | "critical"
  | "unknown";
export type AiDiagnosisConfidence = "high" | "medium";
export type AiDiagnosisObserved = string | number | boolean | null;

export type AiDiagnosisEvidenceReference = {
  ref: string;
  observed: AiDiagnosisObserved;
  description: string;
};

export type AiDiagnosisRunbookAction = {
  runbook: string;
  priority: 1 | 2 | 3;
  instruction: string;
};

export type AiDiagnosisFinding = {
  code: string;
  severity: AiDiagnosisSeverity;
  title: string;
  explanation: string;
  confidence: {
    level: AiDiagnosisConfidence;
    basis: string;
  };
  evidence: AiDiagnosisEvidenceReference[];
  actions: AiDiagnosisRunbookAction[];
};

export type AiDiagnosisEvidence = {
  generatedAt: number;
  window: DeveloperRpcUsageWindow;
  service: {
    id: string;
    product: DeveloperServiceRecord["product"];
    name: string;
    environment: DeveloperServiceRecord["environment"];
    network: DeveloperServiceRecord["network"];
    region: DeveloperServiceRecord["region"];
    status: DeveloperServiceRecord["status"];
  };
  configuration: {
    maturity: string | null;
    provisioning: string | null;
    endpointPresent: boolean;
    configuredUpstreams: number | null;
    requestedComponentCount: number | null;
  };
  usage: {
    requests: number;
    calls: number;
    errors: number;
    upstreamFailures: number;
    averageLatencyMs: number | null;
    successRate: number | null;
    lastRequestAt: number | null;
    workspaceQuotaUtilization: number | null;
  } | null;
};

export type AiDiagnosisProviderResult = {
  coverage: {
    kind: "operational" | "readiness";
    status: "complete" | "limited";
    note: string;
  };
  findings: AiDiagnosisFinding[];
  limitations: string[];
};

export type AiDiagnosisProvider = {
  id: string;
  version: string;
  mode: "deterministic" | "model-assisted";
  modelInvoked: boolean;
  analyze(
    evidence: Readonly<AiDiagnosisEvidence>,
  ): Promise<AiDiagnosisProviderResult> | AiDiagnosisProviderResult;
};

export type AiInfrastructureDiagnosis = {
  schemaVersion: typeof AI_DIAGNOSIS_SCHEMA_VERSION;
  service: AiDiagnosisEvidence["service"];
  window: DeveloperRpcUsageWindow;
  generatedAt: string;
  engine: {
    provider: string;
    version: string;
    mode: AiDiagnosisProvider["mode"];
    modelInvoked: boolean;
  };
  coverage: AiDiagnosisProviderResult["coverage"];
  summary: {
    state: AiDiagnosisState;
    highestSeverity: AiDiagnosisSeverity | "none";
    findingCount: number;
  };
  metrics: {
    requests: number | null;
    calls: number | null;
    errors: number | null;
    upstreamFailures: number | null;
    averageLatencyMs: number | null;
    successRate: number | null;
    lastRequestAt: string | null;
    configuredUpstreams: number | null;
    workspaceQuotaUtilization: number | null;
  };
  findings: AiDiagnosisFinding[];
  limitations: string[];
};

export const deterministicAiDiagnosisProvider: AiDiagnosisProvider = {
  id: AI_DIAGNOSIS_RULES_PROVIDER,
  version: AI_DIAGNOSIS_RULES_VERSION,
  mode: "deterministic",
  modelInvoked: false,
  analyze(evidence) {
    if (evidence.service.product === "rpc-api") {
      return analyzeRpcEvidence(evidence);
    }
    if (evidence.service.product === "rollups") {
      return analyzeChainLaunchEvidence(evidence);
    }
    throw unsupportedAiDiagnosisProblem();
  },
};

export function parseAiDiagnosisWindow(
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
      "ai_diagnosis_window_invalid",
      "Choose a supported AI diagnosis window.",
      { window: "Use 24h, 7d, or 30d." },
    );
  }
  return candidate as DeveloperRpcUsageWindow;
}

export async function diagnoseInfrastructureService(options: {
  service: DeveloperServiceRecord;
  usage: DeveloperRpcUsageReport | null;
  window: DeveloperRpcUsageWindow;
  generatedAt: number;
  provider?: AiDiagnosisProvider;
}): Promise<AiInfrastructureDiagnosis> {
  const provider = options.provider ?? deterministicAiDiagnosisProvider;
  const evidence = buildAiDiagnosisEvidence(options);
  const result = await provider.analyze(evidence);
  const highestSeverity = highestFindingSeverity(result.findings);
  return {
    schemaVersion: AI_DIAGNOSIS_SCHEMA_VERSION,
    service: evidence.service,
    window: evidence.window,
    generatedAt: new Date(evidence.generatedAt).toISOString(),
    engine: {
      provider: provider.id,
      version: provider.version,
      mode: provider.mode,
      modelInvoked: provider.modelInvoked,
    },
    coverage: result.coverage,
    summary: {
      state: diagnosisState(evidence, highestSeverity),
      highestSeverity,
      findingCount: result.findings.length,
    },
    metrics: {
      requests: evidence.usage?.requests ?? null,
      calls: evidence.usage?.calls ?? null,
      errors: evidence.usage?.errors ?? null,
      upstreamFailures: evidence.usage?.upstreamFailures ?? null,
      averageLatencyMs: evidence.usage?.averageLatencyMs ?? null,
      successRate: evidence.usage?.successRate ?? null,
      lastRequestAt:
        evidence.usage?.lastRequestAt == null
          ? null
          : new Date(evidence.usage.lastRequestAt).toISOString(),
      configuredUpstreams: evidence.configuration.configuredUpstreams,
      workspaceQuotaUtilization:
        evidence.usage?.workspaceQuotaUtilization ?? null,
    },
    findings: result.findings,
    limitations: result.limitations,
  };
}

export async function readInfrastructureAiDiagnosis(options: {
  actor: DeveloperActor;
  serviceId: string;
  window: DeveloperRpcUsageWindow;
  now?: number;
  database?: D1Database;
  rpcProvisioning?: Partial<
    Record<RpcNetwork, RpcProvisioningSnapshot>
  >;
}): Promise<AiInfrastructureDiagnosis | null> {
  const now = options.now ?? Date.now();
  const service = await getDeveloperService({
    actor: options.actor,
    serviceId: options.serviceId,
    now,
    database: options.database,
  });
  if (!service) return null;
  const reconciledService = options.rpcProvisioning
    ? reconcileDeveloperServiceProvisioning(
        service,
        options.rpcProvisioning,
        { available: false, endpoint: null },
      )
    : service;
  if (
    reconciledService.product !== "rpc-api" &&
    reconciledService.product !== "rollups"
  ) {
    throw unsupportedAiDiagnosisProblem();
  }
  const usage =
    reconciledService.product === "rpc-api"
      ? await getDeveloperRpcUsage({
          actor: options.actor,
          serviceId: reconciledService.id,
          window: options.window,
          now,
          database: options.database,
        })
      : null;
  if (reconciledService.product === "rpc-api" && !usage) {
    throw new HttpProblem(
      409,
      "ai_diagnosis_evidence_unavailable",
      "RPC usage evidence is unavailable for this service.",
    );
  }
  return diagnoseInfrastructureService({
    service: reconciledService,
    usage,
    window: options.window,
    generatedAt: now,
  });
}

export function buildAiDiagnosisEvidence(options: {
  service: DeveloperServiceRecord;
  usage: DeveloperRpcUsageReport | null;
  window: DeveloperRpcUsageWindow;
  generatedAt: number;
}): AiDiagnosisEvidence {
  const { service, usage } = options;
  if (!Number.isSafeInteger(options.generatedAt) || options.generatedAt < 0) {
    throw new TypeError(
      "AI diagnosis generation time must be a nonnegative integer.",
    );
  }
  if (usage && usage.service.id !== service.id) {
    throw new TypeError("AI diagnosis usage must match the service.");
  }
  if (usage && usage.window !== options.window) {
    throw new TypeError("AI diagnosis usage must match the window.");
  }
  const routing = safeRecord(service.configuration.routing);
  const requestedComponents = Array.isArray(
    service.configuration.requestedComponents,
  )
    ? service.configuration.requestedComponents
    : null;
  return {
    generatedAt: options.generatedAt,
    window: options.window,
    service: {
      id: service.id,
      product: service.product,
      name: service.name,
      environment: service.environment,
      network: service.network,
      region: service.region,
      status: service.status,
    },
    configuration: {
      maturity: safeConfigurationValue(
        service.configuration.maturity,
        ["live", "beta", "configuration", "design-partner", "prelaunch"],
      ),
      provisioning: safeConfigurationValue(
        service.configuration.provisioning,
        [
          "available",
          "awaiting_upstream_configuration",
          "awaiting_gateway_readiness",
          "project_created",
          "configuration_only",
        ],
      ),
      endpointPresent: service.endpointPath !== null,
      configuredUpstreams: safeBoundedInteger(
        routing?.configuredUpstreams,
        100,
      ),
      requestedComponentCount:
        requestedComponents === null
          ? null
          : Math.min(requestedComponents.length, 100),
    },
    usage:
      usage === null
        ? null
        : {
            requests: usage.summary.requests,
            calls: usage.summary.calls,
            errors: usage.summary.errors,
            upstreamFailures: usage.summary.upstreamFailures,
            averageLatencyMs:
              usage.summary.requests === 0
                ? null
                : round(
                    usage.summary.latencyMsTotal /
                      usage.summary.requests,
                    2,
                  ),
            successRate:
              usage.summary.calls === 0
                ? null
                : round(
                    Math.max(
                      0,
                      Math.min(
                        1,
                        1 - usage.summary.errors / usage.summary.calls,
                      ),
                    ),
                    4,
                  ),
            lastRequestAt: usage.summary.lastRequestAt,
            workspaceQuotaUtilization:
              usage.currentHourQuota.workspaceLimit === null ||
              usage.currentHourQuota.workspaceLimit === 0
                ? null
                : round(
                    Math.min(
                      1,
                      usage.currentHourQuota.workspaceUnits /
                        usage.currentHourQuota.workspaceLimit,
                    ),
                    4,
                  ),
          },
  };
}

function analyzeRpcEvidence(
  evidence: AiDiagnosisEvidence,
): AiDiagnosisProviderResult {
  const findings: AiDiagnosisFinding[] = [];
  if (
    evidence.service.status !== "active" ||
    evidence.configuration.provisioning !== "available"
  ) {
    findings.push({
      code: "rpc_upstream_not_ready",
      severity:
        evidence.service.environment === "production"
          ? "critical"
          : "warning",
      title: "RPC upstream is not ready",
      explanation:
        "The control plane has configuration evidence, but it has not verified a callable upstream for this service.",
      confidence: {
        level: "high",
        basis:
          "The finding uses persisted service status and the allowlisted provisioning state.",
      },
      evidence: [
        evidenceReference(
          "service.status",
          evidence.service.status,
          "Persisted service lifecycle state.",
        ),
        evidenceReference(
          "service.configuration.provisioning",
          evidence.configuration.provisioning,
          "Allowlisted upstream provisioning state.",
        ),
        evidenceReference(
          "service.configuration.routing.configuredUpstreams",
          evidence.configuration.configuredUpstreams,
          "Verified upstream count recorded by the control plane.",
        ),
      ],
      actions: [
        {
          runbook: "rpc/upstream-readiness",
          priority: 1,
          instruction:
            "Attach a matching upstream, pass the readiness probe, and confirm the service becomes active before sending traffic.",
        },
      ],
    });
    return {
      coverage: {
        kind: "readiness",
        status: "limited",
        note:
          "Only configuration and provisioning evidence is available because the RPC service is not active.",
      },
      findings,
      limitations: [
        "No runtime health conclusion is made until a verified upstream is active.",
        "The deterministic rules engine does not call an external model.",
      ],
    };
  }

  const usage = evidence.usage;
  if (!usage || usage.requests === 0) {
    findings.push({
      code: "rpc_traffic_evidence_missing",
      severity: "info",
      title: "No request evidence in the selected window",
      explanation:
        "The service is configured as active, but retained gateway telemetry contains no requests in this window.",
      confidence: {
        level: "high",
        basis:
          "The retained, tenant-scoped request aggregate is exactly zero.",
      },
      evidence: [
        evidenceReference(
          "usage.summary.requests",
          usage?.requests ?? 0,
          "Gateway requests retained for the selected window.",
        ),
      ],
      actions: [
        {
          runbook: "observability/send-canary",
          priority: 2,
          instruction:
            "Send a safe read-only canary request, then confirm request, latency, and success evidence appears.",
        },
      ],
    });
  } else {
    appendErrorRateFinding(findings, usage);
    appendUpstreamFailureFinding(findings, usage);
    appendLatencyFinding(findings, usage);
    appendFreshnessFinding(findings, evidence.generatedAt, usage);
    appendQuotaFinding(findings, usage);
  }
  appendResilienceFinding(findings, evidence);

  if (findings.length === 0) {
    findings.push({
      code: "rpc_signals_nominal",
      severity: "info",
      title: "Observed RPC signals are within current thresholds",
      explanation:
        "The selected window has traffic evidence without an elevated error, upstream failure, latency, freshness, quota, or redundancy rule.",
      confidence: {
        level: "medium",
        basis:
          "This conclusion is limited to retained gateway aggregates and configured upstream count.",
      },
      evidence: [
        evidenceReference(
          "usage.summary.calls",
          usage?.calls ?? 0,
          "RPC calls represented in the selected window.",
        ),
        evidenceReference(
          "usage.summary.successRate",
          usage?.successRate ?? null,
          "Success rate derived from calls and errors.",
        ),
      ],
      actions: [
        {
          runbook: "observability/continue-monitoring",
          priority: 3,
          instruction:
            "Continue monitoring and compare this window with provider-level and node-level telemetry as those sources are connected.",
        },
      ],
    });
  }

  const noTraffic = !usage || usage.requests === 0;
  return {
    coverage: {
      kind: "operational",
      status: noTraffic ? "limited" : "complete",
      note: noTraffic
        ? "The service is active, but the selected window has no traffic evidence."
        : "The diagnosis uses retained tenant-scoped gateway aggregates and allowlisted service configuration.",
    },
    findings,
    limitations: [
      "Findings describe gateway evidence, not validator, host, peer, or consensus telemetry.",
      "Thresholds are deterministic operational defaults, not learned predictions.",
      "The deterministic rules engine does not call an external model.",
    ],
  };
}

function analyzeChainLaunchEvidence(
  evidence: AiDiagnosisEvidence,
): AiDiagnosisProviderResult {
  return {
    coverage: {
      kind: "readiness",
      status: "limited",
      note:
        "This report covers the saved chain project brief only. Runtime chain evidence is not connected.",
    },
    findings: [
      {
        code: "chain_runtime_evidence_not_connected",
        severity: "info",
        title: "Chain runtime evidence is not connected",
        explanation:
          "The Chain Launch Cloud record is a design-partner project brief, so Nodezuno cannot make claims about node, RPC, explorer, or consensus health.",
        confidence: {
          level: "high",
          basis:
            "The finding uses the persisted project state and requested component count.",
        },
        evidence: [
          evidenceReference(
            "service.status",
            evidence.service.status,
            "Persisted chain project lifecycle state.",
          ),
          evidenceReference(
            "service.configuration.provisioning",
            evidence.configuration.provisioning,
            "Allowlisted chain project provisioning state.",
          ),
          evidenceReference(
            "service.configuration.requestedComponents.count",
            evidence.configuration.requestedComponentCount,
            "Count of requested launch components without their private values.",
          ),
        ],
        actions: [
          {
            runbook: "chain-launch/connect-evidence",
            priority: 1,
            instruction:
              "Attach node, RPC, explorer, and consensus telemetry sources, validate chain identity, and record the first evidence checkpoint.",
          },
          {
            runbook: "chain-launch/define-slo",
            priority: 2,
            instruction:
              "Define finality, RPC availability, indexing lag, peer health, and validator participation objectives before mainnet operations.",
          },
        ],
      },
    ],
    limitations: [
      "No node, peer, validator, finality, explorer, or RPC runtime evidence is available.",
      "No production chain infrastructure is inferred from a saved project brief.",
      "The deterministic rules engine does not call an external model.",
    ],
  };
}

function appendErrorRateFinding(
  findings: AiDiagnosisFinding[],
  usage: NonNullable<AiDiagnosisEvidence["usage"]>,
): void {
  if (usage.calls === 0) return;
  const errorRate = usage.errors / usage.calls;
  if (errorRate < 0.01) return;
  const critical = errorRate >= 0.05;
  findings.push({
    code: critical
      ? "rpc_error_rate_critical"
      : "rpc_error_rate_elevated",
    severity: critical ? "critical" : "warning",
    title: critical
      ? "RPC error rate is critical"
      : "RPC error rate is elevated",
    explanation:
      "The error ratio calculated from retained RPC calls exceeds the current deterministic threshold.",
    confidence: {
      level: "high",
      basis:
        "The ratio is calculated directly from tenant-scoped call and error counters.",
    },
    evidence: [
      evidenceReference(
        "usage.summary.calls",
        usage.calls,
        "RPC calls in the selected window.",
      ),
      evidenceReference(
        "usage.summary.errors",
        usage.errors,
        "Failed RPC calls in the selected window.",
      ),
      evidenceReference(
        "derived.errorRate",
        round(errorRate, 4),
        "Errors divided by calls.",
      ),
    ],
    actions: [
      {
        runbook: "rpc/error-rate",
        priority: 1,
        instruction:
          "Compare failures by method and upstream, verify chain head agreement, and isolate an unhealthy upstream before changing client behavior.",
      },
    ],
  });
}

function appendUpstreamFailureFinding(
  findings: AiDiagnosisFinding[],
  usage: NonNullable<AiDiagnosisEvidence["usage"]>,
): void {
  if (usage.calls === 0 || usage.upstreamFailures === 0) return;
  const failureRate = usage.upstreamFailures / usage.calls;
  const critical = failureRate >= 0.02;
  findings.push({
    code: critical
      ? "rpc_upstream_failures_critical"
      : "rpc_upstream_failures_detected",
    severity: critical ? "critical" : "warning",
    title: critical
      ? "Upstream failure rate is critical"
      : "Upstream failures were detected",
    explanation:
      "The gateway recorded failures while attempting to reach or use an upstream RPC provider.",
    confidence: {
      level: "high",
      basis:
        "The finding uses the gateway's explicit upstream failure counter.",
    },
    evidence: [
      evidenceReference(
        "usage.summary.upstreamFailures",
        usage.upstreamFailures,
        "Upstream failures in the selected window.",
      ),
      evidenceReference(
        "derived.upstreamFailureRate",
        round(failureRate, 4),
        "Upstream failures divided by RPC calls.",
      ),
    ],
    actions: [
      {
        runbook: "rpc/upstream-failover",
        priority: 1,
        instruction:
          "Inspect upstream readiness and head divergence, then remove a failing endpoint from rotation if failover evidence confirms the fault.",
      },
    ],
  });
}

function appendLatencyFinding(
  findings: AiDiagnosisFinding[],
  usage: NonNullable<AiDiagnosisEvidence["usage"]>,
): void {
  if (usage.averageLatencyMs === null || usage.averageLatencyMs < 500) {
    return;
  }
  const critical = usage.averageLatencyMs >= 1_000;
  findings.push({
    code: critical ? "rpc_latency_critical" : "rpc_latency_elevated",
    severity: critical ? "critical" : "warning",
    title: critical
      ? "Average RPC latency is critical"
      : "Average RPC latency is elevated",
    explanation:
      "Average gateway request latency exceeds the current deterministic threshold.",
    confidence: {
      level: "medium",
      basis:
        "The aggregate covers all observed requests and does not yet include percentile latency or method-level dimensions.",
    },
    evidence: [
      evidenceReference(
        "usage.summary.averageLatencyMs",
        usage.averageLatencyMs,
        "Mean gateway request latency in milliseconds.",
      ),
    ],
    actions: [
      {
        runbook: "rpc/latency",
        priority: critical ? 1 : 2,
        instruction:
          "Compare upstream latency and chain head freshness, then validate routing and region placement with a read-only probe.",
      },
    ],
  });
}

function appendFreshnessFinding(
  findings: AiDiagnosisFinding[],
  generatedAt: number,
  usage: NonNullable<AiDiagnosisEvidence["usage"]>,
): void {
  if (
    usage.requests === 0 ||
    usage.lastRequestAt === null ||
    generatedAt - usage.lastRequestAt < 15 * 60 * 1000
  ) {
    return;
  }
  findings.push({
    code: "rpc_traffic_stale",
    severity: "warning",
    title: "RPC traffic evidence is stale",
    explanation:
      "The selected window contains requests, but the most recent retained request is older than fifteen minutes.",
    confidence: {
      level: "medium",
      basis:
        "The rule compares the report generation time with the latest retained gateway request timestamp.",
    },
    evidence: [
      evidenceReference(
        "derived.minutesSinceLastRequest",
        Math.floor((generatedAt - usage.lastRequestAt) / 60_000),
        "Whole minutes since the latest retained request.",
      ),
    ],
    actions: [
      {
        runbook: "observability/traffic-gap",
        priority: 2,
        instruction:
          "Confirm whether traffic stopped intentionally, then run a safe canary and verify ingestion if traffic should still be present.",
      },
    ],
  });
}

function appendQuotaFinding(
  findings: AiDiagnosisFinding[],
  usage: NonNullable<AiDiagnosisEvidence["usage"]>,
): void {
  const utilization = usage.workspaceQuotaUtilization;
  if (utilization === null || utilization < 0.75) return;
  const critical = utilization >= 0.9;
  findings.push({
    code: critical ? "workspace_quota_critical" : "workspace_quota_high",
    severity: critical ? "critical" : "warning",
    title: critical
      ? "Workspace quota is nearly exhausted"
      : "Workspace quota utilization is high",
    explanation:
      "Current-hour workspace quota use exceeds the deterministic capacity threshold.",
    confidence: {
      level: "high",
      basis:
        "The ratio is derived from the current retained quota bucket and configured workspace limit.",
    },
    evidence: [
      evidenceReference(
        "derived.workspaceQuotaUtilization",
        utilization,
        "Current-hour workspace quota units divided by the limit.",
      ),
    ],
    actions: [
      {
        runbook: "capacity/workspace-quota",
        priority: critical ? 1 : 2,
        instruction:
          "Identify unexpected callers, reduce nonessential traffic, and review the workspace ceiling before the next reset.",
      },
    ],
  });
}

function appendResilienceFinding(
  findings: AiDiagnosisFinding[],
  evidence: AiDiagnosisEvidence,
): void {
  const upstreams = evidence.configuration.configuredUpstreams;
  if (upstreams === null || upstreams >= 2) return;
  findings.push({
    code: "rpc_upstream_redundancy_low",
    severity:
      evidence.service.environment === "production" ? "warning" : "info",
    title: "RPC upstream redundancy is limited",
    explanation:
      "The control plane records fewer than two verified upstreams, so provider-level failover is limited.",
    confidence: {
      level: "high",
      basis:
        "The finding uses the allowlisted configured upstream count.",
    },
    evidence: [
      evidenceReference(
        "service.configuration.routing.configuredUpstreams",
        upstreams,
        "Verified upstream count recorded by the control plane.",
      ),
    ],
    actions: [
      {
        runbook: "rpc/add-redundant-upstream",
        priority:
          evidence.service.environment === "production" ? 2 : 3,
        instruction:
          "Attach a separately operated upstream and verify chain identity, head agreement, and failover behavior.",
      },
    ],
  });
}

function evidenceReference(
  ref: string,
  observed: AiDiagnosisObserved,
  description: string,
): AiDiagnosisEvidenceReference {
  return { ref, observed, description };
}

function safeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeConfigurationValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : null;
}

function safeBoundedInteger(value: unknown, maximum: number): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum
    ? Number(value)
    : null;
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function highestFindingSeverity(
  findings: readonly AiDiagnosisFinding[],
): AiDiagnosisSeverity | "none" {
  if (findings.some((finding) => finding.severity === "critical")) {
    return "critical";
  }
  if (findings.some((finding) => finding.severity === "warning")) {
    return "warning";
  }
  if (findings.some((finding) => finding.severity === "info")) {
    return "info";
  }
  return "none";
}

function diagnosisState(
  evidence: AiDiagnosisEvidence,
  highestSeverity: AiDiagnosisSeverity | "none",
): AiDiagnosisState {
  if (highestSeverity === "critical") return "critical";
  if (highestSeverity === "warning") return "attention";
  if (
    evidence.service.product === "rpc-api" &&
    evidence.service.status === "active" &&
    (evidence.usage?.requests ?? 0) > 0
  ) {
    return "healthy";
  }
  return "unknown";
}

function unsupportedAiDiagnosisProblem(): HttpProblem {
  return new HttpProblem(
    409,
    "ai_diagnosis_unsupported_service",
    "AI diagnosis currently supports RPC Lab services and Chain Launch Cloud project readiness.",
  );
}
