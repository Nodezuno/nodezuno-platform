import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ACCOUNT_DATA_EXPORT_FRESH_SESSION_MS,
  ACCOUNT_DATA_EXPORT_MAX_BYTES,
  ACCOUNT_DATA_EXPORT_RATE_LIMIT,
  ACCOUNT_DATA_EXPORT_RATE_WINDOW_MS,
  accountDataExportDownloadResponse,
  buildAccountDataExport,
  hardenAccountDataExportResponse,
  requireFreshApplicationAccountSession,
} from "../lib/server/account-data-export.ts";
import { createNodezunoAuth } from "../lib/server/auth.ts";
import { consumeRateLimit } from "../lib/server/database.ts";
import { assertSameOrigin, HttpProblem } from "../lib/server/http.ts";

const accountA = "11111111-1111-4111-8111-111111111111";
const accountB = "22222222-2222-4222-8222-222222222222";
const workspaceA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workspaceC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const serviceA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const serviceB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const serviceC = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const keyA = "12345678-1234-4234-8234-1234567890ab";
const keyB = "22345678-1234-4234-8234-1234567890ab";
const keyC = "32345678-1234-4234-8234-1234567890ab";
const recordedAt = 1_800_000_000_000;

test("account export contains current account and review data, excluding legacy platform rows", async () => {
  const database = await createMigratedD1();
  await seedAccountExportFixture(database.database);

  const data = await buildAccountDataExport({
    accountId: accountA,
    currentSessionId: "session-a",
    database,
    exportedAt: recordedAt + 50_000,
  });

  assert.equal(data.account.id, accountA);
  assert.equal(data.account.email, "caller@example.com");
  assert.deepEqual(
    data.submissions.map((submission) => submission.id),
    ["submission-a"],
  );
  assert.equal(data.schemaVersion, "6");
  for (const retiredField of [
    "workspaces",
    "memberships",
    "services",
    "apiKeys",
    "accessPolicies",
    "auditEvents",
    "usage",
  ]) {
    assert.equal(Object.hasOwn(data, retiredField), false);
  }
  assert.deepEqual(
    data.reviewOrders.map((order) => order.id),
    ["review-order-a"],
  );
  assert.equal(data.reviewOrders[0].telegramUsername, "@callerops");
  assert.deepEqual(
    data.stablecoinPaymentIntents.map((intent) => intent.id),
    ["stablecoin-intent-a"],
  );
  assert.equal(data.stablecoinPaymentIntents[0].tokenAmountAtomic, "3750000001");
  assert.deepEqual(
    data.stablecoinPaymentClaims.map((claim) => claim.id),
    ["stablecoin-claim-a"],
  );
  assert.equal(data.stablecoinPaymentClaims[0].telegramUsername, "@callerops");
  assert.deepEqual(data.stablecoinPaymentReconciliations, []);
  assert.deepEqual(data.stablecoinPaymentConfirmations, []);
  assert.equal(
    data.stablecoinPaymentClaims[0].transactionHash,
    `0x${"a".repeat(64)}`,
  );
  assert.equal(data.redactions.paymentVerificationWorkerLeases, true);
  assert.equal(data.redactions.paymentReconciliationOperatorIdentity, true);
  assert.equal(data.redactions.paymentVerifierCredentials, true);
  assert.equal(data.sessions.length, 1);
  assert.deepEqual(data.sessions[0], {
    id: "session-a",
    current: true,
    createdAt: new Date(recordedAt).toISOString(),
    updatedAt: new Date(recordedAt + 1_000).toISOString(),
    expiresAt: new Date(recordedAt + 86_400_000).toISOString(),
    networkAddressRecorded: true,
    userAgentRecorded: true,
  });

  const serialized = JSON.stringify(data);
  for (const forbiddenValue of [
    "EXTERNAL_ACCOUNT_ID_A",
    "ACCESS_TOKEN_A",
    "REFRESH_TOKEN_A",
    "ID_TOKEN_A",
    "PASSWORD_DIGEST_A",
    "SESSION_TOKEN_A",
    "203.0.113.10",
    "Private browser A",
    "SERVICE_CONFIGURATION_A",
    "API_KEY_DIGEST_A",
    "JOINED_KEY_DIGEST",
    "AUDIT_DETAIL_A",
    "https://private.example",
    "10.0.0.0/8",
    "SUBMISSION_METADATA_A",
    "SUBMISSION_REQUEST_DIGEST_A",
    "SUBMISSION_IDEMPOTENCY_A",
    "SUBMISSION_IP_DIGEST_A",
    "SUBMISSION_AGENT_DIGEST_A",
    "FOREIGN_TENANT_MARKER",
    "@foreigntenant",
    `0x${"b".repeat(64)}`,
    accountB,
    workspaceB,
    serviceB,
    keyB,
  ]) {
    assert.doesNotMatch(serialized, new RegExp(escapeRegex(forbiddenValue)));
  }

  const propertyNames = collectPropertyNames(data);
  for (const forbiddenProperty of [
    "accessToken",
    "refreshToken",
    "idToken",
    "password",
    "token",
    "secret",
    "secretHash",
    "ipAddress",
    "userAgent",
    "configuration",
    "detail",
    "requestHash",
    "idempotencyKey",
    "ipHash",
    "userAgentHash",
    "metadata",
  ]) {
    assert.equal(
      propertyNames.has(forbiddenProperty),
      false,
      `${forbiddenProperty} must not appear in the export contract`,
    );
  }
});

