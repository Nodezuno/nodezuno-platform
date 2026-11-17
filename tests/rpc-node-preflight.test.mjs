import assert from "node:assert/strict";
import test from "node:test";
import {
  preflightRpcNodeAttachments,
} from "../lib/server/rpc-node-preflight.ts";
import {
  requestedNetworksFromArguments,
} from "../scripts/preflight-node-attachments.mjs";

const upstreamConfiguration = JSON.stringify({
  ethereum: [
    {
      name: "ethereum-primary",
      url: "https://ethereum.nodes.example.org/secret",
      headers: { Authorization: "Bearer ethereum-secret" },
    },
  ],
  base: [
    {
      name: "base-primary",
      url: "https://base.nodes.example.org/secret",
    },
  ],
  solana: [
    {
      name: "solana-primary",
      url: "https://solana.nodes.example.org/secret",
    },
  ],
});

test("preflight reports only redacted network readiness counts", async () => {
  const calls = [];
  const result = await preflightRpcNodeAttachments({
    rawConfiguration: upstreamConfiguration,
    verifier: async ({ network, upstreams }) => {
      calls.push(network);
      return network === "solana" ? [] : upstreams;
    },
  });

  assert.deepEqual(calls.sort(), ["base", "ethereum", "solana"]);
  assert.equal(result.configurationValid, true);
  assert.equal(result.ready, false);
  assert.deepEqual(result.networks, [
    {
      network: "ethereum",
      configuredUpstreams: 1,
      verifiedUpstreams: 1,
      ready: true,
    },
    {
      network: "base",
      configuredUpstreams: 1,
      verifiedUpstreams: 1,
      ready: true,
    },
    {
      network: "solana",
      configuredUpstreams: 1,
      verifiedUpstreams: 0,
      ready: false,
    },
  ]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /nodes\.example\.org/);
  assert.doesNotMatch(serialized, /secret/i);
});

test("preflight fails closed for invalid or incomplete configuration", async () => {
  const invalid = await preflightRpcNodeAttachments({
    rawConfiguration: "{",
    verifier: async () => {
      throw new Error("Verifier must not run for invalid configuration.");
    },
  });
  assert.equal(invalid.configurationValid, false);
  assert.equal(invalid.ready, false);

  const missing = await preflightRpcNodeAttachments({
    rawConfiguration: JSON.stringify({
      ethereum: JSON.parse(upstreamConfiguration).ethereum,
    }),
    verifier: async ({ upstreams }) => upstreams,
  });
  assert.equal(missing.configurationValid, true);
  assert.equal(missing.ready, false);
  assert.deepEqual(
    missing.networks.map((network) => network.ready),
    [true, false, false],
  );
});

test("preflight accepts an explicit supported network subset", async () => {
  const result = await preflightRpcNodeAttachments({
    rawConfiguration: upstreamConfiguration,
    requiredNetworks: ["solana"],
    verifier: async ({ upstreams }) => upstreams,
  });
  assert.equal(result.ready, true);
  assert.deepEqual(
    result.networks.map((network) => network.network),
    ["solana"],
  );
});

test("preflight rejects duplicate or unsupported requested networks", async () => {
  await assert.rejects(
    () =>
      preflightRpcNodeAttachments({
        rawConfiguration: upstreamConfiguration,
        requiredNetworks: ["ethereum", "ethereum"],
      }),
    /unique, supported RPC network list/,
  );
  await assert.rejects(
    () =>
      preflightRpcNodeAttachments({
        rawConfiguration: upstreamConfiguration,
        requiredNetworks: ["polygon"],
      }),
    /unique, supported RPC network list/,
  );
});

test("preflight CLI accepts an explicit deployment network subset", () => {
  assert.equal(requestedNetworksFromArguments([]), undefined);
  assert.deepEqual(
    requestedNetworksFromArguments(["ethereum"]),
    ["ethereum"],
  );
  assert.deepEqual(
    requestedNetworksFromArguments(["ethereum", "base"]),
    ["ethereum", "base"],
  );
  assert.throws(
    () => requestedNetworksFromArguments(["ethereum", "ethereum"]),
    /Choose each required network once/,
  );
  assert.throws(
    () => requestedNetworksFromArguments(["polygon"]),
    /Choose each required network once/,
  );
});
