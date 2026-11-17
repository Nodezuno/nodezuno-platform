import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("service and API key creation require hashed idempotency identities", async () => {
  const [services, apiKeys, database, migration] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/developer/services/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/v1/developer/api-keys/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../lib/server/database.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../drizzle/0010_developer_idempotency.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  for (const source of [services, apiKeys]) {
    assert.match(source, /readIdempotencyKey\(request\)/);
    assert.match(
      source,
      /privateHash\(\s*"developer-idempotency",\s*idempotencyKey/,
    );
    assert.match(source, /requestHash: await sha256Hex/);
    assert.match(source, /stableStringify/);
    assert.doesNotMatch(source, /\u2014/);
  }
  assert.match(database, /operation = 'service\.create'/);
  assert.match(database, /operation = 'api_key\.create'/);
  assert.match(database, /api_key_secret_already_issued/);
  assert.match(database, /idempotency_key_reused/);
  assert.match(database, /DEVELOPER_MUTATION_IDEMPOTENCY_TTL_MS/);

  assert.match(migration, /idempotency_hash/);
  assert.match(migration, /request_hash/);
  assert.match(migration, /resource_id/);
  assert.match(migration, /workspace_key_unique/);
  assert.match(migration, /expiry_check/);
  assert.doesNotMatch(migration, /`idempotency_key`/);
});
