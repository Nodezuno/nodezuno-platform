import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  allowedEthereumRpcCalls,
  clearEthereumRpcRoutingStateForTests,
  ETHEREUM_RPC_MAX_RESPONSE_BYTES,
  EthereumRpcUpstreamError,
  ethereumRpcMethodQuotaWeight,
  ethereumRpcQuotaUnits,
  forwardEthereumRpc,
  isSafeEthereumRpcRetry,
  parseEthereumJsonRpcText,
  parseEthereumRpcUpstreamsJson,
  parseRpcUpstreamsJson,
  pulseRpcRoutingSnapshot,
  renderEthereumRpcResponses,
  verifiedEthereumMainnetUpstreams,
} from "../lib/server/ethereum-rpc.ts";
import { consumeEthereumRpcQuota } from "../lib/server/database.ts";
import { HttpProblem } from "../lib/server/http.ts";

const upstream = (name, overrides = {}) => ({
  name,
  url: `https://${name.replaceAll("_", "-")}.rpc.example.com/v1`,
  timeoutMs: 8_000,
  headers: {},
  ...overrides,
});

async function withRuntimeEnvironment(overrides, callback) {
  const original = new Map(
    Object.keys(overrides).map((name) => [name, process.env[name]]),
  );
  try {
    for (const [name, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    return await callback();
  } finally {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test.beforeEach(() => {
  clearEthereumRpcRoutingStateForTests();
});

test("RPC upstream configuration fails closed without a real HTTPS target", () => {
  assert.deepEqual(parseEthereumRpcUpstreamsJson(undefined), {
    upstreams: [],
    configurationValid: true,
  });
  assert.equal(
    parseEthereumRpcUpstreamsJson(
      JSON.stringify({
        ethereum: [{ name: "primary", url: "http://rpc.example" }],
      }),
    ).configurationValid,
    false,
  );
  assert.equal(
    parseEthereumRpcUpstreamsJson(
      JSON.stringify({
        ethereum: [
          {
            name: "duplicate",
            url: "https://one.rpc.example.com",
          },
          {
            name: "duplicate",
            url: "https://two.rpc.example.com",
          },
        ],
      }),
    ).configurationValid,
    false,
  );

  const parsed = parseEthereumRpcUpstreamsJson(
    JSON.stringify({
      ethereum: [
        {
          name: "primary",
          url: "https://rpc.provider.example.com/v1",
          timeoutMs: 5_000,
          headers: { Authorization: "Bearer operator-provider-token" },
        },
      ],
    }),
  );
  assert.equal(parsed.configurationValid, true);
  assert.equal(parsed.upstreams.length, 1);
  assert.equal(
    parsed.upstreams[0].headers.Authorization,
    "Bearer operator-provider-token",
  );
});

test("RPC upstream configuration rejects SSRF targets and spoofed headers", () => {
  for (const url of [
    "https://localhost",
    "https://localhost.",
    "https://metadata.google.internal/computeMetadata/v1",
    "https://provider.example/v1",
    "https://127.0.0.1",
    "https://0177.0.0.1",
    "https://10.0.0.1",
    "https://100.64.0.1",
    "https://169.254.169.254/latest/meta-data",
    "https://192.168.1.1",
    "https://198.51.100.10",
    "https://[::1]",
    "https://[fd00::1]",
    "https://[fe80::1]",
    "https://[::ffff:127.0.0.1]",
    "https://[3fff::1]",
    "https://rpc.provider.example.com:8443/v1",
    "https://rpc.provider.example.com\\@127.0.0.1/v1",
    " https://rpc.provider.example.com/v1",
  ]) {
    const parsed = parseEthereumRpcUpstreamsJson(
      JSON.stringify({
        ethereum: [{ name: "blocked", url }],
      }),
    );
    assert.equal(parsed.configurationValid, false, url);
    assert.deepEqual(parsed.upstreams, [], url);
  }

  for (const headers of [
    { Host: "169.254.169.254" },
    { "Proxy-Authorization": "Basic secret" },
    { "Sec-Fetch-Site": "same-origin" },
    { "X-Real-IP": "127.0.0.1" },
    { TE: "trailers" },
    { Authorization: "Bearer one", authorization: "Bearer two" },
    { Authorization: " Bearer provider-token" },
    { Authorization: "Bearer provider\u0009token" },
    { Authorization: "Bearer provider-tokén" },
  ]) {
    assert.equal(
      parseEthereumRpcUpstreamsJson(
        JSON.stringify({
          ethereum: [
            {
              name: "blocked-header",
              url: "https://rpc.provider.example.com/v1",
              headers,
            },
          ],
        }),
      ).configurationValid,
      false,
      JSON.stringify(Object.keys(headers)),
    );
  }

  for (const url of [
    "https://1.1.1.1/v1",
    "https://[2606:4700:4700::1111]/v1",
    "https://rpc.provider.example.com:443/v1?apiKey=operator-secret",
  ]) {
    const parsed = parseEthereumRpcUpstreamsJson(
      JSON.stringify({
        ethereum: [{ name: "public", url }],
      }),
    );
    assert.equal(parsed.configurationValid, true, url);
    assert.equal(parsed.upstreams.length, 1, url);
    assert.equal(new URL(parsed.upstreams[0].url).port, "", url);
  }
});

test("HTTP loopback RPC remains disabled without the explicit single-host container flag", async () => {
  const raw = JSON.stringify({
    ethereum: [
      {
        name: "helios",
        url: "http://127.0.0.1:18545/",
      },
    ],
  });
  for (const environment of [
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK: undefined,
    },
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK: "false",
    },
    {
      NODEZUNO_RUNTIME: "sites",
      NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK: "true",
    },
  ]) {
    await withRuntimeEnvironment(environment, () => {
      const parsed = parseEthereumRpcUpstreamsJson(raw);
      assert.equal(parsed.configurationValid, false);
      assert.deepEqual(parsed.upstreams, []);
    });
  }
});

test("single-host mode accepts only an uncredentialed Ethereum loopback root endpoint", async () => {
  await withRuntimeEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK: "true",
    },
    () => {
      const accepted = parseEthereumRpcUpstreamsJson(
        JSON.stringify({
          ethereum: [
            {
              name: "helios",
              url: "http://127.0.0.1:18545/",
            },
          ],
        }),
      );
      assert.equal(accepted.configurationValid, true);
      assert.equal(accepted.upstreams.length, 1);
      assert.equal(
        accepted.upstreams[0].url,
        "http://127.0.0.1:18545/",
      );

      for (const url of [
        "http://localhost:18545/",
        "http://localhost.localdomain:18545/",
        "http://127.0.0.1/",
        "http://127.0.0.1:80/",
        "http://127.0.0.1:18545/rpc",
        "http://127.0.0.1:18545/?token=secret",
        "http://user:password@127.0.0.1:18545/",
        "http://127.0.0.2:18545/",
        "http://10.0.0.1:18545/",
        "http://169.254.169.254:18545/",
        "http://192.168.1.5:18545/",
        "http://[::1]:18545/",
        "http://1.1.1.1:18545/",
        "http://rpc.provider.org:18545/",
        "https://127.0.0.1:18545/",
      ]) {
        const parsed = parseEthereumRpcUpstreamsJson(
          JSON.stringify({
            ethereum: [{ name: "rejected", url }],
          }),
        );
        assert.equal(parsed.configurationValid, false, url);
        assert.deepEqual(parsed.upstreams, [], url);
      }

      for (const candidate of [
        {
          ethereum: [
            {
              name: "header-credential",
              url: "http://127.0.0.1:18545/",
              headers: { Authorization: "Bearer local-secret" },
            },
          ],
        },
        {
          base: [
            {
              name: "wrong-network",
              url: "http://127.0.0.1:18545/",
            },
          ],
        },
      ]) {
        assert.equal(
          parseRpcUpstreamsJson(JSON.stringify(candidate))
            .configurationValid,
          false,
        );
      }
    },
  );
});

