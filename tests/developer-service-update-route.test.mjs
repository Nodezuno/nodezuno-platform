import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("browser and automation rename routes enforce distinct trust boundaries", async () => {
  const [browserRoute, automationRoute, database] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/developer/services/[id]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/v1/control-plane/services/[id]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/server/database.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(browserRoute, /export async function PATCH/);
  assert.match(browserRoute, /assertSameOrigin\(request\)/);
  assert.match(browserRoute, /requireDeveloperIdentity\(request\)/);
  assert.match(
    browserRoute,
    /validateDeveloperServiceUpdatePayload/,
  );
  assert.match(browserRoute, /updateDeveloperService/);
  assert.match(browserRoute, /developer-service:update:identity/);

  assert.match(automationRoute, /export async function PATCH/);
  assert.match(
    automationRoute,
    /requireDeveloperApiKeyScope\(\s*request,\s*"services:manage"/,
  );
  assert.match(
    automationRoute,
    /validateDeveloperServiceUpdatePayload/,
  );
  assert.match(automationRoute, /authorizationApiKeyId/);
  assert.match(automationRoute, /updateDeveloperService/);
  assert.doesNotMatch(automationRoute, /assertSameOrigin/);

  assert.match(database, /last_mutation_id = \?/);
  assert.match(database, /'service\.updated'/);
  assert.match(database, /'\{"field":"name"\}'/);
  assert.match(database, /service_update_conflict/);
  assert.doesNotMatch(
    database.match(
      /'service\.updated'[\s\S]{0,500}/,
    )?.[0] ?? "",
    /options\.input\.name/,
  );

  for (const source of [browserRoute, automationRoute]) {
    assert.match(source, /service_not_found/);
    assert.match(source, /responseFromError/);
    assert.doesNotMatch(source, /\u2014/);
  }
});