test("download response is bounded and carries strict private headers", async () => {
  const database = await createMigratedD1();
  await seedAccountExportFixture(database.database);
  const data = await buildAccountDataExport({
    accountId: accountA,
    currentSessionId: "session-a",
    database,
    exportedAt: recordedAt + 50_000,
  });
  const response = accountDataExportDownloadResponse({
    data,
    requestId: "request-export-1",
    rateLimitRemaining: 2,
  });

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0, must-revalidate",
  );
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="nodezuno-account-export-2027-01-15.json"',
  );
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-ratelimit-limit"), "3");
  assert.equal(response.headers.get("x-ratelimit-remaining"), "2");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");
  const body = await response.text();
  assert.ok(Buffer.byteLength(body) <= ACCOUNT_DATA_EXPORT_MAX_BYTES);
  assert.equal(JSON.parse(body).data.account.id, accountA);

  const oversized = {
    ...data,
    submissions: [
      {
        ...data.submissions[0],
        message: "x".repeat(ACCOUNT_DATA_EXPORT_MAX_BYTES),
      },
    ],
  };
  assert.throws(
    () =>
      accountDataExportDownloadResponse({
        data: oversized,
        requestId: "request-export-oversized",
        rateLimitRemaining: 1,
      }),
    (error) =>
      error instanceof HttpProblem &&
      error.code === "account_export_too_large",
  );

  const problem = hardenAccountDataExportResponse(
    new Response("{}", {
      status: 403,
      headers: { "Content-Type": "application/problem+json" },
    }),
  );
  assert.equal(problem.headers.get("cache-control"), "private, no-store, max-age=0, must-revalidate");
  assert.equal(problem.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.equal(problem.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
});

