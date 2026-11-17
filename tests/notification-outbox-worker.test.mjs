import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deterministicNotificationDeliveryId,
  sealedNotificationPayload,
} from "../lib/server/database.ts";
import { reviewCapabilityHash } from "../lib/server/crypto.ts";
import { migrateSqlite } from "../scripts/migrate-sqlite.mjs";
import {
  claimOutboxMessage,
  openOutboxDatabase,
  processOneOutboxMessage,
  processOutboxPass,
  readWorkerConfiguration,
} from "../scripts/process-notification-outbox.mjs";

const reviewCapabilitySecret =
  "review-capability-worker-8d4c7a9e2f6b1c5d0a3e7f9b";
const configuration = {
  databasePath: "",
  enabled: true,
  publicOrigin: "https://nodezuno.com",
  password: "zoho-app-password-for-test",
  smtpHost: "smtp.zoho.in",
};
const SUBMISSION_ID = "33333333-3333-4333-8333-333333333333";
const SUBMISSION_OUTBOX_ID = "44444444-4444-4444-8444-444444444444";

test("worker configuration is disabled only when Zoho SMTP values are blank", () => {
  assert.deepEqual(
    readWorkerConfiguration({
      ZOHO_SMTP_HOST: "",
      ZOHO_SMTP_PASSWORD: "",
    }),
    { enabled: false },
  );
  assert.equal(
    readWorkerConfiguration({
      ZOHO_SMTP_HOST: configuration.smtpHost,
      ZOHO_SMTP_PASSWORD: configuration.password,
      NODEZUNO_DATABASE_DRIVER: "sqlite",
      NODEZUNO_SQLITE_PATH: "/tmp/nodezuno.sqlite",
      PUBLIC_ORIGIN: configuration.publicOrigin,
      REVIEW_CAPABILITY_SECRET: reviewCapabilitySecret,
    }).enabled,
    true,
  );
  assert.throws(
    () =>
      readWorkerConfiguration({
        ZOHO_SMTP_HOST: configuration.smtpHost,
        ZOHO_SMTP_PASSWORD: configuration.password,
        NODEZUNO_DATABASE_DRIVER: "d1-rest",
        NODEZUNO_SQLITE_PATH: "/tmp/nodezuno.sqlite",
        PUBLIC_ORIGIN: configuration.publicOrigin,
        REVIEW_CAPABILITY_SECRET: reviewCapabilitySecret,
      }),
    /requires NODEZUNO_DATABASE_DRIVER=sqlite/,
  );
  assert.throws(
    () => readWorkerConfiguration({
      ZOHO_SMTP_HOST: "smtp.invalid",
      ZOHO_SMTP_PASSWORD: configuration.password,
      NODEZUNO_DATABASE_DRIVER: "sqlite",
      NODEZUNO_SQLITE_PATH: "/tmp/nodezuno.sqlite",
      PUBLIC_ORIGIN: configuration.publicOrigin,
      REVIEW_CAPABILITY_SECRET: reviewCapabilitySecret,
    }),
    /valid Zoho email configuration/,
  );
});

test("delivery identities are stable while deliberate topics stay distinct", async () => {
  const identity = ["sales", "request-key", "a".repeat(64)];
  const first = await deterministicNotificationDeliveryId(
    "submission.received",
    ...identity,
  );
  const replay = await deterministicNotificationDeliveryId(
    "submission.received",
    ...identity,
  );
  const buyer = await deterministicNotificationDeliveryId(
    "review.application.received.buyer",
    ...identity,
  );
  const firstConfirmation = await deterministicNotificationDeliveryId(
    "newsletter.confirmation.requested",
    "1".repeat(32),
  );
  const deliberateResubscribe = await deterministicNotificationDeliveryId(
    "newsletter.confirmation.requested",
    "2".repeat(32),
  );
  assert.equal(first, replay);
  assert.notEqual(first, buyer);
  assert.notEqual(firstConfirmation, deliberateResubscribe);
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

  const sealed = await sealedNotificationPayload({
    submissionId: "11111111-1111-4111-8111-111111111111",
    kind: "sales",
  });
  assert.equal(
    sealed.json,
    '{"kind":"sales","submissionId":"11111111-1111-4111-8111-111111111111"}',
  );
  assert.equal(
    sealed.hash,
    createHash("sha256").update(sealed.json).digest("hex"),
  );
});

