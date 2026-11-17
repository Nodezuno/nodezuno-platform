import assert from "node:assert/strict";
import test from "node:test";
import { developerApiKeyHash } from "../lib/server/crypto.ts";
import {
  archiveDeveloperService,
  authenticateDeveloperApiKey,
  createDeveloperApiKey,
  createDeveloperService,
  createDeveloperWorkspace,
  listDeveloperApiKeys,
  listDeveloperServices,
  revokeDeveloperApiKey,
} from "../lib/server/database.ts";
import {
  constantTimeStringEqual,
  createDeveloperApiKeyMaterial,
  developerApiKeyAllowsService,
  parseDeveloperApiKey,
  readDeveloperApiKey,
  serializeDeveloperApiKey,
  serializeDeveloperService,
  validateDeveloperApiKeyPayload,
  validateDeveloperServicePayload,
  validateDeveloperWorkspacePayload,
} from "../lib/server/developer-platform.ts";
import { HttpProblem } from "../lib/server/http.ts";

test("developer payloads reject unsupported and unsafe fields", () => {
  assert.deepEqual(validateDeveloperWorkspacePayload({}), {
    ok: true,
    value: { name: null },
  });
  assert.equal(
    validateDeveloperWorkspacePayload({ name: "  Acme Labs  " }).ok,
    true,
  );
  assert.equal(
    validateDeveloperWorkspacePayload({ name: "Acme", owner: "other" })
      .ok,
    false,
  );
  assert.deepEqual(validateDeveloperApiKeyPayload({ name: "  CI key  " }), {
    ok: true,
    value: { name: "CI key", serviceId: null, scopes: null },
  });
  const serviceId = "33333333-3333-4333-8333-333333333333";
  assert.deepEqual(
    validateDeveloperApiKeyPayload({
      name: "  RPC key  ",
      serviceId,
    }),
    {
      ok: true,
      value: { name: "RPC key", serviceId, scopes: null },
    },
  );
  assert.deepEqual(
    validateDeveloperApiKeyPayload({
      name: "Workspace key",
      serviceId: null,
    }),
    {
      ok: true,
      value: {
        name: "Workspace key",
        serviceId: null,
        scopes: null,
      },
    },
  );
  assert.deepEqual(
    validateDeveloperApiKeyPayload({
      name: "Service automation",
      serviceId: null,
      scopes: ["services:manage"],
    }),
    {
      ok: true,
      value: {
        name: "Service automation",
        serviceId: null,
        scopes: ["services:manage"],
      },
    },
  );
  assert.deepEqual(
    validateDeveloperApiKeyPayload({
      name: "Scoped RPC key",
      serviceId,
      scopes: ["rpc:invoke"],
    }),
    {
      ok: true,
      value: {
        name: "Scoped RPC key",
        serviceId,
        scopes: ["rpc:invoke"],
      },
    },
  );
  assert.equal(
    validateDeveloperApiKeyPayload({
      name: "Broad key",
      serviceId,
      scopes: ["rpc:invoke", "grpc:invoke"],
    }).ok,
    false,
  );
  assert.equal(
    validateDeveloperApiKeyPayload({
      name: "RPC key",
      serviceId: "not-a-service",
    }).ok,
    false,
  );
  assert.equal(validateDeveloperApiKeyPayload({ name: "x" }).ok, false);

  assert.deepEqual(
    validateDeveloperServicePayload({
      product: "platform-api",
      name: "  Production API  ",
      environment: "production",
      network: "global",
      region: "global",
    }),
    {
      ok: true,
      value: {
        product: "platform-api",
        name: "Production API",
        environment: "production",
        network: "global",
        region: "global",
      },
    },
  );
  assert.equal(
    validateDeveloperServicePayload({
      product: "rpc-api",
      name: "Ethereum production",
      environment: "production",
      network: "ethereum",
      region: "us-east",
      live: true,
    }).ok,
    false,
  );
  for (const network of ["ethereum", "base", "solana"]) {
    assert.equal(
      validateDeveloperServicePayload({
        product: "rpc-api",
        name: `${network} production`,
        environment: "production",
        network,
        region: "global",
      }).ok,
      true,
      network,
    );
  }
  assert.equal(
    validateDeveloperServicePayload({
      product: "rpc-api",
      name: "Polygon production",
      environment: "production",
      network: "polygon",
      region: "global",
    }).ok,
    false,
  );
  assert.equal(
    validateDeveloperServicePayload({
      product: "platform-api",
      name: "Production API",
      environment: "production",
      network: "ethereum",
      region: "us-east",
    }).ok,
    false,
  );
  assert.equal(
    validateDeveloperServicePayload({
      product: "grpc-api",
      name: "Ethereum native gRPC",
      environment: "production",
      network: "base",
      region: "global",
    }).ok,
    false,
  );
  for (const network of [
    "op-stack",
    "arbitrum-orbit",
    "avalanche-l1",
    "polygon-cdk",
    "cosmos-evm",
    "custom-chain",
    "custom-rollup",
  ]) {
    assert.equal(
      validateDeveloperServicePayload({
        product: "rollups",
        name: `${network} launch`,
        environment: "staging",
        network,
        region: "global",
      }).ok,
      true,
      network,
    );
  }
  assert.equal(
    validateDeveloperServicePayload({
      product: "rollups",
      name: "Unspecified launch",
      environment: "staging",
      network: "global",
      region: "global",
    }).ok,
    false,
  );
});

