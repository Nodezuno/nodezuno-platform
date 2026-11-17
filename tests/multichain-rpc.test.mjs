import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  allowedEthereumRpcCalls,
  clearEthereumRpcRoutingStateForTests,
  EthereumRpcUpstreamError,
  forwardRpc,
  parseRpcJsonText,
  parseRpcUpstreamsJson,
  rpcMethodIsPlatformAllowed,
  rpcPlatformMethodCatalog,
  rpcQuotaUnits,
  SOLANA_MAINNET_GENESIS_HASH,
  verifiedRpcUpstreams,
} from "../lib/server/ethereum-rpc.ts";
import {
  findRpcServiceForApiKey,
} from "../lib/server/database.ts";

const upstream = (name, overrides = {}) => ({
  name,
  url: `https://${name}.nodes.example.org/rpc`,
  timeoutMs: 8_000,
  headers: {},
  ...overrides,
});
test.beforeEach(() => {
  clearEthereumRpcRoutingStateForTests();
});

test("multi-chain upstream configuration supports one to four private operator attachments per chain", () => {
  const parsed = parseRpcUpstreamsJson(
    JSON.stringify({
      ethereum: [
        upstream("ethereum-primary", {
          headers: { Authorization: "Bearer ethereum-provider-secret" },
        }),
      ],
      base: [upstream("base-primary")],
      solana: [upstream("solana-primary")],
    }),
  );
  assert.equal(parsed.configurationValid, true);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(parsed.upstreamsByNetwork).map(([network, values]) => [
        network,
        values.length,
      ]),
    ),
    { ethereum: 1, base: 1, solana: 1 },
  );
  assert.equal(
    parsed.upstreamsByNetwork.ethereum[0].headers.Authorization,
    "Bearer ethereum-provider-secret",
  );

  for (const invalid of [
    { ethereum: [] },
    {
      solana: Array.from({ length: 5 }, (_, index) =>
        upstream(`solana-${index}`),
      ),
    },
    { polygon: [upstream("polygon-primary")] },
    {},
  ]) {
    const result = parseRpcUpstreamsJson(JSON.stringify(invalid));
    assert.equal(result.configurationValid, false);
    assert.deepEqual(result.upstreamsByNetwork, {
      ethereum: [],
      base: [],
      solana: [],
    });
  }
});

test("every chain rejects SSRF targets and caller-controlled forwarding headers", () => {
  for (const network of ["ethereum", "base", "solana"]) {
    for (const candidate of [
      upstream(`${network}-metadata`, {
        url: "https://169.254.169.254/latest/meta-data",
      }),
      upstream(`${network}-loopback`, {
        url: "https://127.0.0.1/rpc",
      }),
      upstream(`${network}-private-v6`, {
        url: "https://[fd00::1]/rpc",
      }),
      upstream(`${network}-spoofed`, {
        headers: { "X-Forwarded-Host": "metadata.google.internal" },
      }),
      upstream(`${network}-cookie`, {
        headers: { Cookie: "provider-secret" },
      }),
    ]) {
      const parsed = parseRpcUpstreamsJson(
        JSON.stringify({ [network]: [candidate] }),
      );
      assert.equal(
        parsed.configurationValid,
        false,
        `${network}:${candidate.name}`,
      );
    }
  }
});

test("Ethereum and Base activation require their exact mainnet chain IDs", async () => {
  for (const [network, expected, wrong] of [
    ["ethereum", "0x1", "0x2105"],
    ["base", "0x2105", "0x1"],
  ]) {
    const candidate = upstream(`${network}-identity`);
    const seen = [];
    const verified = await verifiedRpcUpstreams({
      network,
      upstreams: [candidate],
      fetcher: async (_url, init) => {
        const request = JSON.parse(init.body);
        seen.push(request);
        return Response.json({
          jsonrpc: "2.0",
          id: request.id,
          result: expected,
        });
      },
    });
    assert.deepEqual(verified.map(({ name }) => name), [candidate.name]);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "eth_chainId");

    const rejected = await verifiedRpcUpstreams({
      network,
      upstreams: [candidate],
      fetcher: async (_url, init) => {
        const request = JSON.parse(init.body);
        return Response.json({
          jsonrpc: "2.0",
          id: request.id,
          result: wrong,
        });
      },
    });
    assert.deepEqual(rejected, []);
  }
});

