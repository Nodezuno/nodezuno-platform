import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { developerApiKeyHash } from "../lib/server/crypto.ts";
import {
  authorizeGrpcDeveloperApiKey,
  GRPC_AUTHORIZATION_MAX_QUOTA_UNITS,
  requireGrpcControlPlaneSecret,
  validateGrpcAuthorizationPayload,
} from "../lib/server/grpc-authorization.ts";
import {
  clearGrpcProvisioningCacheForTests,
  grpcHealthRequestFrame,
  grpcProvisioningSnapshot,
  normalizeGrpcPublicEndpoint,
  parseGrpcHealthServingResponse,
  verifyGrpcHealth,
} from "../lib/server/grpc.ts";
import {
  createDeveloperApiKeyMaterial,
} from "../lib/server/developer-platform.ts";
import { HttpProblem } from "../lib/server/http.ts";

const serviceId = "33333333-3333-4333-8333-333333333333";
const workspaceId = "44444444-4444-4444-8444-444444444444";
const runtimeEnvironment = {
  NODEZUNO_RUNTIME: "container",
  NODEZUNO_GRPC_PUBLIC_ENDPOINT: "https://grpc.nodezuno.com",
  NODEZUNO_GRPC_AUTH_SECRET:
    "grpc-auth-prod-A1b2C3d4E5f6G7h8I9j0K1l2",
  RATE_LIMIT_SECRET:
    "rate-limit-prod-B2c3D4e5F6g7H8i9J0k1L2m3",
  API_KEY_PEPPER:
    "api-key-pepper-C3d4E5f6G7h8I9j0K1l2M3n4",
  BETTER_AUTH_SECRET:
    "better-auth-D4e5F6g7H8i9J0k1L2m3N4o5",
  NODEZUNO_ORIGIN_SECRET:
    "origin-auth-E5f6G7h8I9j0K1l2M3n4O5p6",
  NODEZUNO_RPC_HOURLY_CALL_QUOTA: "120",
  NODEZUNO_RPC_WORKSPACE_HOURLY_CALL_QUOTA: "1200",
};

test("gRPC endpoint validation rejects SSRF and URL ambiguity", () => {
  assert.equal(
    normalizeGrpcPublicEndpoint("https://grpc.nodezuno.com"),
    "https://grpc.nodezuno.com",
  );
  for (const value of [
    "http://grpc.nodezuno.com",
    "https://user:secret@grpc.nodezuno.com",
    "https://grpc.nodezuno.com/path",
    "https://grpc.nodezuno.com?redirect=https://evil.invalid",
    "https://127.0.0.1",
    "https://169.254.169.254",
    "https://10.0.0.1",
    "https://172.16.0.1",
    "https://192.168.1.1",
    "https://2130706433",
    "https://0x7f000001",
    "https://0177.0.0.1",
    "https://[::1]",
    "https://gateway.internal",
  ]) {
    assert.equal(
      normalizeGrpcPublicEndpoint(value),
      null,
      `${value} should be rejected`,
    );
  }
});

test("gRPC health verification requires a serving framed response and never follows redirects", async () => {
  const requestFrame = grpcHealthRequestFrame(
    "nodezuno.ethereum.v1.EthereumProxy",
  );
  assert.equal(requestFrame[0], 0);
  assert.equal(requestFrame.byteLength > 5, true);

  const servingFrame = Uint8Array.from([
    0,
    0,
    0,
    0,
    2,
    0x08,
    0x01,
  ]);
  assert.equal(parseGrpcHealthServingResponse(servingFrame), true);
  assert.equal(
    parseGrpcHealthServingResponse(
      Uint8Array.from([0, 0, 0, 0, 2, 0x08, 0x02]),
    ),
    false,
  );

  let observed;
  assert.equal(
    await verifyGrpcHealth({
      endpoint: "https://grpc.nodezuno.com",
      fetcher: async (url, init) => {
        observed = { url, init };
        return new Response(servingFrame, {
          status: 200,
          headers: {
            "Content-Type": "application/grpc+proto",
            "grpc-status": "0",
          },
        });
      },
    }),
    true,
  );
  assert.equal(
    observed.url,
    "https://grpc.nodezuno.com/grpc.health.v1.Health/Check",
  );
  assert.equal(observed.init.redirect, "manual");
  assert.equal(observed.init.credentials, "omit");
  assert.equal(
    new Uint8Array(observed.init.body).byteLength,
    requestFrame.byteLength,
  );

  assert.equal(
    await verifyGrpcHealth({
      endpoint: "https://grpc.nodezuno.com",
      fetcher: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://evil.invalid/" },
        }),
    }),
    false,
  );
});