test("API keys contain a bounded lookup id and 256-bit random secret", () => {
  const first = createDeveloperApiKeyMaterial();
  const second = createDeveloperApiKeyMaterial();
  assert.notEqual(first.secret, second.secret);
  assert.equal(first.secret.length, 89);
  assert.deepEqual(parseDeveloperApiKey(first.secret), {
    id: first.id,
    secret: first.secret,
  });
  assert.equal(parseDeveloperApiKey(`${first.secret}x`), null);
  assert.equal(parseDeveloperApiKey(first.secret.replace("nzu_live", "sk")), null);

  const request = new Request("https://nodezuno.com/api/v1/platform/whoami", {
    headers: { Authorization: `Bearer ${first.secret}` },
  });
  assert.deepEqual(readDeveloperApiKey(request), {
    id: first.id,
    secret: first.secret,
  });
  assert.throws(
    () =>
      readDeveloperApiKey(
        new Request("https://nodezuno.com/api/v1/platform/whoami", {
          headers: { Authorization: "Bearer malformed" },
        }),
      ),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 401 &&
      error.code === "api_key_invalid",
  );
});

test("API key hashing uses an independent server pepper", async () => {
  const previousRuntime = process.env.NODEZUNO_RUNTIME;
  const previousPepper = process.env.API_KEY_PEPPER;
  try {
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.API_KEY_PEPPER =
      "api-key-pepper-a-7f4c2a91e8d6b3059c7a1f24";
    const first = await developerApiKeyHash("one-time-plaintext-key");
    const repeated = await developerApiKeyHash("one-time-plaintext-key");
    process.env.API_KEY_PEPPER =
      "api-key-pepper-b-29c8f13e6a4d750b1f3c9e82";
    const rotated = await developerApiKeyHash("one-time-plaintext-key");
    assert.equal(first, repeated);
    assert.equal(first.length, 64);
    assert.notEqual(first, "one-time-plaintext-key");
    assert.notEqual(first, rotated);
  } finally {
    setOrDeleteEnvironment("NODEZUNO_RUNTIME", previousRuntime);
    setOrDeleteEnvironment("API_KEY_PEPPER", previousPepper);
  }
});

