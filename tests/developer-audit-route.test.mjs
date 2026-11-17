import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("workspace audit route is authenticated, paginated, and rate-limited", async () => {
  const route = await readFile(
    new URL(
      "../app/api/v1/developer/workspace/audit-events/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /requireDeveloperIdentity\(request\)/);
  assert.match(route, /parseDeveloperAuditLimit/);
  assert.match(route, /parseDeveloperAuditCursor/);
  assert.match(route, /listDeveloperAuditEvents/);
  assert.match(route, /developer-audit:read:identity/);
  assert.match(route, /serializeDeveloperAuditEvent/);
  assert.doesNotMatch(route, /\u2014/);
});