test("single-host loopback forwarding rejects redirects", async () => {
  await withRuntimeEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK: "true",
    },
    async () => {
      const parsed = parseEthereumRpcUpstreamsJson(
        JSON.stringify({
          ethereum: [
            {
              name: "helios",
              url: "http://127.0.0.1:18545/",
            },
          ],
        }),
      );
      const envelope = parseEthereumJsonRpcText(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "local-redirect",
          method: "eth_blockNumber",
          params: [],
        }),
      );
      let requestInit;
      await assert.rejects(
        forwardEthereumRpc({
          calls: allowedEthereumRpcCalls(envelope),
          batch: false,
          upstreams: parsed.upstreams,
          fetcher: async (url, init) => {
            assert.equal(String(url), "http://127.0.0.1:18545/");
            requestInit = init;
            return Response.redirect(
              "http://169.254.169.254/latest/meta-data",
              302,
            );
          },
        }),
        (error) =>
          error instanceof EthereumRpcUpstreamError &&
          error.failureKind === "redirect",
      );
      assert.equal(requestInit.redirect, "manual");
      assert.equal(requestInit.credentials, "omit");
    },
  );
});

test("RPC parser enforces JSON-RPC IDs, batch bounds, and method policy", () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify([
      {
        jsonrpc: "2.0",
        id: "allowed",
        method: "eth_blockNumber",
        params: [],
      },
      {
        jsonrpc: "2.0",
        id: "blocked",
        method: "debug_traceTransaction",
        params: [],
      },
      {
        jsonrpc: "2.0",
        method: "net_version",
        params: [],
      },
    ]),
  );
  assert.equal(envelope.batch, true);
  assert.deepEqual(
    allowedEthereumRpcCalls(envelope).map((call) => call.method),
    ["eth_blockNumber", "net_version"],
  );
  assert.equal(isSafeEthereumRpcRetry("eth_blockNumber"), true);
  assert.equal(isSafeEthereumRpcRetry("eth_sendRawTransaction"), false);

  const duplicate = parseEthereumJsonRpcText(
    JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" },
    ]),
  );
  assert.equal(duplicate.protocolErrorCount, 1);
  assert.equal(allowedEthereumRpcCalls(duplicate).length, 1);
  const duplicateResponse = renderEthereumRpcResponses({
    envelope: duplicate,
    allowedError: {
      code: -32002,
      message: "Upstream unavailable",
    },
  });
  assert.ok(Array.isArray(duplicateResponse));
  assert.equal(duplicateResponse[0].id, 1);
  assert.equal(duplicateResponse[1].id, null);
  assert.equal(duplicateResponse[1].error.code, -32600);
});

test("RPC parser returns standard parse and invalid request errors", () => {
  for (const [body, expectedCode] of [
    ["", -32700],
    ['{"jsonrpc":"2.0"', -32700],
    ["null", -32600],
    ["[]", -32600],
  ]) {
    const envelope = parseEthereumJsonRpcText(body);
    const rendered = renderEthereumRpcResponses({ envelope });
    assert.equal(envelope.protocolErrorCount, 1);
    assert.equal(envelope.calls.length, 0);
    assert.equal(Array.isArray(rendered), false);
    assert.equal(rendered.id, null);
    assert.equal(rendered.error.code, expectedCode);
  }
});

test("mixed RPC batches execute valid members and keep invalid errors in order", async () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify([
      {
        jsonrpc: "2.0",
        id: "valid",
        method: "eth_chainId",
        params: [],
      },
      {
        jsonrpc: "2.0",
        id: "invalid",
        params: [],
      },
    ]),
  );
  let forwardedBody;
  const forwarded = await forwardEthereumRpc({
    calls: allowedEthereumRpcCalls(envelope),
    batch: envelope.batch,
    upstreams: [upstream("primary")],
    fetcher: async (_url, init) => {
      forwardedBody = JSON.parse(init.body);
      return Response.json([
        {
          jsonrpc: "2.0",
          id: "valid",
          result: "0x1",
        },
      ]);
    },
  });
  assert.equal(forwardedBody.length, 1);
  assert.equal(forwardedBody[0].id, "valid");

  const rendered = renderEthereumRpcResponses({
    envelope,
    upstreamResponses: forwarded.responses,
  });
  assert.ok(Array.isArray(rendered));
  assert.equal(rendered[0].id, "valid");
  assert.equal(rendered[0].result, "0x1");
  assert.equal(rendered[1].id, null);
  assert.equal(rendered[1].error.code, -32600);
});

test("expensive Ethereum methods have bounded parameter policies", () => {
  assert.doesNotThrow(() =>
    parseEthereumJsonRpcText(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getLogs",
        params: [{ fromBlock: "0x1", toBlock: "0x7d0" }],
      }),
    ),
  );
  for (const request of [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [{}],
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "eth_getLogs",
      params: [{ fromBlock: "0x1", toBlock: "0x7d1" }],
    },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "eth_feeHistory",
      params: ["0x401", "latest", []],
    },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "eth_getProof",
      params: [
        `0x${"1".repeat(40)}`,
        Array.from({ length: 65 }, () => `0x${"2".repeat(64)}`),
        "latest",
      ],
    },
    {
      jsonrpc: "2.0",
      id: 5,
      method: "eth_call",
      params: [{ data: `0x${"00".repeat(65 * 1024)}` }, "latest"],
    },
  ]) {
    const envelope = parseEthereumJsonRpcText(JSON.stringify(request));
    assert.equal(allowedEthereumRpcCalls(envelope).length, 0);
    const rendered = renderEthereumRpcResponses({ envelope });
    assert.equal(rendered.id, request.id);
    assert.equal(rendered.error.code, -32602);
    assert.equal(
      rendered.error.data.code,
      "rpc_params_out_of_policy",
    );
  }
});

