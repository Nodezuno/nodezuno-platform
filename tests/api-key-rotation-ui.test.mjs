import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  apiKeyRotationAttemptIdentity,
  apiKeyRotationBody,
  canRotateApiKeys,
  isApiKeyActiveAndUnexpired,
  isApiKeyRotationEligible,
} from "../lib/client/api-key-rotation.ts";
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
const stylesUrl = new URL("../app/globals.css", import.meta.url);

const activeKey = {
  expiresAt: "2030-01-01T00:00:00.000Z",
  revokedAt: null,
};
const now = Date.parse("2029-01-01T00:00:00.000Z");

test("rotation is limited to owner and admin users with active, unexpired sources", () => {
  assert.equal(canRotateApiKeys("owner"), true);
  assert.equal(canRotateApiKeys("admin"), true);
  assert.equal(canRotateApiKeys("developer"), false);
  assert.equal(canRotateApiKeys(null), false);

  assert.equal(isApiKeyActiveAndUnexpired(activeKey, now), true);
  assert.equal(
    isApiKeyActiveAndUnexpired(
      { expiresAt: null, revokedAt: null },
      now,
    ),
    true,
  );
  assert.equal(
    isApiKeyActiveAndUnexpired(
      { ...activeKey, expiresAt: new Date(now).toISOString() },
      now,
    ),
    false,
  );
  assert.equal(
    isApiKeyActiveAndUnexpired(
      { ...activeKey, expiresAt: "not-a-date" },
      now,
    ),
    false,
  );
  assert.equal(
    isApiKeyActiveAndUnexpired(
      { ...activeKey, revokedAt: "2028-12-01T00:00:00.000Z" },
      now,
    ),
    false,
  );

  assert.equal(isApiKeyRotationEligible("owner", activeKey, now), true);
  assert.equal(isApiKeyRotationEligible("admin", activeKey, now), true);
  assert.equal(
    isApiKeyRotationEligible("developer", activeKey, now),
    false,
  );
});

test("rotation sends an exact optional-name body and fingerprints the source", () => {
  assert.deepEqual(apiKeyRotationBody(""), {});
  assert.deepEqual(apiKeyRotationBody("   "), {});
  assert.deepEqual(apiKeyRotationBody("  Production RPC  "), {
    name: "Production RPC",
  });
  assert.deepEqual(
    apiKeyRotationAttemptIdentity(
      "source-key-a",
      apiKeyRotationBody("  Production RPC  "),
    ),
    {
      sourceApiKeyId: "source-key-a",
      requestBody: { name: "Production RPC" },
    },
  );
});

test("an exact uncertain rotation retry keeps its key while changed source or name rotates it", () => {
  const source = uuidSource([
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ]);
  const registry = new Map();
  const body = apiKeyRotationBody("");
  const first = acquireDeveloperCreationAttempt(
    registry,
    "api-key-rotation",
    "api-key.rotate",
    apiKeyRotationAttemptIdentity("source-a", body),
    source,
  );
  settleDeveloperCreationAttempt(
    registry,
    "api-key-rotation",
    first.key,
    true,
  );
  const exactRetry = acquireDeveloperCreationAttempt(
    registry,
    "api-key-rotation",
    "api-key.rotate",
    apiKeyRotationAttemptIdentity("source-a", body),
    source,
  );
  const changedName = acquireDeveloperCreationAttempt(
    registry,
    "api-key-rotation",
    "api-key.rotate",
    apiKeyRotationAttemptIdentity(
      "source-a",
      apiKeyRotationBody("Replacement"),
    ),
    source,
  );
  const changedSource = acquireDeveloperCreationAttempt(
    registry,
    "api-key-rotation",
    "api-key.rotate",
    apiKeyRotationAttemptIdentity(
      "source-b",
      apiKeyRotationBody("Replacement"),
    ),
    source,
  );

  assert.equal(exactRetry.key, first.key);
  assert.notEqual(changedName.key, first.key);
  assert.notEqual(changedSource.key, changedName.key);
  assert.match(first.key, /^nzu\.api-key-rotate\./);

  assert.equal(shouldRetainDeveloperCreationAttempt(null), true);
  for (const status of [408, 425, 429, 500, 503]) {
    assert.equal(
      shouldRetainDeveloperCreationAttempt({ ok: false, status }),
      true,
    );
  }
  for (const status of [400, 403, 409, 422]) {
    assert.equal(
      shouldRetainDeveloperCreationAttempt({ ok: false, status }),
      false,
    );
  }
});

