import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  publicApiEndpoints,
  publicOpenApiDocument,
} from "../lib/public-api.ts";

test("RPC usage route is authenticated, bounded, and documented", async () => {
  const route = await readFile(
    new URL(
      "../app/api/v1/developer/services/[id]/usage/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /requireDeveloperIdentity\(request\)/);
  assert.match(route, /isDeveloperResourceId\(id\)/);
  assert.match(route, /parseDeveloperRpcUsageWindow/);
  assert.match(route, /getDeveloperRpcUsage/);
  assert.match(route, /rpc-usage:read:identity/);
  assert.doesNotMatch(route, /\u2014/);

  const operation =
    publicOpenApiDocument.paths[
      "/api/v1/developer/services/{id}/usage"
    ].get;
  assert.deepEqual(operation["x-nodezuno-roles"], [
    "owner",
    "admin",
    "developer",
  ]);
  assert.match(operation.description, /never stores or returns RPC request/);
  assert.ok(
    publicApiEndpoints.some(
      (endpoint) =>
        endpoint.method === "GET" &&
        endpoint.path ===
          "/api/v1/developer/services/{id}/usage" &&
        endpoint.maturity === "live",
    ),
  );
});
