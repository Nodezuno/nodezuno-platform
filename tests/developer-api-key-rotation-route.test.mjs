import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("API key rotation is same-origin, idempotent, and one-time-secret only", async () => {
  const [route, database, migration] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/developer/api-keys/[id]/rotate/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../lib/server/database.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../drizzle/0011_api_key_rotation.sql", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requireDeveloperIdentity\(request\)/);
  assert.match(route, /readIdempotencyKey\(request\)/);
  assert.match(route, /developerApiKeyHash\(material\.secret\)/);
  assert.match(route, /rotateDeveloperApiKey/);
  assert.match(route, /Expires: "0"/);
  assert.match(route, /Pragma: "no-cache"/);
  assert.doesNotMatch(route, /\u2014/);

  assert.match(database, /operation = 'api_key\.rotate'/);
  assert.match(database, /'api_key\.rotated'/);
  assert.match(database, /api_key_rotation_source_inactive/);
  assert.match(migration, /api_key\.rotate/);
  assert.match(migration, /PRAGMA defer_foreign_keys=ON/);
  assert.doesNotMatch(migration, /PRAGMA foreign_keys=OFF/);
});
