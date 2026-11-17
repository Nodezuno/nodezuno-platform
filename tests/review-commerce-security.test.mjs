import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  REVIEW_CURRENCY,
  REVIEW_ORDER_ID_PATTERN,
  REVIEW_PAYMENT_AMOUNT,
  REVIEW_TOTAL_AMOUNT,
  createReviewOrder,
  reviewCreateRequestHash,
  reviewEmailHash,
  validateReviewOrderPayload,
} from "../lib/server/review-commerce.ts";
import {
  closeSqliteDatabase,
  createSqliteDatabase,
} from "../lib/server/sqlite-database.ts";
import { migrateSqlite } from "../scripts/migrate-sqlite.mjs";

const LOCAL_ORIGIN = "http://localhost:3000";
const RATE_LIMIT_SECRET =
  "commerce-security-rate-limit-secret-2026-with-ample-entropy";
const REVIEW_CAPABILITY_SECRET =
  "commerce-security-review-capability-secret-with-ample-entropy";

const MANAGED_ENVIRONMENT = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "NODEZUNO_DATABASE_DRIVER",
  "NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON",
  "NODEZUNO_LEGAL_LAUNCH_APPROVED",
  "NODEZUNO_LOCAL_PREVIEW",
  "NODEZUNO_PAYMENT_CONFIRMATIONS",
  "NODEZUNO_RUNTIME",
  "NODEZUNO_SQLITE_PATH",
  "NODEZUNO_STABLECOIN_PAYMENT_MODE",
  "PUBLIC_ORIGIN",
  "RATE_LIMIT_SECRET",
  "REVIEW_CAPABILITY_SECRET",
];

test("Upgrade Assurance commerce enforces its trust and payment boundaries", async (t) => {
  await t.test("payload validation is exact and server prices are immutable", async () => {
    const valid = validateReviewOrderPayload(validPayload());
    assert.equal(valid.ok, true);
    assert.equal(REVIEW_TOTAL_AMOUNT, 750_000);
    assert.equal(REVIEW_PAYMENT_AMOUNT, 375_000);
    assert.equal(REVIEW_CURRENCY, "usd");
    assert.equal(
      REVIEW_ORDER_ID_PATTERN.test("123e4567-e89b-42d3-a456-426614174000"),
      true,
    );
    assert.equal(
      REVIEW_ORDER_ID_PATTERN.test("123e4567-e89b-12d3-a456-426614174000"),
      false,
    );
    assert.equal(
      REVIEW_ORDER_ID_PATTERN.test("zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz"),
      false,
    );

    for (const payload of [
      { ...validPayload(), totalAmount: 1 },
      { ...validPayload(), consent: false },
      { ...validPayload(), affectedContracts: "1" },
      { ...validPayload(), website: "http://example.com" },
      { ...validPayload(), sourcePath: "https://attacker.example/review/start" },
      { ...validPayload(), changedLines: 1.5 },
    ]) {
      const result = validateReviewOrderPayload(payload);
      assert.equal(result.ok, false);
    }
  });

  await t.test("calendar dates reject impossible days", () => {
    const result = validateReviewOrderPayload({
      ...validPayload(),
      artifactReadyDate: "2026-02-30",
    });
    assert.equal(result.ok, false);
  });

  await t.test("idempotency keys cannot duplicate or mutate an application", async () => {
    await withCommerceDatabase(async ({ pathname }) => {
      const input = validatedInput();
      const options = {
        input,
        request: commerceRequest(LOCAL_ORIGIN),
        idempotencyKey: "review-idempotency-security-key-0001",
        requestHash: await reviewCreateRequestHash(input),
        emailHash: await reviewEmailHash(input.workEmail),
      };
      const first = await createReviewOrder(options);
      const replay = await createReviewOrder(options);
      assert.equal(first.replayed, false);
      assert.equal(replay.replayed, true);
      assert.equal(replay.order.id, first.order.id);
      assert.equal(replay.order.reference, first.order.reference);
      assert.equal(replay.accessToken, first.accessToken);
      await assertHttpProblem(
        createReviewOrder({ ...options, requestHash: "f".repeat(64) }),
        409,
        "idempotency_conflict",
      );
      assert.equal(
        await createSqliteDatabase(pathname)
          .prepare("SELECT COUNT(*) AS count FROM review_orders")
          .first("count"),
        1,
      );

      const concurrentInput = {
        ...input,
        workEmail: "concurrent@example.com",
        company: "Concurrent Protocol",
      };
      const concurrentOptions = {
        input: concurrentInput,
        request: commerceRequest(LOCAL_ORIGIN),
        idempotencyKey: "review-idempotency-concurrent-key-0001",
        requestHash: await reviewCreateRequestHash(concurrentInput),
        emailHash: await reviewEmailHash(concurrentInput.workEmail),
      };
      const concurrent = await Promise.all(
        Array.from({ length: 8 }, () => createReviewOrder(concurrentOptions)),
      );
      assert.equal(new Set(concurrent.map((result) => result.order.id)).size, 1);
      assert.equal(new Set(concurrent.map((result) => result.accessToken)).size, 1);
      assert.equal(concurrent.filter((result) => result.replayed === false).length, 1);
      assert.equal(concurrent.filter((result) => result.replayed === true).length, 7);
      const database = createSqliteDatabase(pathname);
      assert.equal(
        await database
          .prepare("SELECT COUNT(*) AS count FROM review_orders WHERE idempotency_key = ?")
          .bind(concurrentOptions.idempotencyKey)
          .first("count"),
        1,
      );
      assert.equal(
        await database
          .prepare("SELECT COUNT(*) AS count FROM review_order_events WHERE review_order_id = ? AND event_type = 'order.checkout_created'")
          .bind(concurrent[0].order.id)
          .first("count"),
        1,
      );
      assert.equal(
        await database
          .prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE entity_id = ?")
          .bind(concurrent[0].order.id)
          .first("count"),
        2,
      );
    });
  });

  await t.test("rotating the capability secret invalidates only private review access", async () => {
    await withCommerceDatabase(async ({ pathname }) => {
      const input = validatedInput();
      const options = {
        input,
        request: commerceRequest(LOCAL_ORIGIN),
        idempotencyKey: "review-secret-rotation-security-key-0001",
        requestHash: await reviewCreateRequestHash(input),
        emailHash: await reviewEmailHash(input.workEmail),
      };
      const created = await createReviewOrder(options);
      process.env.RATE_LIMIT_SECRET =
        "rotated-commerce-security-rate-limit-secret-with-ample-entropy";
      const rateLimitRotationReplay = await createReviewOrder(options);
      assert.equal(rateLimitRotationReplay.replayed, true);
      assert.equal(rateLimitRotationReplay.order.id, created.order.id);
      assert.equal(rateLimitRotationReplay.accessToken, created.accessToken);
      process.env.REVIEW_CAPABILITY_SECRET =
        "rotated-commerce-review-capability-secret-with-ample-entropy";
      await assertHttpProblem(
        createReviewOrder(options),
        409,
        "review_access_already_issued",
      );
      assert.equal(
        await createSqliteDatabase(pathname)
          .prepare("SELECT COUNT(*) AS count FROM review_orders WHERE id = ?")
          .bind(created.order.id)
          .first("count"),
        1,
      );
    });
  });

});

