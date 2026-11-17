import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sha256Hex } from "../lib/server/crypto.ts";
import {
  confirmNewsletterSubscription,
  persistNewsletterSubscription,
  unsubscribeNewsletter,
} from "../lib/server/database.ts";
import {
  closeSqliteDatabase,
  createSqliteDatabase,
} from "../lib/server/sqlite-database.ts";
import { migrateSqlite } from "../scripts/migrate-sqlite.mjs";

const START = 1_800_000_000_000;

test("newsletter confirmation is double opt-in, expiring, and append-only", async (t) => {
  await t.test("pending retries reuse a live link and expired retries append", async () => {
    await withNewsletterDatabase(async (database) => {
      const first = confirmationToken("1", "a");
      const ignored = confirmationToken("2", "b");
      const refreshed = confirmationToken("3", "c");
      const firstUnsubscribe = "c".repeat(64);
      const ignoredUnsubscribe = "d".repeat(64);
      const refreshedUnsubscribe = "e".repeat(64);

      const firstRecord = await saveAttempt(database, {
        email: "reader@example.com",
        token: first,
        unsubscribeToken: firstUnsubscribe,
        now: START,
      });
      const secondRecord = await saveAttempt(database, {
        email: "reader@example.com",
        token: ignored,
        unsubscribeToken: ignoredUnsubscribe,
        now: START + 1_000,
      });

      assert.equal(secondRecord.id, firstRecord.id);
      assert.equal(secondRecord.state, "pending");
      const subscription = await database
        .prepare(
          `SELECT state, confirmation_token_id AS confirmationTokenId,
                  confirmation_requested_at AS confirmationRequestedAt,
                  confirmation_expires_at AS confirmationExpiresAt,
                  unsubscribe_token_hash AS unsubscribeTokenHash,
                  updated_at AS updatedAt,
                  confirmed_at AS confirmedAt
           FROM newsletter_subscriptions
           WHERE id = ?`,
        )
        .bind(firstRecord.id)
        .first();
      assert.deepEqual(subscription, {
        state: "pending",
        confirmationTokenId: first.id,
        confirmationRequestedAt: START,
        confirmationExpiresAt: START + 72 * 60 * 60 * 1_000,
        unsubscribeTokenHash: await sha256Hex(firstUnsubscribe),
        updatedAt: START,
        confirmedAt: null,
      });

      const firstOutbox = await database
        .prepare(
          `SELECT entity_id AS entityId, payload_json AS payloadJson
           FROM notification_outbox
           WHERE topic = 'newsletter.confirmation.requested'
           ORDER BY created_at, entity_id`,
        )
        .all();
      assert.equal(firstOutbox.results.length, 1);
      assert.deepEqual(JSON.parse(firstOutbox.results[0].payloadJson), {
        subscriptionId: firstRecord.id,
        emailHash: "e".repeat(64),
        confirmationToken: first.raw,
        confirmationPath: `/community/newsletter/confirm?token=${first.raw}`,
        unsubscribeToken: firstUnsubscribe,
        unsubscribePath:
          `/community/newsletter/unsubscribe?token=${firstUnsubscribe}`,
      });

      await saveAttempt(database, {
        email: "reader@example.com",
        token: refreshed,
        unsubscribeToken: refreshedUnsubscribe,
        now: START + 72 * 60 * 60 * 1_000 + 1,
      });
      const refreshedOutbox = await database
        .prepare(
          `SELECT entity_id AS entityId, payload_json AS payloadJson
           FROM notification_outbox
           WHERE topic = 'newsletter.confirmation.requested'
           ORDER BY created_at, entity_id`,
        )
        .all();
      assert.deepEqual(
        refreshedOutbox.results.map((row) => row.entityId),
        [first.id, refreshed.id],
      );
      assert.deepEqual(JSON.parse(refreshedOutbox.results[0].payloadJson), {
        subscriptionId: firstRecord.id,
        emailHash: "e".repeat(64),
        confirmationToken: first.raw,
        confirmationPath: `/community/newsletter/confirm?token=${first.raw}`,
        unsubscribeToken: firstUnsubscribe,
        unsubscribePath:
          `/community/newsletter/unsubscribe?token=${firstUnsubscribe}`,
      });
      assert.deepEqual(JSON.parse(refreshedOutbox.results[1].payloadJson), {
        subscriptionId: firstRecord.id,
        emailHash: "e".repeat(64),
        confirmationToken: refreshed.raw,
        confirmationPath:
          `/community/newsletter/confirm?token=${refreshed.raw}`,
        unsubscribeToken: refreshedUnsubscribe,
        unsubscribePath:
          `/community/newsletter/unsubscribe?token=${refreshedUnsubscribe}`,
      });
      assert.equal(
        "email" in JSON.parse(refreshedOutbox.results[0].payloadJson),
        false,
      );
      assert.equal(
        "name" in JSON.parse(refreshedOutbox.results[0].payloadJson),
        false,
      );
    });
  });

  await t.test("a valid token confirms once and exact replay is idempotent", async () => {
    await withNewsletterDatabase(async (database) => {
      const token = confirmationToken("3", "c");
      const record = await saveAttempt(database, {
        email: "confirm@example.com",
        token,
        unsubscribeToken: "4".repeat(64),
        now: START,
      });
      assert.equal(
        await confirmNewsletterSubscription({
          confirmationTokenId: token.id,
          confirmationTokenHash: "f".repeat(64),
          now: START + 1_000,
          database,
        }),
        "invalid",
      );

      const confirmedAt = START + 2_000;
      assert.equal(
        await confirmNewsletterSubscription({
          confirmationTokenId: token.id,
          confirmationTokenHash: await confirmationHash(token),
          now: confirmedAt,
          database,
        }),
        "subscribed",
      );
      assert.equal(
        await confirmNewsletterSubscription({
          confirmationTokenId: token.id,
          confirmationTokenHash: await confirmationHash(token),
          now: START + 3_000,
          database,
        }),
        "subscribed",
      );
      const ignoredRepeat = confirmationToken("4", "d");
      await saveAttempt(database, {
        email: "confirm@example.com",
        token: ignoredRepeat,
        unsubscribeToken: "5".repeat(64),
        now: START + 4_000,
      });
      assert.deepEqual(
        await database
          .prepare(
            `SELECT state, confirmation_token_id AS confirmationTokenId,
                    unsubscribe_token_hash AS unsubscribeTokenHash,
                    confirmed_at AS confirmedAt
             FROM newsletter_subscriptions WHERE id = ?`,
          )
          .bind(record.id)
          .first(),
        {
          state: "subscribed",
          confirmationTokenId: token.id,
          unsubscribeTokenHash: await sha256Hex("4".repeat(64)),
          confirmedAt,
        },
      );
      assert.equal(
        await database
          .prepare(
            `SELECT count(*) AS count FROM notification_outbox
             WHERE topic = 'newsletter.confirmation.requested'`,
          )
          .first("count"),
        1,
      );
      assert.equal(
        await unsubscribeNewsletter(
          await sha256Hex("4".repeat(64)),
          START + 5_000,
          database,
        ),
        true,
      );
      assert.equal(
        await database
          .prepare("SELECT state FROM newsletter_subscriptions WHERE id = ?")
          .bind(record.id)
          .first("state"),
        "unsubscribed",
      );
    });
  });

  await t.test("a live pending retry keeps its original unsubscribe link", async () => {
    await withNewsletterDatabase(async (database) => {
      const current = confirmationToken("d", "5");
      const ignored = confirmationToken("e", "6");
      const currentUnsubscribe = "1".repeat(64);
      const record = await saveAttempt(database, {
        email: "pending-unsubscribe@example.com",
        token: current,
        unsubscribeToken: currentUnsubscribe,
        now: START,
      });
      await saveAttempt(database, {
        email: "pending-unsubscribe@example.com",
        token: ignored,
        unsubscribeToken: "2".repeat(64),
        now: START + 1_000,
      });

      assert.equal(
        await unsubscribeNewsletter(
          await sha256Hex(currentUnsubscribe),
          START + 2_000,
          database,
        ),
        true,
      );
      assert.deepEqual(
        await database
          .prepare(
            `SELECT state, confirmation_token_id AS confirmationTokenId
             FROM newsletter_subscriptions WHERE id = ?`,
          )
          .bind(record.id)
          .first(),
        { state: "unsubscribed", confirmationTokenId: current.id },
      );
    });
  });

  await t.test("expired, replaced, and unsubscribed tokens cannot confirm", async () => {
    await withNewsletterDatabase(async (database) => {
      const expired = confirmationToken("5", "d");
      await saveAttempt(database, {
        email: "expired@example.com",
        token: expired,
        unsubscribeToken: "6".repeat(64),
        now: START,
      });
      assert.equal(
        await confirmNewsletterSubscription({
          confirmationTokenId: expired.id,
          confirmationTokenHash: await confirmationHash(expired),
          now: START + 72 * 60 * 60 * 1_000 + 1,
          database,
        }),
        "expired",
      );

      const replaced = confirmationToken("7", "e");
      const current = confirmationToken("8", "f");
      await saveAttempt(database, {
        email: "replaced@example.com",
        token: replaced,
        unsubscribeToken: "9".repeat(64),
        now: START,
      });
      await saveAttempt(database, {
        email: "replaced@example.com",
        token: current,
        unsubscribeToken: "a".repeat(64),
        now: START + 72 * 60 * 60 * 1_000 + 1,
      });
      assert.equal(
        await confirmNewsletterSubscription({
          confirmationTokenId: replaced.id,
          confirmationTokenHash: await confirmationHash(replaced),
          now: START + 72 * 60 * 60 * 1_000 + 2,
          database,
        }),
        "invalid",
      );

      const withdrawn = confirmationToken("9", "1");
      const unsubscribeToken = "b".repeat(64);
      const withdrawnRecord = await saveAttempt(database, {
        email: "withdrawn@example.com",
        token: withdrawn,
        unsubscribeToken,
        now: START,
      });
      assert.equal(
        await unsubscribeNewsletter(
          await sha256Hex(unsubscribeToken),
          START + 1_000,
          database,
        ),
        true,
      );
      assert.equal(
        await confirmNewsletterSubscription({
          confirmationTokenId: withdrawn.id,
          confirmationTokenHash: await confirmationHash(withdrawn),
          now: START + 2_000,
          database,
        }),
        "invalid",
      );
      assert.equal(
        await database
          .prepare("SELECT state FROM newsletter_subscriptions WHERE id = ?")
          .bind(withdrawnRecord.id)
          .first("state"),
        "unsubscribed",
      );

      const reactivated = confirmationToken("a", "2");
      const reactivatedUnsubscribe = "c".repeat(64);
      assert.equal(
        (
          await saveAttempt(database, {
            email: "withdrawn@example.com",
            token: reactivated,
            unsubscribeToken: reactivatedUnsubscribe,
            now: START + 3_000,
          })
        ).state,
        "pending",
      );
      assert.deepEqual(
        await database
          .prepare(
            `SELECT confirmation_token_id AS confirmationTokenId,
                    unsubscribe_token_hash AS unsubscribeTokenHash
             FROM newsletter_subscriptions WHERE id = ?`,
          )
          .bind(withdrawnRecord.id)
          .first(),
        {
          confirmationTokenId: reactivated.id,
          unsubscribeTokenHash: await sha256Hex(reactivatedUnsubscribe),
        },
      );
      assert.equal(
        await database
          .prepare(
            `SELECT count(*) AS count FROM notification_outbox
             WHERE topic = 'newsletter.confirmation.requested'
               AND entity_id IN (?, ?)`,
          )
          .bind(withdrawn.id, reactivated.id)
          .first("count"),
        2,
      );
    });
  });

  await t.test("concurrent first requests create one live attempt", async () => {
    await withNewsletterDatabase(async (database) => {
      const first = confirmationToken("b", "3");
      const second = confirmationToken("c", "4");
      await Promise.all([
        saveAttempt(database, {
          email: "concurrent@example.com",
          token: first,
          unsubscribeToken: "d".repeat(64),
          now: START,
        }),
        saveAttempt(database, {
          email: "concurrent@example.com",
          token: second,
          unsubscribeToken: "e".repeat(64),
          now: START,
        }),
      ]);

      const subscription = await database
        .prepare(
          `SELECT confirmation_token_id AS confirmationTokenId,
                  unsubscribe_token_hash AS unsubscribeTokenHash
           FROM newsletter_subscriptions
           WHERE email = 'concurrent@example.com'`,
        )
        .first();
      const outbox = await database
        .prepare(
          `SELECT entity_id AS entityId, payload_json AS payloadJson
           FROM notification_outbox
           WHERE topic = 'newsletter.confirmation.requested'`,
        )
        .all();
      assert.equal(outbox.results.length, 1);
      assert.equal(outbox.results[0].entityId, subscription.confirmationTokenId);
      const payload = JSON.parse(outbox.results[0].payloadJson);
      const winningToken =
        subscription.confirmationTokenId === first.id ? first : second;
      const winningUnsubscribe =
        subscription.confirmationTokenId === first.id
          ? "d".repeat(64)
          : "e".repeat(64);
      assert.equal(payload.confirmationToken, winningToken.raw);
      assert.equal(payload.unsubscribeToken, winningUnsubscribe);
      assert.equal(
        subscription.unsubscribeTokenHash,
        await sha256Hex(winningUnsubscribe),
      );
    });
  });

  await t.test("concurrent expired retries append exactly one replacement", async () => {
    await withNewsletterDatabase(async (database) => {
      const expired = confirmationToken("1", "7");
      const firstReplacement = confirmationToken("2", "8");
      const secondReplacement = confirmationToken("3", "9");
      await saveAttempt(database, {
        email: "concurrent-expiry@example.com",
        token: expired,
        unsubscribeToken: "3".repeat(64),
        now: START,
      });
      const replacementTime = START + 72 * 60 * 60 * 1_000 + 1;
      await Promise.all([
        saveAttempt(database, {
          email: "concurrent-expiry@example.com",
          token: firstReplacement,
          unsubscribeToken: "4".repeat(64),
          now: replacementTime,
        }),
        saveAttempt(database, {
          email: "concurrent-expiry@example.com",
          token: secondReplacement,
          unsubscribeToken: "5".repeat(64),
          now: replacementTime,
        }),
      ]);

      const subscription = await database
        .prepare(
          `SELECT confirmation_token_id AS confirmationTokenId,
                  unsubscribe_token_hash AS unsubscribeTokenHash
           FROM newsletter_subscriptions
           WHERE email = 'concurrent-expiry@example.com'`,
        )
        .first();
      const outbox = await database
        .prepare(
          `SELECT entity_id AS entityId, payload_json AS payloadJson
           FROM notification_outbox
           WHERE topic = 'newsletter.confirmation.requested'
           ORDER BY created_at, entity_id`,
        )
        .all();
      assert.equal(outbox.results.length, 2);
      assert.equal(outbox.results[0].entityId, expired.id);
      assert.equal(outbox.results[1].entityId, subscription.confirmationTokenId);
      const payload = JSON.parse(outbox.results[1].payloadJson);
      const winningToken =
        subscription.confirmationTokenId === firstReplacement.id
          ? firstReplacement
          : secondReplacement;
      const winningUnsubscribe =
        subscription.confirmationTokenId === firstReplacement.id
          ? "4".repeat(64)
          : "5".repeat(64);
      assert.equal(payload.confirmationToken, winningToken.raw);
      assert.equal(payload.unsubscribeToken, winningUnsubscribe);
      assert.equal(
        subscription.unsubscribeTokenHash,
        await sha256Hex(winningUnsubscribe),
      );
    });
  });

  await t.test("GET renders consent UI and never performs the mutation", async () => {
    const [routeSource, pageSource, intakeSource, databaseSource] = await Promise.all([
      readFile(
        new URL(
          "../app/api/v1/newsletter/confirm/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/community/newsletter/confirm/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/v1/newsletter/subscriptions/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../lib/server/database.ts", import.meta.url),
        "utf8",
      ),
    ]);
    assert.doesNotMatch(routeSource, /export async function GET/);
    assert.match(routeSource, /assertSameOrigin\(request\)/);
    assert.match(routeSource, /newsletter:confirmation:ip/);
    assert.doesNotMatch(routeSource, /verifyAbuseChallenge/);
    assert.match(pageSource, /action="\/api\/v1\/newsletter\/confirm"/);
    assert.match(pageSource, /method="post"/);
    assert.match(pageSource, /Email scanners can open this page safely/);
    assert.equal(
      intakeSource.match(/data: GENERIC_ACCEPTED_DATA/g)?.length,
      2,
    );
    assert.match(
      intakeSource,
      /If confirmation is needed, check this address's inbox for the next step\./,
    );
    assert.match(
      databaseSource,
      /constantTimeStringEqual\(\s*expectedHash,\s*options\.confirmationTokenHash/,
    );
  });
});

function confirmationToken(idCharacter, secretCharacter) {
  const id = idCharacter.repeat(32);
  const secret = secretCharacter.repeat(64);
  return { id, secret, raw: `${id}.${secret}` };
}

async function confirmationHash(token) {
  return sha256Hex(
    `newsletter-confirmation\u0000${token.id}\u0000${token.secret}`,
  );
}

async function saveAttempt(
  database,
  { email, token, unsubscribeToken, now },
) {
  return persistNewsletterSubscription({
    input: {
      email,
      name: "Nodezuno Reader",
      consent: true,
      sourcePath: "/community/newsletter",
      website: "",
    },
    emailHash: "e".repeat(64),
    confirmationTokenId: token.id,
    confirmationTokenHash: await confirmationHash(token),
    confirmationToken: token.raw,
    unsubscribeTokenHash: await sha256Hex(unsubscribeToken),
    unsubscribeToken,
    now,
    database,
  });
}

async function withNewsletterDatabase(callback) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "nodezuno-newsletter-confirmation-"),
  );
  const pathname = path.join(directory, "nodezuno.sqlite");
  try {
    await migrateSqlite({ pathname });
    await callback(createSqliteDatabase(pathname));
  } finally {
    closeSqliteDatabase(pathname);
    await rm(directory, { recursive: true, force: true });
  }
}
