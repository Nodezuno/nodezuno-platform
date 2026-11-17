"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  buildRpcUsageChartModel,
  hasRecordedRpcUsage,
  parseRpcUsageEnvelope,
  rpcUsageWindowLabel,
  rpcUsageWindows,
  type RpcUsageNetwork,
  type RpcUsageReport,
  type RpcUsageWindow,
} from "@/lib/client/rpc-observability";

type UsageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      report: RpcUsageReport;
      requestId: string;
      refreshing: boolean;
      refreshError: string;
      refreshMessage: string;
    };

export function RpcObservabilityPanel({
  serviceId,
  serviceName,
  network,
}: {
  serviceId: string;
  serviceName: string;
  network: RpcUsageNetwork;
}) {
  const [usageWindow, setUsageWindow] =
    useState<RpcUsageWindow>("24h");
  const [state, setState] = useState<UsageState>({ kind: "loading" });
  const requestController = useRef<AbortController | null>(null);
  const busy =
    state.kind === "loading" ||
    (state.kind === "ready" && state.refreshing);

  const loadUsage = useCallback(
    async (preserveExisting: boolean): Promise<string | null> => {
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      setState((current) =>
        preserveExisting && current.kind === "ready"
          ? {
              ...current,
              refreshing: true,
              refreshError: "",
              refreshMessage: "",
            }
          : { kind: "loading" },
      );

      try {
        const response = await fetch(
          `/api/v1/developer/services/${encodeURIComponent(
            serviceId,
          )}/usage?window=${usageWindow}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        const payload = await readJson(response);
        if (response.status === 401) {
          redirectToLogin();
          throw new Error("Your session expired. Sign in to continue.");
        }
        if (!response.ok) {
          throw new Error(
            usageProblem(
              payload,
              "The RPC usage report could not be loaded.",
            ),
          );
        }
        const result = parseRpcUsageEnvelope(payload);
        if (
          result.report.service.id !== serviceId ||
          result.report.service.network !== network ||
          result.report.window !== usageWindow
        ) {
          throw new Error(
            "The usage response did not match the selected RPC service.",
          );
        }
        setState({
          kind: "ready",
          report: result.report,
          requestId: result.requestId,
          refreshing: false,
          refreshError: "",
          refreshMessage: preserveExisting
            ? "RPC usage report refreshed."
            : "",
        });
        return null;
      } catch (caught) {
        if (controller.signal.aborted) return null;
        const message =
          caught instanceof Error
            ? caught.message
            : "The RPC usage report could not be loaded.";
        setState((current) =>
          preserveExisting && current.kind === "ready"
            ? {
                ...current,
                refreshing: false,
                refreshError: message,
                refreshMessage: "",
              }
            : { kind: "error", message },
        );
        return message;
      } finally {
        if (requestController.current === controller) {
          requestController.current = null;
        }
      }
    },
    [network, serviceId, usageWindow],
  );

  useEffect(() => {
    const task = window.setTimeout(() => {
      void loadUsage(false);
    }, 0);
    return () => {
      window.clearTimeout(task);
      requestController.current?.abort();
    };
  }, [loadUsage]);

  async function retryUsage() {
    const error = await loadUsage(false);
    restoreUsageFocus(
      error ? "rpc-observability-retry" : "rpc-observability-title",
    );
  }

  async function refreshUsage() {
    if (busy || state.kind !== "ready") return;
    await loadUsage(true);
    restoreUsageFocus("rpc-observability-refresh");
  }

  return (
    <section
      aria-busy={busy}
      aria-labelledby="rpc-observability-title"
      className="rpc-observability"
    >
      <header className="rpc-observability-header">
        <div>
          <span>RPC observability</span>
          <h3 id="rpc-observability-title" tabIndex={-1}>
            Recorded traffic for {serviceName}.
          </h3>
          <p>
            This panel renders only authenticated usage returned for the
            selected service. It does not add sample requests, infer missing
            traffic, or represent an uptime SLA.
          </p>
        </div>
        <div className="rpc-observability-service">
          <span>Selected service</span>
          <strong>{networkLabel(network)}</strong>
          <code>{serviceId}</code>
        </div>
      </header>

      <div className="rpc-observability-toolbar">
        <div aria-label="Usage window" role="group">
          {rpcUsageWindows.map((candidate) => (
            <button
              aria-controls="rpc-observability-report"
              aria-pressed={usageWindow === candidate}
              className={usageWindow === candidate ? "is-active" : ""}
              key={candidate}
              onClick={() => {
                if (candidate !== usageWindow) {
                  setUsageWindow(candidate);
                }
              }}
              type="button"
            >
              {candidate === "24h"
                ? "24 hours"
                : candidate === "7d"
                  ? "7 days"
                  : "30 days"}
            </button>
          ))}
        </div>
        <button
          className="button button-outline"
          disabled={state.kind !== "ready" || busy}
          id="rpc-observability-refresh"
          onClick={() => void refreshUsage()}
          type="button"
        >
          {state.kind === "ready" && state.refreshing
            ? "Refreshing usage..."
            : "Refresh usage"}
        </button>
      </div>

      <div id="rpc-observability-report">
        {state.kind === "loading" ? (
          <div className="rpc-observability-loading" role="status">
            <span aria-hidden="true" />
            <div>
              <strong>
                Loading{" "}
                {rpcUsageWindowLabel(usageWindow).toLowerCase()} of usage
              </strong>
              <small>No placeholder traffic is shown.</small>
            </div>
          </div>
        ) : state.kind === "error" ? (
          <div className="rpc-observability-error" role="alert">
            <span>Usage unavailable</span>
            <strong>The selected service report could not be shown.</strong>
            <p>{state.message}</p>
            <button
              className="button button-outline"
              id="rpc-observability-retry"
              onClick={() => void retryUsage()}
              type="button"
            >
              Retry usage report
            </button>
          </div>
        ) : (
          <UsageReport
            refreshError={state.refreshError}
            refreshMessage={state.refreshMessage}
            report={state.report}
            requestId={state.requestId}
          />
        )}
      </div>
    </section>
  );
}

function UsageReport({
  report,
  requestId,
  refreshError,
  refreshMessage,
}: {
  report: RpcUsageReport;
  requestId: string;
  refreshError: string;
  refreshMessage: string;
}) {
  const chart = buildRpcUsageChartModel(report.series);
  const recordedUsage = hasRecordedRpcUsage(report.summary);
  const quota = report.currentHourQuota;
  const quotaKnown =
    quota.workspaceLimit !== null &&
    quota.workspaceRemaining !== null;
  const chartTitle = `${rpcUsageWindowLabel(
    report.window,
  )} of recorded RPC calls and errors`;
  const chartDescription = report.series.length
    ? `${report.series.length} ${report.resolution} points. ${formatWhole(
        report.summary.calls,
      )} calls and ${formatWhole(
        report.summary.errors,
      )} errors were returned by the usage API.`
    : "The usage API returned no time-series points for this window.";

  return (
    <div className="rpc-observability-report">
      <div className="rpc-observability-freshness">
        <div>
          <span>Window</span>
          <strong>{rpcUsageWindowLabel(report.window)}</strong>
          <small>{report.resolution} resolution</small>
        </div>
        <div>
          <span>Report generated</span>
          <strong>
            <time dateTime={report.generatedAt}>
              {formatDate(report.generatedAt)}
            </time>
          </strong>
          <small>{formatAge(report.generatedAt)}</small>
        </div>
        <div>
          <span>Recorded interval</span>
          <strong>
            <time dateTime={report.startAt}>
              {formatShortDate(report.startAt)}
            </time>{" "}
            to{" "}
            <time dateTime={report.endAt}>
              {formatShortDate(report.endAt)}
            </time>
          </strong>
          <small>Local time</small>
        </div>
        <div>
          <span>Last recorded request</span>
          <strong>
            {report.summary.lastRequestAt ? (
              <time dateTime={report.summary.lastRequestAt}>
                {formatDate(report.summary.lastRequestAt)}
              </time>
            ) : (
              "No request recorded"
            )}
          </strong>
          <small>Request {requestId}</small>
        </div>
      </div>

      <div
        aria-atomic="true"
        className="rpc-observability-refresh-status"
      >
        {refreshError ? (
          <p className="is-error" role="alert">
            Existing usage remains visible. {refreshError}
          </p>
        ) : refreshMessage ? (
          <p className="is-success" role="status">
            {refreshMessage}
          </p>
        ) : null}
      </div>

      {!recordedUsage ? (
        <div className="rpc-observability-empty" role="note">
          <strong>No recorded RPC traffic in this window.</strong>
          <p>
            Every metric below is zero or unavailable in the API response.
            Nodezuno does not insert demonstration traffic.
          </p>
        </div>
      ) : null}

      <div
        aria-label={`${rpcUsageWindowLabel(report.window)} summary`}
        className="rpc-observability-summary"
      >
        <MetricCard
          detail="Authenticated HTTP requests"
          label="Requests"
          value={formatWhole(report.summary.requests)}
        />
        <MetricCard
          detail="JSON-RPC calls, including batches"
          label="RPC calls"
          value={formatWhole(report.summary.calls)}
        />
        <MetricCard
          detail={
            report.summary.successRate === null
              ? "No RPC calls were recorded"
              : `${formatWhole(report.summary.errors)} calls returned errors`
          }
          label="Call success"
          value={formatSuccessRate(report.summary.successRate)}
        />
        <MetricCard
          detail={
            report.summary.averageLatencyMs === null
              ? "No request latency was recorded"
              : "Average gateway request latency"
          }
          label="Average latency"
          value={formatLatency(report.summary.averageLatencyMs)}
        />
        <MetricCard
          detail={`${formatWhole(
            report.summary.upstreamFailures,
          )} upstream failures`}
          label="Errors"
          value={formatWhole(report.summary.errors)}
        />
        <MetricCard
          detail={`${formatBytes(
            report.summary.bytesIn,
          )} in / ${formatBytes(report.summary.bytesOut)} out`}
          label="Traffic"
          value={formatBytes(
            report.summary.bytesIn + report.summary.bytesOut,
          )}
        />
      </div>

      <section
        aria-labelledby="rpc-observability-quota-title"
        className="rpc-observability-quota"
      >
        <div>
          <span>Current hour</span>
          <h4 id="rpc-observability-quota-title">
            Workspace quota headroom
          </h4>
          <p>
            The selected service used{" "}
            <strong>{formatWhole(quota.serviceUnits)}</strong> units this
            hour. The workspace used{" "}
            <strong>{formatWhole(quota.workspaceUnits)}</strong> units across
            its RPC services.
          </p>
        </div>
        {quotaKnown ? (
          <div className="rpc-observability-quota-meter">
            <div>
              <span>Workspace usage</span>
              <strong>
                {formatWhole(quota.workspaceUnits)} /{" "}
                {formatWhole(quota.workspaceLimit!)}
              </strong>
            </div>
            <progress
              aria-label="Current workspace hourly quota usage"
              max={Math.max(1, quota.workspaceLimit!)}
              value={Math.min(
                quota.workspaceUnits,
                Math.max(1, quota.workspaceLimit!),
              )}
            />
            <p>
              {formatWhole(quota.workspaceRemaining!)} units remain. Resets{" "}
              <time dateTime={quota.resetAt}>
                {formatDate(quota.resetAt)}
              </time>
              .
            </p>
          </div>
        ) : (
          <div className="rpc-observability-quota-unavailable">
            <strong>Workspace limit unavailable</strong>
            <p>
              The usage API did not return a workspace limit, so this panel
              does not infer a percentage. The selected service usage remains
              visible.
            </p>
            <span>
              Next hourly reset{" "}
              <time dateTime={quota.resetAt}>
                {formatDate(quota.resetAt)}
              </time>
            </span>
          </div>
        )}
      </section>

      <figure className="rpc-observability-chart">
        <div className="rpc-observability-chart-heading">
          <div>
            <span>Recorded time series</span>
            <h4>{chartTitle}</h4>
          </div>
          <div aria-label="Chart legend">
            <span className="is-calls">RPC calls</span>
            <span className="is-errors">Errors</span>
          </div>
        </div>
        {report.series.length === 0 ? (
          <div className="rpc-observability-chart-empty">
            No time-series points were returned for this window.
          </div>
        ) : chart.hasTraffic ? (
          <svg
            aria-labelledby="rpc-observability-chart-title rpc-observability-chart-description"
            role="img"
            viewBox="0 0 720 240"
          >
            <title id="rpc-observability-chart-title">{chartTitle}</title>
            <desc id="rpc-observability-chart-description">
              {chartDescription}
            </desc>
            <g aria-hidden="true" className="rpc-observability-chart-grid">
              <line x1="48" x2="702" y1="20" y2="20" />
              <line x1="48" x2="702" y1="112" y2="112" />
              <line x1="48" x2="702" y1="204" y2="204" />
              <text x="40" y="24">
                {formatCompact(chart.maximum)}
              </text>
              <text x="40" y="208">
                0
              </text>
              <text x="48" y="228">
                {formatChartTick(report.series[0].startAt, report.window)}
              </text>
              <text x="375" y="228" textAnchor="middle">
                {formatChartTick(
                  report.series[Math.floor(report.series.length / 2)].startAt,
                  report.window,
                )}
              </text>
              <text x="702" y="228" textAnchor="end">
                {formatChartTick(
                  report.series[report.series.length - 1].startAt,
                  report.window,
                )}
              </text>
            </g>
            <polyline
              className="rpc-observability-chart-calls"
              fill="none"
              points={chart.callPoints}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              className="rpc-observability-chart-errors"
              fill="none"
              points={chart.errorPoints}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div className="rpc-observability-chart-empty">
            The returned series contains no recorded RPC calls or errors.
          </div>
        )}
        <figcaption>
          Calls and errors are plotted from the returned buckets. This is not
          an uptime or availability graph. Times use your local timezone.
        </figcaption>
      </figure>

      <details className="rpc-observability-series">
        <summary>View exact time-series values</summary>
        <div tabIndex={0}>
          <table>
            <caption className="sr-only">
              Exact {rpcUsageWindowLabel(report.window).toLowerCase()} RPC
              usage series
            </caption>
            <thead>
              <tr>
                <th scope="col">Bucket start</th>
                <th scope="col">Requests</th>
                <th scope="col">Calls</th>
                <th scope="col">Errors</th>
                <th scope="col">Upstream failures</th>
                <th scope="col">Success</th>
                <th scope="col">Latency</th>
                <th scope="col">Quota units</th>
                <th scope="col">Bytes in</th>
                <th scope="col">Bytes out</th>
                <th scope="col">Last request</th>
              </tr>
            </thead>
            <tbody>
              {report.series.length > 0 ? (
                report.series.map((point) => (
                  <tr key={point.startAt}>
                    <th scope="row">
                      <time dateTime={point.startAt}>
                        {formatDate(point.startAt)}
                      </time>
                    </th>
                    <td>{formatWhole(point.requests)}</td>
                    <td>{formatWhole(point.calls)}</td>
                    <td>{formatWhole(point.errors)}</td>
                    <td>{formatWhole(point.upstreamFailures)}</td>
                    <td>{formatSuccessRate(point.successRate)}</td>
                    <td>{formatLatency(point.averageLatencyMs)}</td>
                    <td>{formatWhole(point.quotaUnits)}</td>
                    <td title={`${formatWhole(point.bytesIn)} bytes`}>
                      {formatBytes(point.bytesIn)}
                    </td>
                    <td title={`${formatWhole(point.bytesOut)} bytes`}>
                      {formatBytes(point.bytesOut)}
                    </td>
                    <td>
                      {point.lastRequestAt ? (
                        <time dateTime={point.lastRequestAt}>
                          {formatDate(point.lastRequestAt)}
                        </time>
                      ) : (
                        "No request"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11}>No series points returned.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>

      <section
        aria-labelledby="rpc-observability-keys-title"
        className="rpc-observability-keys"
      >
        <div>
          <span>Credential attribution</span>
          <h4 id="rpc-observability-keys-title">
            Usage by service-bound API key
          </h4>
          <p>
            Counts below come directly from the selected service report.
            Revoked credentials remain labeled for historical attribution.
          </p>
        </div>
        {report.apiKeys.length === 0 ? (
          <div className="rpc-observability-keys-empty">
            <strong>No API key breakdown was returned.</strong>
            <p>No credential traffic is inferred.</p>
          </div>
        ) : (
          <div className="rpc-observability-key-table" tabIndex={0}>
            <table>
              <caption className="sr-only">
                API key usage for {report.service.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">API key</th>
                  <th scope="col">State</th>
                  <th scope="col">Requests / calls</th>
                  <th scope="col">Success</th>
                  <th scope="col">Errors / upstream</th>
                  <th scope="col">Latency</th>
                  <th scope="col">Quota</th>
                  <th scope="col">Traffic</th>
                  <th scope="col">Last request</th>
                </tr>
              </thead>
              <tbody>
                {report.apiKeys.map((apiKey) => (
                  <tr key={apiKey.id}>
                    <th scope="row">
                      <strong>{apiKey.name}</strong>
                      <code>
                        {apiKey.prefix}
                        {"••••"}
                        {apiKey.lastFour}
                      </code>
                    </th>
                    <td>
                      {apiKey.revokedAt ? (
                        <span className="is-revoked">
                          Revoked{" "}
                          <time dateTime={apiKey.revokedAt}>
                            {formatShortDate(apiKey.revokedAt)}
                          </time>
                        </span>
                      ) : (
                        <span className="is-active">Active</span>
                      )}
                    </td>
                    <td>
                      {formatWhole(apiKey.requests)} /{" "}
                      {formatWhole(apiKey.calls)}
                    </td>
                    <td>{formatSuccessRate(apiKey.successRate)}</td>
                    <td>
                      {formatWhole(apiKey.errors)} /{" "}
                      {formatWhole(apiKey.upstreamFailures)}
                    </td>
                    <td>{formatLatency(apiKey.averageLatencyMs)}</td>
                    <td>{formatWhole(apiKey.quotaUnits)}</td>
                    <td
                      title={`${formatWhole(
                        apiKey.bytesIn,
                      )} bytes in, ${formatWhole(
                        apiKey.bytesOut,
                      )} bytes out`}
                    >
                      {formatBytes(apiKey.bytesIn + apiKey.bytesOut)}
                    </td>
                    <td>
                      {apiKey.lastRequestAt ? (
                        <time dateTime={apiKey.lastRequestAt}>
                          {formatDate(apiKey.lastRequestAt)}
                        </time>
                      ) : (
                        "No request"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function networkLabel(network: RpcUsageNetwork): string {
  if (network === "ethereum") return "Ethereum mainnet";
  if (network === "base") return "Base mainnet";
  return "Solana mainnet";
}

function formatWhole(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function formatSuccessRate(value: number | null): string {
  if (value === null) return "No calls";
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
    minimumFractionDigits: value > 0 && value < 1 ? 1 : 0,
    style: "percent",
  }).format(value);
}

function formatLatency(value: number | null): string {
  if (value === null) return "No requests";
  return `${new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
  }).format(value)} ms`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${formatWhole(value)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"] as const;
  let amount = value;
  let unit = -1;
  do {
    amount /= 1024;
    unit += 1;
  } while (amount >= 1024 && unit < units.length - 1);
  return `${new Intl.NumberFormat("en", {
    maximumFractionDigits: amount >= 10 ? 1 : 2,
  }).format(amount)} ${units[unit]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatChartTick(
  value: string,
  window: RpcUsageWindow,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(
    "en",
    window === "24h"
      ? { hour: "numeric" }
      : { day: "numeric", month: "short" },
  ).format(date);
}

function formatAge(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Freshness unavailable";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return "Generated less than a minute ago";
  if (elapsed < hour) {
    const minutes = Math.floor(elapsed / minute);
    return `Generated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsed < day) {
    const hours = Math.floor(elapsed / hour);
    return `Generated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(elapsed / day);
  return `Generated ${days} day${days === 1 ? "" : "s"} ago`;
}

function restoreUsageFocus(id: string) {
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.focus();
  });
}

function redirectToLogin() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.assign(
    `/login?return_to=${encodeURIComponent(returnTo)}`,
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function usageProblem(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fallback;
  }
  const candidate = payload as Record<string, unknown>;
  for (const key of ["detail", "title", "message", "error"]) {
    if (typeof candidate[key] === "string" && candidate[key].trim()) {
      return candidate[key].trim();
    }
  }
  return fallback;
}
