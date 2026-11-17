import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const browserRoute = new URL(
  "../app/api/v1/developer/services/[id]/quota-guardrail/route.ts",
  import.meta.url,
);
const automationRoute = new URL(
  "../app/api/v1/control-plane/services/[id]/quota-guardrail/route.ts",
  import.meta.url,
);

test("browser guardrail route is tenant-bound, same-origin, and bounded", async () => {
  const source = await readFile(browserRoute, "utf8");
  const get = handlerSource(source, "GET", "PUT");
  const put = handlerSource(source, "PUT");
  assert.ok(get);
  assert.ok(put);
  assert.match(get, /requireDeveloperIdentity\(request\)/);
  assert.match(get, /getDeveloperRpcServiceGuardrail/);
  assert.match(get, /developerGuardrailRateLimit\(user, "read"\)/);
  assert.doesNotMatch(get, /assertSameOrigin/);
  assert.match(put, /assertSameOrigin\(request\)/);
  assert.match(put, /readJsonBody\(request\)/);
  assert.match(put, /validateRpcServiceGuardrailUpdate/);
  assert.match(put, /updateDeveloperRpcServiceGuardrail/);
  assert.match(put, /guardrail: validation\.value/);
  assert.match(put, /status: 422/);
  assert.match(source, /loadEthereumRpcRuntimeConfiguration/);
  assert.match(source, /serializeRpcServiceGuardrail/);
  assert.match(source, /rpc-service-guardrail:\$\{operation\}:identity/);
  assert.match(source, /Vary: vary/);
  assert.doesNotMatch(source, /\u2014/);
});

test("API-key guardrail route requires unbound services management authority", async () => {
  const source = await readFile(automationRoute, "utf8");
  assert.match(
    source,
    /requireDeveloperApiKeyScope\(\s*request,\s*"services:manage"/,
  );
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function PUT/);
  assert.match(source, /control-plane-rpc-service-guardrail:.*:key/s);
  assert.match(
    source,
    /control-plane-rpc-service-guardrail:.*:workspace/s,
  );
  assert.match(source, /workspaceId: identity\.workspace\.id/);
  assert.match(
    source,
    /authorizationApiKeyId: identity\.apiKey\.id/,
  );
  assert.match(source, /Vary: "Authorization"/);
  assert.doesNotMatch(source, /assertSameOrigin/);
  assert.doesNotMatch(source, /\u2014/);
});

function handlerSource(source, method, followingMethod) {
  const suffix = followingMethod
    ? `(?=\\nexport async function ${followingMethod})`
    : "(?=\\nasync function)";
  return source.match(
    new RegExp(`export async function ${method}[\\s\\S]+?${suffix}`),
  )?.[0];
}