test("expensive reads consume weighted quota while protected writes stay single-unit", () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getLogs",
        params: [{ fromBlock: "0x1", toBlock: "0x2" }],
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "eth_getProof",
        params: [`0x${"1".repeat(40)}`, [], "latest"],
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "eth_feeHistory",
        params: ["0x1", "latest", []],
      },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "eth_call",
        params: [{ data: "0x" }, "latest"],
      },
      {
        jsonrpc: "2.0",
        id: 5,
        method: "eth_sendRawTransaction",
        params: ["0xdeadbeef"],
      },
    ]),
  );
  const calls = allowedEthereumRpcCalls(envelope);
  assert.equal(ethereumRpcQuotaUnits(calls), 22);
  assert.equal(ethereumRpcMethodQuotaWeight("eth_getLogs"), 10);
  assert.equal(ethereumRpcMethodQuotaWeight("eth_getProof"), 5);
  assert.equal(ethereumRpcMethodQuotaWeight("eth_feeHistory"), 3);
  assert.equal(ethereumRpcMethodQuotaWeight("eth_call"), 3);
  assert.equal(
    ethereumRpcMethodQuotaWeight("eth_sendRawTransaction"),
    1,
  );
  assert.equal(isSafeEthereumRpcRetry("eth_sendRawTransaction"), false);
});

test("RPC rendering keeps caller order and returns explicit blocked errors", () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify([
      { jsonrpc: "2.0", id: 7, method: "eth_chainId" },
      { jsonrpc: "2.0", id: "deny", method: "admin_peers" },
    ]),
  );
  const rendered = renderEthereumRpcResponses({
    envelope,
    upstreamResponses: new Map([
      [
        "number:7",
        { jsonrpc: "2.0", id: 7, result: "0x1" },
      ],
    ]),
  });
  assert.ok(Array.isArray(rendered));
  assert.equal(rendered[0].id, 7);
  assert.equal(rendered[0].result, "0x1");
  assert.equal(rendered[1].id, "deny");
  assert.equal(rendered[1].error.code, -32004);
});

test("read-only RPC calls fail over and do not invent customer authorization", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) {
      return new Response("temporary failure", { status: 503 });
    }
    return Response.json({
      jsonrpc: "2.0",
      id: "request-42",
      result: "0x1234",
    });
  };
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "request-42",
      method: "eth_blockNumber",
      params: [],
    }),
  );
  const result = await forwardEthereumRpc({
    calls: allowedEthereumRpcCalls(envelope),
    batch: false,
    upstreams: [upstream("primary"), upstream("secondary")],
    fetcher,
    now: (() => {
      let value = 100;
      return () => (value += 5);
    })(),
  });

  assert.equal(calls.length, 2);
  assert.equal(
    new Headers(calls[0].init.headers).get("authorization"),
    null,
  );
  assert.equal(result.upstreamFailures, 1);
  assert.equal(result.responses.get("string:request-42").id, "request-42");
  assert.equal(
    result.responses.get("string:request-42").result,
    "0x1234",
  );
});

test("Pulse opens a failing read circuit and retries the primary after cooldown", async () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "pulse-routing",
      method: "eth_blockNumber",
      params: [],
    }),
  );
  const upstreams = [upstream("pulse-primary"), upstream("pulse-secondary")];
  let now = 10_000;
  let primaryFailuresRemaining = 2;
  const attempts = [];
  const fetcher = async (url) => {
    const name = String(url).includes("pulse-primary")
      ? "primary"
      : "secondary";
    attempts.push(name);
    if (name === "primary" && primaryFailuresRemaining > 0) {
      primaryFailuresRemaining -= 1;
      return new Response("temporarily unavailable", { status: 503 });
    }
    return Response.json({
      jsonrpc: "2.0",
      id: "pulse-routing",
      result: "0x1234",
    });
  };
  const request = () =>
    forwardEthereumRpc({
      calls: allowedEthereumRpcCalls(envelope),
      batch: false,
      upstreams,
      fetcher,
      now: () => now,
    });

  await request();
  assert.deepEqual(attempts.splice(0), ["primary", "secondary"]);
  await request();
  assert.deepEqual(attempts.splice(0), ["primary", "secondary"]);

  const openSnapshot = await pulseRpcRoutingSnapshot({
    network: "ethereum",
    upstreams,
    now,
  });
  assert.deepEqual(openSnapshot, [
    {
      slot: 1,
      primary: true,
      state: "open",
      latencyEwmaMs: null,
      consecutiveFailures: 2,
      successfulObservations: 0,
      cooldownRemainingMs: 15_000,
      lastObservedAt: 10_000,
    },
    {
      slot: 2,
      primary: false,
      state: "closed",
      latencyEwmaMs: 0,
      consecutiveFailures: 0,
      successfulObservations: 2,
      cooldownRemainingMs: 0,
      lastObservedAt: 10_000,
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(openSnapshot),
    /https:|authorization|pulse-primary/,
  );

  await request();
  assert.deepEqual(attempts.splice(0), ["secondary"]);

  now += 15_001;
  assert.equal(
    (
      await pulseRpcRoutingSnapshot({
        network: "ethereum",
        upstreams,
        now,
      })
    )[0].state,
    "half_open",
  );
  await request();
  assert.deepEqual(attempts.splice(0), ["primary"]);
  assert.equal(
    (
      await pulseRpcRoutingSnapshot({
        network: "ethereum",
        upstreams,
        now,
      })
    )[0].state,
    "closed",
  );
  await request();
  assert.deepEqual(attempts.splice(0), ["primary"]);
});

