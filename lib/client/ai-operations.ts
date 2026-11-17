export const aiDiagnosisWindows = ["24h", "7d", "30d"] as const;

export type AiDiagnosisWindow = (typeof aiDiagnosisWindows)[number];
export type AiFindingSeverity = "info" | "warning" | "critical";

export type AiDiagnosisEvidence = {
  ref: string;
  observed: string | number | boolean | null;
  description: string;
};

export type AiDiagnosisFinding = {
  code: string;
  severity: AiFindingSeverity;
  title: string;
  explanation: string;
  confidence: {
    level: "high" | "medium";
    basis: string;
  };
  evidence: AiDiagnosisEvidence[];
  actions: Array<{
    runbook: string;
    priority: 1 | 2 | 3;
    instruction: string;
  }>;
};

export type AiInfrastructureDiagnosis = {
  schemaVersion: "2026-08-01";
  service: {
    id: string;
    product: string;
    name: string;
    environment: string;
    network: string;
    region: string;
    status: string;
  };
  window: AiDiagnosisWindow;
  generatedAt: string;
  engine: {
    provider: "nodezuno-evidence-rules";
    version: "1.0.0";
    mode: "deterministic";
    modelInvoked: false;
  };
  coverage: {
    kind: "operational" | "readiness";
    status: "complete" | "limited";
    note: string;
  };
  summary: {
    state: "healthy" | "attention" | "critical" | "unknown";
    highestSeverity: "none" | AiFindingSeverity;
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

export type AiDiagnosisEnvelope = {
  diagnosis: AiInfrastructureDiagnosis;
  requestId: string;
};

export function parseAiDiagnosisEnvelope(
  payload: unknown,
): AiDiagnosisEnvelope {
  const envelope = exactObject(payload, ["data", "requestId"], "response");
  const data = exactObject(envelope.data, ["diagnosis"], "response data");
  const diagnosis = exactObject(
    data.diagnosis,
    [
      "schemaVersion",
      "service",
      "window",
      "generatedAt",
      "engine",
      "coverage",
      "summary",
      "metrics",
      "findings",
      "limitations",
    ],
    "diagnosis",
  );
  const service = exactObject(
    diagnosis.service,
    ["id", "product", "name", "environment", "network", "region", "status"],
    "diagnosis service",
  );
  const engine = exactObject(
    diagnosis.engine,
    ["provider", "version", "mode", "modelInvoked"],
    "diagnosis engine",
  );
  const coverage = exactObject(
    diagnosis.coverage,
    ["kind", "status", "note"],
    "diagnosis coverage",
  );
  const summary = exactObject(
    diagnosis.summary,
    ["state", "highestSeverity", "findingCount"],
    "diagnosis summary",
  );
  const metrics = exactObject(
    diagnosis.metrics,
    [
      "requests",
      "calls",
      "errors",
      "upstreamFailures",
      "averageLatencyMs",
      "successRate",
      "lastRequestAt",
      "configuredUpstreams",
      "workspaceQuotaUtilization",
    ],
    "diagnosis metrics",
  );
  const findings = boundedArray(diagnosis.findings, 12, "diagnosis findings").map(
    parseFinding,
  );
  const limitations = boundedArray(
    diagnosis.limitations,
    12,
    "diagnosis limitations",
  ).map((value) => boundedString(value, 500, "diagnosis limitation"));
  const findingCount = nonnegativeInteger(
    summary.findingCount,
    "diagnosis finding count",
  );
  if (findingCount !== findings.length) {
    throw new Error("The diagnosis finding count did not match its findings.");
  }

  return {
    requestId: boundedString(envelope.requestId, 128, "request identifier"),
    diagnosis: {
      schemaVersion: exactValue(
        diagnosis.schemaVersion,
        "2026-08-01",
        "diagnosis schema version",
      ),
      service: {
        id: resourceId(service.id, "service identifier"),
        product: boundedString(service.product, 80, "service product"),
        name: boundedString(service.name, 80, "service name"),
        environment: boundedString(
          service.environment,
          40,
          "service environment",
        ),
        network: boundedString(service.network, 80, "service network"),
        region: boundedString(service.region, 80, "service region"),
        status: boundedString(service.status, 40, "service status"),
      },
      window: enumValue(
        diagnosis.window,
        aiDiagnosisWindows,
        "diagnosis window",
      ),
      generatedAt: timestamp(diagnosis.generatedAt, "diagnosis generation time"),
      engine: {
        provider: exactValue(
          engine.provider,
          "nodezuno-evidence-rules",
          "diagnosis provider",
        ),
        version: exactValue(engine.version, "1.0.0", "diagnosis engine version"),
        mode: exactValue(engine.mode, "deterministic", "diagnosis engine mode"),
        modelInvoked: exactValue(
          engine.modelInvoked,
          false,
          "diagnosis model state",
        ),
      },
      coverage: {
        kind: enumValue(
          coverage.kind,
          ["operational", "readiness"] as const,
          "diagnosis coverage kind",
        ),
        status: enumValue(
          coverage.status,
          ["complete", "limited"] as const,
          "diagnosis coverage status",
        ),
        note: boundedString(coverage.note, 500, "diagnosis coverage note"),
      },
      summary: {
        state: enumValue(
          summary.state,
          ["healthy", "attention", "critical", "unknown"] as const,
          "diagnosis state",
        ),
        highestSeverity: enumValue(
          summary.highestSeverity,
          ["none", "info", "warning", "critical"] as const,
          "diagnosis highest severity",
        ),
        findingCount,
      },
      metrics: {
        requests: nullableNonnegativeInteger(metrics.requests, "request count"),
        calls: nullableNonnegativeInteger(metrics.calls, "call count"),
        errors: nullableNonnegativeInteger(metrics.errors, "error count"),
        upstreamFailures: nullableNonnegativeInteger(
          metrics.upstreamFailures,
          "upstream failure count",
        ),
        averageLatencyMs: nullableNonnegativeNumber(
          metrics.averageLatencyMs,
          "average latency",
        ),
        successRate: nullableRatio(metrics.successRate, "success rate"),
        lastRequestAt:
          metrics.lastRequestAt === null
            ? null
            : timestamp(metrics.lastRequestAt, "last request time"),
        configuredUpstreams: nullableNonnegativeInteger(
          metrics.configuredUpstreams,
          "configured upstream count",
        ),
        workspaceQuotaUtilization: nullableRatio(
          metrics.workspaceQuotaUtilization,
          "workspace quota utilization",
        ),
      },
      findings,
      limitations,
    },
  };
}

export function aiDiagnosisWindowLabel(window: AiDiagnosisWindow): string {
  if (window === "24h") return "Last 24 hours";
  if (window === "7d") return "Last 7 days";
  return "Last 30 days";
}

function parseFinding(value: unknown): AiDiagnosisFinding {
  const finding = exactObject(
    value,
    ["code", "severity", "title", "explanation", "confidence", "evidence", "actions"],
    "diagnosis finding",
  );
  const confidence = exactObject(
    finding.confidence,
    ["level", "basis"],
    "finding confidence",
  );
  const evidence = boundedArray(finding.evidence, 8, "finding evidence").map(
    (candidate) => {
      const item = exactObject(
        candidate,
        ["ref", "observed", "description"],
        "finding evidence item",
      );
      return {
        ref: evidenceRef(item.ref),
        observed: observedValue(item.observed),
        description: boundedString(
          item.description,
          500,
          "evidence description",
        ),
      };
    },
  );
  const actions = boundedArray(finding.actions, 6, "finding actions").map(
    (candidate) => {
      const action = exactObject(
        candidate,
        ["runbook", "priority", "instruction"],
        "finding action",
      );
      return {
        runbook: boundedString(action.runbook, 120, "runbook name"),
        priority: enumValue(
          action.priority,
          [1, 2, 3] as const,
          "runbook priority",
        ),
        instruction: boundedString(
          action.instruction,
          500,
          "runbook instruction",
        ),
      };
    },
  );
  return {
    code: evidenceRef(finding.code),
    severity: enumValue(
      finding.severity,
      ["info", "warning", "critical"] as const,
      "finding severity",
    ),
    title: boundedString(finding.title, 160, "finding title"),
    explanation: boundedString(
      finding.explanation,
      800,
      "finding explanation",
    ),
    confidence: {
      level: enumValue(
        confidence.level,
        ["high", "medium"] as const,
        "finding confidence level",
      ),
      basis: boundedString(confidence.basis, 500, "finding confidence basis"),
    },
    evidence,
    actions,
  };
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`The ${label} was not an object.`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`The ${label} contained an unexpected field.`);
  }
  return record;
}