test("delivery migration is append-only and D1-safe", async () => {
  const migration = await readFile(
    new URL("../drizzle/0017_notification_delivery_state.sql", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(migration, /PRAGMA\s+foreign_keys\s*=\s*OFF/i);
  assert.match(migration, /notification_outbox_seal_immutable/);
  assert.match(migration, /notification_outbox_identity_immutable/);
  assert.match(migration, /notification_outbox_progression_guard/);
  assert.match(migration, /notification_outbox_delivery_id_unique/);
  assert.match(migration, /notification_outbox_provider_message_unique/);
  assert.match(migration, /notification_outbox_state_available_idx/);
  assert.match(migration, /notification_outbox_state_lease_idx/);
  assert.match(migration, /notification_outbox_topic_entity_created_idx/);
  assert.doesNotMatch(migration, /notification_outbox_topic_entity_unique/);
});

test("claim seals canonical payload and uses an unguessable conditional lease", async () => {
  await withDatabase(async (database) => {
    const now = 10_000;
    const outboxId = "11111111-1111-4111-8111-111111111111";
    const subscriptionId = "22222222-2222-4222-8222-222222222222";
    database
      .prepare(
        `INSERT INTO notification_outbox
          (id, topic, entity_id, state, attempts, payload_json, available_at,
           created_at, updated_at)
         VALUES (?, 'newsletter.unsubscribe.requested', ?, 'pending', 0,
                 '{}', ?, ?, ?)`,
      )
      .run(outboxId, subscriptionId, now, now, now);
    database
      .prepare(
        `INSERT INTO newsletter_subscriptions
          (id, email, email_hash, state, source_path, consent_version,
           consented_at, unsubscribe_token_hash, created_at, updated_at,
           unsubscribed_at)
         VALUES (?, ?, ?, 'unsubscribed', '/', 'v1', ?, ?, ?, ?, ?)`,
      )
      .run(
        subscriptionId,
        "claim@nodezuno.com",
        "a".repeat(64),
        now,
        "b".repeat(64),
        now,
        now,
        now,
      );

    const first = claimOutboxMessage(database, now);
    assert.equal(first.deliveryId, outboxId);
    assert.equal(first.templateVersion, "newsletter-unsubscribe-internal-v1");
    assert.match(first.payloadHash, /^[a-f0-9]{64}$/);
    assert.match(first.leaseToken, /^[a-f0-9]{64}$/);
    assert.equal(first.leaseExpiresAt, now + 120_000);
    assert.equal(claimOutboxMessage(database, now + 1), null);

    assert.throws(() =>
      database
        .prepare(
          `UPDATE notification_outbox SET payload_json = '{"changed":true}'
           WHERE id = ?`,
        )
        .run(outboxId),
    );
    assert.throws(() =>
      database
        .prepare("UPDATE notification_outbox SET id = ? WHERE id = ?")
        .run("99999999-9999-4999-8999-999999999999", outboxId),
    );

    const stale = claimOutboxMessage(database, now + 120_001);
    assert.equal(stale.deliveryId, outboxId);
    assert.notEqual(stale.leaseToken, first.leaseToken);
    assert.equal(stale.attempts, 2);
  });
});

test("Zoho SMTP acceptance stores provider identity without claiming inbox delivery", async () => {
  await withDatabase(async (database) => {
    const now = 20_000;
    seedSubmission(database, now);
    let sentMessage;
    const result = await processOneOutboxMessage({
      configuration,
      database,
      now,
      emailSenderImplementation: async (row, message) => {
        sentMessage = message;
        return `<nodezuno-${row.deliveryId.replaceAll("-", "")}@nodezuno.com>`;
      },
    });
    assert.equal(result.state, "accepted");
    const row = database
      .prepare(
        `SELECT state, provider, provider_message_id AS providerMessageId,
                accepted_at AS acceptedAt, delivered_at AS deliveredAt,
                lease_token AS leaseToken
         FROM notification_outbox WHERE id = ?`,
      )
      .get(SUBMISSION_OUTBOX_ID);
    assert.deepEqual({ ...row }, {
      state: "accepted",
      provider: "zoho",
      providerMessageId: `<nodezuno-${SUBMISSION_OUTBOX_ID.replaceAll("-", "")}@nodezuno.com>`,
      acceptedAt: now,
      deliveredAt: null,
      leaseToken: null,
    });
    assert.equal(sentMessage.to, "info@nodezuno.com");
    assert.match(sentMessage.subject, /New sales request/);
  });
});

test("transient provider failures retry without leaking mutable content", async () => {
  await withDatabase(async (database) => {
    const now = 30_000;
    seedSubmission(database, now);
    const result = await processOneOutboxMessage({
      configuration,
      database,
      now,
      emailSenderImplementation: async () => {
        throw Object.assign(new Error("recipient secret"), {
          code: "smtp_temporary_rejection",
          retryAfterMs: 120_000,
        });
      },
    });
    assert.equal(result.state, "retry_scheduled");
    const row = database
      .prepare(
        `SELECT state, attempts, last_error AS lastError,
                terminal_failure_code AS terminalFailureCode,
                lease_token AS leaseToken, available_at AS availableAt
         FROM notification_outbox WHERE id = ?`,
      )
      .get(SUBMISSION_OUTBOX_ID);
    assert.equal(row.state, "pending");
    assert.equal(row.attempts, 1);
    assert.equal(row.lastError, "smtp_temporary_rejection");
    assert.equal(row.terminalFailureCode, null);
    assert.equal(row.leaseToken, null);
    assert.equal(row.availableAt, now + 120_000);
    assert.doesNotMatch(JSON.stringify(row), /recipient secret/);
  });
});

test("provider reconciliation wins a conditional worker failure update", async () => {
  await withDatabase(async (database) => {
    const now = 35_000;
    const providerMessageId = "e8dc8991-9500-44ae-b753-35d7dcc6bd3c";
    seedSubmission(database, now);
    const result = await processOneOutboxMessage({
      configuration,
      database,
      now,
      emailSenderImplementation: async (row) => {
        const providerMessageId = `<nodezuno-${row.deliveryId.replaceAll("-", "")}@nodezuno.com>`;
        const reconciled = database
          .prepare(
            `UPDATE notification_outbox
             SET state = 'accepted', provider = 'zoho',
                 provider_message_id = ?, accepted_at = ?,
                 lease_token = NULL, lease_expires_at = NULL, updated_at = ?
             WHERE delivery_id = ? AND state = 'processing'`,
          )
          .run(providerMessageId, now, now, SUBMISSION_OUTBOX_ID);
        assert.equal(reconciled.changes, 1);
        return providerMessageId;
      },
    });
    assert.equal(result.state, "accepted");
    const row = database
      .prepare(
        `SELECT state, provider_message_id AS providerMessageId,
                terminal_failure_code AS terminalFailureCode,
                last_error AS lastError
         FROM notification_outbox WHERE delivery_id = ?`,
      )
      .get(SUBMISSION_OUTBOX_ID);
    assert.deepEqual({ ...row }, {
      state: "accepted",
      providerMessageId,
      terminalFailureCode: null,
      lastError: null,
    });
  });
});

test("internal unsubscribe delivery completes without calling SMTP", async () => {
  await withDatabase(async (database) => {
    const now = 40_000;
    const subscriptionId = "55555555-5555-4555-8555-555555555555";
    const outboxId = "66666666-6666-4666-8666-666666666666";
    database
      .prepare(
        `INSERT INTO newsletter_subscriptions
          (id, email, email_hash, state, source_path, consent_version,
           consented_at, unsubscribe_token_hash, created_at, updated_at,
           unsubscribed_at)
         VALUES (?, ?, ?, 'unsubscribed', '/', 'v1', ?, ?, ?, ?, ?)`,
      )
      .run(
        subscriptionId,
        "internal@nodezuno.com",
        "a".repeat(64),
        now,
        "b".repeat(64),
        now,
        now,
        now,
      );
    database
      .prepare(
        `INSERT INTO notification_outbox
          (id, topic, entity_id, state, attempts, payload_json, available_at,
           created_at, updated_at)
         VALUES (?, 'newsletter.unsubscribe.requested', ?, 'pending', 0,
                 '{}', ?, ?, ?)`,
      )
      .run(
        outboxId,
        subscriptionId,
        now,
        now,
        now,
      );
    const result = await processOutboxPass({
      configuration,
      database,
      now,
      emailSenderImplementation: async () => {
        throw new Error("SMTP must not be called");
      },
    });
    assert.equal(result.delivered, 1);
    const row = database
      .prepare(
        `SELECT state, provider, accepted_at AS acceptedAt,
                delivered_at AS deliveredAt
         FROM notification_outbox WHERE id = ?`,
      )
      .get(outboxId);
    assert.deepEqual({ ...row }, {
      state: "delivered",
      provider: "internal",
      acceptedAt: now,
      deliveredAt: now,
    });
  });
});

test("retry horizon prevents another SMTP attempt", async () => {
  await withDatabase(async (database) => {
    const now = 50_000;
    seedSubmission(database, now);
    const first = await processOneOutboxMessage({
      configuration,
      database,
      now,
      emailSenderImplementation: async () => {
        throw new Error("network unavailable");
      },
    });
    assert.equal(first.state, "retry_scheduled");

    let providerCalls = 0;
    const afterHorizon = now + 20 * 60 * 60 * 1000 + 1;
    const final = await processOneOutboxMessage({
      configuration,
      database,
      now: afterHorizon,
      emailSenderImplementation: async () => {
        providerCalls += 1;
        throw new Error("must not send");
      },
    });
    assert.equal(final.state, "failed");
    assert.equal(providerCalls, 0);
    const row = database
      .prepare(
        `SELECT state, terminal_failure_code AS terminalFailureCode
         FROM notification_outbox WHERE id = ?`,
      )
      .get(SUBMISSION_OUTBOX_ID);
    assert.deepEqual({ ...row }, {
      state: "failed",
      terminalFailureCode: "retry_horizon_exhausted",
    });
  });
});

test("newsletter confirmation sends the real confirmation page link", async () => {
  await withDatabase(async (database) => {
    const now = Date.UTC(2026, 7, 20, 8, 0, 0);
    const subscriptionId = "77777777-7777-4777-8777-777777777777";
    const outboxId = "88888888-8888-4888-8888-888888888888";
    const tokenId = "1".repeat(32);
    const tokenSecret = "2".repeat(64);
    const confirmationToken = `${tokenId}.${tokenSecret}`;
    const unsubscribeToken = "3".repeat(64);
    const emailHash = "4".repeat(64);
    const confirmationHash = createHash("sha256")
      .update(
        `newsletter-confirmation\u0000${tokenId}\u0000${tokenSecret}`,
      )
      .digest("hex");
    database
      .prepare(
        `INSERT INTO newsletter_subscriptions
          (id, email, email_hash, state, source_path, consent_version,
           consented_at, confirmation_token_id, confirmation_token_hash,
           confirmation_requested_at, confirmation_expires_at,
           unsubscribe_token_hash, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', '/', '2026-08-13', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        subscriptionId,
        "signal@nodezuno.com",
        emailHash,
        now,
        tokenId,
        confirmationHash,
        now,
        now + 60 * 60 * 1000,
        createHash("sha256").update(unsubscribeToken).digest("hex"),
        now,
        now,
      );
    const payload = {
      subscriptionId,
      unsubscribeToken,
      confirmationToken,
      emailHash,
      unsubscribePath:
        `/community/newsletter/unsubscribe?token=${unsubscribeToken}`,
      confirmationPath:
        `/community/newsletter/confirm?token=${confirmationToken}`,
    };
    database
      .prepare(
        `INSERT INTO notification_outbox
          (id, topic, entity_id, state, attempts, payload_json, available_at,
           created_at, updated_at)
         VALUES (?, 'newsletter.confirmation.requested', ?, 'pending', 0,
                 ?, ?, ?, ?)`,
      )
      .run(outboxId, tokenId, JSON.stringify(payload), now, now, now);

    let sentMessage;
    const result = await processOneOutboxMessage({
      configuration,
      database,
      now,
      emailSenderImplementation: async (row, message) => {
        sentMessage = message;
        return `<nodezuno-${row.deliveryId.replaceAll("-", "")}@nodezuno.com>`;
      },
    });
    assert.equal(result.state, "accepted");
    assert.equal(sentMessage.to, "signal@nodezuno.com");
    const confirmationUrl =
      `${configuration.publicOrigin}/community/newsletter/confirm?token=` +
      confirmationToken;
    assert.match(sentMessage.text, new RegExp(escapeRegex(confirmationUrl)));
    assert.match(sentMessage.html, new RegExp(escapeRegex(confirmationUrl)));
    assert.doesNotMatch(sentMessage.html, /\/api\/v1\/newsletter\/confirm/);
    assert.equal(
      sentMessage.listUnsubscribe,
      `${configuration.publicOrigin}/community/newsletter/unsubscribe?token=${unsubscribeToken}`,
    );
  });
});

test("buyer tracking email reconstructs the private fragment server-side", async () => {
  await withDatabase(async (database) => {
    const now = Date.UTC(2026, 7, 20, 9, 0, 0);
    const reviewOrderId = "99999999-9999-4999-8999-999999999999";
    const outboxId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const reference = "NZ-2026-99999999";
    const idempotencyKey = "review-worker-idempotency";
    const requestHash = "5".repeat(64);
    const previousRuntime = process.env.NODEZUNO_RUNTIME;
    const previousSecret = process.env.REVIEW_CAPABILITY_SECRET;
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.REVIEW_CAPABILITY_SECRET = reviewCapabilitySecret;
    try {
      const capability = await reviewCapabilityHash(
        "review-order-capability",
        `${idempotencyKey}\u0000${requestHash}`,
      );
      const accessTokenHash = await reviewCapabilityHash(
        "review-order-access",
        capability,
      );
      database
        .prepare(
          `INSERT INTO review_orders (
            id, reference, contact_name, work_email, email_hash, company,
            team_type, target_chain, audited_baseline, proposed_release,
            change_summary, affected_contracts, source_path, access_token_hash,
            idempotency_key, request_hash, ip_hash, consent_version,
            consented_at, created_at, updated_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          reviewOrderId,
          reference,
          "Sanjay Sudagani",
          "buyer@nodezuno.com",
          "6".repeat(64),
          "Nodezuno",
          "Protocol engineering team",
          "Base",
          "audit-commit",
          "release-commit",
          "A frozen upgrade with documented storage changes.",
          2,
          "/review/start",
          accessTokenHash,
          idempotencyKey,
          requestHash,
          "7".repeat(64),
          "review-intake-2026-08",
          now,
          now,
          now,
          now + 60 * 60 * 1000,
        );
      const sealed = await sealedNotificationPayload({
        reference,
        reviewOrderId,
      });
      database
        .prepare(
          `INSERT INTO notification_outbox
            (id, delivery_id, topic, entity_id, state, attempts,
             template_version, payload_json, payload_hash, available_at,
             created_at, updated_at)
           VALUES (?, ?, 'review.application.received.buyer', ?, 'pending', 0,
                   'review-application-buyer-v1', ?, ?, ?, ?, ?)`,
        )
        .run(
          outboxId,
          outboxId,
          reviewOrderId,
          sealed.json,
          sealed.hash,
          now,
          now,
          now,
        );

      let sentMessage;
      const result = await processOneOutboxMessage({
        configuration,
        database,
        now,
        emailSenderImplementation: async (row, message) => {
          sentMessage = message;
          return `<nodezuno-${row.deliveryId.replaceAll("-", "")}@nodezuno.com>`;
        },
      });
      assert.equal(result.state, "accepted");
      const trackingUrl =
        `${configuration.publicOrigin}/review/${reviewOrderId}` +
        `#access=${capability}`;
      assert.match(sentMessage.text, new RegExp(escapeRegex(trackingUrl)));
      assert.equal(sentMessage.to, "buyer@nodezuno.com");
      assert.doesNotMatch(sealed.json, /access|buyer@|capability/i);
    } finally {
      if (previousRuntime === undefined) delete process.env.NODEZUNO_RUNTIME;
      else process.env.NODEZUNO_RUNTIME = previousRuntime;
      if (previousSecret === undefined) {
        delete process.env.REVIEW_CAPABILITY_SECRET;
      } else {
        process.env.REVIEW_CAPABILITY_SECRET = previousSecret;
      }
    }
  });
});

test("an exact topic schema rejects extra mutable fields before send", async () => {
  await withDatabase(async (database) => {
    const now = 60_000;
    seedSubmission(database, now);
    database
      .prepare("DELETE FROM notification_outbox WHERE id = ?")
      .run(SUBMISSION_OUTBOX_ID);
    database
      .prepare(
        `INSERT INTO notification_outbox
          (id, topic, entity_id, state, attempts, payload_json, available_at,
           created_at, updated_at)
         VALUES (?, 'submission.received', ?, 'pending', 0, ?, ?, ?, ?)`,
      )
      .run(
        SUBMISSION_OUTBOX_ID,
        SUBMISSION_ID,
        JSON.stringify({
          kind: "sales",
          submissionId: SUBMISSION_ID,
          recipient: "attacker@invalid.test",
        }),
        now,
        now,
        now,
      );
    let called = false;
    const result = await processOneOutboxMessage({
      configuration,
      database,
      now,
      emailSenderImplementation: async () => {
        called = true;
        return "unexpected";
      },
    });
    assert.equal(result.state, "failed");
    assert.equal(called, false);
    const row = database
      .prepare(
        `SELECT terminal_failure_code AS terminalFailureCode, last_error AS lastError
         FROM notification_outbox WHERE id = ?`,
      )
      .get(SUBMISSION_OUTBOX_ID);
    assert.deepEqual({ ...row }, {
      terminalFailureCode: "invalid_payload",
      lastError: "invalid_payload",
    });
    assert.doesNotMatch(JSON.stringify(row), /attacker@/);
  });
});

function seedSubmission(database, now) {
  database
    .prepare(
      `INSERT INTO submissions
        (id, kind, status, name, email, email_hash, company, team_type,
         message, source_path, metadata_json, consent_version, consented_at,
         idempotency_key, request_hash, ip_hash, created_at, updated_at,
         expires_at)
       VALUES (?, 'sales', 'received', 'Sanjay', ?, ?, 'Nodezuno',
               'Protocol engineering team', 'A sufficiently detailed request.',
               '/', '{}', 'v1', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      SUBMISSION_ID,
      "buyer@nodezuno.com",
      "a".repeat(64),
      now,
      "idempotency-worker-1",
      "b".repeat(64),
      "c".repeat(64),
      now,
      now,
      now + 100_000,
    );
  database
    .prepare(
      `INSERT INTO notification_outbox
        (id, topic, entity_id, state, attempts, payload_json, available_at,
         created_at, updated_at)
       VALUES (?, 'submission.received', ?, 'pending',
               0, ?, ?, ?, ?)`,
    )
    .run(
      SUBMISSION_OUTBOX_ID,
      SUBMISSION_ID,
      JSON.stringify({
        submissionId: SUBMISSION_ID,
        kind: "sales",
      }),
      now,
      now,
      now,
    );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function withDatabase(operation) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "nodezuno-outbox-worker-"),
  );
  const pathname = path.join(directory, "nodezuno.sqlite");
  try {
    await migrateSqlite({
      environment: {
        NODEZUNO_ALLOW_SCHEMA_BASELINE: "false",
        NODEZUNO_SQLITE_PATH: pathname,
      },
      pathname,
    });
    const database = openOutboxDatabase(pathname);
    try {
      await operation(database);
    } finally {
      database.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