test("Pulse explores verified read upstreams and prefers observed lower latency", async () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "pulse-latency",
      method: "eth_blockNumber",
      params: [],
    }),
  );
  const upstreams = [
    upstream("latency-primary"),
    upstream("latency-secondary"),
  ];
  let clock = 30_000;
  const attempts = [];
  const request = () =>
    forwardEthereumRpc({
      calls: allowedEthereumRpcCalls(envelope),
      batch: false,
      upstreams,
      now: () => clock,
      fetcher: async (url) => {
        const name = String(url).includes("latency-primary")
          ? "primary"
          : "secondary";
        attempts.push(name);
        clock += name === "primary" ? 120 : 10;
        return Response.json({
          jsonrpc: "2.0",
          id: "pulse-latency",
          result: "0x1234",
        });
      },
    });

  await request();
  assert.deepEqual(attempts.splice(0), ["primary"]);
  await request();
  assert.deepEqual(attempts.splice(0), ["secondary"]);
  await request();
  assert.deepEqual(attempts.splice(0), ["secondary"]);
});

test("Pulse never reroutes a transaction submission away from configured primary", async () => {
  const readEnvelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "pulse-read",
      method: "eth_blockNumber",
      params: [],
    }),
  );
  const writeEnvelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "pulse-write",
      method: "eth_sendRawTransaction",
      params: ["0xdeadbeef"],
    }),
  );
  const upstreams = [upstream("write-primary"), upstream("write-secondary")];
  let now = 20_000;
  for (let request = 0; request < 2; request += 1) {
    await forwardEthereumRpc({
      calls: allowedEthereumRpcCalls(readEnvelope),
      batch: false,
      upstreams,
      now: () => now,
      fetcher: async (url) =>
        String(url).includes("write-primary")
          ? new Response("unavailable", { status: 503 })
          : Response.json({
              jsonrpc: "2.0",
              id: "pulse-read",
              result: "0x1234",
            }),
    });
    now += 1;
  }

  const writeAttempts = [];
  await assert.rejects(
    () =>
      forwardEthereumRpc({
        calls: allowedEthereumRpcCalls(writeEnvelope),
        batch: false,
        upstreams,
        now: () => now,
        fetcher: async (url) => {
          writeAttempts.push(String(url));
          return new Response("unavailable", { status: 503 });
        },
      }),
    EthereumRpcUpstreamError,
  );
  assert.equal(writeAttempts.length, 1);
  assert.match(writeAttempts[0], /write-primary/);
});

test("transaction submission is attempted once and operator headers stay explicit", async () => {
  const calls = [];
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 9,
      method: "eth_sendRawTransaction",
      params: ["0xdeadbeef"],
    }),
  );
  await assert.rejects(
    () =>
      forwardEthereumRpc({
        calls: allowedEthereumRpcCalls(envelope),
        batch: false,
        upstreams: [
          upstream("primary", {
            headers: {
              Authorization: "Bearer operator-provider-token",
            },
          }),
          upstream("secondary"),
        ],
        fetcher: async (url, init) => {
          calls.push({ url, init });
          return new Response("unavailable", { status: 503 });
        },
      }),
    (error) =>
      error instanceof EthereumRpcUpstreamError &&
      error.upstreamFailures === 1,
  );
  assert.equal(calls.length, 1);
  assert.equal(
    new Headers(calls[0].init.headers).get("authorization"),
    "Bearer operator-provider-token",
  );
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(new Headers(calls[0].init.headers).get("host"), null);
  assert.equal(
    new Headers(calls[0].init.headers).get("content-type"),
    "application/json",
  );
});

test("read failover is capped at two provider attempts", async () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 10,
      method: "eth_blockNumber",
    }),
  );
  let attempts = 0;
  await assert.rejects(
    () =>
      forwardEthereumRpc({
        calls: allowedEthereumRpcCalls(envelope),
        batch: false,
        upstreams: [
          upstream("one"),
          upstream("two"),
          upstream("three"),
          upstream("four"),
        ],
        fetcher: async () => {
          attempts += 1;
          return new Response("unavailable", { status: 503 });
        },
      }),
    EthereumRpcUpstreamError,
  );
  assert.equal(attempts, 2);
});

test("only reachable Ethereum mainnet upstreams pass activation", async () => {
  const seenAuthorization = [];
  const verified = await verifiedEthereumMainnetUpstreams({
    upstreams: [
      upstream("mainnet", {
        headers: { Authorization: "Bearer operator-token" },
      }),
      upstream("base"),
      upstream("unavailable"),
    ],
    fetcher: async (url, init) => {
      seenAuthorization.push(
        new Headers(init.headers).get("authorization"),
      );
      if (String(url).includes("unavailable")) {
        return new Response("unavailable", { status: 503 });
      }
      return Response.json({
        jsonrpc: "2.0",
        id: "nodezuno-mainnet-probe",
        result: String(url).includes("mainnet") ? "0x1" : "0x2105",
      });
    },
  });
  assert.deepEqual(
    verified.map((candidate) => candidate.name),
    ["mainnet"],
  );
  assert.equal(
    seenAuthorization.filter(
      (value) => value === "Bearer operator-token",
    ).length,
    1,
  );
  assert.equal(
    seenAuthorization.filter((value) => value === null).length,
    3,
  );
});

test("RPC upstream responses must match the original request IDs", async () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "original",
      method: "eth_chainId",
    }),
  );
  await assert.rejects(
    () =>
      forwardEthereumRpc({
        calls: allowedEthereumRpcCalls(envelope),
        batch: false,
        upstreams: [upstream("primary")],
        fetcher: async () =>
          Response.json({
            jsonrpc: "2.0",
            id: "substituted",
            result: "0x1",
          }),
      }),
    EthereumRpcUpstreamError,
  );
});

test("RPC forwarding blocks redirects without forwarding provider secrets", async () => {
  const endpoint =
    "https://rpc.provider.example.com/v1/operator-secret?apiKey=query-secret";
  const authorization = "Bearer header-secret";
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "redirect",
      method: "eth_blockNumber",
    }),
  );
  let requestInit;
  let capturedError;
  try {
    await forwardEthereumRpc({
      calls: allowedEthereumRpcCalls(envelope),
      batch: false,
      upstreams: [
        upstream("redirect", {
          url: endpoint,
          headers: { Authorization: authorization },
        }),
      ],
      fetcher: async (_url, init) => {
        requestInit = init;
        return Response.redirect(
          "https://169.254.169.254/latest/meta-data",
          302,
        );
      },
    });
  } catch (error) {
    capturedError = error;
  }

  assert.ok(capturedError instanceof EthereumRpcUpstreamError);
  assert.equal(capturedError.failureKind, "redirect");
  assert.equal(capturedError.status, 502);
  assert.equal(requestInit.redirect, "manual");
  assert.equal(
    new Headers(requestInit.headers).get("authorization"),
    authorization,
  );
  for (const serialized of [
    String(capturedError),
    capturedError.message,
    JSON.stringify(capturedError),
  ]) {
    assert.equal(serialized.includes("operator-secret"), false);
    assert.equal(serialized.includes("query-secret"), false);
    assert.equal(serialized.includes("header-secret"), false);
    assert.equal(serialized.includes("169.254.169.254"), false);
  }
});

