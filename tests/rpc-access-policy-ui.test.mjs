import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parsePolicyLines,
  parseRpcAccessPolicyEnvelope,
  rpcPolicyDraftProblem,
  rpcPolicyUpdatePayload,
} from "../lib/client/rpc-access-policy.ts";

const panelUrl = new URL(
  "../components/rpc-access-policy-panel.tsx",
  import.meta.url,
);
const consoleUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("RPC policy client contract is exact and rejects mismatched snapshots", () => {
  assert.deepEqual(
    parsePolicyLines(
      " https://app.example.com \n\nhttps://admin.example.com\n",
    ),
    ["https://app.example.com", "https://admin.example.com"],
  );

  const policy = {
    allowedOrigins: ["https://app.example.com"],
    allowedIpCidrs: ["203.0.113.0/24"],
    allowedMethods: ["eth_chainId", "eth_blockNumber"],
  };
  assert.deepEqual(rpcPolicyUpdatePayload(7, policy), {
    revision: 7,
    allowedOrigins: ["https://app.example.com"],
    allowedIpCidrs: ["203.0.113.0/24"],
    allowedMethods: ["eth_chainId", "eth_blockNumber"],
  });
  assert.throws(() => rpcPolicyUpdatePayload(-1, policy));

  const payload = {
    data: {
      serviceId: "service-1",
      network: "base",
      revision: 7,
      policy,
      updatedAt: "2026-07-18T10:00:00.000Z",
    },
    requestId: "request-1",
  };
  assert.deepEqual(
    parseRpcAccessPolicyEnvelope(payload, "service-1", "base"),
    payload.data,
  );
  assert.throws(() =>
    parseRpcAccessPolicyEnvelope(payload, "service-2", "base"),
  );
  assert.throws(() =>
    parseRpcAccessPolicyEnvelope(payload, "service-1", "solana"),
  );
  assert.throws(() =>
    parseRpcAccessPolicyEnvelope(
      {
        data: {
          ...payload.data,
          policy: { ...policy, allowedMethods: "eth_chainId" },
        },
      },
      "service-1",
      "base",
    ),
  );
});

test("RPC policy draft guard rejects wildcards, duplicates, and bad methods", () => {
  const empty = {
    allowedOrigins: [],
    allowedIpCidrs: [],
    allowedMethods: [],
  };
  assert.equal(rpcPolicyDraftProblem(empty), null);
  assert.match(
    rpcPolicyDraftProblem({
      ...empty,
      allowedOrigins: ["https://*.example.com"],
    }),
    /Wildcard origins are not supported/,
  );
  assert.match(
    rpcPolicyDraftProblem({
      ...empty,
      allowedIpCidrs: ["203.0.113.0/24", "203.0.113.0/24"],
    }),
    /duplicate address range/,
  );
  assert.match(
    rpcPolicyDraftProblem({
      ...empty,
      allowedMethods: ["eth call"],
    }),
    /exact RPC method names/,
  );
});

test("selected service policy editor handles load, save, conflict, and accessible reload", async () => {
  const [panel, consoleSource, styles] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(consoleUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(
    panel,
    /\/api\/v1\/developer\/services\/\$\{encodeURIComponent\([\s\S]+serviceId[\s\S]+\)\}\/rpc-access-policy/,
  );
  assert.match(panel, /method: "PUT"/);
  assert.match(panel, /credentials: "same-origin"/);
  assert.match(
    panel,
    /rpcPolicyUpdatePayload\(snapshot\.revision, parsedDraft\)/,
  );
  assert.match(panel, /response\.status === 409/);
  assert.match(panel, /Your edits are still here/);
  assert.match(panel, /Reload the latest revision/);
  assert.match(panel, /Empty means no extra restriction, not public CORS/);
  assert.match(panel, /does not enable cross-origin browser access/);
  assert.match(panel, /never[\s\S]+offers a wildcard origin option/);
  assert.doesNotMatch(panel, /value=["']\*["']/);
  assert.match(panel, /allowedOrigins/);
  assert.match(panel, /allowedIpCidrs/);
  assert.match(panel, /allowedMethods/);
  assert.match(panel, /commonMethods[\s\S]+ethereum[\s\S]+base[\s\S]+solana/);
  assert.match(panel, /methodCatalog\.length > 0/);
  assert.match(panel, /Methods reported by this gateway/);
  assert.match(panel, /event\.key === "Escape"/);
  assert.match(panel, /autoFocus/);
  assert.match(panel, /reloadTriggerRef\.current\?\.focus/);
  assert.match(panel, /async function reloadPolicy\(focusTargetId: string\)/);
  assert.match(panel, /id="rpc-policy-reload-trigger"/);
  assert.match(
    panel,
    /id="rpc-access-policy-title" tabIndex=\{-1\}/,
  );
  assert.match(
    panel,
    /reloadPolicy\("rpc-policy-reload-trigger"\)/,
  );
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /aria-busy=/);

  assert.match(consoleSource, /<RpcAccessPolicyPanel/);
  assert.match(consoleSource, /network=\{selectedRpcNetwork\}/);
  assert.match(consoleSource, /serviceId=\{selectedRpcService\.id\}/);
  assert.match(
    consoleSource,
    /rpcMethodCatalog\([\s\S]+selectedRpcService[\s\S]+\)/,
  );

  assert.match(
    styles,
    /\.rpc-access-policy-actions \.button,[\s\S]+min-height: 44px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]+\.rpc-access-policy-grid textarea[\s\S]+font-size: 16px/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+\.rpc-access-policy/,
  );

  for (const source of [panel, consoleSource, styles]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});