function boundedArray(value: unknown, maximum: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`The ${label} was invalid.`);
  }
  return value;
}

function boundedString(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string") throw new Error(`The ${label} was invalid.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`The ${label} was invalid.`);
  }
  return normalized;
}

function resourceId(value: unknown, label: string): string {
  const normalized = boundedString(value, 128, label);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(`The ${label} was invalid.`);
  }
  return normalized;
}

function evidenceRef(value: unknown): string {
  const normalized = boundedString(value, 120, "evidence reference");
  if (!/^[a-z0-9._:-]+$/.test(normalized)) {
    throw new Error("The evidence reference was invalid.");
  }
  return normalized;
}

function enumValue<const T extends readonly unknown[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (!allowed.includes(value)) throw new Error(`The ${label} was invalid.`);
  return value as T[number];
}

function exactValue<const T>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`The ${label} was invalid.`);
  return expected;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`The ${label} was invalid.`);
  }
  return value as number;
}

function nullableNonnegativeInteger(value: unknown, label: string): number | null {
  return value === null ? null : nonnegativeInteger(value, label);
}

function nullableNonnegativeNumber(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`The ${label} was invalid.`);
  }
  return value;
}

function nullableRatio(value: unknown, label: string): number | null {
  const parsed = nullableNonnegativeNumber(value, label);
  if (parsed !== null && parsed > 1) throw new Error(`The ${label} was invalid.`);
  return parsed;
}

function timestamp(value: unknown, label: string): string {
  const normalized = boundedString(value, 64, label);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`The ${label} was invalid.`);
  }
  return normalized;
}

function observedValue(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= 200) return value;
  throw new Error("The evidence observation was invalid.");
}
