import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const secretValues = {
  RATE_LIMIT_SECRET: "rate-7c4e91b2f8a563d09e17c42bQx42",
  BETTER_AUTH_SECRET: "auth-6e2b94f1c8073a5d29e14f68Lm91",
  REVIEW_CAPABILITY_SECRET: "review-8c5a31d7f0e426b9a53c18d2Qx",
  NODEZUNO_ORIGIN_SECRET: "origin-93f0a76d1b4c825e7f6a30d1Vk",
};

function runPreflight(overrides = {}) {
  return spawnSync(
    process.execPath,
    ["scripts/preflight-review-application.mjs"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        NODEZUNO_RUNTIME: "container",
        NODEZUNO_LOCAL_PREVIEW: "false",
        NODEZUNO_DOMAIN: "nodezuno.com",
        NODEZUNO_LEGAL_LAUNCH_APPROVED: "true",
        NODEZUNO_PUBLIC_INDEXING: "false",
        PUBLIC_ORIGIN: "https://nodezuno.com",
        BETTER_AUTH_URL: "https://nodezuno.com",
        NODEZUNO_ADMIN_EMAILS: "info@nodezuno.com",
        ZOHO_SMTP_HOST: "smtp.zoho.in",
        ZOHO_SMTP_PASSWORD: "zoho-app-password-for-test",
        NODEZUNO_STABLECOIN_PAYMENT_MODE: "ethereum_mainnet",
        NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON: JSON.stringify([
          {
            name: "payment-mainnet-primary",
            provider: "primary-provider",
            url: "https://ethereum-rpc.example/rpc",
            headers: {},
            timeoutMs: 8_000,
          },
          {
            name: "payment-mainnet-secondary",
            provider: "secondary-provider",
            url: "https://ethereum-rpc-secondary.example/rpc",
            headers: {},
            timeoutMs: 8_000,
          },
        ]),
        NODEZUNO_PAYMENT_CONFIRMATIONS: "12",
        AWS_REGION: "ap-south-1",
        NODEZUNO_DELIVERABLE_BUCKET: "nodezuno-production-deliverables-012345678901",
        NODEZUNO_DELIVERABLE_KMS_KEY_ARN: "arn:aws:kms:ap-south-1:012345678901:key/01234567-89ab-4cde-8fab-0123456789ab",
        CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
        CLOUDFLARE_D1_DATABASE_ID:
          "01234567-89ab-4cde-8fab-0123456789ab",
        CLOUDFLARE_D1_API_TOKEN:
          "D1token-0123456789abcdef0123456789abcdef",
        CF_ACCESS_TEAM_DOMAIN: "https://nodezuno.cloudflareaccess.com",
        CF_ACCESS_AUDIENCE: "audience-0123456789abcdef",
        ...secretValues,
        ...overrides,
      },
    },
  );
}

test("application preflight reports only named boolean checks", () => {
  const result = runPreflight();
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ready, true);
  assert.equal(payload.runtime, "container");
  assert.ok(Object.values(payload.checks).every(Boolean));
  assert.equal(payload.checks.stablecoinPayments, true);
  assert.deepEqual(payload.publicIndexing, {
    requested: false,
    legalLaunchApproved: true,
    effective: false,
    state: "disabled",
  });
  for (const secret of Object.values(secretValues)) {
    assert.doesNotMatch(result.stdout, new RegExp(secret));
    assert.doesNotMatch(result.stderr, new RegExp(secret));
  }
});

test("application preflight accepts a private deployment with payments disabled", () => {
  const result = runPreflight({
    NODEZUNO_LEGAL_LAUNCH_APPROVED: "false",
    NODEZUNO_STABLECOIN_PAYMENT_MODE: "disabled",
    NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON: "",
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ready, true);
  assert.equal(payload.checks.legalLaunchBoundary, true);
  assert.equal(payload.checks.stablecoinPayments, true);
  assert.equal(payload.publicIndexing.state, "disabled");
});

test("application preflight gates enabled Ethereum payment verification", () => {
  for (const overrides of [
    { NODEZUNO_LEGAL_LAUNCH_APPROVED: "false" },
    { NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON: "[]" },
    {
      NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON: JSON.stringify([
        {
          name: "payment-mainnet-only",
          provider: "only-provider",
          url: "https://ethereum-rpc.example/rpc",
          headers: {},
          timeoutMs: 8_000,
        },
      ]),
    },
    { NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON: "not-json" },
  ]) {
    const result = runPreflight(overrides);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ready, false);
    assert.equal(payload.checks.stablecoinPayments, false);
  }
});

test("application preflight gates public indexing on legal launch approval", () => {
  const blocked = runPreflight({
    NODEZUNO_LEGAL_LAUNCH_APPROVED: "false",
    NODEZUNO_PUBLIC_INDEXING: "true",
    NODEZUNO_STABLECOIN_PAYMENT_MODE: "disabled",
    NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON: "",
  });
  assert.equal(blocked.status, 1);
  const blockedPayload = JSON.parse(blocked.stdout);
  assert.equal(blockedPayload.checks.legalLaunchBoundary, false);
  assert.equal(blockedPayload.publicIndexing.state, "blocked");
  assert.equal(blockedPayload.publicIndexing.effective, false);

  const approved = runPreflight({ NODEZUNO_PUBLIC_INDEXING: "true" });
  assert.equal(approved.status, 0, approved.stderr);
  const approvedPayload = JSON.parse(approved.stdout);
  assert.equal(approvedPayload.publicIndexing.state, "enabled");
  assert.equal(approvedPayload.publicIndexing.effective, true);

  const invalid = runPreflight({ NODEZUNO_PUBLIC_INDEXING: "TRUE" });
  assert.equal(invalid.status, 1);
  const invalidPayload = JSON.parse(invalid.stdout);
  assert.equal(invalidPayload.checks.indexingFlagsValid, false);
  assert.equal(invalidPayload.publicIndexing.state, "invalid");
});

test("application preflight fails closed for incoherent configuration", () => {
  const result = runPreflight({
    NODEZUNO_ORIGIN_SECRET: secretValues.RATE_LIMIT_SECRET,
    BETTER_AUTH_URL: "https://wrong.example",
  });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ready, false);
  assert.equal(payload.checks.secretIsolation, false);
  assert.equal(payload.checks.accountAuthentication, false);
});

test("application preflight requires the public origin to match the deployment domain", () => {
  const result = runPreflight({ NODEZUNO_DOMAIN: "wrong.nodezuno.com" });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).checks.publicOrigin, false);
});

test("application preflight accepts the persistent SQLite driver", () => {
  const result = runPreflight({
    NODEZUNO_INGRESS_MODE: "direct",
    NODEZUNO_ORIGIN_SECRET: "",
    NODEZUNO_DATABASE_DRIVER: "sqlite",
    NODEZUNO_SQLITE_PATH:
      "/var/lib/nodezuno/nodezuno.sqlite",
    CF_ACCESS_TEAM_DOMAIN: "",
    CF_ACCESS_AUDIENCE: "",
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ready, true);
  assert.equal(payload.checks.databaseConnection, true);
  assert.equal(payload.checks.ingressBoundary, true);

  const invalid = runPreflight({
    NODEZUNO_INGRESS_MODE: "direct",
    NODEZUNO_ORIGIN_SECRET: "",
    NODEZUNO_DATABASE_DRIVER: "sqlite",
    NODEZUNO_SQLITE_PATH: "../nodezuno.sqlite",
  });
  assert.equal(invalid.status, 1);
  assert.equal(
    JSON.parse(invalid.stdout).checks.databaseConnection,
    false,
  );
});
