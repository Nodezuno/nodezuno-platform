"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  aiDiagnosisWindowLabel,
  aiDiagnosisWindows,
  parseAiDiagnosisEnvelope,
  type AiDiagnosisWindow,
  type AiInfrastructureDiagnosis,
} from "@/lib/client/ai-operations";

type DiagnosableService = {
  id: string;
  name: string;
  product: string;
  network: string;
  status: string;
};

type PanelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; diagnosis: AiInfrastructureDiagnosis; requestId: string }
  | { kind: "error"; message: string };

export function AiOperationsPanel({
  services,
}: {
  services: DiagnosableService[];
}) {
  const eligibleServices = useMemo(
    () =>
      services.filter(
        (service) =>
          service.product === "rpc-api" || service.product === "rollups",
      ),
    [services],
  );
  const [serviceId, setServiceId] = useState(eligibleServices[0]?.id ?? "");
  const [window, setWindow] = useState<AiDiagnosisWindow>("24h");
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const requestController = useRef<AbortController | null>(null);

  const selectedService =
    eligibleServices.find((service) => service.id === serviceId) ??
    eligibleServices[0] ??
    null;
  const selectedServiceId = selectedService?.id ?? "";

  useEffect(
    () => () => {
      requestController.current?.abort();
    },
    [],
  );

  async function runDiagnosis() {
    if (!selectedService) return;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setState({ kind: "loading" });

    try {
      const response = await fetch(
        `/api/v1/developer/services/${encodeURIComponent(
          selectedService.id,
        )}/ai-diagnosis?window=${window}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(problemMessage(payload, response.status));
      }
      const result = parseAiDiagnosisEnvelope(payload);
      if (result.diagnosis.service.id !== selectedService.id) {
        throw new Error("The diagnosis returned a different service.");
      }
      if (result.diagnosis.window !== window) {
        throw new Error("The diagnosis returned a different evidence window.");
      }
      setState({
        kind: "ready",
        diagnosis: result.diagnosis,
        requestId: result.requestId,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The evidence scan could not be completed.",
      });
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
    }
  }

  function changeService(nextServiceId: string) {
    requestController.current?.abort();
    setServiceId(nextServiceId);
    setState({ kind: "idle" });
  }

  function changeWindow(nextWindow: AiDiagnosisWindow) {
    requestController.current?.abort();
    setWindow(nextWindow);
    setState({ kind: "idle" });
  }

  return (
    <section
      aria-labelledby="ai-operations-title"
      className="ai-operations"
    >
      <div className="ai-operations-heading">
        <div>
          <span>Evidence intelligence</span>
          <h2 id="ai-operations-title" tabIndex={-1}>
            AI Operations Copilot
          </h2>
          <p>
            Diagnose one service from its saved configuration, provisioning
            state, and retained operational telemetry. Every conclusion shows
            its evidence and every action remains under operator control.
          </p>
        </div>
        <div className="ai-operations-engine" role="note">
          <strong>Evidence engine v1</strong>
          <span>Deterministic analysis</span>
          <small>No external model call in this release</small>
        </div>
      </div>

      {eligibleServices.length === 0 ? (
        <div className="ai-operations-empty">
          <strong>Create a diagnosable service first.</strong>
          <p>
            The current evidence engine supports RPC services and Chain Launch
            Cloud project briefs. It does not invent health for unreleased
            products.
          </p>
        </div>
      ) : (
        <>
          <div className="ai-operations-toolbar">
            <label>
              <span>Service</span>
              <select
                onChange={(event) => changeService(event.target.value)}
                value={selectedServiceId}
              >
                {eligibleServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} · {service.network}
                  </option>
                ))}
              </select>
            </label>
            <div aria-label="Evidence window" className="ai-operations-windows">
              <span>Evidence window</span>
              <div>
                {aiDiagnosisWindows.map((candidate) => (
                  <button
                    aria-pressed={window === candidate}
                    key={candidate}
                    onClick={() => changeWindow(candidate)}
                    type="button"
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="button button-solid"
              disabled={state.kind === "loading"}
              onClick={() => void runDiagnosis()}
              type="button"
            >
              {state.kind === "loading" ? "Scanning evidence..." : "Run evidence scan"}
            </button>
          </div>

          <div aria-live="polite" className="ai-operations-result">
            {state.kind === "idle" ? (
              <div className="ai-operations-empty">
                <strong>Ready to inspect {selectedService?.name}.</strong>
                <p>
                  The scan reads only server-authorized evidence for this
                  workspace. It does not receive API-key secrets, request
                  payloads, wallet addresses, or arbitrary database rows.
                </p>
              </div>
            ) : state.kind === "loading" ? (
              <div className="ai-operations-empty" role="status">
                <strong>Building an evidence-backed diagnosis.</strong>
                <p>Configuration and {aiDiagnosisWindowLabel(window).toLowerCase()} are being evaluated.</p>
              </div>
            ) : state.kind === "error" ? (
              <div className="ai-operations-error" role="alert">
                <strong>Diagnosis unavailable</strong>
                <p>{state.message}</p>
                <button onClick={() => void runDiagnosis()} type="button">
                  Retry scan
                </button>
              </div>
            ) : (
              <DiagnosisResult
                diagnosis={state.diagnosis}
                requestId={state.requestId}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function DiagnosisResult({
  diagnosis,
  requestId,
}: {
  diagnosis: AiInfrastructureDiagnosis;
  requestId: string;
}) {
  return (
    <div className="ai-operations-report">
      <div className="ai-operations-summary">
        <div>
          <span>Assessment</span>
          <strong className={`is-${diagnosis.summary.state}`}>
            {diagnosisStateLabel(diagnosis.summary.state)}
          </strong>
        </div>
        <div>
          <span>Coverage</span>
          <strong>{diagnosis.coverage.kind}</strong>
        </div>
        <div>
          <span>Findings</span>
          <strong>{diagnosis.summary.findingCount}</strong>
        </div>
        <div>
          <span>Generated</span>
          <strong>{formatTimestamp(diagnosis.generatedAt)}</strong>
        </div>
      </div>

      <div className="ai-operations-coverage">
        <strong>
          {diagnosis.coverage.status === "complete"
            ? "Complete evidence coverage"
            : "Limited evidence coverage"}
        </strong>
        <p>{diagnosis.coverage.note}</p>
      </div>

      <dl className="ai-operations-metrics">
        <Metric label="Requests" value={formatInteger(diagnosis.metrics.requests)} />
        <Metric label="RPC calls" value={formatInteger(diagnosis.metrics.calls)} />
        <Metric label="Errors" value={formatInteger(diagnosis.metrics.errors)} />
        <Metric
          label="Upstream failures"
          value={formatInteger(diagnosis.metrics.upstreamFailures)}
        />
        <Metric
          label="Average latency"
          value={formatLatency(diagnosis.metrics.averageLatencyMs)}
        />
        <Metric
          label="Success rate"
          value={formatRatio(diagnosis.metrics.successRate)}
        />
        <Metric
          label="Configured upstreams"
          value={formatInteger(diagnosis.metrics.configuredUpstreams)}
        />
        <Metric
          label="Workspace quota"
          value={formatRatio(diagnosis.metrics.workspaceQuotaUtilization)}
        />
      </dl>

      {diagnosis.findings.length === 0 ? (
        <div className="ai-operations-empty">
          <strong>No actionable findings in this evidence window.</strong>
          <p>This is not an uptime guarantee. Continue monitoring the service.</p>
        </div>
      ) : (
        <div className="ai-operations-findings">
          {diagnosis.findings.map((finding) => (
            <article className={`is-${finding.severity}`} key={finding.code}>
              <div className="ai-operations-finding-heading">
                <span>{finding.severity}</span>
                <div>
                  <h3>{finding.title}</h3>
                  <small>
                    {finding.confidence.level} confidence · {finding.code}
                  </small>
                </div>
              </div>
              <p>{finding.explanation}</p>
              <div className="ai-operations-evidence">
                <strong>Why the engine concluded this</strong>
                <dl>
                  {finding.evidence.map((evidence) => (
                    <div key={evidence.ref}>
                      <dt>{evidence.ref}</dt>
                      <dd>
                        <code>{formatObserved(evidence.observed)}</code>
                        <span>{evidence.description}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <small>{finding.confidence.basis}</small>
              </div>
              <div className="ai-operations-actions">
                <strong>Operator-reviewed actions</strong>
                <ol>
                  {finding.actions.map((action) => (
                    <li key={`${finding.code}:${action.priority}:${action.runbook}`}>
                      <span>P{action.priority}</span>
                      <div>
                        <strong>{action.runbook}</strong>
                        <p>{action.instruction}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ))}
        </div>
      )}

      <details className="ai-operations-limitations">
        <summary>Coverage boundaries and audit details</summary>
        <ul>
          {diagnosis.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
          <li>No remediation was executed by this scan.</li>
          <li>Request ID: {requestId}</li>
        </ul>
      </details>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function problemMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (typeof record.detail === "string" && record.detail.length <= 500) {
      return record.detail;
    }
    if (typeof record.title === "string" && record.title.length <= 200) {
      return record.title;
    }
  }
  if (status === 401) return "Sign in again before running a diagnosis.";
  if (status === 409) return "This service does not have supported evidence yet.";
  return "The evidence scan could not be completed.";
}

function diagnosisStateLabel(state: AiInfrastructureDiagnosis["summary"]["state"]): string {
  if (state === "healthy") return "Healthy evidence";
  if (state === "attention") return "Needs attention";
  if (state === "critical") return "Critical evidence";
  return "Evidence incomplete";
}

function formatInteger(value: number | null): string {
  return value === null ? "Not measured" : value.toLocaleString("en-US");
}

function formatLatency(value: number | null): string {
  return value === null ? "Not measured" : `${value.toFixed(1)} ms`;
}

function formatRatio(value: number | null): string {
  return value === null ? "Not measured" : `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatObserved(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
