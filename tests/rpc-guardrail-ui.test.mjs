import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseRpcGuardrailEnvelope,
  rpcGuardrailUpdatePayload,
} from "../lib/client/rpc-guardrail.ts";

const validEnvelope = {
  data: {
    serviceId: "2e0453dd-e120-469a-96d7-809abf411544",
    product: "rpc-api",
    network: "base",
    hourlyQuotaLimit: 4_000,
    effectiveHourlyQuotaLimit: 4_000,
    platformWorkspaceHourlyQuotaLimit: 10_000,
    warningThresholdPercent: 80,
    revision: 3,
    inherited: false,
    updatedAt: "2026-07-18T10:00:00.000Z",
  },
  requestId: "request-1",
};

test("guardrail parser accepts an exact consistent snapshot", () => {
  assert.deepEqual(
    parseRpcGuardrailEnvelope(validEnvelope, {
      serviceId: validEnvelope.data.serviceId,
      product: "rpc-api",
      network: "base",
    }),
    validEnvelope.data,
  );
  assert.deepEqual(
    rpcGuardrailUpdatePayload({
      hourlyQuotaLimit: null,
      warningThresholdPercent: 85,
      revision: 3,
    }),
    {
      hourlyQuotaLimit: null,
      warningThresholdPercent: 85,
      revision: 3,
    },
  );
});

test("guardrail parser rejects mismatches, expansion, and extra fields", () => {
  assert.throws(() =>
    parseRpcGuardrailEnvelope(validEnvelope, {
      serviceId: validEnvelope.data.serviceId,
      product: "grpc-api",
      network: "base",
    }),
  );
  assert.throws(() =>
    parseRpcGuardrailEnvelope(
      {
        ...validEnvelope,
        data: {
          ...validEnvelope.data,
          effectiveHourlyQuotaLimit: 4_001,
          hourlyQuotaLimit: 4_000,
        },
      },
      {
        serviceId: validEnvelope.data.serviceId,
        product: "rpc-api",
        network: "base",
      },
    ),
  );
  assert.throws(() =>
    parseRpcGuardrailEnvelope(
      {
        ...validEnvelope,
        data: { ...validEnvelope.data, providerUrl: "https://secret" },
      },
      {
        serviceId: validEnvelope.data.serviceId,
        product: "rpc-api",
        network: "base",
      },
    ),
  );
  assert.throws(() =>
    rpcGuardrailUpdatePayload({
      hourlyQuotaLimit: 99,
      warningThresholdPercent: 80,
      revision: 3,
    }),
  );
});

test("console mounts conflict-safe guardrails beside RPC usage and gRPC setup", async () => {
  const [panel, consoleSource, styles] = await Promise.all([
    readFile(
      new URL("../components/rpc-guardrail-panel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/developer-console.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /\/quota-guardrail/);
  assert.match(panel, /method: "PUT"/);
  assert.match(panel, /cache: "no-store"/);
  assert.match(panel, /credentials: "same-origin"/);
  assert.match(panel, /response\.status === 409/);
  assert.match(panel, /Your edits are still here/);
  assert.match(panel, /Reload latest revision/);
  assert.match(panel, /can reduce, but never increase/);
  assert.match(panel, /workspaceRole === "owner"/);
  assert.match(panel, /workspaceRole === "admin"/);
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /aria-busy=/);
  assert.match(consoleSource, /<RpcGuardrailPanel/);
  assert.match(
    consoleSource,
    /product="rpc-api"[\s\S]+<RpcObservabilityPanel/,
  );
  assert.match(
    consoleSource,
    /product="grpc-api"[\s\S]+serviceId=\{ethereumGrpcService\.id\}/,
  );
  assert.match(styles, /\.rpc-guardrail-summary/);
  assert.match(
    styles,
    /@media \(max-width: 520px\)[\s\S]+\.rpc-guardrail-fields input[\s\S]+font-size: 16px/,
  );
  for (const source of [panel, consoleSource, styles]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});