test("a rotation succeeds only with a request ID, replacement metadata, and one-time secret", () => {
  assert.equal(
    isCompleteDeveloperCreationEnvelope(
      {
        data: {
          apiKey: { id: "replacement-key" },
          secret: "nzu_live_one_time_secret",
        },
        requestId: "request-rotation",
      },
      "api-key.rotate",
    ),
    true,
  );
  assert.equal(
    isCompleteDeveloperCreationEnvelope(
      {
        data: { apiKey: { id: "replacement-key" } },
        requestId: "request-rotation",
      },
      "api-key.rotate",
    ),
    false,
  );

  const source = uuidSource([
    "44444444-4444-4444-8444-444444444444",
  ]);
  assert.equal(
    createDeveloperIdempotencyKey("api-key.rotate", source),
    "nzu.api-key-rotate.44444444-4444-4444-8444-444444444444",
  );
});

test("console rotation is atomic, accessible, explicit, and preserves the returned secret through refresh", async () => {
  const [source, styles] = await Promise.all([
    readFile(consoleUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);
  const rotateStart = source.indexOf("async function rotateApiKey");
  const rotateEnd = source.indexOf(
    "async function revokeApiKey",
    rotateStart,
  );
  assert.ok(rotateStart >= 0 && rotateEnd > rotateStart);
  const rotateFunction = source.slice(rotateStart, rotateEnd);

  assert.match(
    rotateFunction,
    /postIdempotentControlPlane<SecretReceipt>\([\s\S]+"api-key-rotation"[\s\S]+"api-key\.rotate"/,
  );
  assert.match(
    rotateFunction,
    /`\/api\/v1\/developer\/api-keys\/\$\{encodeURIComponent\(apiKey\.id\)\}\/rotate`/,
  );
  assert.match(
    rotateFunction,
    /apiKeyRotationBody\(rotationName\)/,
  );
  assert.match(
    rotateFunction,
    /apiKeyRotationAttemptIdentity\(apiKey\.id, body\)/,
  );
  assert.match(source, /"Idempotency-Key": attempt\.key/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /body: JSON\.stringify\(body\)/);
  assert.doesNotMatch(rotateFunction, /\bwhile\s*\(|\bsetInterval\s*\(/);

  assert.match(source, /candidate\.code === "api_key_secret_already_issued"/);
  assert.match(
    source,
    /candidate\.code === "api_key_rotation_source_inactive"/,
  );
  assert.match(
    source,
    /already revoked or expired[\s\S]+Refresh key metadata[\s\S]+active, unexpired key/,
  );
  assert.match(
    rotateFunction,
    /No automatic retry was made[\s\S]+exact manual retry keeps the same request identity/,
  );

  assert.match(source, /isApiKeyRotationEligible\([\s\S]+workspace\?\.role/);
  assert.match(source, /className="key-rotate-confirm"/);
  assert.match(
    source,
    /aria-label=\{`Rotate \$\{apiKey\.name\} confirmation`\}/,
  );
  assert.match(source, /role="group"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /autoFocus/);
  assert.match(source, /Replacement name \(optional\)/);
  assert.match(source, /aria-busy=\{rotatingId === apiKey\.id\}/);
  assert.match(source, /className="key-rotate-error"[\s\S]+role="alert"/);
  assert.match(source, /id=\{`rotate-key-\$\{apiKey\.id\}`\}/);
  assert.match(
    source,
    /restoreActionFocus\(`rotate-key-\$\{apiKeyId\}`\)/,
  );

  const receiptIndex = rotateFunction.indexOf(
    "setSecretReceipt(envelope.data)",
  );
  const refreshIndex = rotateFunction.indexOf("await loadConsole(true)");
  assert.ok(receiptIndex >= 0 && refreshIndex > receiptIndex);
  assert.doesNotMatch(
    rotateFunction.slice(receiptIndex, refreshIndex),
    /setSecretReceipt\(null\)/,
  );
  assert.match(
    rotateFunction,
    /setSecretReceiptSurface\("api-keys"\)/,
  );
  assert.match(
    rotateFunction,
    /replacement preserved its service binding and scopes/,
  );

  assert.match(source, /function downloadSecret\(\)/);
  assert.match(source, /new Blob\(\[contents\]/);
  assert.match(source, /URL\.createObjectURL\(blob\)/);
  assert.match(source, /Download secret/);
  assert.match(source, /Nodezuno cannot recover this secret/);
  assert.doesNotMatch(rotateFunction, /console\.(?:log|info|debug)/);

  assert.match(styles, /\.key-rotate-confirm/);
  assert.match(
    styles,
    /@media \(hover: none\), \(pointer: coarse\)[\s\S]+?\.key-rotate-button/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+?\.key-rotate-confirm input/,
  );
  assert.doesNotMatch(source, /\u2014/);
  assert.doesNotMatch(styles, /\u2014/);
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
