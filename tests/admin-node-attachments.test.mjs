import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseOperatorNodeAttachmentSnapshot } from "../lib/client/node-attachment-operations.ts";

const valid = {
  data: {
    rpc: [
      {
        network: "ethereum",
        name: "Ethereum",
        configuredUpstreams: 2,
        verifiedUpstreams: 2,
        ready: true,
        state: "ready",
        expectedIdentity: "eth_chainId = 0x1",
        safeReads:
          "Pulse verified-latency adaptive failover, at most two attempts",
        writes: "Configured primary, exactly one attempt",
        pulse: {
          scope: "process-local",
          upstreams: [
            {
              slot: 1,
              primary: true,
              state: "closed",
              latencyEwmaMs: 82.5,
              consecutiveFailures: 0,
              successfulObservations: 24,
              cooldownRemainingMs: 0,
              lastObservedAt: "2026-07-18T11:59:58.000Z",
            },
            {
              slot: 2,
              primary: false,
              state: "open",
              latencyEwmaMs: 140,
              consecutiveFailures: 3,
              successfulObservations: 5,
              cooldownRemainingMs: 15000,
              lastObservedAt: "2026-07-18T11:59:57.000Z",
            },
          ],
        },
      },
      {
        network: "base",
        name: "Base",
        configuredUpstreams: 1,
        verifiedUpstreams: 0,
        ready: false,
        state: "verification_failed",
        expectedIdentity: "eth_chainId = 0x2105",
        safeReads:
          "Pulse verified-latency adaptive failover, at most two attempts",
        writes: "Configured primary, exactly one attempt",
        pulse: {
          scope: "process-local",
          upstreams: [
            {
              slot: 1,
              primary: true,
              state: "cold",
              latencyEwmaMs: null,
              consecutiveFailures: 0,
              successfulObservations: 0,
              cooldownRemainingMs: 0,
              lastObservedAt: null,
            },
          ],
        },
      },
      {
        network: "solana",
        name: "Solana",
        configuredUpstreams: 0,
        verifiedUpstreams: 0,
        ready: false,
        state: "not_configured",
        expectedIdentity:
          "mainnet-beta genesis plus getHealth = ok",
        safeReads:
          "Pulse verified-latency adaptive failover, at most two attempts",
        writes: "Configured primary, exactly one attempt",
        pulse: {
          scope: "process-local",
          upstreams: [],
        },
      },
    ],
    nativeGrpc: {
      configured: true,
      endpointConfigured: true,
      authenticationConfigured: true,
      ready: true,
      state: "ready",
      serviceName: "nodezuno.ethereum.v1.EthereumProxy",
    },
    checkedAt: "2026-07-18T12:00:00.000Z",
  },
  requestId: "11111111-1111-4111-8111-111111111111",
};

test("operator node snapshot accepts only the exact redacted contract", () => {
  const parsed = parseOperatorNodeAttachmentSnapshot(valid);
  assert.ok(parsed);
  assert.equal(parsed.rpc[0].network, "ethereum");
  assert.equal(parsed.rpc[1].state, "verification_failed");
  assert.equal(parsed.rpc[0].pulse.upstreams[1].state, "open");
  assert.equal(parsed.nativeGrpc.ready, true);
  assert.equal(JSON.stringify(parsed).includes("https://"), false);

  assert.equal(
    parseOperatorNodeAttachmentSnapshot({
      ...valid,
      data: {
        ...valid.data,
        rpc: [
          { ...valid.data.rpc[0], providerUrl: "https://secret.example" },
          ...valid.data.rpc.slice(1),
        ],
      },
    }),
    null,
  );
  assert.equal(
    parseOperatorNodeAttachmentSnapshot({
      ...valid,
      data: {
        ...valid.data,
        rpc: [
          {
            ...valid.data.rpc[0],
            pulse: {
              ...valid.data.rpc[0].pulse,
              upstreams: [
                {
                  ...valid.data.rpc[0].pulse.upstreams[0],
                  providerUrl: "https://secret.example",
                },
                valid.data.rpc[0].pulse.upstreams[1],
              ],
            },
          },
          ...valid.data.rpc.slice(1),
        ],
      },
    }),
    null,
  );
  assert.equal(
    parseOperatorNodeAttachmentSnapshot({
      ...valid,
      data: {
        ...valid.data,
        rpc: [
          {
            ...valid.data.rpc[0],
            ready: false,
            state: "ready",
          },
          ...valid.data.rpc.slice(1),
        ],
      },
    }),
    null,
  );
  assert.equal(
    parseOperatorNodeAttachmentSnapshot({
      ...valid,
      data: {
        ...valid.data,
        rpc: [
          ...valid.data.rpc.slice(0, 1),
          {
            ...valid.data.rpc[1],
            verifiedUpstreams: 2,
          },
          valid.data.rpc[2],
        ],
      },
    }),
    null,
  );
});

test("admin attachment probe is authenticated, bounded, and secret-free", async () => {
  const [route, component] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/admin/node-attachments/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../components/node-attachment-operations.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(route, /requireAdminRequest\(request\)/);
  assert.match(route, /admin-node-attachments:read:identity/);
  assert.match(route, /rpcProvisioningSnapshots/);
  assert.match(route, /grpcProvisioningSnapshot/);
  assert.match(route, /cacheControl: "no-store, max-age=0"/);
  assert.doesNotMatch(route, /\.headers\b/);
  assert.doesNotMatch(route, /upstream\.url/);

  assert.match(component, /\/api\/v1\/admin\/node-attachments/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /Run verification/);
  assert.match(component, /provider URLs, headers, credentials/);
  assert.match(component, /requestSequence/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(route, /\u2014/);
  assert.doesNotMatch(component, /\u2014/);
});
