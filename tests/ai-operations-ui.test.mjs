import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  aiDiagnosisWindowLabel,
  parseAiDiagnosisEnvelope,
} from "../lib/client/ai-operations.ts";

const panelUrl = new URL(
  "../components/ai-operations-panel.tsx",
  import.meta.url,
);
const consoleUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("AI operations parser accepts one exact evidence-backed diagnosis", () => {
  const payload = diagnosisEnvelope();
  const parsed = parseAiDiagnosisEnvelope(payload);

  assert.equal(parsed.requestId, "request-ai-1");
  assert.equal(parsed.diagnosis.service.id, "service-1");
  assert.equal(parsed.diagnosis.window, "24h");
  assert.equal(parsed.diagnosis.engine.mode, "deterministic");
  assert.equal(parsed.diagnosis.engine.modelInvoked, false);
  assert.equal(parsed.diagnosis.summary.findingCount, 1);
  assert.equal(parsed.diagnosis.findings[0].severity, "warning");
  assert.equal(parsed.diagnosis.findings[0].evidence[0].observed, 0.94);
  assert.equal(parsed.diagnosis.findings[0].actions[0].priority, 1);
  assert.equal(aiDiagnosisWindowLabel("30d"), "Last 30 days");
});

test("AI operations parser rejects invented fields and inconsistent evidence", () => {
  assert.throws(() =>
    parseAiDiagnosisEnvelope(
      diagnosisEnvelope({
        engine: {
          provider: "external-model",
          version: "1.0.0",
          mode: "generative",
          modelInvoked: true,
        },
      }),
    ),
  );
  assert.throws(() =>
    parseAiDiagnosisEnvelope(
      diagnosisEnvelope({
        summary: {
          state: "attention",
          highestSeverity: "warning",
          findingCount: 2,
        },
      }),
    ),
  );
  assert.throws(() => {
    const payload = diagnosisEnvelope();
    payload.data.diagnosis.secret = "must-not-pass";
    return parseAiDiagnosisEnvelope(payload);
  });
  assert.throws(() =>
    parseAiDiagnosisEnvelope(
      diagnosisEnvelope({
        metrics: {
          ...diagnosisEnvelope().data.diagnosis.metrics,
          successRate: 1.01,
        },
      }),
    ),
  );
});

test("AI Operations Copilot is explicit, accessible, and operator controlled", async () => {
  const [panel, consoleSource, styles] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(consoleUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(
    panel,
    /\/api\/v1\/developer\/services\/\$\{encodeURIComponent\([\s\S]+selectedService\.id[\s\S]+\)\}\/ai-diagnosis\?window=\$\{window\}/,
  );
  assert.match(panel, /credentials: "same-origin"/);
  assert.match(panel, /cache: "no-store"/);
  assert.match(panel, /headers: \{ Accept: "application\/json" \}/);
  assert.match(panel, /requestController\.current\?\.abort\(\)/);
  assert.match(panel, /result\.diagnosis\.service\.id !== selectedService\.id/);
  assert.match(panel, /result\.diagnosis\.window !== window/);

  assert.match(panel, /AI Operations Copilot/);
  assert.match(panel, /Every conclusion shows[\s\S]+its evidence/);
  assert.match(panel, /every action remains under operator control/);
  assert.match(panel, /No external model call in this release/);
  assert.match(panel, /does not receive API-key secrets/);
  assert.match(panel, /No remediation was executed by this scan/);
  assert.match(panel, /Operator-reviewed actions/);
  assert.match(panel, /Coverage boundaries and audit details/);
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /aria-pressed=\{window === candidate\}/);

  assert.match(consoleSource, /import \{ AiOperationsPanel \}/);
  assert.match(consoleSource, /<AiOperationsPanel services=\{services\} \/>/);
  assert.match(styles, /\.ai-operations/);
  assert.match(styles, /\.ai-operations-evidence/);
  assert.match(styles, /\.ai-operations-actions/);
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]+\.ai-operations-summary[\s\S]+grid-template-columns: 1fr/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+\.ai-operations/,
  );

  for (const source of [panel, consoleSource, styles]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});

function diagnosisEnvelope(overrides = {}) {
  return {
    data: {
      diagnosis: {
        schemaVersion: "2026-08-01",
        service: {
          id: "service-1",
          product: "rpc-api",
          name: "Ethereum production",
          environment: "production",
          network: "ethereum",
          region: "global",
          status: "active",
        },
        window: "24h",
        generatedAt: "2026-08-06T10:00:00.000Z",
        engine: {
          provider: "nodezuno-evidence-rules",
          version: "1.0.0",
          mode: "deterministic",
          modelInvoked: false,
        },
        coverage: {
          kind: "operational",
          status: "complete",
          note: "The service record and retained RPC usage were available.",
        },
        summary: {
          state: "attention",
          highestSeverity: "warning",
          findingCount: 1,
        },
        metrics: {
          requests: 100,
          calls: 100,
          errors: 6,
          upstreamFailures: 2,
          averageLatencyMs: 180.5,
          successRate: 0.94,
          lastRequestAt: "2026-08-06T09:59:00.000Z",
          configuredUpstreams: 1,
          workspaceQuotaUtilization: 0.42,
        },
        findings: [
          {
            code: "rpc.success-rate.warning",
            severity: "warning",
            title: "RPC success rate needs attention",
            explanation: "The retained request window is below the target.",
            confidence: {
              level: "high",
              basis: "The rate is derived from retained RPC request outcomes.",
            },
            evidence: [
              {
                ref: "rpc_usage.success_rate",
                observed: 0.94,
                description: "Successful calls divided by recorded calls.",
              },
            ],
            actions: [
              {
                runbook: "Inspect upstream failures",
                priority: 1,
                instruction: "Review the upstream error window before changing routing.",
              },
            ],
          },
        ],
        limitations: [
          "The scan covers retained Nodezuno evidence only.",
        ],
        ...overrides,
      },
    },
    requestId: "request-ai-1",
  };
}
