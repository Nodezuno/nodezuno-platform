import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  buildAiDiagnosisEvidence,
  diagnoseInfrastructureService,
  parseAiDiagnosisWindow,
  readInfrastructureAiDiagnosis,
} from "../lib/server/ai-infrastructure-diagnostics.ts";
import { HttpProblem } from "../lib/server/http.ts";
import {
  publicApiEndpoints,
  publicOpenApiDocument,
} from "../lib/public-api.ts";

const now = 1_800_000_000_000;
const serviceId = "11111111-1111-4111-8111-111111111111";

test("configuration-only RPC diagnosis has one exact evidence-backed payload", async () => {
  const diagnosis = await diagnoseInfrastructureService({
    service: rpcService({
      status: "configuration_saved",
      endpointPath: null,
      configuration: {
        maturity: "configuration",
        provisioning: "awaiting_upstream_configuration",
        routing: { configuredUpstreams: 0 },
      },
    }),
    usage: null,
    window: "24h",
    generatedAt: now,
  });

  assert.deepEqual(diagnosis, {
    schemaVersion: "2026-08-01",
    service: {
      id: serviceId,
      product: "rpc-api",
      name: "Ethereum production",
      environment: "production",
      network: "ethereum",
      region: "global",
      status: "configuration_saved",
    },
    window: "24h",
    generatedAt: "2027-01-15T08:00:00.000Z",
    engine: {
      provider: "nodezuno-evidence-rules",
      version: "1.0.0",
      mode: "deterministic",
      modelInvoked: false,
    },
    coverage: {
      kind: "readiness",
      status: "limited",
      note:
        "Only configuration and provisioning evidence is available because the RPC service is not active.",
    },
    summary: {
      state: "critical",
      highestSeverity: "critical",
      findingCount: 1,
    },
    metrics: {
      requests: null,
      calls: null,
      errors: null,
      upstreamFailures: null,
      averageLatencyMs: null,
      successRate: null,
      lastRequestAt: null,
      configuredUpstreams: 0,
      workspaceQuotaUtilization: null,
    },
    findings: [
      {
        code: "rpc_upstream_not_ready",
        severity: "critical",
        title: "RPC upstream is not ready",
        explanation:
          "The control plane has configuration evidence, but it has not verified a callable upstream for this service.",
        confidence: {
          level: "high",
          basis:
            "The finding uses persisted service status and the allowlisted provisioning state.",
        },
        evidence: [
          {
            ref: "service.status",
            observed: "configuration_saved",
            description: "Persisted service lifecycle state.",
          },
          {
            ref: "service.configuration.provisioning",
            observed: "awaiting_upstream_configuration",
            description: "Allowlisted upstream provisioning state.",
          },
          {
            ref: "service.configuration.routing.configuredUpstreams",
            observed: 0,
            description:
              "Verified upstream count recorded by the control plane.",
          },
        ],
        actions: [
          {
            runbook: "rpc/upstream-readiness",
            priority: 1,
            instruction:
              "Attach a matching upstream, pass the readiness probe, and confirm the service becomes active before sending traffic.",
          },
        ],
      },
    ],
    limitations: [
      "No runtime health conclusion is made until a verified upstream is active.",
      "The deterministic rules engine does not call an external model.",
    ],
  });
});