test("RPC forwarding classifies hostile upstream responses safely", async () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "response-check",
      method: "eth_blockNumber",
    }),
  );
  const validPayload = JSON.stringify({
    jsonrpc: "2.0",
    id: "response-check",
    result: "0x1",
  });
  const cases = [
    {
      expected: "content_type",
      response: () =>
        new Response(validPayload, {
          headers: { "Content-Type": "text/html" },
        }),
    },
    {
      expected: "content_type",
      response: () => new Response(validPayload),
    },
    {
      expected: "invalid_response",
      response: () =>
        new Response("{not-json", {
          headers: { "Content-Type": "application/json" },
        }),
    },
    {
      expected: "invalid_response",
      response: () =>
        new Response(Uint8Array.of(0xff), {
          headers: { "Content-Type": "application/json" },
        }),
    },
    {
      expected: "response_too_large",
      response: () =>
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(
              ETHEREUM_RPC_MAX_RESPONSE_BYTES + 1,
            ),
          },
        }),
    },
    {
      expected: "response_too_large",
      response: () =>
        new Response(
          new Uint8Array(ETHEREUM_RPC_MAX_RESPONSE_BYTES + 1),
          {
            headers: { "Content-Type": "application/json" },
          },
        ),
    },
  ];

  for (const scenario of cases) {
    await assert.rejects(
      () =>
        forwardEthereumRpc({
          calls: allowedEthereumRpcCalls(envelope),
          batch: false,
          upstreams: [upstream(`hostile-${scenario.expected}`)],
          fetcher: async () => scenario.response(),
        }),
      (error) =>
        error instanceof EthereumRpcUpstreamError &&
        error.failureKind === scenario.expected &&
        error.code === "rpc_upstream_failed",
      scenario.expected,
    );
  }

  const accepted = await forwardEthereumRpc({
    calls: allowedEthereumRpcCalls(envelope),
    batch: false,
    upstreams: [upstream("structured-json")],
    fetcher: async () =>
      new Response(validPayload, {
        headers: {
          "Content-Type": "application/problem+json; charset=utf-8",
        },
      }),
  });
  assert.equal(
    accepted.responses.get("string:response-check").result,
    "0x1",
  );
});

test("RPC forwarding classifies timeouts and clears completed timers", async () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "timeout-check",
      method: "eth_blockNumber",
    }),
  );
  await assert.rejects(
    () =>
      forwardEthereumRpc({
        calls: allowedEthereumRpcCalls(envelope),
        batch: false,
        upstreams: [
          upstream("timeout", {
            timeoutMs: 15,
          }),
        ],
        fetcher: async (_url, init) =>
          await new Promise((_resolve, reject) => {
            init.signal.addEventListener(
              "abort",
              () =>
                reject(
                  new DOMException(
                    "The request was aborted.",
                    "AbortError",
                  ),
                ),
              { once: true },
            );
          }),
      }),
    (error) =>
      error instanceof EthereumRpcUpstreamError &&
      error.status === 504 &&
      error.failureKind === "timeout" &&
      error.code === "rpc_upstream_timeout",
  );

  await assert.rejects(
    () =>
      forwardEthereumRpc({
        calls: allowedEthereumRpcCalls(envelope),
        batch: false,
        upstreams: [
          upstream("ignores-abort", {
            timeoutMs: 15,
          }),
        ],
        fetcher: async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return Response.json({
            jsonrpc: "2.0",
            id: "timeout-check",
            result: "0x1",
          });
        },
      }),
    (error) =>
      error instanceof EthereumRpcUpstreamError &&
      error.status === 504 &&
      error.failureKind === "timeout",
  );

  let completedSignal;
  await forwardEthereumRpc({
    calls: allowedEthereumRpcCalls(envelope),
    batch: false,
    upstreams: [
      upstream("completed", {
        timeoutMs: 15,
      }),
    ],
    fetcher: async (_url, init) => {
      completedSignal = init.signal;
      return Response.json({
        jsonrpc: "2.0",
        id: "timeout-check",
        result: "0x1",
      });
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(completedSignal.aborted, false);
});

test("RPC forwarding discards transport errors that contain provider secrets", async () => {
  const endpoint =
    "https://rpc.provider.example.com/operator-path-secret?token=query-secret";
  const authorization = "Bearer header-secret";
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "network-check",
      method: "eth_blockNumber",
    }),
  );
  let capturedError;
  try {
    await forwardEthereumRpc({
      calls: allowedEthereumRpcCalls(envelope),
      batch: false,
      upstreams: [
        upstream("network", {
          url: endpoint,
          headers: { Authorization: authorization },
        }),
      ],
      fetcher: async () => {
        throw new Error(
          `connect failed for ${endpoint} with ${authorization}`,
        );
      },
    });
  } catch (error) {
    capturedError = error;
  }
  assert.ok(capturedError instanceof EthereumRpcUpstreamError);
  assert.equal(capturedError.failureKind, "network");
  for (const secret of [
    "operator-path-secret",
    "query-secret",
    "header-secret",
  ]) {
    assert.equal(String(capturedError).includes(secret), false);
    assert.equal(JSON.stringify(capturedError).includes(secret), false);
  }
});

test("RPC forwarding redacts provider credentials reflected in JSON-RPC errors", async () => {
  const endpoint =
    "https://rpc.provider.example.com/v1/operator-path-secret?apiKey=query-secret-value";
  const authorization = "Bearer header-secret-value";
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "reflected-secret",
      method: "eth_blockNumber",
    }),
  );
  const forwarded = await forwardEthereumRpc({
    calls: allowedEthereumRpcCalls(envelope),
    batch: false,
    upstreams: [
      upstream("reflected-secret", {
        url: endpoint,
        headers: { Authorization: authorization },
      }),
    ],
    fetcher: async () =>
      Response.json({
        jsonrpc: "2.0",
        id: "reflected-secret",
        error: {
          code: -32000,
          message:
            `Provider HTTPS://RPC.PROVIDER.EXAMPLE.COM rejected ` +
            "query-secret-value and header-secret-value.",
          data: {
            endpoint,
            nested: ["operator-path-secret", authorization],
          },
        },
      }),
  });
  const response = forwarded.responses.get(
    "string:reflected-secret",
  );
  const serialized = JSON.stringify(response);
  assert.equal(forwarded.errorCalls, 1);
  assert.match(serialized, /\[redacted\]/);
  for (const secret of [
    "rpc.provider.example.com",
    "operator-path-secret",
    "query-secret-value",
    "header-secret-value",
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test("RPC notifications accept an empty 204 upstream response", async () => {
  const envelope = parseEthereumJsonRpcText(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_blockNumber",
    }),
  );
  const forwarded = await forwardEthereumRpc({
    calls: allowedEthereumRpcCalls(envelope),
    batch: false,
    upstreams: [upstream("notification")],
    fetcher: async () => new Response(null, { status: 204 }),
  });
  assert.equal(forwarded.responses.size, 0);
  assert.equal(forwarded.responseBytes, 0);
});

