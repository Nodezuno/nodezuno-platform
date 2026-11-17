import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  acquireDeveloperCreationAttempt,
  createDeveloperIdempotencyKey,
  isCompleteDeveloperCreationEnvelope,
  settleDeveloperCreationAttempt,
  shouldRetainDeveloperCreationAttempt,
} from "../lib/client/control-plane-idempotency.ts";

const consoleUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);

test("developer creation keys are secure-source UUIDs within the server contract", () => {
  const source = uuidSource([
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ]);
  const serviceKey = createDeveloperIdempotencyKey(
    "service.create",
    source,
  );
  const apiKey = createDeveloperIdempotencyKey(
    "api-key.create",
    source,
  );

  assert.equal(
    serviceKey,
    "nzu.service.11111111-1111-4111-8111-111111111111",
  );
  assert.equal(
    apiKey,
    "nzu.api-key.22222222-2222-4222-8222-222222222222",
  );
  for (const key of [serviceKey, apiKey]) {
    assert.ok(key.length >= 16 && key.length <= 128);
    assert.match(key, /^[A-Za-z0-9._:-]+$/);
  }
  assert.throws(() =>
    createDeveloperIdempotencyKey("service.create", {
      randomUUID: () => "contains spaces",
    }),
  );
});

test("an ambiguous retry reuses one key while changed input rotates it", () => {
  const source = uuidSource([
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ]);
  const registry = new Map();
  const first = acquireDeveloperCreationAttempt(
    registry,
    "service-form",
    "service.create",
    { name: "Ethereum", network: "ethereum" },
    source,
  );
  const sameSubmission = acquireDeveloperCreationAttempt(
    registry,
    "service-form",
    "service.create",
    { network: "ethereum", name: "Ethereum" },
    source,
  );

  assert.equal(sameSubmission.key, first.key);
  settleDeveloperCreationAttempt(
    registry,
    "service-form",
    first.key,
    true,
  );
  assert.equal(registry.get("service-form")?.key, first.key);

  const changedSubmission = acquireDeveloperCreationAttempt(
    registry,
    "service-form",
    "service.create",
    { name: "Base", network: "base" },
    source,
  );
  assert.notEqual(changedSubmission.key, first.key);

  settleDeveloperCreationAttempt(
    registry,
    "service-form",
    first.key,
    false,
  );
  assert.equal(
    registry.get("service-form")?.key,
    changedSubmission.key,
  );
  settleDeveloperCreationAttempt(
    registry,
    "service-form",
    changedSubmission.key,
    false,
  );
  assert.equal(registry.has("service-form"), false);

  const nextSubmission = acquireDeveloperCreationAttempt(
    registry,
    "service-form",
    "service.create",
    { name: "Base", network: "base" },
    source,
  );
  assert.notEqual(nextSubmission.key, changedSubmission.key);
});

test("only uncertain mutation outcomes retain a creation attempt", () => {
  assert.equal(shouldRetainDeveloperCreationAttempt(null), true);
  assert.equal(
    shouldRetainDeveloperCreationAttempt({ ok: true, status: 201 }),
    true,
  );
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(
      shouldRetainDeveloperCreationAttempt({ ok: false, status }),
      true,
    );
  }
  for (const status of [400, 401, 403, 409, 422]) {
    assert.equal(
      shouldRetainDeveloperCreationAttempt({ ok: false, status }),
      false,
    );
  }
});

test("a creation is confirmed only by a complete service or one-time-secret receipt", () => {
  assert.equal(
    isCompleteDeveloperCreationEnvelope(
      {
        data: { service: { id: "service-1" } },
        requestId: "request-service",
      },
      "service.create",
    ),
    true,
  );
  assert.equal(
    isCompleteDeveloperCreationEnvelope(
      {
        data: {
          apiKey: { id: "key-1" },
          secret: "nzu_live_secret",
        },
        requestId: "request-key",
      },
      "api-key.create",
    ),
    true,
  );
  assert.equal(
    isCompleteDeveloperCreationEnvelope(
      {
        data: { apiKey: { id: "key-1" } },
        requestId: "request-key",
      },
      "api-key.create",
    ),
    false,
  );
  assert.equal(
    isCompleteDeveloperCreationEnvelope(
      {
        data: { service: { id: "service-1" } },
      },
      "service.create",
    ),
    false,
  );
});

test("every service and API-key creation flow sends a managed idempotency key", async () => {
  const source = await readFile(consoleUrl, "utf8");
  const expectedCalls = [
    ["service-form", "service.create", "/api/v1/developer/services"],
    [
      "rpc-guided-service",
      "service.create",
      "/api/v1/developer/services",
    ],
    [
      "grpc-guided-service",
      "service.create",
      "/api/v1/developer/services",
    ],
    [
      "rpc-guided-key",
      "api-key.create",
      "/api/v1/developer/api-keys",
    ],
    [
      "rpc-recovery-key",
      "api-key.create",
      "/api/v1/developer/api-keys",
    ],
    [
      "grpc-guided-key",
      "api-key.create",
      "/api/v1/developer/api-keys",
    ],
    [
      "grpc-recovery-key",
      "api-key.create",
      "/api/v1/developer/api-keys",
    ],
    [
      "api-key-form",
      "api-key.create",
      "/api/v1/developer/api-keys",
    ],
  ];

  assert.equal(
    source.match(/await postIdempotentControlPlane/g)?.length,
    expectedCalls.length + 1,
  );
  for (const [slot, operation, path] of expectedCalls) {
    assert.match(
      source,
      new RegExp(
        `"${escapeRegex(slot)}",\\s+"${escapeRegex(
          operation,
        )}",\\s+"${escapeRegex(path)}"`,
      ),
    );
  }
  assert.equal(
    source.match(/"\/api\/v1\/developer\/services"/g)?.length,
    4,
  );
  assert.equal(
    source.match(/"\/api\/v1\/developer\/api-keys"/g)?.length,
    6,
  );
  assert.match(source, /"Idempotency-Key": attempt\.key/);
  assert.match(source, /shouldRetainDeveloperCreationAttempt\(response\)/);
  assert.match(
    source,
    /isCompleteDeveloperCreationEnvelope\(envelope, operation\)/,
  );
  assert.match(
    source,
    /candidate\.code === "api_key_secret_already_issued"/,
  );
  assert.match(
    source,
    /its one-time secret cannot be shown again[\s\S]+revoke the replacement key and create or rotate to another replacement/,
  );
  assert.doesNotMatch(source, /\u2014/);
});

function uuidSource(values) {
  let index = 0;
  return {
    randomUUID() {
      const value = values[index];
      index += 1;
      if (!value) throw new Error("No UUID value remains.");
      return value;
    },
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