test("API key metadata never serializes the secret or stored digest", () => {
  const serialized = serializeDeveloperApiKey({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Production",
    prefix: "nzu_live_11111111",
    lastFour: "abcd",
    scopes: ["platform:identity"],
    serviceId: null,
    createdAt: 1_700_000_000_000,
    lastUsedAt: null,
    expiresAt: 1_800_000_000_000,
    revokedAt: null,
  });
  assert.equal(Object.hasOwn(serialized, "secret"), false);
  assert.equal(Object.hasOwn(serialized, "secretHash"), false);
  assert.deepEqual(serialized.scopes, ["platform:identity"]);
  assert.equal(serialized.serviceId, null);
});

test("API key persistence receives only the digest, prefix, and last four", async () => {
  const material = createDeveloperApiKeyMaterial();
  const database = createKeyCreationDatabase();
  const metadata = await createDeveloperApiKey({
    actorEmail: "OWNER@EXAMPLE.COM",
    id: material.id,
    name: "Production",
    prefix: material.prefix,
    lastFour: material.lastFour,
    secretHash: "c".repeat(64),
    expiresAt: 2_000_000_000_000,
    now: 1_800_000_000_000,
    database: database.database,
  });
  assert.equal(metadata.id, material.id);
  assert.equal(metadata.serviceId, null);
  assert.deepEqual(metadata.scopes, ["platform:identity"]);
  const allBindings = database.batches.flatMap((batch) =>
    batch.flatMap((item) => item.bindings),
  );
  assert.equal(allBindings.includes(material.secret), false);
  assert.equal(allBindings.includes("c".repeat(64)), true);
});

test("unbound service management keys retain one explicit automation scope", async () => {
  const material = createDeveloperApiKeyMaterial();
  const database = createKeyCreationDatabase();
  const metadata = await createDeveloperApiKey({
    actorEmail: "owner@example.com",
    id: material.id,
    name: "Service automation",
    prefix: material.prefix,
    lastFour: material.lastFour,
    secretHash: "b".repeat(64),
    serviceId: null,
    scopes: ["services:manage"],
    expiresAt: 2_000_000_000_000,
    now: 1_800_000_000_000,
    database: database.database,
  });
  assert.equal(metadata.serviceId, null);
  assert.deepEqual(metadata.scopes, ["services:manage"]);
});

test("service-bound API keys validate ownership, serialize binding, and retain it on revocation", async () => {
  const serviceId = "33333333-3333-4333-8333-333333333333";
  const otherServiceId = "44444444-4444-4444-8444-444444444444";
  const material = createDeveloperApiKeyMaterial();
  const database = createKeyCreationDatabase([serviceId]);
  const metadata = await createDeveloperApiKey({
    actorEmail: "owner@example.com",
    id: material.id,
    name: "Ethereum production",
    prefix: material.prefix,
    lastFour: material.lastFour,
    secretHash: "d".repeat(64),
    serviceId,
    expiresAt: 2_000_000_000_000,
    now: 1_800_000_000_000,
    database: database.database,
  });
  assert.equal(metadata.serviceId, serviceId);
  assert.deepEqual(metadata.scopes, ["rpc:invoke"]);
  assert.equal(serializeDeveloperApiKey(metadata).serviceId, serviceId);
  assert.equal(
    JSON.parse(database.batches[0][1].bindings[6]).serviceId,
    serviceId,
  );
  await assert.rejects(
    () =>
      createDeveloperApiKey({
        actorEmail: "owner@example.com",
        id: createDeveloperApiKeyMaterial().id,
        name: "Over-scoped key",
        prefix: "nzu_live_66666666",
        lastFour: "ijkl",
        secretHash: "f".repeat(64),
        serviceId,
        scopes: ["grpc:invoke"],
        expiresAt: 2_000_000_000_000,
        now: 1_800_000_000_050,
        database: database.database,
      }),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 422 &&
      error.code === "api_key_scope_invalid",
  );

  const revoked = await revokeDeveloperApiKey({
    actorEmail: "owner@example.com",
    id: material.id,
    now: 1_800_000_000_100,
    database: database.database,
  });
  assert.equal(revoked?.serviceId, serviceId);
  assert.equal(revoked?.revokedAt, 1_800_000_000_100);

  await assert.rejects(
    () =>
      createDeveloperApiKey({
        actorEmail: "owner@example.com",
        id: createDeveloperApiKeyMaterial().id,
        name: "Wrong service",
        prefix: "nzu_live_55555555",
        lastFour: "efgh",
        secretHash: "e".repeat(64),
        serviceId: otherServiceId,
        expiresAt: 2_000_000_000_000,
        now: 1_800_000_000_200,
        database: database.database,
      }),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 422 &&
      error.code === "api_key_service_invalid",
  );
});

