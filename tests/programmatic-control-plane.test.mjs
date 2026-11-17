import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertDeveloperApiKeyScope } from "../lib/server/developer-api-key-auth.ts";
import { HttpProblem } from "../lib/server/http.ts";

test("programmatic service control plane is scoped, tenant-bound, and idempotent", async () => {
  const [
    collectionRoute,
    itemRoute,
    usageRoute,
    policyRoute,
    auth,
    database,
    platform,
  ] =
    await Promise.all([
      readFile(
        new URL(
          "../app/api/v1/control-plane/services/route.ts",
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
        new URL(
          "../app/api/v1/control-plane/services/[id]/usage/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/v1/control-plane/services/[id]/rpc-access-policy/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../lib/server/developer-api-key-auth.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../lib/server/database.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../lib/server/developer-platform.ts", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(collectionRoute, /"services:manage"/);
  assert.match(collectionRoute, /readIdempotencyKey\(request\)/);
  assert.match(collectionRoute, /stableStringify/);
  assert.match(collectionRoute, /listDeveloperServicesForApiKey/);
  assert.match(collectionRoute, /authorizationApiKeyId/);
  assert.match(itemRoute, /"services:manage"/);
  assert.match(itemRoute, /archiveDeveloperService/);
  assert.match(usageRoute, /"services:manage"/);
  assert.match(usageRoute, /getDeveloperRpcUsage/);
  assert.match(policyRoute, /"services:manage"/);
  assert.match(policyRoute, /getDeveloperRpcAccessPolicy/);
  assert.match(policyRoute, /updateDeveloperRpcAccessPolicy/);
  assert.doesNotMatch(collectionRoute, /assertSameOrigin/);
  assert.doesNotMatch(itemRoute, /assertSameOrigin/);
  assert.doesNotMatch(policyRoute, /assertSameOrigin/);

  assert.match(auth, /authenticateDeveloperApiKey/);
  assert.match(auth, /identity\.apiKey\.serviceId !== null/);
  assert.match(auth, /developer-api-key-auth:key/);
  assert.match(auth, /developer-api-key-auth:workspace/);

  assert.match(
    database,
    /requireActiveDeveloperServiceManagementKey/,
  );
  assert.match(database, /k\.workspace_id = \?/);
  assert.match(database, /"services:manage"/);
  assert.match(platform, /"services:manage"/);

  for (const source of [
    collectionRoute,
    itemRoute,
    usageRoute,
    policyRoute,
    auth,
    database,
    platform,
  ]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});

test("service management authorization rejects wrong scope and bindings", () => {
  const identity = {
    workspace: {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "acme",
      name: "Acme",
    },
    apiKey: {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Automation",
      prefix: "nzu_live_22222222",
      lastFour: "abcd",
      scopes: ["services:manage"],
      serviceId: null,
      expiresAt: 2_000_000_000_000,
    },
    secretHash: "a".repeat(64),
  };
  assert.doesNotThrow(() =>
    assertDeveloperApiKeyScope(identity, "services:manage"),
  );
  assert.throws(
    () =>
      assertDeveloperApiKeyScope(
        {
          ...identity,
          apiKey: {
            ...identity.apiKey,
            scopes: ["platform:identity"],
          },
        },
        "services:manage",
      ),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 403 &&
      error.code === "api_key_scope_denied",
  );
  assert.throws(
    () =>
      assertDeveloperApiKeyScope(
        {
          ...identity,
          apiKey: {
            ...identity.apiKey,
            serviceId: "33333333-3333-4333-8333-333333333333",
          },
        },
        "services:manage",
      ),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 403 &&
      error.code === "api_key_service_binding_denied",
  );
});
