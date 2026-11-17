import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("individual service reads preserve browser and automation trust boundaries", async () => {
  const [
    browserRoute,
    automationRoute,
    databaseSource,
    provisioningSource,
  ] = await Promise.all([
    source("../app/api/v1/developer/services/[id]/route.ts"),
    source("../app/api/v1/control-plane/services/[id]/route.ts"),
    source("../lib/server/database.ts"),
    source("../lib/server/developer-service-provisioning.ts"),
  ]);
  const browserGet = handlerSource(browserRoute, "GET", "PATCH");
  const automationGet = handlerSource(
    automationRoute,
    "GET",
    "PATCH",
  );
  const serviceRead = databaseSource.match(
    /export async function getDeveloperService[\s\S]+?(?=\nasync function listDeveloperServicesInWorkspace)/,
  )?.[0];

  assert.ok(browserGet, "browser GET handler should be present");
  assert.match(browserGet, /requireDeveloperIdentity\(request\)/);
  assert.match(browserGet, /developer-service:read:identity/);
  assert.match(browserGet, /getDeveloperService\(\{/);
  assert.match(browserGet, /actor: developerActorFromUser\(user\)/);
  assert.match(browserGet, /reconcileDeveloperServiceProvisioning/);
  assert.match(browserGet, /rpcProvisioningSnapshots\(\)/);
  assert.match(browserGet, /grpcProvisioningSnapshot\(\)/);
  assert.match(browserGet, /service_not_found/);
  assert.match(browserGet, /Vary: "Cookie"/);
  assert.doesNotMatch(browserGet, /assertSameOrigin/);

  assert.ok(automationGet, "automation GET handler should be present");
  assert.match(
    automationGet,
    /requireDeveloperApiKeyScope\(\s*request,\s*"services:manage"/,
  );
  assert.match(automationGet, /control-plane-services:read:key/);
  assert.match(automationGet, /control-plane-services:read:workspace/);
  assert.match(automationGet, /workspaceId: identity\.workspace\.id/);
  assert.match(
    automationGet,
    /authorizationApiKeyId: identity\.apiKey\.id/,
  );
  assert.match(automationGet, /reconcileDeveloperServiceProvisioning/);
  assert.match(automationGet, /service_not_found/);
  assert.match(automationGet, /Vary: "Authorization"/);
  assert.doesNotMatch(automationGet, /assertSameOrigin/);

  assert.ok(serviceRead, "tenant-scoped database read should be present");
  assert.match(serviceRead, /authorizeDeveloperServiceControl\(\{/);
  assert.match(
    serviceRead,
    /WHERE id = \? AND workspace_id = \? AND archived_at IS NULL/,
  );
  assert.match(
    serviceRead,
    /WHERE workspace_id = \? AND service_id = \? AND expires_at > \?/,
  );
  assert.match(serviceRead, /LEFT JOIN rpc_telemetry/);

  assert.match(provisioningSource, /service\.product !== "rpc-api"/);
  assert.match(provisioningSource, /service\.product !== "grpc-api"/);
  assert.match(
    provisioningSource,
    /provisioning\.available && provisioning\.upstreamCount > 0/,
  );
  assert.match(
    provisioningSource,
    /provisioning\.available && provisioning\.endpoint !== null/,
  );

  for (const value of [
    browserGet,
    automationGet,
    serviceRead,
    provisioningSource,
  ]) {
    assert.doesNotMatch(value, /\u2014/);
  }
});

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function handlerSource(sourceText, method, followingMethod) {
  return sourceText.match(
    new RegExp(
      `export async function ${method}[\\s\\S]+?(?=\\nexport async function ${followingMethod})`,
    ),
  )?.[0];
}