test("API key verification fails closed for wrong, revoked, expired, and suspended keys", async () => {
  const now = 1_800_000_000_000;
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Production",
    prefix: "nzu_live_11111111",
    lastFour: "abcd",
    serviceId: null,
    scopesJson: JSON.stringify(["platform:identity", "rpc:invented"]),
    secretHash: "a".repeat(64),
    expiresAt: now + 10_000,
    revokedAt: null,
    workspaceId: "22222222-2222-4222-8222-222222222222",
    workspaceSlug: "acme-22222222",
    workspaceName: "Acme",
    workspaceStatus: "active",
  };
  const validDb = createAuthenticationDatabase(base);
  const valid = await authenticateDeveloperApiKey({
    id: base.id,
    secretHash: base.secretHash,
    now,
    database: validDb.database,
  });
  assert.deepEqual(valid?.apiKey.scopes, ["platform:identity"]);
  assert.equal(valid?.apiKey.serviceId, null);
  assert.equal(validDb.lastUsedWrites, 1);

  const boundServiceId = "33333333-3333-4333-8333-333333333333";
  const bound = await authenticateDeveloperApiKey({
    id: base.id,
    secretHash: base.secretHash,
    now,
    database: createAuthenticationDatabase({
      ...base,
      serviceId: boundServiceId,
      scopesJson: JSON.stringify(["rpc:invoke"]),
    }).database,
  });
  assert.equal(bound?.apiKey.serviceId, boundServiceId);
  assert.deepEqual(bound?.apiKey.scopes, ["rpc:invoke"]);

  for (const row of [
    base,
    { ...base, revokedAt: now - 1 },
    { ...base, expiresAt: now },
    { ...base, workspaceStatus: "suspended" },
  ]) {
    const suppliedHash = row === base ? "b".repeat(64) : base.secretHash;
    const result = await authenticateDeveloperApiKey({
      id: base.id,
      secretHash: suppliedHash,
      now,
      database: createAuthenticationDatabase(row).database,
    });
    assert.equal(result, null);
  }
  assert.equal(constantTimeStringEqual("same", "same"), true);
  assert.equal(constantTimeStringEqual("same", "different"), false);
});

test("service-bound keys deny cross-service access while workspace keys remain compatible", () => {
  const boundServiceId = "33333333-3333-4333-8333-333333333333";
  const otherServiceId = "44444444-4444-4444-8444-444444444444";
  assert.equal(
    developerApiKeyAllowsService(
      { serviceId: boundServiceId },
      boundServiceId,
    ),
    true,
  );
  assert.equal(
    developerApiKeyAllowsService(
      { serviceId: boundServiceId },
      otherServiceId,
    ),
    false,
  );
  assert.equal(
    developerApiKeyAllowsService({ serviceId: null }, otherServiceId),
    true,
  );
});

test("workspace creation batches workspace, owner membership, and audit atomically", async () => {
  const fake = createWorkspaceDatabase();
  const result = await createDeveloperWorkspace({
    name: "Acme Labs",
    actorEmail: " OWNER@EXAMPLE.COM ",
    now: 1_800_000_000_000,
    database: fake.database,
  });
  assert.equal(result.created, true);
  assert.equal(result.workspace.role, "owner");
  assert.equal(fake.batches.length, 1);
  assert.equal(fake.batches[0].length, 3);
  assert.match(fake.batches[0][0].sql, /developer_workspaces/);
  assert.match(fake.batches[0][1].sql, /developer_workspace_members/);
  assert.match(fake.batches[0][2].sql, /developer_audit_events/);
  assert.ok(fake.batches[0][1].bindings.includes("owner@example.com"));
});

