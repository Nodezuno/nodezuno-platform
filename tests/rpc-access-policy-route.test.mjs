import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controlPlaneRoute = new URL(
  "../app/api/v1/developer/services/[id]/rpc-access-policy/route.ts",
  import.meta.url,
);
const gatewayRoute = new URL(
  "../app/api/v1/rpc/[serviceId]/route.ts",
  import.meta.url,
);
const databaseModule = new URL(
  "../lib/server/database.ts",
  import.meta.url,
);
const migration = new URL(
  "../drizzle/0009_rpc_access_policies.sql",
  import.meta.url,
);

test("RPC policy control plane authenticates exact reads and same-origin updates", async () => {
  const [source, serializer] = await Promise.all([
    readFile(controlPlaneRoute, "utf8"),
    readFile(
      new URL("../lib/server/rpc-access-policy.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function PUT/);
  assert.match(source, /requireDeveloperIdentity\(request\)/);
  assert.match(source, /assertSameOrigin\(request\)/);
  assert.match(source, /validateRpcAccessPolicyUpdate/);
  assert.match(source, /expectedRevision: validation\.value\.revision/);
  assert.match(source, /rpc-access-policy:update:identity/);
  assert.match(source, /status: 422/);
  assert.match(source, /serializeRpcAccessPolicyRecord/);
  assert.match(serializer, /updatedAt:[\s\S]+toISOString\(\)/);
  assert.doesNotMatch(source, /\u2014/);
});

test("RPC gateway enforces persisted transport and method policy before quota", async () => {
  const source = await readFile(gatewayRoute, "utf8");
  const policyLookup = source.indexOf(
    "const accessPolicy = await findRpcAccessPolicyForService",
  );
  const policyApplication = source.indexOf(
    "applyRpcAccessPolicyToCalls",
    policyLookup,
  );
  const allowedCallSelection = source.indexOf(
    "const allowedCalls = allowedEthereumRpcCalls",
  );
  const quota = source.indexOf("await consumeRpcQuota");
  const upstream = source.indexOf("await forwardRpc");
  assert.ok(policyLookup > 0);
  assert.ok(policyApplication > policyLookup);
  assert.ok(allowedCallSelection > policyApplication);
  assert.ok(quota > allowedCallSelection);
  assert.ok(upstream > quota);
  assert.match(source, /requestClientAddress\(request\)/);
  assert.match(source, /rpcCorsResponseHeaders/);
  assert.match(source, /export async function OPTIONS/);
  assert.match(source, /rpcCorsPreflight/);
  assert.match(source, /scope: "rpc-cors-preflight:ip"/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin["']?,\s*["']\*/);
  assert.doesNotMatch(source, /Access-Control-Allow-Credentials/);
});

test("RPC policy persistence is optimistic, tenant-scoped, and audit-redacted", async () => {
  const [database, sql] = await Promise.all([
    readFile(databaseModule, "utf8"),
    readFile(migration, "utf8"),
  ]);
  assert.match(database, /ON CONFLICT\(service_id\) DO UPDATE/);
  assert.match(
    database,
    /developer_rpc_access_policies\.revision = \?/,
  );
  assert.match(database, /update_id = \?/);
  assert.match(database, /rpc_access_policy\.updated/);
  assert.match(database, /allowedOriginsCount/);
  assert.doesNotMatch(
    database.match(
      /const auditDetail = JSON\.stringify\(\{[\s\S]*?\}\);/,
    )?.[0] ?? "",
    /policy\.allowedOrigins(?!\.length)/,
  );
  assert.match(sql, /PRIMARY KEY NOT NULL/);
  assert.match(sql, /ON DELETE cascade/);
  assert.match(sql, /json_valid/);
  assert.match(sql, /revision[^]*>= 1/);
  assert.match(sql, /update_id_unique/);
});