test("mainnet probes retry transient HTTP failures but reject untrusted payload types", async () => {
  let attempts = 0;
  let probeInit;
  const recovered = await verifiedEthereumMainnetUpstreams({
    upstreams: [upstream("probe-retry")],
    fetcher: async (_url, init) => {
      attempts += 1;
      probeInit = init;
      if (attempts === 1) {
        return new Response("temporarily unavailable", {
          status: 503,
        });
      }
      return Response.json({
        jsonrpc: "2.0",
        id: "nodezuno-mainnet-probe",
        result: "0x1",
      });
    },
  });
  assert.deepEqual(
    recovered.map((candidate) => candidate.name),
    ["probe-retry"],
  );
  assert.equal(attempts, 2);
  assert.equal(probeInit.redirect, "manual");
  assert.equal(probeInit.credentials, "omit");
  assert.equal(probeInit.cache, "no-store");

  for (const response of [
    () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "nodezuno-mainnet-probe",
          result: "0x1",
        }),
        { headers: { "Content-Type": "text/html" } },
      ),
    () =>
      Response.redirect(
        "https://169.254.169.254/latest/meta-data",
        302,
      ),
  ]) {
    let rejectedAttempts = 0;
    const rejected = await verifiedEthereumMainnetUpstreams({
      upstreams: [upstream("probe-rejected")],
      fetcher: async () => {
        rejectedAttempts += 1;
        return response();
      },
    });
    assert.deepEqual(rejected, []);
    assert.equal(rejectedAttempts, 1);
  }
});

test("mainnet verification cache changes when provider credentials change", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async (_url, init) => {
    attempts += 1;
    const authorization = new Headers(init.headers).get("authorization");
    return Response.json({
      jsonrpc: "2.0",
      id: "nodezuno-mainnet-probe",
      result: authorization === "Bearer version-one" ? "0x1" : "0x2105",
    });
  };
  try {
    const now = () => 2_000_000_000_000;
    const first = await verifiedEthereumMainnetUpstreams({
      upstreams: [
        upstream("cache-configuration", {
          headers: { Authorization: "Bearer version-one" },
        }),
      ],
      now,
    });
    const changed = await verifiedEthereumMainnetUpstreams({
      upstreams: [
        upstream("cache-configuration", {
          headers: { Authorization: "Bearer version-two" },
        }),
      ],
      now,
    });
    assert.equal(first.length, 1);
    assert.equal(changed.length, 0);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RPC admission consumes workspace, service, and key quotas in one database batch", async () => {
  const batches = [];
  const database = quotaDatabase(async (statements) => {
    batches.push(statements);
    return [
      {
        success: true,
        results: [{ quotaUnits: 7 }],
        meta: { changes: 1 },
      },
      {
        success: true,
        results: [{ quotaUnits: 4 }],
        meta: { changes: 1 },
      },
      {
        success: true,
        results: [{ quotaUnits: 3 }],
        meta: { changes: 1 },
      },
    ];
  });
  const originalRandom = Math.random;
  Math.random = () => 1;
  try {
    const result = await consumeEthereumRpcQuota({
      workspaceId: "workspace-1",
      serviceId: "service-1",
      apiKeyId: "key-1",
      callCount: 3,
      quotaUnits: 5,
      limit: 10,
      workspaceLimit: 100,
      now: 1_800_000_000_000,
      database,
    });
    assert.equal(result.remaining, 7);
    assert.equal(result.workspaceRemaining, 93);
    assert.equal(result.serviceRemaining, 96);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 3);
  assert.match(
    batches[0][0].sql,
    /ethereum_rpc_workspace_quota_buckets/,
  );
  assert.match(batches[0][0].sql, /excluded\.quota_limit \+ 1/);
  assert.match(
    batches[0][1].sql,
    /ethereum_rpc_service_quota_buckets/,
  );
  assert.match(batches[0][1].sql, /excluded\.quota_limit \+ 1/);
  assert.match(batches[0][2].sql, /ethereum_rpc_usage_buckets/);
  assert.match(batches[0][2].sql, /quota_limit/);
  assert.equal(batches[0][0].bindings[3], 5);
  assert.equal(batches[0][1].bindings[4], 5);
  assert.equal(batches[0][2].bindings[5], 5);
  assert.equal(batches[0][2].bindings[7], 3);
});

test("RPC quota constraint failures become stable 429 responses", async () => {
  const database = quotaDatabase(async () => {
    throw new Error(
      "D1_ERROR: CHECK constraint failed: ethereum_rpc_workspace_quota_limit_check",
    );
  });
  await assert.rejects(
    () =>
      consumeEthereumRpcQuota({
        workspaceId: "workspace-1",
        serviceId: "service-1",
        apiKeyId: "key-1",
        callCount: 2,
        quotaUnits: 2,
        limit: 10,
        workspaceLimit: 10,
        now: 1_800_000_000_000,
        database,
      }),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 429 &&
      error.code === "rpc_quota_exceeded",
  );
});

