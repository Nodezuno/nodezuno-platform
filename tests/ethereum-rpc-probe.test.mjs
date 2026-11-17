import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ethereumRpcApiKeyAllowsService,
  ethereumRpcProbeHttpMessage,
  readEthereumRpcQuota,
  verifyEthereumMainnetChainId,
} from "../lib/client/ethereum-rpc-probe.ts";

test("RPC keys allow only their bound service or the whole workspace", () => {
  assert.equal(
    ethereumRpcApiKeyAllowsService({ serviceId: null }, "service-a"),
    true,
  );
  assert.equal(
    ethereumRpcApiKeyAllowsService(
      { serviceId: "service-a" },
      "service-a",
    ),
    true,
  );
  assert.equal(
    ethereumRpcApiKeyAllowsService(
      { serviceId: "service-b" },
      "service-a",
    ),
    false,
  );
});

test("RPC probe maps actionable gateway failures without response bodies", () => {
  assert.equal(
    ethereumRpcProbeHttpMessage(401, null),
    "The one-time key was rejected. Create a new key and try again.",
  );
  assert.equal(
    ethereumRpcProbeHttpMessage(429, "1"),
    "The RPC limit was reached. Retry in 1 second.",
  );
  assert.equal(
    ethereumRpcProbeHttpMessage(429, "12"),
    "The RPC limit was reached. Retry in 12 seconds.",
  );
  assert.equal(
    ethereumRpcProbeHttpMessage(
      429,
      "Thu, 01 Jan 2026 00:00:05 GMT",
      Date.parse("Thu, 01 Jan 2026 00:00:00 GMT"),
    ),
    "The RPC limit was reached. Retry in 5 seconds.",
  );
  assert.equal(
    ethereumRpcProbeHttpMessage(502, null),
    "The gateway could not complete the upstream request. Retry shortly.",
  );
  assert.equal(
    ethereumRpcProbeHttpMessage(504, null),
    "The Ethereum upstream timed out. Retry shortly.",
  );
});

test("RPC probe verifies only a valid Ethereum mainnet chain response", () => {
  assert.deepEqual(
    verifyEthereumMainnetChainId({
      jsonrpc: "2.0",
      id: 1,
      result: "0x1",
    }),
    {
      ok: true,
      chainId: "1",
      chainLabel: "Ethereum mainnet",
    },
  );
  assert.equal(
    verifyEthereumMainnetChainId({
      jsonrpc: "2.0",
      id: 1,
      result: "0x2",
    }).ok,
    false,
  );
  assert.equal(
    verifyEthereumMainnetChainId({
      jsonrpc: "2.0",
      id: 2,
      result: "0x1",
    }).ok,
    false,
  );
  assert.equal(
    verifyEthereumMainnetChainId({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32_000 },
    }).ok,
    false,
  );
  assert.equal(verifyEthereumMainnetChainId("0x1").ok, false);
});

test("RPC probe reads only validated quota response headers", () => {
  assert.deepEqual(
    readEthereumRpcQuota(
      new Headers({
        "X-RateLimit-Limit": "1000",
        "X-RateLimit-Remaining": "998",
        "X-RateLimit-Reset": "1767225600",
        "X-Nodezuno-Workspace-RateLimit-Limit": "10000",
        "X-Nodezuno-Workspace-RateLimit-Remaining": "9998",
        "X-Nodezuno-Service-RateLimit-Limit": "5000",
        "X-Nodezuno-Service-RateLimit-Remaining": "4998",
        "X-Nodezuno-Service-Quota-Warning-Threshold": "80",
        "X-Nodezuno-Service-Quota-Warning": "false",
      }),
    ),
    {
      limit: 1000,
      remaining: 998,
      resetAt: "2026-01-01T00:00:00.000Z",
      serviceLimit: 5000,
      serviceRemaining: 4998,
      serviceWarning: false,
      serviceWarningThresholdPercent: 80,
      workspaceLimit: 10000,
      workspaceRemaining: 9998,
    },
  );
  assert.equal(
    readEthereumRpcQuota(
      new Headers({
        "X-RateLimit-Limit": "not-a-number",
        "X-RateLimit-Remaining": "1",
      }),
    ),
    null,
  );
  assert.equal(
    readEthereumRpcQuota(
      new Headers({
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "-1",
      }),
    ),
    null,
  );
});

test("RPC probe implementation has no persistence, logging, or forbidden dash", async () => {
  const [helper, consoleSource] = await Promise.all([
    readFile(
      new URL("../lib/client/ethereum-rpc-probe.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/developer-console.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(helper, /console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(helper, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(helper, /\u2014/);
  assert.doesNotMatch(consoleSource, /localStorage|sessionStorage/);
  assert.doesNotMatch(consoleSource, /\u2014/);
});