test("fresh application sessions are accepted while stale and hosted identities fail", async () => {
  const database = await createMigratedD1();
  const previousEnvironment = snapshotEnvironment([
    "NODEZUNO_RUNTIME",
    "NODEZUNO_LOCAL_PREVIEW",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "PUBLIC_ORIGIN",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "ZOHO_SMTP_PASSWORD",
    "ZOHO_SMTP_HOST",
  ]);
  const origin = "http://localhost:3000";
  try {
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_LOCAL_PREVIEW = "true";
    process.env.BETTER_AUTH_SECRET =
      "account-export-test-secret-with-more-than-32-characters";
    process.env.BETTER_AUTH_URL = origin;
    process.env.PUBLIC_ORIGIN = origin;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.ZOHO_SMTP_PASSWORD;
    delete process.env.ZOHO_SMTP_HOST;

    const auth = await createNodezunoAuth(
      new Request(`${origin}/api/auth/sign-up/email`),
      database,
    );
    const signUp = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify({
          callbackURL: "/account",
          email: "fresh-export@example.com",
          name: "Fresh Export",
          password: "correct horse battery staple",
        }),
      }),
    );
    assert.equal(signUp.status, 200);
    const cookie = requestCookie(signUp.headers.getSetCookie().join("; "));
    const now = Date.now();
    const request = new Request(`${origin}/api/v1/account/export`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
      },
    });

    const identity = await requireFreshApplicationAccountSession(request, {
      database,
      now,
    });
    assert.match(identity.accountId, /^[0-9a-f-]{36}$/);
    assert.ok(identity.currentSessionId);

    await database
      .prepare(
        `UPDATE auth_sessions
         SET created_at = ?
         WHERE id = ?`,
      )
      .bind(
        now - ACCOUNT_DATA_EXPORT_FRESH_SESSION_MS,
        identity.currentSessionId,
      )
      .run();
    await assert.rejects(
      requireFreshApplicationAccountSession(request, {
        database,
        now,
      }),
      (error) =>
        error instanceof HttpProblem &&
        error.code === "session_not_fresh",
    );

    const hostedOnlyRequest = new Request(
      `${origin}/api/v1/account/export`,
      {
        method: "POST",
        headers: {
          Origin: origin,
          "oai-authenticated-user-email": "hosted@example.com",
        },
      },
    );
    await assert.rejects(
      requireFreshApplicationAccountSession(hostedOnlyRequest, {
        database,
        now,
      }),
      (error) =>
        error instanceof HttpProblem &&
        error.code === "authentication_required",
    );
  } finally {
    restoreEnvironment(previousEnvironment);
  }
});

test("account export rate policy allows three hourly attempts and rejects the fourth", async () => {
  const database = await createMigratedD1();
  const now = recordedAt;
  for (
    let attempt = 1;
    attempt <= ACCOUNT_DATA_EXPORT_RATE_LIMIT;
    attempt += 1
  ) {
    const result = await consumeRateLimit({
      scope: "account-data-export:create:identity",
      subjectHash: "caller-private-digest",
      limit: ACCOUNT_DATA_EXPORT_RATE_LIMIT,
      windowMs: ACCOUNT_DATA_EXPORT_RATE_WINDOW_MS,
      now,
      database,
    });
    assert.equal(
      result.remaining,
      ACCOUNT_DATA_EXPORT_RATE_LIMIT - attempt,
    );
  }
  await assert.rejects(
    consumeRateLimit({
      scope: "account-data-export:create:identity",
      subjectHash: "caller-private-digest",
      limit: ACCOUNT_DATA_EXPORT_RATE_LIMIT,
      windowMs: ACCOUNT_DATA_EXPORT_RATE_WINDOW_MS,
      now,
      database,
    }),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 429 &&
      error.code === "rate_limit_exceeded" &&
      new Headers(error.headers).get("retry-after") === "3600",
  );
});