function validPayload() {
  return {
    contactName: "Sanjay Security Tester",
    workEmail: "buyer@example.com",
    company: "Nodezuno Test Protocol",
    website: "https://example.com/",
    teamType: "Protocol engineering team",
    targetChain: "Ethereum",
    auditedBaseline: "audit-v1.4.0 and commit 1111111",
    proposedRelease: "release-v1.4.1 and commit 2222222",
    changeSummary:
      "A bounded upgrade changes accounting behavior while preserving the previously audited storage layout.",
    affectedContracts: 2,
    changedLines: 184,
    artifactReadyDate: "2026-09-01",
    targetReleaseDate: "2026-09-15",
    publicLinks: "https://github.com/example/protocol",
    consent: true,
    sourcePath: "/review/start?source=security-test",
  };
}

function validatedInput() {
  const result = validateReviewOrderPayload(validPayload());
  assert.equal(result.ok, true);
  return result.value;
}

function commerceRequest(origin, extraHeaders = {}) {
  return new Request(`${origin}/api/v1/review-orders/security-test`, {
    headers: {
      origin,
      "user-agent": "Nodezuno commerce security test",
      "x-nodezuno-client-ip": "203.0.113.81",
      ...extraHeaders,
    },
  });
}

async function withCommerceDatabase(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "nodezuno-commerce-security-"));
  const pathname = path.join(directory, "nodezuno.sqlite");
  const previous = Object.fromEntries(
    MANAGED_ENVIRONMENT.map((name) => [name, process.env[name]]),
  );
  try {
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_DATABASE_DRIVER = "sqlite";
    process.env.NODEZUNO_SQLITE_PATH = pathname;
    process.env.NODEZUNO_LOCAL_PREVIEW = "true";
    process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED = "false";
    process.env.NODEZUNO_STABLECOIN_PAYMENT_MODE = "disabled";
    delete process.env.NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON;
    process.env.NODEZUNO_PAYMENT_CONFIRMATIONS = "12";
    process.env.PUBLIC_ORIGIN = LOCAL_ORIGIN;
    process.env.BETTER_AUTH_URL = process.env.PUBLIC_ORIGIN;
    process.env.BETTER_AUTH_SECRET =
      "commerce-security-better-auth-secret-with-ample-entropy";
    process.env.RATE_LIMIT_SECRET = RATE_LIMIT_SECRET;
    process.env.REVIEW_CAPABILITY_SECRET = REVIEW_CAPABILITY_SECRET;
    await migrateSqlite({ pathname });
    await callback({ pathname });
  } finally {
    closeSqliteDatabase(pathname);
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

async function assertHttpProblem(promise, status, code) {
  await assert.rejects(
    promise,
    (error) => error?.status === status && error?.code === code,
  );
}
