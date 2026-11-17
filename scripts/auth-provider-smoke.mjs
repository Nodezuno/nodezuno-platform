import assert from "node:assert/strict";
import { ed25519 } from "@noble/curves/ed25519.js";
import { createSignInMessage } from "@solana/wallet-standard-util";
import bs58 from "bs58";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

const base = normalizeLocalOrigin(
  process.argv.slice(2).find((value) => value !== "--") ??
    "http://localhost:3000",
);
const statement =
  "Sign in to Nodezuno. This request does not create a transaction or cost gas.";

const emailAddress = `auth-smoke-${crypto.randomUUID()}@nodezuno.local`;
const emailSignup = await postAuth("/sign-up/email", {
  callbackURL: "/console",
  email: emailAddress,
  name: "Nodezuno auth smoke",
  password: "correct horse battery staple",
});
assert.equal(emailSignup.response.status, 200);
const emailCookie = sessionCookie(emailSignup.response);
const emailSession = await applicationSession(emailCookie);
assert.equal(emailSession.authMethod, "email");
assert.equal(emailSession.contactEmail, emailAddress);

const evm = privateKeyToAccount(
  "0x59c6995e998f97a5a0044976f7ad3f3b66c4c35f06bd5f61e92dca5dcf9e85c5",
);
const evmNonce = await postAuth("/siwe/nonce", {
  walletAddress: evm.address,
  chainId: 1,
});
assert.equal(evmNonce.response.status, 200);
assert.match(evmNonce.payload.nonce, /^[0-9a-f]{32}$/);
const issuedAt = new Date();
const evmMessage = createSiweMessage({
  address: evm.address,
  chainId: 1,
  domain: base.host,
  scheme: "http",
  nonce: evmNonce.payload.nonce,
  uri: base.origin,
  version: "1",
  statement,
  issuedAt,
  expirationTime: new Date(issuedAt.getTime() + 5 * 60 * 1000),
});
const evmSignature = await evm.signMessage({ message: evmMessage });
const evmLogin = await postAuth("/siwe/verify", {
  message: evmMessage,
  signature: evmSignature,
  walletAddress: evm.address,
  chainId: 1,
});
assert.equal(evmLogin.response.status, 200);
const evmCookie = sessionCookie(evmLogin.response);
const evmSession = await applicationSession(evmCookie);
assert.equal(evmSession.authMethod, "evm");
assert.equal(evmSession.walletAddress?.toLowerCase(), evm.address.toLowerCase());
const evmReplay = await postAuth("/siwe/verify", {
  message: evmMessage,
  signature: evmSignature,
  walletAddress: evm.address,
  chainId: 1,
});
assert.equal(evmReplay.response.status, 401);

const solanaPrivateKey = crypto.getRandomValues(new Uint8Array(32));
const solanaAddress = bs58.encode(
  ed25519.getPublicKey(solanaPrivateKey),
);
const solanaNonce = await postAuth("/solana/nonce", {
  address: solanaAddress,
});
assert.equal(solanaNonce.response.status, 200);
assert.equal(solanaNonce.payload.input.address, solanaAddress);
const solanaMessage = createSignInMessage(solanaNonce.payload.input);
const solanaSignature = ed25519.sign(
  solanaMessage,
  solanaPrivateKey,
);
const solanaLogin = await postAuth("/solana/verify", {
  address: solanaAddress,
  signedMessage: encodeBase64Url(solanaMessage),
  signature: encodeBase64Url(solanaSignature),
  signatureType: "ed25519",
});
assert.equal(solanaLogin.response.status, 200);
const solanaCookie = sessionCookie(solanaLogin.response);
const solanaSession = await applicationSession(solanaCookie);
assert.equal(solanaSession.authMethod, "solana");
assert.equal(solanaSession.walletAddress, solanaAddress);
const solanaReplay = await postAuth("/solana/verify", {
  address: solanaAddress,
  signedMessage: encodeBase64Url(solanaMessage),
  signature: encodeBase64Url(solanaSignature),
  signatureType: "ed25519",
});
assert.equal(solanaReplay.response.status, 401);

console.log(
  JSON.stringify({
    email: "signed-up-and-session-verified",
    evm: "signature-verified-and-replay-rejected",
    solana: "signature-verified-and-replay-rejected",
  }),
);

async function postAuth(pathname, body) {
  const response = await fetch(
    new URL(`/api/auth${pathname}`, base),
    {
      method: "POST",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: base.origin,
      },
      body: JSON.stringify(body),
    },
  );
  let payload = null;
  try {
    payload = await response.clone().json();
  } catch {
    payload = null;
  }
  return { response, payload };
}

async function applicationSession(cookie) {
  const response = await fetch(
    new URL("/api/v1/auth/session", base),
    {
      headers: {
        Accept: "application/json",
        Cookie: cookie,
      },
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.data.user);
  return payload.data.user;
}

function sessionCookie(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = values
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
  assert.match(cookie, /nodezuno\.session_token=/);
  return cookie;
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function normalizeLocalOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Use an absolute loopback URL for the auth smoke suite.");
  }
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "The auth smoke suite refuses every non-loopback or non-HTTP target.",
    );
  }
  return url;
}