test("service creation activates each launched RPC network only with matching verified provisioning", async () => {
  const fake = createServiceDatabase();
  const actor = {
    accountId: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
  };
  const platform = await createDeveloperService({
    actor,
    input: {
      product: "platform-api",
      name: "Production API",
      environment: "production",
      network: "global",
      region: "global",
    },
    now: 1_800_000_000_000,
    database: fake.database,
  });
  const rpc = await createDeveloperService({
    actor,
    input: {
      product: "rpc-api",
      name: "Ethereum RPC",
      environment: "production",
      network: "ethereum",
      region: "us-east",
    },
    now: 1_800_000_000_001,
    database: fake.database,
  });
  const activeRpc = await createDeveloperService({
    actor,
    input: {
      product: "rpc-api",
      name: "Ethereum RPC beta",
      environment: "production",
      network: "ethereum",
      region: "global",
    },
    rpcProvisioning: {
      network: "ethereum",
      available: true,
      upstreamCount: 1,
    },
    now: 1_800_000_000_002,
    database: fake.database,
  });
  const activeBase = await createDeveloperService({
    actor,
    input: {
      product: "rpc-api",
      name: "Base RPC beta",
      environment: "production",
      network: "base",
      region: "global",
    },
    rpcProvisioning: {
      network: "base",
      available: true,
      upstreamCount: 2,
    },
    now: 1_800_000_000_003,
    database: fake.database,
  });
  const activeSolana = await createDeveloperService({
    actor,
    input: {
      product: "rpc-api",
      name: "Solana RPC beta",
      environment: "production",
      network: "solana",
      region: "global",
    },
    rpcProvisioning: {
      network: "solana",
      available: true,
      upstreamCount: 1,
    },
    now: 1_800_000_000_004,
    database: fake.database,
  });
  const mismatchedBase = await createDeveloperService({
    actor,
    input: {
      product: "rpc-api",
      name: "Base mismatch",
      environment: "production",
      network: "base",
      region: "global",
    },
    rpcProvisioning: {
      network: "ethereum",
      available: true,
      upstreamCount: 1,
    },
    now: 1_800_000_000_005,
    database: fake.database,
  });
  const grpc = await createDeveloperService({
    actor,
    input: {
      product: "grpc-api",
      name: "Ethereum gRPC pending",
      environment: "production",
      network: "ethereum",
      region: "global",
    },
    now: 1_800_000_000_006,
    database: fake.database,
  });
  const activeGrpc = await createDeveloperService({
    actor,
    input: {
      product: "grpc-api",
      name: "Ethereum gRPC beta",
      environment: "production",
      network: "ethereum",
      region: "global",
    },
    grpcProvisioning: {
      available: true,
      endpoint: "https://grpc.nodezuno.com",
    },
    now: 1_800_000_000_007,
    database: fake.database,
  });

  assert.equal(platform.status, "active");
  assert.equal(platform.endpointPath, "/api/v1/platform/whoami");
  assert.equal(platform.configuration.maturity, "live");
  assert.equal(rpc.status, "configuration_saved");
  assert.equal(rpc.endpointPath, null);
  assert.equal(
    rpc.configuration.provisioning,
    "awaiting_upstream_configuration",
  );
  assert.equal(activeRpc.status, "active");
  assert.equal(activeRpc.endpointPath, `/api/v1/rpc/${activeRpc.id}`);
  assert.equal(activeRpc.configuration.maturity, "beta");
  assert.equal(activeRpc.configuration.routing.configuredUpstreams, 1);
  assert.equal(activeRpc.telemetry, null);
  assert.equal(activeBase.status, "active");
  assert.equal(activeBase.configuration.protocol, "evm-json-rpc-2.0");
  assert.equal(activeBase.configuration.network.id, "base");
  assert.equal(activeBase.configuration.routing.configuredUpstreams, 2);
  assert.equal(activeSolana.status, "active");
  assert.equal(
    activeSolana.configuration.protocol,
    "solana-json-rpc-2.0",
  );
  assert.equal(activeSolana.configuration.network.id, "solana");
  assert.equal(mismatchedBase.status, "configuration_saved");
  assert.equal(mismatchedBase.endpointPath, null);
  assert.equal(grpc.status, "configuration_saved");
  assert.equal(grpc.endpointPath, null);
  assert.equal(
    grpc.configuration.provisioning,
    "awaiting_gateway_readiness",
  );
  assert.equal(activeGrpc.status, "active");
  assert.equal(
    activeGrpc.endpointPath,
    "https://grpc.nodezuno.com",
  );
  assert.equal(
    activeGrpc.configuration.authentication.requiredScope,
    "grpc:invoke",
  );
  assert.equal(
    activeGrpc.configuration.authentication.serviceIdMetadata,
    "x-nodezuno-service-id",
  );
  assert.equal((await listDeveloperServices(actor, fake.database)).length, 8);

  const archived = await archiveDeveloperService({
    actor,
    id: rpc.id,
    now: 1_800_000_000_008,
    database: fake.database,
  });
  assert.equal(archived?.status, "archived");
  assert.deepEqual(
    (await listDeveloperServices(actor, fake.database)).map(
      (service) => service.id,
    ),
    [
      activeGrpc.id,
      grpc.id,
      mismatchedBase.id,
      activeSolana.id,
      activeBase.id,
      activeRpc.id,
      platform.id,
    ],
  );

  const serialized = serializeDeveloperService(platform);
  assert.equal(Object.hasOwn(serialized, "workspaceId"), false);
  assert.equal(serialized.status, "active");
  assert.equal(serialized.createdAt, "2027-01-15T08:00:00.000Z");
});