test("active RPC diagnosis applies deterministic severity thresholds", async () => {
  const diagnosis = await diagnoseInfrastructureService({
    service: rpcService(),
    usage: rpcUsage({
      summary: {
        quotaUnits: 120,
        requests: 100,
        calls: 100,
        errors: 6,
        upstreamFailures: 3,
        latencyMsTotal: 120_000,
        bytesIn: 1_000,
        bytesOut: 2_000,
        lastRequestAt: now - 20 * 60 * 1000,
      },
      currentHourQuota: {
        serviceUnits: 50,
        workspaceUnits: 95,
        workspaceLimit: 100,
        workspaceRemaining: 5,
        resetAt: now + 60 * 60 * 1000,
      },
    }),
    window: "24h",
    generatedAt: now,
  });

  assert.deepEqual(
    diagnosis.findings.map((finding) => [
      finding.code,
      finding.severity,
      finding.actions[0].runbook,
    ]),
    [
      ["rpc_error_rate_critical", "critical", "rpc/error-rate"],
      [
        "rpc_upstream_failures_critical",
        "critical",
        "rpc/upstream-failover",
      ],
      ["rpc_latency_critical", "critical", "rpc/latency"],
      ["rpc_traffic_stale", "warning", "observability/traffic-gap"],
      ["workspace_quota_critical", "critical", "capacity/workspace-quota"],
      [
        "rpc_upstream_redundancy_low",
        "warning",
        "rpc/add-redundant-upstream",
      ],
    ],
  );
  assert.deepEqual(diagnosis.summary, {
    state: "critical",
    highestSeverity: "critical",
    findingCount: 6,
  });
  assert.deepEqual(diagnosis.metrics, {
    requests: 100,
    calls: 100,
    errors: 6,
    upstreamFailures: 3,
    averageLatencyMs: 1200,
    successRate: 0.94,
    lastRequestAt: "2027-01-15T07:40:00.000Z",
    configuredUpstreams: 1,
    workspaceQuotaUtilization: 0.95,
  });
  assert.equal(diagnosis.engine.modelInvoked, false);
});

test("the provider boundary receives only allowlisted redacted evidence", async () => {
  const privateMarker = "private-upstream-secret-9fd1";
  let captured;
  const service = rpcService({
    endpointPath: `/rpc/${privateMarker}`,
    configuration: {
      maturity: privateMarker,
      provisioning: privateMarker,
      secret: privateMarker,
      upstreamUrl: `https://${privateMarker}.example`,
      routing: {
        configuredUpstreams: 2,
        primary: privateMarker,
      },
    },
  });
  const usage = rpcUsage({
    apiKeys: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: privateMarker,
        prefix: "nzu_live_private",
        lastFour: "abcd",
        revokedAt: null,
        quotaUnits: 1,
        requests: 1,
        calls: 1,
        errors: 0,
        upstreamFailures: 0,
        latencyMsTotal: 10,
        bytesIn: 1,
        bytesOut: 1,
        lastRequestAt: now,
      },
    ],
  });
  const provider = {
    id: "test-safe-provider",
    version: "1",
    mode: "deterministic",
    modelInvoked: false,
    analyze(evidence) {
      captured = structuredClone(evidence);
      return {
        coverage: {
          kind: "operational",
          status: "complete",
          note: "Test coverage.",
        },
        findings: [],
        limitations: ["Test limitation."],
      };
    },
  };

  const diagnosis = await diagnoseInfrastructureService({
    service,
    usage,
    window: "24h",
    generatedAt: now,
    provider,
  });
  assert.ok(captured);
  assert.equal(captured.configuration.maturity, null);
  assert.equal(captured.configuration.provisioning, null);
  assert.equal(captured.configuration.endpointPresent, true);
  assert.equal(captured.configuration.configuredUpstreams, 2);
  for (const value of [captured, diagnosis]) {
    const serialized = JSON.stringify(value);
    assert.doesNotMatch(serialized, new RegExp(privateMarker));
    assert.doesNotMatch(serialized, /upstreamUrl|apiKeys|lastFour|prefix/);
  }
  assert.deepEqual(Object.keys(captured.configuration).sort(), [
    "configuredUpstreams",
    "endpointPresent",
    "maturity",
    "provisioning",
    "requestedComponentCount",
  ]);
});