test("gRPC provisioning is active only with isolated configuration and a real serving response", async () => {
  await withEnvironment(runtimeEnvironment, async () => {
    clearGrpcProvisioningCacheForTests();
    const snapshot = await grpcProvisioningSnapshot({
      bypassCache: true,
      fetcher: async () =>
        new Response(
          Uint8Array.from([0, 0, 0, 0, 2, 0x08, 0x01]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/grpc",
              "grpc-status": "0",
            },
          },
        ),
    });
    assert.deepEqual(snapshot, {
      available: true,
      endpoint: "https://grpc.nodezuno.com",
    });

    process.env.NODEZUNO_GRPC_AUTH_SECRET =
      process.env.RATE_LIMIT_SECRET;
    clearGrpcProvisioningCacheForTests();
    assert.deepEqual(
      await grpcProvisioningSnapshot({
        bypassCache: true,
        fetcher: async () => {
          throw new Error("health probe must not run");
        },
      }),
      { available: false, endpoint: null },
    );
  });
});

test("private gRPC authorization secret is separate and payloads are exact", async () => {
  await withEnvironment(runtimeEnvironment, async () => {
    const request = new Request(
      "https://nodezuno.com/api/v1/internal/grpc/authorize",
      {
        headers: {
          Authorization:
            `Bearer ${runtimeEnvironment.NODEZUNO_GRPC_AUTH_SECRET}`,
        },
      },
    );
    assert.equal(
      await requireGrpcControlPlaneSecret(request),
      runtimeEnvironment.NODEZUNO_GRPC_AUTH_SECRET,
    );
    assert.deepEqual(
      validateGrpcAuthorizationPayload({
        serviceId,
        apiKey:
          "nzu_live_11111111-1111-4111-8111-111111111111_" +
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        quotaUnits: 3,
      }),
      {
        serviceId,
        apiKey:
          "nzu_live_11111111-1111-4111-8111-111111111111_" +
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        quotaUnits: 3,
      },
    );
    for (const payload of [
      {
        serviceId,
        apiKey: "secret",
        quotaUnits: 1,
        allow: true,
      },
      { serviceId, apiKey: "secret" },
      { serviceId, apiKey: "secret", quotaUnits: 0 },
      {
        serviceId,
        apiKey: "secret",
        quotaUnits: GRPC_AUTHORIZATION_MAX_QUOTA_UNITS + 1,
      },
      { serviceId, apiKey: "secret", quotaUnits: 1.5 },
      { serviceId, apiKey: "secret", quotaUnits: "1" },
    ]) {
      assert.equal(validateGrpcAuthorizationPayload(payload), null);
    }
  });
});

