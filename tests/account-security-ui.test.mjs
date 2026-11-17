import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("account page mounts provider-aware security for every identity", async () => {
  const source = await readFile("app/account/page.tsx", "utf8");
  assert.match(source, /<AccountSecurity/);
  assert.match(source, /authMethod=\{user\.authMethod \?\? "chatgpt"\}/);
  assert.match(source, /betterAuthManaged=\{Boolean\(user\.accountId\)\}/);
  assert.match(
    source,
    /emailRecoveryAvailable=\{providers\.emailVerification\}/,
  );
  assert.match(source, /identitySignOutPath\("\/"\)/);
  assert.match(source, /href="\/account#security"/);
});

test("security controls call supported Better Auth routes", async () => {
  const source = await readFile("components/account-security.tsx", "utf8");
  for (const route of [
    "/api/auth/get-session",
    "/api/auth/list-sessions",
    "/api/auth/revoke-session",
    "/api/auth/revoke-other-sessions",
    "/api/auth/revoke-sessions",
    "/api/auth/change-password",
    "/api/auth/sign-out",
  ]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(source, /authMethod === "email"/);
  assert.match(source, /authMethod === "google"/);
  assert.match(source, /authMethod === "evm" \|\| authMethod === "solana"/);
  assert.match(source, /ChatGPT manages this session/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /autoComplete="current-password"/);
  assert.match(source, /autoComplete="new-password"/);
  assert.doesNotMatch(source, /\u2014/);
});
