import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildRpcUsageChartModel,
  hasRecordedRpcUsage,
  parseRpcUsageEnvelope,
  rpcUsageWindowLabel,
} from "../lib/client/rpc-observability.ts";

const panelUrl = new URL(
  "../components/rpc-observability-panel.tsx",
  import.meta.url,
);
const consoleUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("RPC usage parser accepts the exact authenticated report contract", () => {
  const payload = usageEnvelope();
  const parsed = parseRpcUsageEnvelope(payload);

  assert.equal(parsed.requestId, "request-usage");
  assert.equal(parsed.report.service.id, "service-1");
  assert.equal(parsed.report.service.network, "ethereum");
  assert.equal(parsed.report.window, "24h");
  assert.equal(parsed.report.resolution, "1h");
  assert.equal(parsed.report.summary.requests, 12);
  assert.equal(parsed.report.summary.averageLatencyMs, 18.75);
  assert.equal(parsed.report.summary.successRate, 0.9);
  assert.equal(parsed.report.currentHourQuota.workspaceRemaining, 960);
  assert.equal(parsed.report.series.length, 2);
  assert.equal(parsed.report.apiKeys[0].revokedAt, null);

  const empty = parseRpcUsageEnvelope(
    usageEnvelope({
      currentHourQuota: {
        serviceUnits: 0,
        workspaceUnits: 0,
        workspaceLimit: null,
        workspaceRemaining: null,
        resetAt: "2026-07-18T11:00:00.000Z",
      },
      summary: metrics({
        quotaUnits: 0,
        requests: 0,
        calls: 0,
        errors: 0,
        upstreamFailures: 0,
        averageLatencyMs: null,
        successRate: null,
        bytesIn: 0,
        bytesOut: 0,
        lastRequestAt: null,
      }),
      series: [],
      apiKeys: [],
    }),
  );
  assert.equal(hasRecordedRpcUsage(empty.report.summary), false);
});

test("RPC usage parser rejects mismatched windows, unsafe metrics, and inconsistent quota", () => {
  assert.throws(() =>
    parseRpcUsageEnvelope(
      usageEnvelope({ resolution: "1d" }),
    ),
  );
  assert.throws(() =>
    parseRpcUsageEnvelope(
      usageEnvelope({
        summary: metrics({ successRate: 1.01 }),
      }),
    ),
  );
  assert.throws(() =>
    parseRpcUsageEnvelope(
      usageEnvelope({
        summary: metrics({ calls: -1 }),
      }),
    ),
  );
  assert.throws(() =>
    parseRpcUsageEnvelope(
      usageEnvelope({
        currentHourQuota: {
          serviceUnits: 4,
          workspaceUnits: 40,
          workspaceLimit: 1_000,
          workspaceRemaining: null,
          resetAt: "2026-07-18T11:00:00.000Z",
        },
      }),
    ),
  );
  assert.throws(() =>
    parseRpcUsageEnvelope(
      usageEnvelope({
        service: {
          id: "service-1",
          name: "Unsupported",
          network: "polygon",
        },
      }),
    ),
  );
  assert.throws(() => {
    const payload = usageEnvelope();
    delete payload.requestId;
    return parseRpcUsageEnvelope(payload);
  });
});

test("RPC chart model plots only returned calls and errors", () => {
  const series = [
    seriesPoint("2026-07-18T08:00:00.000Z", 0, 0),
    seriesPoint("2026-07-18T09:00:00.000Z", 10, 2),
    seriesPoint("2026-07-18T10:00:00.000Z", 5, 1),
  ];
  const chart = buildRpcUsageChartModel(series);

  assert.equal(chart.maximum, 10);
  assert.equal(chart.hasTraffic, true);
  assert.equal(chart.callPoints, "48,204 375,20 702,112");
  assert.equal(chart.errorPoints, "48,204 375,167.2 702,185.6");
  assert.equal(
    buildRpcUsageChartModel([
      seriesPoint("2026-07-18T08:00:00.000Z", 0, 0),
    ]).hasTraffic,
    false,
  );
  assert.equal(rpcUsageWindowLabel("30d"), "Last 30 days");
});