test("D1 gRPC authorization honors scope, service, tenant, expiry, and revocation", async () => {
  await withEnvironment(runtimeEnvironment, async () => {
    const material = createDeveloperApiKeyMaterial(
      "11111111-1111-4111-8111-111111111111",
    );
    const now = 1_800_000_000_000;
    const secretHash = await developerApiKeyHash(material.secret);
    const base = {
      id: material.id,
      name: "gRPC production",
      prefix: material.prefix,
      lastFour: material.lastFour,
      serviceId,
      scopesJson: JSON.stringify(["grpc:invoke"]),
      secretHash,
      expiresAt: now + 60_000,
      revokedAt: null,
      workspaceId,
      workspaceSlug: "workspace",
      workspaceName: "Workspace",
      workspaceStatus: "active",
    };
    const admittedDatabase = createGrpcAuthorizationDatabase(
      base,
      true,
    );
    const originalRandom = Math.random;
    let admitted;
    try {
      Math.random = () => 0;
      admitted = await authorizeGrpcDeveloperApiKey({
        input: {
          serviceId,
          apiKey: material.secret,
          quotaUnits: 10,
        },
        now,
        database: admittedDatabase,
      });
    } finally {
      Math.random = originalRandom;
    }
    assert.equal(admitted, true);
    assert.deepEqual(admittedDatabase.quotaAdmissions, [
      {
        workspaceId,
        serviceId,
        apiKeyId: material.id,
        quotaUnits: 10,
        callCount: 1,
        limit: 120,
        workspaceLimit: 1200,
        serviceLimit: 1200,
      },
    ]);

    const guardedDatabase = createGrpcAuthorizationDatabase(
      base,
      true,
      null,
      {
        serviceId,
        workspaceId,
        hourlyQuotaLimit: 300,
        warningThresholdPercent: 80,
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    );
    assert.equal(
      await authorizeGrpcDeveloperApiKey({
        input: {
          serviceId,
          apiKey: material.secret,
          quotaUnits: 10,
        },
        now,
        database: guardedDatabase,
      }),
      true,
    );
    assert.equal(
      guardedDatabase.quotaAdmissions[0].serviceLimit,
      300,
    );

    const readinessDatabase = createGrpcAuthorizationDatabase(
      base,
      true,
    );
    assert.equal(
      await authorizeGrpcDeveloperApiKey({
        input: {
          serviceId:
            "00000000-0000-4000-8000-000000000000",
          apiKey:
            "nzu_live_00000000-0000-4000-8000-000000000000_" +
            "A".repeat(43),
          quotaUnits: 1,
        },
        now,
        database: readinessDatabase,
      }),
      false,
    );
    assert.deepEqual(readinessDatabase.quotaAdmissions, []);

    const authorize = (row, serviceAvailable = true) =>
      {
        const database = createGrpcAuthorizationDatabase(
          row,
          serviceAvailable,
        );
        return {
          database,
          decision: authorizeGrpcDeveloperApiKey({
            input: {
              serviceId,
              apiKey: material.secret,
              quotaUnits: 3,
            },
            now,
            database,
          }),
        };
      };

    const wrongScope = authorize({
      ...base,
      scopesJson: JSON.stringify(["rpc:invoke"]),
    });
    assert.equal(
      await wrongScope.decision,
      false,
    );
    assert.deepEqual(wrongScope.database.quotaAdmissions, []);

    for (const denied of [
      authorize({
        ...base,
        serviceId: "55555555-5555-4555-8555-555555555555",
      }),
      authorize({ ...base, serviceId: null }),
      authorize({ ...base, expiresAt: now }),
      authorize({ ...base, revokedAt: now - 1 }),
      authorize({ ...base, workspaceStatus: "suspended" }),
      authorize(base, false),
    ]) {
      assert.equal(await denied.decision, false);
      assert.deepEqual(denied.database.quotaAdmissions, []);
    }

    const exhaustedDatabase = createGrpcAuthorizationDatabase(
      base,
      true,
      new HttpProblem(
        429,
        "rpc_quota_exceeded",
        "The hourly Ethereum RPC quota has been reached.",
      ),
    );
    await assert.rejects(
      authorizeGrpcDeveloperApiKey({
        input: {
          serviceId,
          apiKey: material.secret,
          quotaUnits: 5,
        },
        now,
        database: exhaustedDatabase,
      }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 429 &&
        error.code === "rpc_quota_exceeded",
    );
  });
});

test("private gRPC authorization route preserves quota exhaustion and redacts keys", async () => {
  const [route, authorization] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/internal/grpc/authorize/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../lib/server/grpc-authorization.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(route, /authorizeGrpcDeveloperApiKey/);
  assert.match(route, /error instanceof HttpProblem/);
  assert.match(route, /responseFromError\(error, requestId\)/);
  assert.match(authorization, /consumeRpcQuota\(\{/);
  assert.match(authorization, /quotaUnits: options\.input\.quotaUnits/);
  assert.match(authorization, /workspaceLimit: runtime\.workspaceHourlyCallQuota/);
  assert.ok(
    authorization.indexOf("if (!service) return false") <
      authorization.indexOf("await consumeRpcQuota"),
  );
  for (const source of [route, authorization]) {
    assert.doesNotMatch(source, /console\.(?:error|warn)\([^)]*apiKey/);
    assert.doesNotMatch(source, /\u2014/);
  }
});

function createGrpcAuthorizationDatabase(
  authenticationRow,
  serviceAvailable,
  quotaError = null,
  guardrail = null,
) {
  const database = {
    quotaAdmissions: [],
    prepare(sql) {
      return {
        sql,
        bindings: [],
        bind(...values) {
          this.bindings = values;
          return this;
        },
        async first() {
          if (sql.includes("JOIN developer_workspaces")) {
            return this.bindings[0] === authenticationRow.id
              ? { ...authenticationRow }
              : null;
          }
          if (sql.includes("product = 'grpc-api'")) {
            return serviceAvailable &&
              this.bindings[0] === serviceId &&
              this.bindings[1] === authenticationRow.workspaceId
              ? {
                  id: serviceId,
                  workspaceId: authenticationRow.workspaceId,
                  product: "grpc-api",
                  name: "Ethereum gRPC",
                  environment: "production",
                  network: "ethereum",
                  region: "global",
                  status: "active",
                  endpointPath: "https://grpc.nodezuno.com",
                  configurationJson: "{}",
                  createdAt: 1,
                  updatedAt: 1,
                  archivedAt: null,
                }
              : null;
          }
          if (
            sql.includes(
              "FROM developer_rpc_service_guardrails",
            )
          ) {
            return guardrail;
          }
          if (sql.includes("SELECT quota_units AS quotaUnits")) {
            return null;
          }
          return null;
        },
        async run() {
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
    async batch(statements) {
      if (
        statements.length === 3 &&
        statements[0].sql?.includes(
          "INSERT INTO ethereum_rpc_workspace_quota_buckets",
        ) &&
        statements[1].sql?.includes(
          "INSERT INTO ethereum_rpc_service_quota_buckets",
        ) &&
        statements[2].sql?.includes(
          "INSERT INTO ethereum_rpc_usage_buckets",
        )
      ) {
        if (quotaError) throw quotaError;
        const workspaceBindings = statements[0].bindings;
        const serviceBindings = statements[1].bindings;
        const keyBindings = statements[2].bindings;
        database.quotaAdmissions.push({
          workspaceId: workspaceBindings[1],
          serviceId: keyBindings[2],
          apiKeyId: keyBindings[3],
          quotaUnits: keyBindings[5],
          callCount: keyBindings[7],
          limit: keyBindings[6],
          workspaceLimit: workspaceBindings[4],
          serviceLimit: serviceBindings[5],
        });
        return [
          {
            success: true,
            results: [{ quotaUnits: workspaceBindings[3] }],
            meta: { changes: 1 },
          },
          {
            success: true,
            results: [{ quotaUnits: serviceBindings[4] }],
            meta: { changes: 1 },
          },
          {
            success: true,
            results: [{ quotaUnits: keyBindings[5] }],
            meta: { changes: 1 },
          },
        ];
      }
      return [];
    },
  };
  return database;
}

async function withEnvironment(values, run) {
  const previous = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    return await run();
  } finally {
    clearGrpcProvisioningCacheForTests();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