test("account export route and UI keep origin, rate, and hosted behavior explicit", async () => {
  const [route, component, accountPage, apiReference] = await Promise.all([
    readFile("app/api/v1/account/export/route.ts", "utf8"),
    readFile("components/account-data-export.tsx", "utf8"),
    readFile("app/account/page.tsx", "utf8"),
    readFile("docs/API.md", "utf8"),
  ]);

  assert.match(route, /export async function POST/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requireFreshApplicationAccountSession/);
  assert.match(route, /scope: "account-data-export:create:identity"/);
  assert.match(route, /ACCOUNT_DATA_EXPORT_RATE_LIMIT/);
  assert.match(route, /hardenAccountDataExportResponse/);
  assert.doesNotMatch(route, /export async function DELETE/);

  assert.match(component, /fetch\(exportEndpoint/);
  assert.match(component, /method: "POST"/);
  assert.match(component, /credentials: "same-origin"/);
  assert.match(component, /cache: "no-store"/);
  assert.match(component, /URL\.createObjectURL/);
  assert.match(component, /anchor\.download = exportFilename/);
  assert.match(component, /ChatGPT account stays with ChatGPT/);
  assert.match(component, /Create a Nodezuno account/);
  assert.match(component, /session_not_fresh/);
  assert.match(accountPage, /<AccountDataExport/);
  assert.match(accountPage, /href="\/account#data-export"/);

  assert.match(apiReference, /POST \| `\/api\/v1\/account\/export`/);
  assert.doesNotMatch(
    `${route}\n${component}\n${accountPage}\n${apiReference}`,
    /\u2014/,
  );

  assert.throws(
    () =>
      assertSameOrigin(
        new Request("https://nodezuno.com/api/v1/account/export", {
          method: "POST",
          headers: {
            Origin: "https://attacker.example",
            "Sec-Fetch-Site": "cross-site",
          },
        }),
      ),
    (error) =>
      error instanceof HttpProblem &&
      error.code === "cross_origin_request",
  );
});

async function seedAccountExportFixture(sqlite) {
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const insert = (sql, ...values) => sqlite.prepare(sql).run(...values);
    insert(
      `INSERT INTO auth_users
        (id, name, email, email_verified, image, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      accountA,
      "Caller Account",
      "caller@example.com",
      "https://profiles.example/caller.png",
      recordedAt,
      recordedAt + 1_000,
    );
    insert(
      `INSERT INTO auth_users
        (id, name, email, email_verified, image, created_at, updated_at)
       VALUES (?, ?, ?, 1, NULL, ?, ?)`,
      accountB,
      "FOREIGN_TENANT_MARKER",
      "foreign@example.com",
      recordedAt,
      recordedAt + 1_000,
    );
    insert(
      `INSERT INTO auth_accounts
        (id, account_id, provider_id, user_id, access_token, refresh_token,
         id_token, access_token_expires_at, refresh_token_expires_at, scope,
         password, created_at, updated_at)
       VALUES (?, ?, 'credential', ?, ?, ?, ?, ?, ?, 'openid', ?, ?, ?)`,
      "linked-a",
      "EXTERNAL_ACCOUNT_ID_A",
      accountA,
      "ACCESS_TOKEN_A",
      "REFRESH_TOKEN_A",
      "ID_TOKEN_A",
      recordedAt + 100_000,
      recordedAt + 200_000,
      "PASSWORD_DIGEST_A",
      recordedAt,
      recordedAt + 1_000,
    );
    insert(
      `INSERT INTO auth_accounts
        (id, account_id, provider_id, user_id, access_token, refresh_token,
         id_token, access_token_expires_at, refresh_token_expires_at, scope,
         password, created_at, updated_at)
       VALUES (?, ?, 'google', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      "linked-b",
      "FOREIGN_TENANT_MARKER",
      accountB,
      "FOREIGN_TENANT_MARKER",
      recordedAt,
      recordedAt + 1_000,
    );
    insert(
      `INSERT INTO auth_sessions
        (id, expires_at, token, created_at, updated_at, ip_address,
         user_agent, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      "session-a",
      recordedAt + 86_400_000,
      "SESSION_TOKEN_A",
      recordedAt,
      recordedAt + 1_000,
      "203.0.113.10",
      "Private browser A",
      accountA,
    );
    insert(
      `INSERT INTO auth_sessions
        (id, expires_at, token, created_at, updated_at, ip_address,
         user_agent, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      "session-b",
      recordedAt + 86_400_000,
      "FOREIGN_TENANT_MARKER",
      recordedAt,
      recordedAt + 1_000,
      "198.51.100.20",
      "FOREIGN_TENANT_MARKER",
      accountB,
    );
    insert(
      `INSERT INTO auth_wallet_addresses
        (id, user_id, address, chain_id, is_primary, created_at)
       VALUES ('evm-a', ?, '0x1111111111111111111111111111111111111111',
               1, 1, ?)`,
      accountA,
      recordedAt,
    );
    insert(
      `INSERT INTO auth_solana_wallets
        (id, user_id, address, is_primary, created_at)
       VALUES ('sol-a', ?, '11111111111111111111111111111111', 1, ?)`,
      accountA,
      recordedAt,
    );

    for (const [id, slug, name] of [
      [workspaceA, "caller-workspace", "Caller workspace"],
      [workspaceB, "foreign-workspace", "FOREIGN_TENANT_MARKER"],
      [workspaceC, "joined-workspace", "Joined workspace"],
    ]) {
      insert(
        `INSERT INTO developer_workspaces
          (id, slug, name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
        id,
        slug,
        name,
        recordedAt,
        recordedAt + 1_000,
      );
    }
    insert(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('member-a-owner', ?, ?, 'caller@example.com', 'owner', ?, ?)`,
      workspaceA,
      accountA,
      recordedAt,
      recordedAt + 1_000,
    );
    insert(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('member-b-admin', ?, ?, 'foreign@example.com', 'admin', ?, ?)`,
      workspaceA,
      accountB,
      recordedAt,
      recordedAt + 1_000,
    );
    insert(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('member-b-owner', ?, ?, 'foreign@example.com', 'owner', ?, ?)`,
      workspaceB,
      accountB,
      recordedAt,
      recordedAt + 1_000,
    );
    insert(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('member-a-developer', ?, ?, 'caller@example.com', 'developer', ?, ?)`,
      workspaceC,
      accountA,
      recordedAt,
      recordedAt + 1_000,
    );

    for (const [id, workspaceId, name, configuration] of [
      [serviceA, workspaceA, "Caller RPC", '{"private":"SERVICE_CONFIGURATION_A"}'],
      [serviceB, workspaceB, "FOREIGN_TENANT_MARKER", '{"private":"FOREIGN_TENANT_MARKER"}'],
      [serviceC, workspaceC, "Joined RPC", "{}"],
    ]) {
      insert(
        `INSERT INTO developer_services
          (id, workspace_id, product, name, environment, network, region,
           status, endpoint_path, configuration_json,
           created_by_account_id, created_at, updated_at, archived_at)
         VALUES (?, ?, 'rpc-api', ?, 'production', 'ethereum', 'global',
                 'active', ?, ?, ?, ?, ?, NULL)`,
        id,
        workspaceId,
        name,
        `/api/v1/rpc/${id}`,
        configuration,
        workspaceId === workspaceB ? accountB : accountA,
        recordedAt,
        recordedAt + 1_000,
      );
    }

    for (const [id, workspaceId, serviceId, name, digest] of [
      [keyA, workspaceA, serviceA, "Caller key", "API_KEY_DIGEST_A"],
      [keyB, workspaceB, serviceB, "FOREIGN_TENANT_MARKER", "FOREIGN_TENANT_MARKER"],
      [keyC, workspaceC, serviceC, "Joined key", "JOINED_KEY_DIGEST"],
    ]) {
      insert(
        `INSERT INTO developer_api_keys
          (id, workspace_id, service_id, name, prefix, last_four,
           scopes_json, secret_hash, created_by_account_id,
           created_by_email, created_at, last_used_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, 'nzu_live_12345678', '90ab',
                 '["rpc:invoke"]', ?, ?, 'caller@example.com', ?, NULL, ?, NULL)`,
        id,
        workspaceId,
        serviceId,
        name,
        digest,
        workspaceId === workspaceB ? accountB : accountA,
        recordedAt,
        recordedAt + 86_400_000,
      );
    }

    for (const [id, workspaceId, accountId, detail] of [
      ["audit-a", workspaceA, accountA, '{"private":"AUDIT_DETAIL_A"}'],
      ["audit-b", workspaceB, accountB, '{"private":"FOREIGN_TENANT_MARKER"}'],
      ["audit-c", workspaceC, accountA, '{"private":"JOINED_AUDIT_DETAIL"}'],
    ]) {
      insert(
        `INSERT INTO developer_audit_events
          (id, workspace_id, actor_account_id, actor_email, api_key_id,
           action, entity_type, entity_id, detail_json, created_at)
         VALUES (?, ?, ?, NULL, NULL, 'service.created', 'service', ?, ?, ?)`,
        id,
        workspaceId,
        accountId,
        workspaceId === workspaceA
          ? serviceA
          : workspaceId === workspaceB
            ? serviceB
            : serviceC,
        detail,
        recordedAt,
      );
    }
    insert(
      `INSERT INTO developer_rpc_access_policies
        (service_id, workspace_id, allowed_origins_json,
         allowed_ip_cidrs_json, allowed_methods_json, revision, update_id,
         updated_by_account_id, updated_by_email, created_at, updated_at)
       VALUES (?, ?, '["https://private.example"]', '["10.0.0.0/8"]',
               '["eth_call"]', 1, 'policy-update-a', ?,
               'caller@example.com', ?, ?)`,
      serviceA,
      workspaceA,
      accountA,
      recordedAt,
      recordedAt + 1_000,
    );

    for (const [id, workspaceId, serviceId, apiKeyId] of [
      ["usage-a", workspaceA, serviceA, keyA],
      ["usage-b", workspaceB, serviceB, keyB],
      ["usage-c", workspaceC, serviceC, keyC],
    ]) {
      insert(
        `INSERT INTO ethereum_rpc_usage_buckets
          (id, workspace_id, service_id, api_key_id, bucket_start,
           quota_units, quota_limit, request_count, rpc_call_count,
           error_count, upstream_failure_count, latency_ms_total,
           bytes_in, bytes_out, last_request_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, 2, 1000, 2, 2, 0, 0, 20, 100, 200, ?, ?, ?)`,
        id,
        workspaceId,
        serviceId,
        apiKeyId,
        recordedAt,
        recordedAt + 500,
        recordedAt + 1_000,
        recordedAt + 86_400_000,
      );
    }

    insert(
      `INSERT INTO submissions
        (id, kind, status, name, email, email_hash, company, team_type,
         message, source_path, metadata_json, consent_version, consented_at,
         submitted_by_account_id, submitted_by_email, idempotency_key,
         request_hash, ip_hash, user_agent_hash, created_at, updated_at,
         expires_at)
       VALUES ('submission-a', 'support', 'received', 'Caller',
               'caller@example.com', 'caller-email-digest', 'Caller Co',
               'wallet', 'Please help with my service.', '/support',
               '{"private":"SUBMISSION_METADATA_A"}', '2026-01', ?, ?,
               'caller@example.com', 'SUBMISSION_IDEMPOTENCY_A',
               'SUBMISSION_REQUEST_DIGEST_A', 'SUBMISSION_IP_DIGEST_A',
               'SUBMISSION_AGENT_DIGEST_A', ?, ?, ?)`,
      recordedAt,
      accountA,
      recordedAt,
      recordedAt + 1_000,
      recordedAt + 86_400_000,
    );
    insert(
      `INSERT INTO submissions
        (id, kind, status, name, email, email_hash, company, team_type,
         message, source_path, metadata_json, consent_version, consented_at,
         submitted_by_account_id, submitted_by_email, idempotency_key,
         request_hash, ip_hash, user_agent_hash, created_at, updated_at,
         expires_at)
       VALUES ('submission-b', 'support', 'received',
               'FOREIGN_TENANT_MARKER', 'foreign@example.com',
               'foreign-email-digest', 'FOREIGN_TENANT_MARKER', 'exchange',
               'FOREIGN_TENANT_MARKER request body.', '/support', '{}',
               '2026-01', ?, ?, 'foreign@example.com',
               'FOREIGN_TENANT_MARKER-idempotency',
               'FOREIGN_TENANT_MARKER-request',
               'FOREIGN_TENANT_MARKER-ip',
               'FOREIGN_TENANT_MARKER-agent', ?, ?, ?)`,
      recordedAt,
      accountB,
      recordedAt,
      recordedAt + 1_000,
      recordedAt + 86_400_000,
    );
    insert(
      `INSERT INTO review_orders
        (id, reference, status, contact_name, work_email, email_hash,
         company, team_type, target_chain, audited_baseline,
         proposed_release, change_summary, affected_contracts, source_path,
         proposal_version, proposal_title, proposal_scope,
         proposal_exclusions, proposal_reviewer, proposal_issued_at,
         proposal_expires_at, proposal_accepted_at, next_action,
         submitted_by_account_id, access_token_hash, idempotency_key,
         request_hash, ip_hash, consent_version, consented_at, created_at,
         updated_at, expires_at, telegram_username)
       VALUES ('review-order-a', 'NZ-TEST-A', 'deposit_pending', 'Caller',
               'caller@example.com', 'review-email-a', 'Caller Co',
               'wallet', 'ethereum', 'audit-a', 'release-a',
               'A complete caller-owned review scope for account export.',
               2, '/services/upgrade-assurance', 1, 'Review A', 'Scope A',
               'Exclusions A', 'Reviewer A', ?, ?, ?,
               'Wait for payment verification.', ?, 'access-a',
               'review-idempotency-a', 'review-request-a', 'review-ip-a',
               '2026-01', ?, ?, ?, ?, '@callerops')`,
      recordedAt,
      recordedAt + 86_400_000,
      recordedAt + 1_000,
      accountA,
      recordedAt,
      recordedAt,
      recordedAt + 1_000,
      recordedAt + 86_400_000,
    );
    insert(
      `INSERT INTO review_orders
        (id, reference, status, contact_name, work_email, email_hash,
         company, team_type, target_chain, audited_baseline,
         proposed_release, change_summary, affected_contracts, source_path,
         proposal_version, proposal_title, proposal_scope,
         proposal_exclusions, proposal_reviewer, proposal_issued_at,
         proposal_expires_at, proposal_accepted_at, next_action,
         submitted_by_account_id, access_token_hash, idempotency_key,
         request_hash, ip_hash, consent_version, consented_at, created_at,
         updated_at, expires_at, telegram_username)
       VALUES ('review-order-b', 'NZ-TEST-B', 'deposit_pending',
               'FOREIGN_TENANT_MARKER', 'foreign@example.com',
               'review-email-b', 'FOREIGN_TENANT_MARKER', 'exchange',
               'ethereum', 'audit-b', 'release-b',
               'FOREIGN_TENANT_MARKER review scope.', 2,
               '/services/upgrade-assurance', 1, 'Review B', 'Scope B',
               'Exclusions B', 'Reviewer B', ?, ?, ?,
               'Wait for payment verification.', ?, 'access-b',
               'review-idempotency-b', 'review-request-b', 'review-ip-b',
               '2026-01', ?, ?, ?, ?, '@foreigntenant')`,
      recordedAt,
      recordedAt + 86_400_000,
      recordedAt + 1_000,
      accountB,
      recordedAt,
      recordedAt,
      recordedAt + 1_000,
      recordedAt + 86_400_000,
    );
    insert(
      `INSERT INTO review_stablecoin_payment_intents
        (id, review_order_id, phase, state, asset, chain_id, network,
         token_contract, token_decimals, recipient_address,
         obligation_amount, obligation_currency, token_amount_atomic,
         token_amount_display, reference_units, proposal_version,
         terms_accepted_at, expires_at, created_at, updated_at)
       VALUES ('stablecoin-intent-a', 'review-order-a', 'deposit',
               'confirming', 'USDC', 1, 'ethereum',
               '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6,
               '0x07218C8E2B01fbff950Af65A0f36D3305520aC3b',
               375000, 'usd', '3750000001', '3750.000001', 1, 1,
               ?, ?, ?, ?)`,
      recordedAt + 1_000,
      recordedAt + 86_400_000,
      recordedAt + 1_000,
      recordedAt + 2_000,
    );
    insert(
      `INSERT INTO review_stablecoin_payment_intents
        (id, review_order_id, phase, state, asset, chain_id, network,
         token_contract, token_decimals, recipient_address,
         obligation_amount, obligation_currency, token_amount_atomic,
         token_amount_display, reference_units, proposal_version,
         terms_accepted_at, expires_at, created_at, updated_at)
       VALUES ('stablecoin-intent-b', 'review-order-b', 'deposit',
               'confirming', 'USDT', 1, 'ethereum',
               '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6,
               '0x07218C8E2B01fbff950Af65A0f36D3305520aC3b',
               375000, 'usd', '3750000002', '3750.000002', 2, 1,
               ?, ?, ?, ?)`,
      recordedAt + 1_000,
      recordedAt + 86_400_000,
      recordedAt + 1_000,
      recordedAt + 2_000,
    );
    insert(
      `INSERT INTO review_stablecoin_payment_claims
        (id, payment_intent_id, transaction_hash, telegram_username, state,
         observed_sender, observed_token_contract,
         observed_recipient_address, observed_amount_atomic, block_number,
         block_hash, log_index, block_timestamp, confirmations,
         evidence_hash, rpc_agreement_count, attempt_count, next_check_at,
         last_checked_at, submitted_at, created_at, updated_at)
       VALUES ('stablecoin-claim-a', 'stablecoin-intent-a', ?, '@callerops',
               'confirming', '0x1111111111111111111111111111111111111111',
               '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
               '0x07218C8E2B01fbff950Af65A0f36D3305520aC3b',
               '3750000001', '19000000', ?, '3', ?, 8, ?, 2, 1, ?, ?,
               ?, ?, ?)`,
      `0x${"a".repeat(64)}`,
      `0x${"c".repeat(64)}`,
      recordedAt + 500,
      "d".repeat(64),
      recordedAt + 30_000,
      recordedAt + 2_000,
      recordedAt + 1_000,
      recordedAt + 1_000,
      recordedAt + 2_000,
    );
    insert(
      `INSERT INTO review_stablecoin_payment_claims
        (id, payment_intent_id, transaction_hash, telegram_username, state,
         attempt_count, next_check_at, submitted_at, created_at, updated_at)
       VALUES ('stablecoin-claim-b', 'stablecoin-intent-b', ?,
               '@foreigntenant', 'submitted', 0, ?, ?, ?, ?)`,
      `0x${"b".repeat(64)}`,
      recordedAt + 30_000,
      recordedAt + 1_000,
      recordedAt + 1_000,
      recordedAt + 1_000,
    );
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

async function createMigratedD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = path.resolve("drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();
  for (const file of migrationFiles) {
    const source = await readFile(
      path.join(migrationDirectory, file),
      "utf8",
    );
    for (const statement of source.split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) sqlite.exec(sql);
    }
  }
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  return new MemoryD1Database(sqlite);
}

class MemoryD1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new MemoryD1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class MemoryD1Statement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new MemoryD1Statement(
      this.database,
      this.sql,
      bindings.map(normalizeBinding),
    );
  }

  async first(column) {
    const row =
      this.database.prepare(this.sql).get(...this.bindings) ?? null;
    if (typeof column === "string") return row?.[column] ?? null;
    return row;
  }

  async all() {
    const results = this.database.prepare(this.sql).all(...this.bindings);
    return {
      meta: { changes: 0 },
      results,
      success: true,
    };
  }

  async raw() {
    const rows = this.database.prepare(this.sql).all(...this.bindings);
    return rows.map((row) => Object.values(row));
  }

  async run() {
    if (
      /^\s*(SELECT|PRAGMA|WITH)\b/i.test(this.sql) ||
      /\bRETURNING\b/i.test(this.sql)
    ) {
      const results = this.database.prepare(this.sql).all(...this.bindings);
      return {
        meta: { changes: results.length },
        results,
        success: true,
      };
    }
    const result = this.database.prepare(this.sql).run(...this.bindings);
    return {
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
      results: [],
      success: true,
    };
  }
}

function normalizeBinding(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value;
}

function collectPropertyNames(value, names = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectPropertyNames(item, names);
    return names;
  }
  if (!value || typeof value !== "object") return names;
  for (const [key, item] of Object.entries(value)) {
    names.add(key);
    collectPropertyNames(item, names);
  }
  return names;
}

function requestCookie(setCookie) {
  return setCookie
    .split(/,\s*(?=[^;,]+=)/)
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

function snapshotEnvironment(names) {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnvironment(snapshot) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