test("Chain Launch Cloud saves a structured project brief without claiming deployment", async () => {
  const actor = {
    accountId: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
  };
  const service = await createDeveloperService({
    actor,
    input: {
      product: "rollups",
      name: "Partner OP Stack launch",
      environment: "staging",
      network: "op-stack",
      region: "us-east",
    },
    now: 1_800_000_000_000,
    database: createServiceDatabase().database,
  });

  assert.equal(service.status, "configuration_saved");
  assert.equal(service.endpointPath, null);
  assert.equal(service.configuration.maturity, "design-partner");
  assert.equal(service.configuration.provisioning, "project_created");
  assert.equal(service.configuration.category, "chain-launch");
  assert.deepEqual(service.configuration.stack, {
    id: "op-stack",
    label: "OP Stack",
  });
  assert.deepEqual(service.configuration.requestedComponents, [
    "rpc",
    "explorer",
    "indexing",
    "monitoring",
    "snapshots",
  ]);
  assert.equal(
    service.configuration.funding,
    "commercial_or_ecosystem_partnership",
  );
});

test("cross-workspace key listing and revocation derive tenant from identity", async () => {
  const fake = createTenantDatabase();
  const listed = await listDeveloperApiKeys(
    "owner-b@example.com",
    fake.database,
  );
  assert.deepEqual(listed.map((key) => key.id), [fake.keyB.id]);
  assert.equal(listed[0].serviceId, fake.keyB.serviceId);

  const revoked = await revokeDeveloperApiKey({
    actorEmail: "owner-b@example.com",
    id: fake.keyA.id,
    now: 1_800_000_000_000,
    database: fake.database,
  });
  assert.equal(revoked, null);
  assert.equal(fake.keyA.revokedAt, null);
  assert.equal(fake.batches.length, 0);
});

function createAuthenticationDatabase(row) {
  const state = { lastUsedWrites: 0 };
  const database = {
    prepare(sql) {
      return statement(sql, {
        first(bindings) {
          return bindings[0] === row.id ? { ...row } : null;
        },
        run() {
          state.lastUsedWrites += 1;
          return { success: true, meta: { changes: 1 } };
        },
      });
    },
  };
  return {
    database,
    get lastUsedWrites() {
      return state.lastUsedWrites;
    },
  };
}