test("Solana activation requires the canonical genesis and bounded health probe", async () => {
  const candidate = upstream("solana-mainnet");
  const requests = [];
  const verified = await verifiedRpcUpstreams({
    network: "solana",
    upstreams: [candidate],
    fetcher: async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push({ request, init });
      return Response.json({
        jsonrpc: "2.0",
        id: request.id,
        result:
          request.method === "getGenesisHash"
            ? SOLANA_MAINNET_GENESIS_HASH
            : "ok",
      });
    },
  });
  assert.deepEqual(verified.map(({ name }) => name), ["solana-mainnet"]);
  assert.deepEqual(
    requests.map(({ request }) => request.method),
    ["getGenesisHash", "getHealth"],
  );
  for (const { init } of requests) {
    assert.equal(init.redirect, "manual");
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
  }

  let wrongGenesisCalls = 0;
  const wrongGenesis = await verifiedRpcUpstreams({
    network: "solana",
    upstreams: [candidate],
    fetcher: async (_url, init) => {
      wrongGenesisCalls += 1;
      const request = JSON.parse(init.body);
      return Response.json({
        jsonrpc: "2.0",
        id: request.id,
        result: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      });
    },
  });
  assert.deepEqual(wrongGenesis, []);
  assert.equal(wrongGenesisCalls, 1);

  let unhealthyCalls = 0;
  const unhealthy = await verifiedRpcUpstreams({
    network: "solana",
    upstreams: [candidate],
    fetcher: async (_url, init) => {
      unhealthyCalls += 1;
      const request = JSON.parse(init.body);
      return Response.json({
        jsonrpc: "2.0",
        id: request.id,
        result:
          request.method === "getGenesisHash"
            ? SOLANA_MAINNET_GENESIS_HASH
            : "behind",
      });
    },
  });
  assert.deepEqual(unhealthy, []);
  assert.equal(unhealthyCalls, 2);
});

test("Solana uses an explicit platform allowlist and bounded expensive reads", () => {
  assert.equal(
    rpcMethodIsPlatformAllowed("solana", "getBalance"),
    true,
  );
  assert.equal(
    rpcMethodIsPlatformAllowed("solana", "sendTransaction"),
    true,
  );
  for (const method of [
    "requestAirdrop",
    "validatorExit",
    "setIdentity",
    "getIdentity",
    "unknownProviderExtension",
  ]) {
    assert.equal(rpcMethodIsPlatformAllowed("solana", method), false);
  }
  assert.equal(rpcMethodIsPlatformAllowed("base", "eth_getBalance"), true);
  assert.equal(rpcMethodIsPlatformAllowed("base", "admin_peers"), false);
  assert.equal(rpcMethodIsPlatformAllowed("base", "debug_traceCall"), false);

  const catalog = rpcPlatformMethodCatalog("solana");
  assert.ok(Array.isArray(catalog));
  assert.deepEqual(catalog, [...catalog].sort());
  assert.ok(catalog.includes("sendTransaction"));
  assert.equal(catalog.includes("requestAirdrop"), false);
  assert.equal(rpcPlatformMethodCatalog("ethereum"), null);

  const publicKey = "11111111111111111111111111111111";
  const envelope = parseRpcJsonText(
    JSON.stringify([
      {
        jsonrpc: "2.0",
        id: "balance",
        method: "getBalance",
        params: [publicKey],
      },
      {
        jsonrpc: "2.0",
        id: "program",
        method: "getProgramAccounts",
        params: [
          publicKey,
          {
            filters: [{ dataSize: 165 }],
            dataSlice: { offset: 0, length: 1024 },
          },
        ],
      },
      {
        jsonrpc: "2.0",
        id: "too-many-blocks",
        method: "getBlocksWithLimit",
        params: [1, 2001],
      },
      {
        jsonrpc: "2.0",
        id: "airdrop",
        method: "requestAirdrop",
        params: [publicKey, 1],
      },
    ]),
    "solana",
  );
  const allowed = allowedEthereumRpcCalls(envelope);
  assert.deepEqual(
    allowed.map(({ method }) => method),
    ["getBalance", "getProgramAccounts"],
  );
  assert.equal(rpcQuotaUnits("solana", allowed), 11);
});

test("Solana reads fail over deterministically while transaction submission is attempted once", async () => {
  const candidates = [upstream("solana-primary"), upstream("solana-backup")];
  const readEnvelope = parseRpcJsonText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "read",
      method: "getBalance",
      params: ["11111111111111111111111111111111"],
    }),
    "solana",
  );
  const readAttempts = [];
  const read = await forwardRpc({
    network: "solana",
    calls: allowedEthereumRpcCalls(readEnvelope),
    batch: false,
    upstreams: candidates,
    fetcher: async (url) => {
      readAttempts.push(String(url));
      return readAttempts.length === 1
        ? new Response("unavailable", { status: 503 })
        : Response.json({
            jsonrpc: "2.0",
            id: "read",
            result: { context: { slot: 1 }, value: 42 },
          });
    },
  });
  assert.equal(readAttempts.length, 2);
  assert.equal(read.upstreamFailures, 1);

  const writeEnvelope = parseRpcJsonText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "write",
      method: "sendTransaction",
      params: ["AQIDBA==", { encoding: "base64" }],
    }),
    "solana",
  );
  const writeAttempts = [];
  await assert.rejects(
    () =>
      forwardRpc({
        network: "solana",
        calls: allowedEthereumRpcCalls(writeEnvelope),
        batch: false,
        upstreams: candidates,
        fetcher: async (url) => {
          writeAttempts.push(String(url));
          return new Response("unavailable", { status: 503 });
        },
      }),
    (error) =>
      error instanceof EthereumRpcUpstreamError &&
      error.network === "solana" &&
      error.upstreamFailures === 1,
  );
  assert.equal(writeAttempts.length, 1);
  assert.match(writeAttempts[0], /solana-primary/);
});