test("workspace quota survives API key and service rotation atomically", async () => {
  const sqlite = await createRpcQuotaSqliteDatabase();
  const database = sqliteD1Database(sqlite);
  const originalRandom = Math.random;
  Math.random = () => 1;
  try {
    const first = await consumeEthereumRpcQuota({
      workspaceId: "workspace-1",
      serviceId: "service-1",
      apiKeyId: "key-1",
      callCount: 6,
      quotaUnits: 6,
      limit: 10,
      workspaceLimit: 10,
      now: 1_800_000_000_000,
      database,
    });
    assert.equal(first.workspaceRemaining, 4);

    await assert.rejects(
      () =>
        consumeEthereumRpcQuota({
          workspaceId: "workspace-1",
          serviceId: "service-2",
          apiKeyId: "key-2",
          callCount: 5,
          quotaUnits: 5,
          limit: 10,
          workspaceLimit: 10,
          now: 1_800_000_000_000,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 429 &&
        error.headers?.["X-Nodezuno-Quota-Scope"] === "workspace",
    );

    assert.equal(
      sqlite
        .prepare(
          `SELECT quota_units AS quotaUnits
           FROM ethereum_rpc_workspace_quota_buckets`,
        )
        .get().quotaUnits,
      6,
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM ethereum_rpc_usage_buckets",
        )
        .get().count,
      1,
    );
  } finally {
    Math.random = originalRandom;
    sqlite.close();
  }
});

test("service quota spans API keys and rolls back every tier on rejection", async () => {
  const sqlite = await createRpcQuotaSqliteDatabase();
  const database = sqliteD1Database(sqlite);
  const originalRandom = Math.random;
  Math.random = () => 1;
  try {
    const first = await consumeEthereumRpcQuota({
      workspaceId: "workspace-1",
      serviceId: "service-1",
      apiKeyId: "key-1",
      callCount: 60,
      quotaUnits: 60,
      limit: 100,
      workspaceLimit: 200,
      serviceLimit: 100,
      now: 1_800_000_000_000,
      database,
    });
    assert.equal(first.workspaceRemaining, 140);
    assert.equal(first.serviceRemaining, 40);
    assert.equal(first.remaining, 40);

    await assert.rejects(
      () =>
        consumeEthereumRpcQuota({
          workspaceId: "workspace-1",
          serviceId: "service-1",
          apiKeyId: "key-2",
          callCount: 41,
          quotaUnits: 41,
          limit: 100,
          workspaceLimit: 200,
          serviceLimit: 100,
          now: 1_800_000_000_000,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 429 &&
        error.headers?.["X-Nodezuno-Quota-Scope"] === "service" &&
        error.headers?.[
          "X-Nodezuno-Service-RateLimit-Limit"
        ] === "100",
    );

    assert.equal(
      sqlite
        .prepare(
          `SELECT quota_units AS quotaUnits
           FROM ethereum_rpc_workspace_quota_buckets`,
        )
        .get().quotaUnits,
      60,
    );
    assert.deepEqual(
      {
        ...sqlite
          .prepare(
            `SELECT quota_units AS quotaUnits,
                    quota_limit AS quotaLimit
             FROM ethereum_rpc_service_quota_buckets`,
          )
          .get(),
      },
      { quotaUnits: 60, quotaLimit: 100 },
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM ethereum_rpc_usage_buckets",
        )
        .get().count,
      1,
    );
  } finally {
    Math.random = originalRandom;
    sqlite.close();
  }
});

test("lowering a service guardrail below current usage fails closed without mutation", async () => {
  const sqlite = await createRpcQuotaSqliteDatabase();
  const database = sqliteD1Database(sqlite);
  const originalRandom = Math.random;
  Math.random = () => 1;
  try {
    await consumeEthereumRpcQuota({
      workspaceId: "workspace-1",
      serviceId: "service-1",
      apiKeyId: "key-1",
      callCount: 60,
      quotaUnits: 60,
      limit: 100,
      workspaceLimit: 200,
      serviceLimit: 100,
      now: 1_800_000_000_000,
      database,
    });

    await assert.rejects(
      () =>
        consumeEthereumRpcQuota({
          workspaceId: "workspace-1",
          serviceId: "service-1",
          apiKeyId: "key-1",
          callCount: 1,
          quotaUnits: 1,
          limit: 100,
          workspaceLimit: 200,
          serviceLimit: 50,
          now: 1_800_000_000_000,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 429 &&
        error.headers?.["X-Nodezuno-Quota-Scope"] === "service",
    );

    assert.deepEqual(
      {
        ...sqlite
          .prepare(
            `SELECT quota_units AS quotaUnits,
                    quota_limit AS quotaLimit
             FROM ethereum_rpc_service_quota_buckets`,
          )
          .get(),
      },
      { quotaUnits: 60, quotaLimit: 100 },
    );
    assert.equal(
      sqlite
        .prepare(
          `SELECT quota_units AS quotaUnits
           FROM ethereum_rpc_workspace_quota_buckets`,
        )
        .get().quotaUnits,
      60,
    );
    assert.equal(
      sqlite
        .prepare(
          `SELECT quota_units AS quotaUnits
           FROM ethereum_rpc_usage_buckets`,
        )
        .get().quotaUnits,
      60,
    );
  } finally {
    Math.random = originalRandom;
    sqlite.close();
  }
});

test("API key quota rejection rolls back workspace and service admissions", async () => {
  const sqlite = await createRpcQuotaSqliteDatabase();
  const database = sqliteD1Database(sqlite);
  const originalRandom = Math.random;
  Math.random = () => 1;
  try {
    await consumeEthereumRpcQuota({
      workspaceId: "workspace-1",
      serviceId: "service-1",
      apiKeyId: "key-1",
      callCount: 3,
      quotaUnits: 3,
      limit: 5,
      workspaceLimit: 200,
      serviceLimit: 100,
      now: 1_800_000_000_000,
      database,
    });
    await assert.rejects(
      () =>
        consumeEthereumRpcQuota({
          workspaceId: "workspace-1",
          serviceId: "service-1",
          apiKeyId: "key-1",
          callCount: 3,
          quotaUnits: 3,
          limit: 5,
          workspaceLimit: 200,
          serviceLimit: 100,
          now: 1_800_000_000_000,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 429 &&
        error.headers?.["X-Nodezuno-Quota-Scope"] === "key",
    );
    for (const table of [
      "ethereum_rpc_workspace_quota_buckets",
      "ethereum_rpc_service_quota_buckets",
      "ethereum_rpc_usage_buckets",
    ]) {
      assert.equal(
        sqlite
          .prepare(
            `SELECT quota_units AS quotaUnits FROM ${table}`,
          )
          .get().quotaUnits,
        3,
        table,
      );
    }
  } finally {
    Math.random = originalRandom;
    sqlite.close();
  }
});

test("quota buckets store weighted units separately from actual RPC call counts", async () => {
  const sqlite = await createRpcQuotaSqliteDatabase();
  const database = sqliteD1Database(sqlite);
  const originalRandom = Math.random;
  Math.random = () => 1;
  try {
    const admitted = await consumeEthereumRpcQuota({
      workspaceId: "workspace-1",
      serviceId: "service-1",
      apiKeyId: "key-1",
      callCount: 2,
      quotaUnits: 11,
      limit: 20,
      workspaceLimit: 20,
      now: 1_800_000_000_000,
      database,
    });
    assert.equal(admitted.remaining, 9);
    assert.equal(admitted.workspaceRemaining, 9);
    const stored = sqlite
      .prepare(
        `SELECT quota_units AS quotaUnits,
                rpc_call_count AS rpcCallCount
         FROM ethereum_rpc_usage_buckets`,
      )
      .get();
    assert.equal(stored.quotaUnits, 11);
    assert.equal(stored.rpcCallCount, 2);

    await assert.rejects(
      () =>
        consumeEthereumRpcQuota({
          workspaceId: "workspace-1",
          serviceId: "service-1",
          apiKeyId: "key-1",
          callCount: 1,
          quotaUnits: 10,
          limit: 20,
          workspaceLimit: 20,
          now: 1_800_000_000_000,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 429 &&
        error.code === "rpc_quota_exceeded",
    );
  } finally {
    Math.random = originalRandom;
    sqlite.close();
  }
});

test("generic D1 batch errors still become 429 when persisted quota proves exhaustion", async () => {
  const database = {
    prepare(sql) {
      return {
        sql,
        bindings: [],
        bind(...values) {
          this.bindings = values;
          return this;
        },
        async first() {
          return sql.includes("workspace_quota")
            ? { quotaUnits: 9 }
            : null;
        },
      };
    },
    async batch() {
      throw new Error("The durable database rejected the request (7500).");
    },
  };
  await assert.rejects(
    () =>
      consumeEthereumRpcQuota({
        workspaceId: "workspace-1",
        serviceId: "service-2",
        apiKeyId: "key-2",
        callCount: 2,
        quotaUnits: 2,
        limit: 10,
        workspaceLimit: 10,
        now: 1_800_000_000_000,
        database,
      }),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 429 &&
      error.headers?.["X-Nodezuno-Quota-Scope"] === "workspace",
  );
});

test("RPC migrations create all quota tables with enforced indexes and foreign keys", async () => {
  const sqlite = await createRpcQuotaSqliteDatabase();
  try {
    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'ethereum_rpc_%'
         ORDER BY name`,
      )
      .all()
      .map((row) => row.name);
    assert.deepEqual(tables, [
      "ethereum_rpc_service_quota_buckets",
      "ethereum_rpc_usage_buckets",
      "ethereum_rpc_workspace_quota_buckets",
    ]);
    const indexes = new Set(
      sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'index' AND name LIKE 'ethereum_rpc_%'`,
        )
        .all()
        .map((row) => row.name),
    );
    for (const name of [
      "ethereum_rpc_usage_service_key_bucket_unique",
      "ethereum_rpc_usage_workspace_service_bucket_idx",
      "ethereum_rpc_usage_expiry_idx",
      "ethereum_rpc_workspace_quota_workspace_bucket_unique",
      "ethereum_rpc_workspace_quota_expiry_idx",
      "ethereum_rpc_service_quota_service_bucket_unique",
      "ethereum_rpc_service_quota_workspace_service_bucket_idx",
      "ethereum_rpc_service_quota_expiry_idx",
    ]) {
      assert.equal(indexes.has(name), true, `${name} should exist`);
    }
    assert.deepEqual(
      sqlite.prepare("PRAGMA foreign_key_check").all(),
      [],
    );
  } finally {
    sqlite.close();
  }
});

test("public RPC admission is enforced before body parsing and key lookup", async () => {
  const source = await readFile(
    new URL(
      "../app/api/v1/rpc/[serviceId]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const admission = source.indexOf(
    'scope: "ethereum-rpc-auth:ip"',
  );
  const bodyRead = source.indexOf("await readTextBody");
  const keyHash = source.indexOf("await developerApiKeyHash");
  const serviceBindingCheck = source.indexOf(
    "if (!developerApiKeyAllowsService",
  );
  const serviceLookup = source.indexOf(
    "const service = await findRpcServiceForApiKey",
  );
  assert.ok(admission > 0);
  assert.ok(admission < bodyRead);
  assert.ok(admission < keyHash);
  assert.ok(serviceBindingCheck > keyHash);
  assert.ok(serviceBindingCheck < serviceLookup);
  assert.match(
    source.slice(serviceBindingCheck, serviceLookup),
    /api_key_service_denied/,
  );
  assert.match(
    source.slice(admission, bodyRead),
    /limit:\s*120[\s\S]*windowMs:\s*60\s*\*\s*1000/,
  );
});

function quotaDatabase(batch) {
  return {
    prepare(sql) {
      return {
        sql,
        bindings: [],
        bind(...values) {
          this.bindings = values;
          return this;
        },
      };
    },
    batch,
  };
}

async function createRpcQuotaSqliteDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE developer_workspaces (
      id TEXT PRIMARY KEY NOT NULL
    );
    CREATE TABLE developer_services (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL
    );
    CREATE TABLE developer_api_keys (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL
    );
  `);
  const migration = await readFile(
    new URL("../drizzle/0005_huge_doorman.sql", import.meta.url),
    "utf8",
  );
  sqlite.exec(migration.replaceAll("--> statement-breakpoint", ""));
  const guardrailMigration = await readFile(
    new URL("../drizzle/0013_smiling_legion.sql", import.meta.url),
    "utf8",
  );
  sqlite.exec(
    guardrailMigration.replaceAll("--> statement-breakpoint", ""),
  );
  sqlite.exec(`
    INSERT INTO developer_workspaces (id) VALUES ('workspace-1');
    INSERT INTO developer_services (id, workspace_id)
      VALUES ('service-1', 'workspace-1'),
             ('service-2', 'workspace-1');
    INSERT INTO developer_api_keys (id, workspace_id)
      VALUES ('key-1', 'workspace-1'),
             ('key-2', 'workspace-1');
  `);
  return sqlite;
}

function sqliteD1Database(sqlite) {
  return {
    prepare(sql) {
      return sqliteD1Statement(sqlite, sql);
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => {
          const prepared = sqlite.prepare(statement.sql);
          if (/\bRETURNING\b/i.test(statement.sql)) {
            const rows = prepared.all(...statement.bindings);
            return {
              success: true,
              results: rows,
              meta: { changes: rows.length },
            };
          }
          const result = prepared.run(...statement.bindings);
          return {
            success: true,
            results: [],
            meta: { changes: Number(result.changes) },
          };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function sqliteD1Statement(sqlite, sql) {
  return {
    sql,
    bindings: [],
    bind(...values) {
      this.bindings = values;
      return this;
    },
    async first() {
      return sqlite.prepare(sql).get(...this.bindings) ?? null;
    },
    async run() {
      const result = sqlite.prepare(sql).run(...this.bindings);
      return {
        success: true,
        results: [],
        meta: { changes: Number(result.changes) },
      };
    },
  };
}
