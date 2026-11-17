import assert from "node:assert/strict";
import test from "node:test";
import { accountIdentityFromHeaders } from "../lib/server/account-identity.ts";

test("verified hosted identity retains its contact email for request ownership", async () => {
  const previous = {
    runtime: process.env.NODEZUNO_RUNTIME,
    legacy: process.env.NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY,
  };
  delete process.env.NODEZUNO_RUNTIME;
  process.env.NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY = "true";
  try {
    const identity = await accountIdentityFromHeaders(
      new Headers({
        "oai-authenticated-user-email": "OWNER@NODEZUNO.COM",
        "oai-authenticated-user-full-name": "Sanjay%20Sudagani",
        "oai-authenticated-user-full-name-encoding":
          "percent-encoded-utf-8",
      }),
    );
    assert.deepEqual(identity, {
      authMethod: "chatgpt",
      contactEmail: "owner@nodezuno.com",
      displayName: "Sanjay Sudagani",
      email: "owner@nodezuno.com",
      fullName: "Sanjay Sudagani",
    });
  } finally {
    restoreEnvironment("NODEZUNO_RUNTIME", previous.runtime);
    restoreEnvironment(
      "NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY",
      previous.legacy,
    );
  }
});

test("unverified hosted headers do not create an account identity", async () => {
  const previous = {
    runtime: process.env.NODEZUNO_RUNTIME,
    legacy: process.env.NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY,
  };
  delete process.env.NODEZUNO_RUNTIME;
  delete process.env.NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY;
  try {
    const identity = await accountIdentityFromHeaders(
      new Headers({
        "oai-authenticated-user-email": "attacker@example.com",
      }),
    );
    assert.equal(identity, null);
  } finally {
    restoreEnvironment("NODEZUNO_RUNTIME", previous.runtime);
    restoreEnvironment(
      "NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY",
      previous.legacy,
    );
  }
});

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
