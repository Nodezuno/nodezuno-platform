import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolveRpcCredentialState,
  rpcRecoveryKeyPayload,
} from "../lib/client/rpc-credential-recovery.ts";

const consoleSourceUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("RPC readiness requires a usable raw credential in this tab", () => {
  assert.equal(
    resolveRpcCredentialState({
      activeKeyExists: false,
      gatewayReady: true,
      rawSecretAvailable: false,
    }),
    "setup-incomplete",
  );
  assert.equal(
    resolveRpcCredentialState({
      activeKeyExists: true,
      gatewayReady: false,
      rawSecretAvailable: true,
    }),
    "setup-incomplete",
  );
  assert.equal(
    resolveRpcCredentialState({
      activeKeyExists: true,
      gatewayReady: true,
      rawSecretAvailable: false,
    }),
    "saved-key-required",
  );
  assert.equal(
    resolveRpcCredentialState({
      activeKeyExists: true,
      gatewayReady: true,
      rawSecretAvailable: true,
    }),
    "credential-in-tab",
  );
});

test("recovery creates one scoped key without requesting key revocation", () => {
  assert.deepEqual(rpcRecoveryKeyPayload("service-ethereum"), {
    name: "Ethereum recovery key",
    serviceId: "service-ethereum",
  });
  assert.deepEqual(
    rpcRecoveryKeyPayload("service-base", "Base recovery key"),
    {
      name: "Base recovery key",
      serviceId: "service-base",
    },
  );
  assert.deepEqual(
    rpcRecoveryKeyPayload("service-solana", "Solana recovery key"),
    {
      name: "Solana recovery key",
      serviceId: "service-solana",
    },
  );
});

test("lost-secret recovery is explicit, accessible, and keeps manual guidance", async () => {
  const [source, styles] = await Promise.all([
    readFile(consoleSourceUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(
    source,
    /rpcFirstRequestReady\s*=\s*[\s\S]*rpcCredentialState === "credential-in-tab"/,
  );
  assert.match(source, /rpcSavedKeyRequired/);
  assert.match(source, /The existing raw secret cannot be shown again/);
  assert.match(source, /Export it as/);
  assert.match(source, /NODEZUNO_API_KEY/);
  assert.match(source, /Create a new service-bound key/);
  assert.match(source, /Confirm new key/);
  assert.match(
    source,
    /This does not reveal, revoke, or[\s\S]+modify any existing key/,
  );
  assert.match(source, /aria-describedby="rpc-recovery-warning"/);
  assert.match(source, /autoFocus/);
  assert.match(
    source,
    /event\.key === "Escape"[\s\S]+cancelRpcRecoveryConfirmation/,
  );
  assert.match(source, /restoreActionFocus\("rpc-recovery-key-trigger"\)/);
  assert.match(
    source,
    /Existing keys remain active until you explicitly revoke them/,
  );

  const recoveryStart = source.indexOf("async function createRpcRecoveryKey");
  const recoveryEnd = source.indexOf(
    "async function refreshOperatorData",
    recoveryStart,
  );
  assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart);
  const recoveryFunction = source.slice(recoveryStart, recoveryEnd);
  assert.match(
    recoveryFunction,
    /postIdempotentControlPlane<SecretReceipt>\([\s\S]+"rpc-recovery-key"[\s\S]+"api-key\.create"[\s\S]+\/api\/v1\/developer\/api-keys/,
  );
  assert.match(
    recoveryFunction,
    /rpcRecoveryKeyPayload\([\s\S]+selectedRpcService\.id,[\s\S]+selectedRpcDescriptor\.recoveryKeyName/,
  );
  assert.doesNotMatch(recoveryFunction, /method:\s*"DELETE"|revokeApiKey/);

  assert.match(styles, /\.rpc-credential-recovery/);
  assert.match(styles, /\.rpc-credential-recovery-actions a[\s\S]+min-height: 44px/);
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]+?\.rpc-credential-recovery-confirm/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+?\.rpc-credential-recovery/,
  );

  for (const text of [source, styles]) {
    assert.doesNotMatch(text, /\u2014/);
  }
});