test("Chain Launch Cloud is readiness-only and other previews fail closed", async () => {
  const privateComponent = "private-validator-address";
  const chain = await diagnoseInfrastructureService({
    service: {
      ...rpcService(),
      product: "rollups",
      name: "Avalanche launch",
      network: "avalanche-l1",
      status: "configuration_saved",
      endpointPath: null,
      configuration: {
        maturity: "design-partner",
        provisioning: "project_created",
        requestedComponents: [
          "rpc",
          "explorer",
          privateComponent,
        ],
      },
      telemetry: null,
    },
    usage: null,
    window: "7d",
    generatedAt: now,
  });
  assert.deepEqual(chain.coverage, {
    kind: "readiness",
    status: "limited",
    note:
      "This report covers the saved chain project brief only. Runtime chain evidence is not connected.",
  });
  assert.deepEqual(chain.summary, {
    state: "unknown",
    highestSeverity: "info",
    findingCount: 1,
  });
  assert.equal(
    chain.findings[0].code,
    "chain_runtime_evidence_not_connected",
  );
  assert.equal(chain.findings[0].evidence[2].observed, 3);
  assert.doesNotMatch(JSON.stringify(chain), new RegExp(privateComponent));
  assert.match(chain.limitations.join(" "), /No node, peer, validator/);

  for (const product of ["platform-api", "nft-api"]) {
    await assert.rejects(
      diagnoseInfrastructureService({
        service: {
          ...rpcService(),
          product,
          status:
            product === "platform-api"
              ? "active"
              : "configuration_saved",
          configuration: {
            maturity: product === "platform-api" ? "live" : "prelaunch",
          },
        },
        usage: null,
        window: "24h",
        generatedAt: now,
      }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 409 &&
        error.code === "ai_diagnosis_unsupported_service",
      product,
    );
  }
});

test("window parsing is bounded and returns a stable problem", () => {
  assert.equal(parseAiDiagnosisWindow(null), "24h");
  assert.equal(parseAiDiagnosisWindow("7d"), "7d");
  assert.throws(
    () => parseAiDiagnosisWindow("365d"),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 400 &&
      error.code === "ai_diagnosis_window_invalid" &&
      error.fields?.window === "Use 24h, 7d, or 30d.",
  );
});

test("tenant-scoped diagnosis cannot read another workspace service", async () => {
  const database = await createMigratedD1();
  seedTenantFixture(database.database);
  const owner = {
    accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "owner-a@example.com",
  };
  const foreignOwner = {
    accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    email: "owner-b@example.com",
  };

  const own = await readInfrastructureAiDiagnosis({
    actor: owner,
    serviceId,
    window: "24h",
    now,
    database,
  });
  assert.equal(own?.service.id, serviceId);
  assert.equal(own?.metrics.calls, 20);

  const foreign = await readInfrastructureAiDiagnosis({
    actor: foreignOwner,
    serviceId,
    window: "24h",
    now,
    database,
  });
  assert.equal(foreign, null);
});

test("route and OpenAPI require auth and publish the exact no-model contract", async () => {
  const route = await readFile(
    new URL(
      "../app/api/v1/developer/services/[id]/ai-diagnosis/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /requireDeveloperIdentity\(request\)/);
  assert.match(route, /isDeveloperResourceId\(id\)/);
  assert.match(route, /ai-diagnosis:read:identity/);
  assert.match(route, /actor: developerActorFromUser\(user\)/);
  assert.match(route, /readInfrastructureAiDiagnosis/);
  assert.match(route, /Vary: "Cookie"/);
  assert.doesNotMatch(route, /assertSameOrigin/);
  assert.doesNotMatch(route, /\u2014/);

  const pathName =
    "/api/v1/developer/services/{id}/ai-diagnosis";
  const operation = publicOpenApiDocument.paths[pathName].get;
  assert.deepEqual(operation["x-nodezuno-roles"], [
    "owner",
    "admin",
    "developer",
  ]);
  assert.equal(operation["x-nodezuno-ai-mode"], "deterministic");
  assert.match(operation.description, /No external model is called/);
  assert.equal(
    operation.responses["200"].content["application/json"].schema.$ref,
    "#/components/schemas/AiInfrastructureDiagnosisEnvelope",
  );
  assert.ok(operation.responses["409"]);
  assert.ok(
    publicApiEndpoints.some(
      (endpoint) =>
        endpoint.method === "GET" &&
        endpoint.path === pathName &&
        endpoint.maturity === "beta",
    ),
  );
  const schema =
    publicOpenApiDocument.components.schemas.AiInfrastructureDiagnosis;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.engine.required, [
    "provider",
    "version",
    "mode",
    "modelInvoked",
  ]);
  assert.deepEqual(schema.properties.findings.items, {
    $ref: "#/components/schemas/AiDiagnosisFinding",
  });
});

function rpcService(overrides = {}) {
  return {
    id: serviceId,
    workspaceId: "33333333-3333-4333-8333-333333333333",
    product: "rpc-api",
    name: "Ethereum production",
    environment: "production",
    network: "ethereum",
    region: "global",
    status: "active",
    endpointPath: `/api/v1/rpc/${serviceId}`,
    configuration: {
      maturity: "beta",
      provisioning: "available",
      routing: { configuredUpstreams: 1 },
    },
    telemetry: null,
    createdAt: now - 100_000,
    updatedAt: now - 10_000,
    archivedAt: null,
    ...overrides,
  };
}

function rpcUsage(overrides = {}) {
  return {
    service: {
      id: serviceId,
      name: "Ethereum production",
      network: "ethereum",
    },
    window: "24h",
    resolution: "1h",
    generatedAt: now,
    startAt: now - 24 * 60 * 60 * 1000,
    endAt: now,
    summary: {
      quotaUnits: 10,
      requests: 10,
      calls: 10,
      errors: 0,
      upstreamFailures: 0,
      latencyMsTotal: 1_000,
      bytesIn: 100,
      bytesOut: 200,
      lastRequestAt: now,
    },
    currentHourQuota: {
      serviceUnits: 10,
      workspaceUnits: 10,
      workspaceLimit: 1_000,
      workspaceRemaining: 990,
      resetAt: now + 60 * 60 * 1000,
    },
    series: [],
    apiKeys: [],
    ...overrides,
  };
}

function seedTenantFixture(sqlite) {
  const accountA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const accountB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const workspaceA = "33333333-3333-4333-8333-333333333333";
  const workspaceB = "44444444-4444-4444-8444-444444444444";
  const apiKeyId = "55555555-5555-4555-8555-555555555555";
  const bucketStart = Math.floor(now / 3_600_000) * 3_600_000;
  sqlite.exec("BEGIN");
  try {
    for (const [id, name, email] of [
      [accountA, "Owner A", "owner-a@example.com"],
      [accountB, "Owner B", "owner-b@example.com"],
    ]) {
      sqlite
        .prepare(
          `INSERT INTO auth_users
            (id, name, email, email_verified, image, created_at, updated_at)
           VALUES (?, ?, ?, 1, NULL, ?, ?)`,
        )
        .run(id, name, email, now - 100_000, now - 100_000);
    }
    for (const [id, slug, name] of [
      [workspaceA, "workspace-a", "Workspace A"],
      [workspaceB, "workspace-b", "Workspace B"],
    ]) {
      sqlite
        .prepare(
          `INSERT INTO developer_workspaces
            (id, slug, name, status, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?)`,
        )
        .run(id, slug, name, now - 100_000, now - 100_000);
    }
    for (const [id, workspaceId, accountId, email] of [
      ["member-a", workspaceA, accountA, "owner-a@example.com"],
      ["member-b", workspaceB, accountB, "owner-b@example.com"],
    ]) {
      sqlite
        .prepare(
          `INSERT INTO developer_workspace_members
            (id, workspace_id, account_id, email, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'owner', ?, ?)`,
        )
        .run(
          id,
          workspaceId,
          accountId,
          email,
          now - 100_000,
          now - 100_000,
        );
    }
    sqlite
      .prepare(
        `INSERT INTO developer_services
          (id, workspace_id, product, name, environment, network, region,
           status, endpoint_path, configuration_json,
           created_by_account_id, created_at, updated_at, archived_at)
         VALUES (?, ?, 'rpc-api', 'Owner A RPC', 'production', 'ethereum',
                 'global', 'active', ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        serviceId,
        workspaceA,
        `/api/v1/rpc/${serviceId}`,
        JSON.stringify({
          maturity: "beta",
          provisioning: "available",
          routing: { configuredUpstreams: 2 },
        }),
        accountA,
        now - 100_000,
        now - 10_000,
      );
    sqlite
      .prepare(
        `INSERT INTO developer_api_keys
          (id, workspace_id, service_id, name, prefix, last_four,
           scopes_json, secret_hash, created_by_account_id,
           created_by_email, created_at, last_used_at, expires_at, revoked_at)
         VALUES (?, ?, ?, 'RPC key', 'nzu_live_55555555', 'abcd',
                 '["rpc:invoke"]', ?, ?, 'owner-a@example.com', ?, NULL,
                 ?, NULL)`,
      )
      .run(
        apiKeyId,
        workspaceA,
        serviceId,
        "f".repeat(64),
        accountA,
        now - 100_000,
        now + 86_400_000,
      );
    sqlite
      .prepare(
        `INSERT INTO ethereum_rpc_usage_buckets
          (id, workspace_id, service_id, api_key_id, bucket_start,
           quota_units, quota_limit, request_count, rpc_call_count,
           error_count, upstream_failure_count, latency_ms_total,
           bytes_in, bytes_out, last_request_at, updated_at, expires_at)
         VALUES ('usage-a', ?, ?, ?, ?, 20, 1000, 20, 20, 0, 0, 2000,
                 100, 200, ?, ?, ?)`,
      )
      .run(
        workspaceA,
        serviceId,
        apiKeyId,
        bucketStart,
        now - 1_000,
        now - 1_000,
        now + 86_400_000,
      );
    sqlite
      .prepare(
        `INSERT INTO ethereum_rpc_workspace_quota_buckets
          (id, workspace_id, bucket_start, quota_units, quota_limit,
           updated_at, expires_at)
         VALUES ('workspace-quota-a', ?, ?, 20, 1000, ?, ?)`,
      )
      .run(workspaceA, bucketStart, now - 1_000, now + 86_400_000);
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

async function createMigratedD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = path.resolve("drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();
  for (const file of migrationFiles) {
    const source = await readFile(
      path.join(migrationDirectory, file),
      "utf8",
    );
    for (const statement of source.split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) sqlite.exec(sql);
    }
  }
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  return new MemoryD1Database(sqlite);
}

class MemoryD1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new MemoryD1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class MemoryD1Statement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new MemoryD1Statement(
      this.database,
      this.sql,
      bindings.map(normalizeBinding),
    );
  }

  async first(column) {
    const row =
      this.database.prepare(this.sql).get(...this.bindings) ?? null;
    if (typeof column === "string") return row?.[column] ?? null;
    return row;
  }

  async all() {
    const results = this.database.prepare(this.sql).all(...this.bindings);
    return { meta: { changes: 0 }, results, success: true };
  }

  async raw() {
    const rows = this.database.prepare(this.sql).all(...this.bindings);
    return rows.map((row) => Object.values(row));
  }

  async run() {
    if (
      /^\s*(SELECT|PRAGMA|WITH)\b/i.test(this.sql) ||
      /\bRETURNING\b/i.test(this.sql)
    ) {
      const results = this.database.prepare(this.sql).all(...this.bindings);
      return {
        meta: { changes: results.length },
        results,
        success: true,
      };
    }
    const result = this.database.prepare(this.sql).run(...this.bindings);
    return {
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
      results: [],
      success: true,
    };
  }
}

function normalizeBinding(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value;
}

test("evidence builder rejects mismatched service and window usage", () => {
  assert.throws(
    () =>
      buildAiDiagnosisEvidence({
        service: rpcService(),
        usage: {
          ...rpcUsage(),
          service: {
            ...rpcUsage().service,
            id: "99999999-9999-4999-8999-999999999999",
          },
        },
        window: "24h",
        generatedAt: now,
      }),
    /usage must match the service/,
  );
  assert.throws(
    () =>
      buildAiDiagnosisEvidence({
        service: rpcService(),
        usage: { ...rpcUsage(), window: "7d" },
        window: "24h",
        generatedAt: now,
      }),
    /usage must match the window/,
  );
});