function createWorkspaceDatabase() {
  const state = {
    workspace: null,
    memberAccountId: null,
    memberEmail: null,
    batches: [],
  };
  const database = {
    prepare(sql) {
      return statement(sql, {
        first(bindings) {
          if (!state.workspace) return null;
          if (sql.includes("m.role = 'owner'")) {
            return bindings.includes(state.memberEmail)
              ? state.workspace
              : null;
          }
          if (sql.includes("WHERE w.id = ?")) {
            return bindings[0] === state.workspace.id &&
              (bindings.includes(state.memberAccountId) ||
                bindings.includes(state.memberEmail))
              ? state.workspace
              : null;
          }
          return null;
        },
      });
    },
    async batch(statements) {
      state.batches.push(statements);
      const workspaceInsert = statements[0];
      const memberInsert = statements[1];
      state.memberAccountId = memberInsert.bindings[2];
      state.memberEmail = memberInsert.bindings[3];
      state.workspace = {
        id: workspaceInsert.bindings[0],
        slug: workspaceInsert.bindings[1],
        name: workspaceInsert.bindings[2],
        status: "active",
        role: "owner",
        createdAt: workspaceInsert.bindings[3],
        updatedAt: workspaceInsert.bindings[4],
      };
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  return {
    database,
    get batches() {
      return state.batches;
    },
  };
}

function createServiceDatabase() {
  const workspace = {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "workspace-b",
    name: "Workspace B",
    status: "active",
    role: "owner",
    createdAt: 100,
    updatedAt: 100,
  };
  const services = new Map();
  const database = {
    prepare(sql) {
      return statement(sql, {
        first(bindings) {
          if (sql.includes("FROM developer_workspace_members m")) {
            return bindings.includes(
              "11111111-1111-4111-8111-111111111111",
            )
              ? workspace
              : null;
          }
          if (sql.includes("FROM developer_services")) {
            const service = services.get(bindings[0]);
            return service?.workspaceId === bindings[1]
              ? { ...service }
              : null;
          }
          return null;
        },
        all(bindings) {
          const results = [...services.values()]
            .filter(
              (service) =>
                service.workspaceId === bindings[0] &&
                service.archivedAt === null,
            )
            .sort((left, right) => right.createdAt - left.createdAt)
            .map((service) => ({ ...service }));
          return { success: true, results };
        },
      });
    },
    async batch(statements) {
      const mutation = statements[0];
      if (mutation.sql.includes("INSERT INTO developer_services")) {
        const values = mutation.bindings;
        services.set(values[0], {
          id: values[0],
          workspaceId: values[1],
          product: values[2],
          name: values[3],
          environment: values[4],
          network: values[5],
          region: values[6],
          status: values[7],
          endpointPath: values[8],
          configurationJson: values[9],
          createdAt: values[11],
          updatedAt: values[12],
          archivedAt: null,
        });
      } else if (mutation.sql.includes("UPDATE developer_services")) {
        const service = services.get(mutation.bindings[2]);
        if (
          service &&
          service.workspaceId === mutation.bindings[3] &&
          service.archivedAt === null
        ) {
          service.status = "archived";
          service.archivedAt = mutation.bindings[0];
          service.updatedAt = mutation.bindings[1];
        }
      }
      return statements.map(() => ({
        success: true,
        meta: { changes: 1 },
      }));
    },
  };
  return { database };
}

function createTenantDatabase() {
  const workspaceB = {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "workspace-b",
    name: "Workspace B",
    status: "active",
    role: "owner",
    createdAt: 100,
    updatedAt: 100,
  };
  const keyA = keyRow(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "11111111-1111-4111-8111-111111111111",
  );
  const keyB = keyRow(
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspaceB.id,
  );
  keyB.serviceId = "33333333-3333-4333-8333-333333333333";
  const batches = [];
  const database = {
    prepare(sql) {
      return statement(sql, {
        first(bindings) {
          if (sql.includes("FROM developer_workspace_members m")) {
            return bindings.includes("owner-b@example.com")
              ? workspaceB
              : null;
          }
          if (sql.includes("FROM developer_api_keys")) {
            const [id, workspaceId] = bindings;
            const key = [keyA, keyB].find(
              (item) => item.id === id && item.workspaceId === workspaceId,
            );
            return key ? { ...key } : null;
          }
          return null;
        },
        all(bindings) {
          const keys = [keyA, keyB].filter(
            (item) => item.workspaceId === bindings[0],
          );
          return { success: true, results: keys.map((key) => ({ ...key })) };
        },
      });
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  return { database, keyA, keyB, batches };
}

function createKeyCreationDatabase(serviceIds = []) {
  const workspace = {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "workspace-b",
    name: "Workspace B",
    status: "active",
    role: "owner",
    createdAt: 100,
    updatedAt: 100,
  };
  const availableServiceIds = new Set(serviceIds);
  const state = { inserted: null, batches: [] };
  const database = {
    prepare(sql) {
      return statement(sql, {
        first(bindings) {
          if (sql.includes("FROM developer_workspace_members m")) {
            return workspace;
          }
          if (sql.includes("FROM developer_services")) {
            return availableServiceIds.has(bindings[0]) &&
              bindings[1] === workspace.id
              ? {
                  id: bindings[0],
                  product: "rpc-api",
                  network: "ethereum",
                }
              : null;
          }
          if (
            sql.includes("FROM developer_api_keys") &&
            state.inserted &&
            bindings[0] === state.inserted.id &&
            bindings[1] === state.inserted.workspaceId
          ) {
            return { ...state.inserted };
          }
          return null;
        },
      });
    },
    async batch(statements) {
      state.batches.push(statements);
      const mutation = statements[0];
      const values = mutation.bindings;
      if (mutation.sql.includes("INSERT INTO developer_api_keys")) {
        state.inserted = {
          id: values[0],
          workspaceId: values[1],
          serviceId: values[2],
          name: values[3],
          prefix: values[4],
          lastFour: values[5],
          scopesJson: values[6],
          secretHash: values[7],
          createdByAccountId: values[8],
          createdByEmail: values[9],
          createdAt: values[10],
          lastUsedAt: null,
          expiresAt: values[11],
          revokedAt: null,
        };
      } else if (
        mutation.sql.includes("UPDATE developer_api_keys") &&
        state.inserted?.id === values[1] &&
        state.inserted.workspaceId === values[2] &&
        state.inserted.revokedAt === null
      ) {
        state.inserted.revokedAt = values[0];
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  return {
    database,
    get batches() {
      return state.batches;
    },
  };
}

function keyRow(id, workspaceId) {
  return {
    id,
    workspaceId,
    name: "Test key",
    prefix: `nzu_live_${id.slice(0, 8)}`,
    lastFour: "abcd",
    scopesJson: JSON.stringify(["platform:identity"]),
    secretHash: "a".repeat(64),
    serviceId: null,
    createdByAccountId: null,
    createdByEmail: "owner@example.com",
    createdAt: 100,
    lastUsedAt: null,
    expiresAt: 2_000_000_000_000,
    revokedAt: null,
  };
}

function statement(sql, handlers = {}) {
  return {
    sql,
    bindings: [],
    bind(...values) {
      this.bindings = values;
      return this;
    },
    async first() {
      return handlers.first?.(this.bindings) ?? null;
    },
    async all() {
      return (
        handlers.all?.(this.bindings) ?? {
          success: true,
          results: [],
        }
      );
    },
    async run() {
      return (
        handlers.run?.(this.bindings) ?? {
          success: true,
          meta: { changes: 0 },
        }
      );
    },
  };
}

function setOrDeleteEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
