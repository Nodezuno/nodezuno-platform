import assert from "node:assert/strict";
import test from "node:test";
import {
  verifiedUserFromHeaders,
  verifyCloudflareAccessJwt,
} from "../lib/server/identity.ts";
import {
  clientAddressFromTrustedIngress,
  configuredPublicOrigin,
  requestClientAddress,
} from "../lib/server/runtime-config.ts";

const teamDomain = "https://nodezuno-test.cloudflareaccess.com";
const audience = "0123456789abcdef0123456789abcdef";

async function signingFixture(overrides = {}) {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  publicJwk.alg = "RS256";
  publicJwk.kid = "nodezuno-test-key";
  publicJwk.use = "sig";

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    kid: publicJwk.kid,
    typ: "JWT",
  };
  const payload = {
    aud: audience,
    email: "SANJAY@EXAMPLE.COM",
    exp: now + 300,
    iat: now,
    iss: teamDomain,
    ...overrides,
  };
  const encodedHeader = encodeJson(header);
  const encodedPayload = encodeJson(payload);
  const signed = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(signed),
  );
  return {
    token: `${signed}.${encodeBytes(new Uint8Array(signature))}`,
    jwks: { keys: [publicJwk] },
  };
}

test("container identity verifies a Cloudflare Access RS256 token", async () => {
  const fixture = await signingFixture();
  const user = await verifyCloudflareAccessJwt({
    token: fixture.token,
    teamDomain,
    audience,
    jwks: fixture.jwks,
  });
  assert.deepEqual(user, {
    email: "sanjay@example.com",
    fullName: null,
    displayName: "sanjay@example.com",
  });
});

test("container identity rejects expiry, audience, and signature changes", async () => {
  const expired = await signingFixture({
    exp: Math.floor(Date.now() / 1000) - 120,
  });
  await assert.rejects(
    verifyCloudflareAccessJwt({
      token: expired.token,
      teamDomain,
      audience,
      jwks: expired.jwks,
    }),
    (error) => error?.code === "authentication_invalid",
  );

  const wrongAudience = await signingFixture({ aud: "another-audience" });
  await assert.rejects(
    verifyCloudflareAccessJwt({
      token: wrongAudience.token,
      teamDomain,
      audience,
      jwks: wrongAudience.jwks,
    }),
    (error) => error?.code === "authentication_invalid",
  );

  const valid = await signingFixture();
  const [tokenHeader, tokenPayload, tokenSignature] =
    valid.token.split(".");
  const changedToken = `${tokenHeader}.${tokenPayload}.${
    tokenSignature.startsWith("A") ? "B" : "A"
  }${tokenSignature.slice(1)}`;
  await assert.rejects(
    verifyCloudflareAccessJwt({
      token: changedToken,
      teamDomain,
      audience,
      jwks: valid.jwks,
    }),
    (error) => error?.code === "authentication_invalid",
  );
});

test("container mode ignores forgeable Sites identity headers", async () => {
  const previousRuntime = process.env.NODEZUNO_RUNTIME;
  process.env.NODEZUNO_RUNTIME = "container";
  try {
    const user = await verifiedUserFromHeaders(
      new Headers({
        "oai-authenticated-user-email": "attacker@example.com",
      }),
    );
    assert.equal(user, null);
  } finally {
    restoreEnvironment("NODEZUNO_RUNTIME", previousRuntime);
  }
});

test("downstream client address trusts only the sanitized internal header", () => {
  const trusted = new Request("https://nodezuno.com/api/v1/status", {
    headers: {
      "cf-connecting-ip": "192.0.2.250",
      "x-forwarded-for": "192.0.2.251",
      "x-nodezuno-client-ip": "2001:0db8::42",
    },
  });
  const rawProviderOnly = new Request(
    "https://nodezuno.com/api/v1/status",
    {
      headers: { "cf-connecting-ip": "203.0.113.42" },
    },
  );
  const invalidInternal = new Request(
    "https://nodezuno.com/api/v1/status",
    {
      headers: {
        "x-nodezuno-client-ip": "203.0.113.42, 192.0.2.1",
      },
    },
  );

  assert.equal(requestClientAddress(trusted), "2001:db8::42");
  assert.equal(requestClientAddress(rawProviderOnly), "unknown");
  assert.equal(requestClientAddress(invalidInternal), "unknown");
});

test("trusted ingress derivation uses only the boundary-owned address", () => {
  const direct = new Request(
    "https://nodezuno.com/api/v1/status",
    {
      headers: {
        "cf-connecting-ip": "192.0.2.250",
        "x-forwarded-for": "198.51.100.8, 203.0.113.42",
      },
    },
  );
  const sites = new Request("https://nodezuno.com/api/v1/status", {
    headers: {
      "cf-connecting-ip": "2001:0db8::10",
      "x-forwarded-for": "192.0.2.250",
    },
  });

  assert.equal(
    clientAddressFromTrustedIngress(direct, "direct"),
    "203.0.113.42",
  );
  assert.equal(
    clientAddressFromTrustedIngress(sites, "sites"),
    "2001:db8::10",
  );
});

test("public origin accepts HTTPS and a tightly scoped local preview", () => {
  const previous = {
    runtime: process.env.NODEZUNO_RUNTIME,
    origin: process.env.PUBLIC_ORIGIN,
    preview: process.env.NODEZUNO_LOCAL_PREVIEW,
  };
  process.env.NODEZUNO_RUNTIME = "container";
  try {
    process.env.PUBLIC_ORIGIN = "https://nodezuno.com";
    delete process.env.NODEZUNO_LOCAL_PREVIEW;
    assert.equal(configuredPublicOrigin(), "https://nodezuno.com");

    process.env.PUBLIC_ORIGIN = "http://localhost:3000";
    assert.equal(configuredPublicOrigin(), null);
    process.env.NODEZUNO_LOCAL_PREVIEW = "true";
    assert.equal(configuredPublicOrigin(), "http://localhost:3000");

    process.env.PUBLIC_ORIGIN = "http://nodezuno.example";
    assert.equal(configuredPublicOrigin(), null);
    for (const invalid of [
      " https://nodezuno.com",
      "https://user:secret@nodezuno.com",
      "https://127.0.0.1",
      "https://nodezuno.internal",
    ]) {
      process.env.PUBLIC_ORIGIN = invalid;
      assert.equal(configuredPublicOrigin(), null);
    }
  } finally {
    restoreEnvironment("NODEZUNO_RUNTIME", previous.runtime);
    restoreEnvironment("PUBLIC_ORIGIN", previous.origin);
    restoreEnvironment("NODEZUNO_LOCAL_PREVIEW", previous.preview);
  }
});

function encodeJson(value) {
  return encodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBytes(value) {
  return Buffer.from(value).toString("base64url");
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