test("observability panel fetches only the selected RPC service and exposes complete honest states", async () => {
  const [panel, consoleSource, styles] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(consoleUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(
    panel,
    /\/api\/v1\/developer\/services\/\$\{encodeURIComponent\([\s\S]+serviceId[\s\S]+\)\}\/usage\?window=\$\{usageWindow\}/,
  );
  assert.match(panel, /credentials: "same-origin"/);
  assert.match(panel, /cache: "no-store"/);
  assert.match(panel, /headers: \{ Accept: "application\/json" \}/);
  assert.match(panel, /result\.report\.service\.id !== serviceId/);
  assert.match(panel, /result\.report\.service\.network !== network/);
  assert.match(panel, /result\.report\.window !== usageWindow/);
  assert.match(panel, /requestController\.current\?\.abort\(\)/);

  assert.match(panel, /rpcUsageWindows\.map/);
  assert.match(panel, /aria-pressed=\{usageWindow === candidate\}/);
  assert.match(panel, /24 hours/);
  assert.match(panel, /7 days/);
  assert.match(panel, /30 days/);
  assert.match(panel, /kind: "loading"/);
  assert.match(panel, /kind: "error"/);
  assert.match(panel, /kind: "ready"/);
  assert.match(panel, /Existing usage remains visible/);
  assert.match(panel, /No recorded RPC traffic in this window/);
  assert.match(panel, /does not insert demonstration traffic/);

  assert.match(panel, /<progress/);
  assert.match(panel, /workspaceLimit !== null/);
  assert.match(panel, /does not infer a percentage/);
  assert.match(panel, /formatSuccessRate/);
  assert.match(panel, /formatLatency/);
  assert.match(panel, /formatBytes/);
  assert.match(panel, /Last recorded request/);
  assert.match(panel, /Report generated/);
  assert.match(panel, /requestId/);

  assert.match(panel, /<svg/);
  assert.match(panel, /role="img"/);
  assert.match(panel, /<title id="rpc-observability-chart-title">/);
  assert.match(panel, /<desc id="rpc-observability-chart-description">/);
  assert.match(panel, /View exact time-series values/);
  assert.match(panel, /<table>/);
  assert.match(panel, /Usage by service-bound API key/);
  assert.match(panel, /Revoked credentials remain labeled/);
  assert.match(panel, /\{"••••"\}/);
  assert.match(panel, /not[\s\S]+uptime or availability graph/i);

  assert.match(consoleSource, /<RpcObservabilityPanel/);
  assert.match(
    consoleSource,
    /selectedRpcService \? \([\s\S]+<RpcObservabilityPanel[\s\S]+network=\{selectedRpcNetwork\}[\s\S]+serviceId=\{selectedRpcService\.id\}/,
  );
  assert.doesNotMatch(
    consoleSource,
    /<RpcObservabilityPanel[\s\S]{0,300}ethereumGrpcService/,
  );

  assert.match(styles, /\.rpc-observability/);
  assert.match(styles, /\.rpc-observability-chart-calls/);
  assert.match(styles, /\.rpc-observability-key-table/);
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]+\.rpc-observability-summary[\s\S]+grid-template-columns: 1fr/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+\.rpc-observability/,
  );
  assert.match(
    styles,
    /@media \(hover: none\), \(pointer: coarse\)[\s\S]+\.rpc-observability-toolbar button/,
  );

  for (const source of [panel, consoleSource, styles]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});

function usageEnvelope(overrides = {}) {
  return {
    data: {
      service: {
        id: "service-1",
        name: "Ethereum production",
        network: "ethereum",
      },
      window: "24h",
      resolution: "1h",
      generatedAt: "2026-07-18T10:30:00.000Z",
      startAt: "2026-07-17T11:00:00.000Z",
      endAt: "2026-07-18T11:00:00.000Z",
      summary: metrics(),
      currentHourQuota: {
        serviceUnits: 40,
        workspaceUnits: 40,
        workspaceLimit: 1_000,
        workspaceRemaining: 960,
        resetAt: "2026-07-18T11:00:00.000Z",
      },
      series: [
        seriesPoint("2026-07-18T09:00:00.000Z", 5, 0),
        seriesPoint("2026-07-18T10:00:00.000Z", 5, 1),
      ],
      apiKeys: [
        {
          id: "key-1",
          name: "Production",
          prefix: "nzu_live_12345678",
          lastFour: "wxyz",
          revokedAt: null,
          ...metrics(),
        },
      ],
      ...overrides,
    },
    requestId: "request-usage",
  };
}

function metrics(overrides = {}) {
  return {
    quotaUnits: 40,
    requests: 12,
    calls: 10,
    errors: 1,
    upstreamFailures: 0,
    averageLatencyMs: 18.75,
    successRate: 0.9,
    bytesIn: 1_024,
    bytesOut: 8_192,
    lastRequestAt: "2026-07-18T10:25:00.000Z",
    ...overrides,
  };
}

function seriesPoint(startAt, calls, errors) {
  return {
    startAt,
    ...metrics({
      calls,
      errors,
      requests: calls === 0 ? 0 : 1,
      quotaUnits: calls,
      averageLatencyMs: calls === 0 ? null : 10,
      successRate: calls === 0 ? null : 1 - errors / calls,
      bytesIn: calls * 10,
      bytesOut: calls * 100,
      lastRequestAt: calls === 0 ? null : startAt,
    }),
  };
}