test("generic RPC service lookup remains tenant-scoped and supports only launched networks", async () => {
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    workspaceId: "workspace-a",
    product: "rpc-api",
    name: "Base production",
    environment: "production",
    network: "base",
    region: "global",
    status: "active",
    endpointPath:
      "/api/v1/rpc/11111111-1111-4111-8111-111111111111",
    configurationJson: "{}",
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
  };
  const prepared = [];
  const database = {
    prepare(sql) {
      const statement = {
        sql,
        bindings: [],
        bind(...values) {
          this.bindings = values;
          return this;
        },
        async first() {
          prepared.push({
            sql: this.sql,
            bindings: [...this.bindings],
          });
          return this.bindings[1] === "workspace-a" ? row : null;
        },
      };
      return statement;
    },
  };
  const allowed = await findRpcServiceForApiKey({
    serviceId: row.id,
    workspaceId: "workspace-a",
    database,
  });
  const isolated = await findRpcServiceForApiKey({
    serviceId: row.id,
    workspaceId: "workspace-b",
    database,
  });
  assert.equal(allowed?.network, "base");
  assert.equal(isolated, null);
  assert.match(prepared[0].sql, /workspace_id = \?/);
  assert.match(
    prepared[0].sql,
    /network IN \('ethereum', 'base', 'solana'\)/,
  );
  assert.deepEqual(prepared[0].bindings, [row.id, "workspace-a"]);
});

test("the public RPC route binds authorization and upstream selection to the persisted service network", async () => {
  const source = await readFile(
    new URL("../app/api/v1/rpc/[serviceId]/route.ts", import.meta.url),
    "utf8",
  );
  const serviceLookup = source.indexOf(
    "const service = await findRpcServiceForApiKey",
  );
  const networkSelection = source.indexOf(
    "const network = service.network as RpcNetwork",
  );
  const configurationSelection = source.indexOf(
    "runtime.upstreamsByNetwork[network]",
  );
  const verification = source.indexOf("await verifiedRpcUpstreams");
  const forwarding = source.indexOf("await forwardRpc");
  assert.ok(serviceLookup > 0);
  assert.ok(networkSelection > serviceLookup);
  assert.ok(configurationSelection > networkSelection);
  assert.ok(verification > configurationSelection);
  assert.ok(forwarding > verification);
  assert.match(
    source.slice(networkSelection, forwarding),
    /network,\s*upstreams: configuredUpstreams/,
  );
});

test("migration 0008 enforces the launched RPC networks and lookup index", async () => {
  const [migration, schema] = await Promise.all([
    readFile(
      new URL("../drizzle/0008_multichain_rpc.sql", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /developer_services_rpc_network_check/);
  assert.match(migration, /'ethereum', 'base', 'solana'/);
  assert.match(migration, /rpc_network_insert_guard/);
  assert.match(migration, /rpc_network_update_guard/);
  for (const source of [migration, schema]) {
    assert.match(source, /developer_services_rpc_network_active_idx/);
  }
});

test("parseRpcJsonText correctly handles malformed payloads and non-object JSON primitives", () => {
  const invalidJson = parseRpcJsonText("{ malformed json", "ethereum");
  assert.equal(invalidJson.protocolErrorCount, 1);
  assert.equal(invalidJson.entries.length, 1);
  assert.equal(invalidJson.entries[0].kind, "error");
  if (invalidJson.entries[0].kind === "error") {
    assert.equal(invalidJson.entries[0].response.error.code, -32700);
    assert.equal(invalidJson.entries[0].response.error.message, "Parse error");
  }

  const numberPrimitive = parseRpcJsonText("12345", "ethereum");
  assert.equal(numberPrimitive.protocolErrorCount, 1);
  assert.equal(numberPrimitive.entries[0].kind, "error");
  if (numberPrimitive.entries[0].kind === "error") {
    assert.equal(numberPrimitive.entries[0].response.error.code, -32600);
    assert.equal(numberPrimitive.entries[0].response.error.message, "Invalid Request");
  }

  const stringPrimitive = parseRpcJsonText('"just a string"', "ethereum");
  assert.equal(stringPrimitive.protocolErrorCount, 1);
  assert.equal(stringPrimitive.entries[0].kind, "error");
  if (stringPrimitive.entries[0].kind === "error") {
    assert.equal(stringPrimitive.entries[0].response.error.code, -32600);
    assert.equal(stringPrimitive.entries[0].response.error.message, "Invalid Request");
  }

  const emptyBatch = parseRpcJsonText("[]", "ethereum");
  assert.equal(emptyBatch.protocolErrorCount, 1);
  assert.equal(emptyBatch.entries[0].kind, "error");
  if (emptyBatch.entries[0].kind === "error") {
    assert.equal(emptyBatch.entries[0].response.error.code, -32600);
    assert.equal(emptyBatch.entries[0].response.error.message, "Invalid Request");
  }
});
