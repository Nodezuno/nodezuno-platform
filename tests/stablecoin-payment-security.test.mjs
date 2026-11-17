import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  adminUpdateReviewOrder,
  createReviewOrder,
  publicReviewOrder,
  exchangeReviewAccess,
  reviewCreateRequestHash,
  reviewEmailHash,
  validateReviewOrderPayload,
} from "../lib/server/review-commerce.ts";
import {
  createStablecoinPaymentIntent,
  normalizeTelegramUsername,
  normalizeTransactionHash,
  submitStablecoinPaymentClaim,
  verifyStablecoinPaymentClaim,
} from "../lib/server/stablecoin-payment.ts";
import {
  ETHEREUM_TRANSFER_TOPIC,
  NODEZUNO_PAYMENT_RECIPIENT,
  parseEthereumRpcEndpoints,
  stablecoinPaymentConfiguration,
  STABLECOIN_ASSETS,
} from "../lib/server/stablecoin-payment-config.ts";
import { paymentVerifierConfigurationHash } from "../lib/server/stablecoin-payment-health.ts";
import {
  applyReconciledStablecoinPayment,
  listStablecoinPaymentConfirmations,
} from "../lib/server/stablecoin-payment-records.ts";
import {
  closeSqliteDatabase,
  createSqliteDatabase,
} from "../lib/server/sqlite-database.ts";
import { migrateSqlite } from "../scripts/migrate-sqlite.mjs";
import { processStablecoinPaymentsOnce } from "../scripts/process-stablecoin-payments.mjs";

const ORIGIN = "https://nodezuno.com";
const RPC_URL = "https://payment-rpc.example";
const RPC_URL_SECONDARY = "https://payment-rpc-secondary.example";
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

test("direct Ethereum stablecoin settlement is attributable and fail closed", async (t) => {
  await t.test("transaction hashes and mandatory Telegram usernames are normalized strictly", () => {
    assert.equal(normalizeTransactionHash(`0x${"A".repeat(64)}`), `0x${"a".repeat(64)}`);
    assert.equal(normalizeTelegramUsername("Protocol_Ops"), "@protocol_ops");
    assert.equal(normalizeTelegramUsername("@Nodezuno1"), "@nodezuno1");
    assert.throws(() => normalizeTransactionHash("0x1234"), hasProblem(422, "transaction_hash_invalid"));
    assert.throws(() => normalizeTelegramUsername("@bad-name"), hasProblem(422, "telegram_username_invalid"));
    assert.throws(() => normalizeTelegramUsername("abcd"), hasProblem(422, "telegram_username_invalid"));
  });

  await t.test("payment RPC configuration accepts only bounded server-owned endpoints", () => {
    assert.deepEqual(
      parseEthereumRpcEndpoints(JSON.stringify([{
        name: "payment-primary",
        provider: "provider-primary",
        url: "https://rpc.example/ethereum",
        headers: { Authorization: "Bearer redacted" },
        timeoutMs: 8_000,
      }])),
      [{
        name: "payment-primary",
        provider: "provider-primary",
        url: "https://rpc.example/ethereum",
        headers: { Authorization: "Bearer redacted" },
        timeoutMs: 8_000,
      }],
    );
    for (const value of [
      [{ name: "payment-primary", provider: "provider-primary", url: "http://rpc.example" }],
      [{ name: "payment-primary", provider: "provider-primary", url: "https://user:secret@rpc.example" }],
      [{ name: "payment-primary", provider: "provider-primary", url: "https://rpc.example/?key=secret" }],
      [{ name: "payment-primary", provider: "provider-primary", url: "https://rpc.example", headers: { Host: "attacker.example" } }],
      [
        { name: "payment-primary", provider: "provider-primary", url: "https://one.example" },
        { name: "payment-primary", provider: "provider-secondary", url: "https://two.example" },
      ],
    ]) {
      assert.deepEqual(parseEthereumRpcEndpoints(JSON.stringify(value)), []);
    }
    assert.equal(parseEthereumRpcEndpoints("not-json").length, 0);
  });

  await t.test("payment activation requires legal approval outside local preview", async () => {
    const names = [
      "NODEZUNO_RUNTIME",
      "NODEZUNO_LOCAL_PREVIEW",
      "NODEZUNO_LEGAL_LAUNCH_APPROVED",
      "NODEZUNO_STABLECOIN_PAYMENT_MODE",
      "NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON",
      "PUBLIC_ORIGIN",
      "BETTER_AUTH_URL",
    ];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const endpoints = JSON.stringify([
      { name: "payment-primary", provider: "provider-primary", url: RPC_URL, headers: {} },
      { name: "payment-secondary", provider: "provider-secondary", url: RPC_URL_SECONDARY, headers: {} },
    ]);
    try {
      process.env.NODEZUNO_RUNTIME = "container";
      process.env.NODEZUNO_LOCAL_PREVIEW = "false";
      process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED = "false";
      process.env.NODEZUNO_STABLECOIN_PAYMENT_MODE = "disabled";
      delete process.env.NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON;
      assert.equal((await stablecoinPaymentConfiguration()).ready, true);

      process.env.NODEZUNO_STABLECOIN_PAYMENT_MODE = "ethereum_mainnet";
      process.env.NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON = endpoints;
      assert.equal((await stablecoinPaymentConfiguration()).ready, false);

      process.env.NODEZUNO_LOCAL_PREVIEW = "true";
      process.env.PUBLIC_ORIGIN = "http://localhost:3000";
      process.env.BETTER_AUTH_URL = "http://localhost:3000";
      assert.equal((await stablecoinPaymentConfiguration()).ready, true);

      process.env.NODEZUNO_LOCAL_PREVIEW = "false";
      process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED = "true";
      assert.equal((await stablecoinPaymentConfiguration()).ready, true);

      process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED = "false";
      process.env.NODEZUNO_STABLECOIN_PAYMENT_MODE = "manual_ethereum";
      delete process.env.NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON;
      const manual = await stablecoinPaymentConfiguration();
      assert.equal(manual.ready, false);
      assert.equal(manual.mode, "manual_ethereum");
      assert.equal(manual.legalLaunchApproved, false);
      assert.deepEqual(manual.endpoints, []);

      process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED = "true";
      assert.equal((await stablecoinPaymentConfiguration()).ready, true);
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  await t.test("submission alone never marks paid and finalized evidence advances exactly once", async () => {
    await withPaymentDatabase(async ({ pathname }) => {
      const first = await payableOrder("first", 81);
      const intentResult = await createStablecoinPaymentIntent({
        request: first.request,
        id: first.id,
        phase: "deposit",
        proposalVersion: first.proposalVersion,
        asset: "USDC",
        idempotencyKey: "payment-first-intent-2026",
      });
      const instruction = intentResult.payment.intent;
      assert.equal(instruction.chainId, 1);
      assert.equal(instruction.network, "Ethereum Mainnet");
      assert.equal(instruction.tokenContract, STABLECOIN_ASSETS.USDC.contract);
      assert.equal(instruction.recipient, NODEZUNO_PAYMENT_RECIPIENT);
      assert.match(instruction.tokenAmount, /^3750\.00\d{4}$/);
      assert.equal(instruction.amount, 375_000);

      const transactionHash = `0x${"1".repeat(64)}`;
      const submitted = await submitStablecoinPaymentClaim({
        request: first.request,
        reviewOrderId: first.id,
        paymentIntentId: instruction.id,
        transactionHash,
        telegramUsername: "NodezunoBuyer",
      });
      assert.equal(submitted.claim.state, "submitted");
      assert.equal(submitted.claim.telegramUsername, "@nodezunobuyer");

      const database = createSqliteDatabase(pathname);
      assert.equal(await orderStatus(database, first.id), "deposit_pending");
      assert.equal(
        await database.prepare("SELECT telegram_username FROM review_orders WHERE id = ?")
          .bind(first.id).first("telegram_username"),
        "@nodezunobuyer",
      );
      await assert.rejects(
        submitStablecoinPaymentClaim({
          request: first.request,
          reviewOrderId: first.id,
          paymentIntentId: instruction.id,
          transactionHash,
          telegramUsername: "DifferentBuyer",
        }),
        hasProblem(409, "transaction_claim_details_conflict"),
      );

      await withRpcEvidence({
        transactionHash,
        tokenContract: instruction.tokenContract,
        recipient: instruction.recipient,
        amountAtomic: instruction.amountAtomic,
      }, async () => {
        const worker = await processStablecoinPaymentsOnce();
        assert.equal(worker.selected, 1);
        assert.equal(worker.verified, 1);
        assert.equal(worker.confirming, 0);
      });
      assert.equal(await orderStatus(database, first.id), "deposit_paid");
      assert.equal(
        await database.prepare("SELECT state FROM review_stablecoin_payment_claims WHERE id = ?")
          .bind(submitted.claim.id).first("state"),
        "verified",
      );
      assert.equal(
        await database.prepare("SELECT COUNT(*) AS count FROM review_order_events WHERE review_order_id = ? AND event_type = 'payment.confirmed'")
          .bind(first.id).first("count"),
        1,
      );
      const confirmations = await listStablecoinPaymentConfirmations(first.id);
      assert.equal(confirmations.length, 1);
      assert.equal(confirmations[0].recordKind, "exact_match");
      assert.equal(confirmations[0].recordHash, confirmations[0].evidenceHash);
      assert.match(confirmations[0].receiptReference, /^NZ-ETH-[A-F0-9]{64}$/);
      await assert.rejects(
        database.prepare("UPDATE review_stablecoin_payment_confirmations SET recorded_at = recorded_at + 1 WHERE id = ?")
          .bind(confirmations[0].id).run(),
        /immutable/,
      );
      await assert.rejects(
        database.prepare("DELETE FROM review_stablecoin_payment_confirmations WHERE id = ?")
          .bind(confirmations[0].id).run(),
        /cannot be deleted/,
      );
      await assert.rejects(
        database.prepare("UPDATE review_stablecoin_payment_claims SET state = 'checking' WHERE id = ?")
          .bind(submitted.claim.id).run(),
        /state is immutable/,
      );
      assert.deepEqual(
        await verifyStablecoinPaymentClaim(submitted.claim.id),
        { state: "verified", claimId: submitted.claim.id },
      );
      assert.equal(
        await database.prepare("SELECT COUNT(*) AS count FROM review_order_events WHERE review_order_id = ? AND event_type = 'payment.confirmed'")
          .bind(first.id).first("count"),
        1,
      );
    });
  });

  await t.test("manual Cloudflare payment stays pending until an operator records the check", async () => {
    await withPaymentDatabase(async ({ pathname }) => {
      const buyer = await payableOrder("manual", 82);
      const instruction = (await createStablecoinPaymentIntent({
        request: buyer.request,
        id: buyer.id,
        phase: "deposit",
        proposalVersion: buyer.proposalVersion,
        asset: "USDC",
        idempotencyKey: "payment-manual-intent-2026",
      })).payment.intent;
      const transactionHash = `0x${"a".repeat(64)}`;
      const submission = await submitStablecoinPaymentClaim({
        request: buyer.request,
        reviewOrderId: buyer.id,
        paymentIntentId: instruction.id,
        transactionHash,
        telegramUsername: "NodezunoBuyer",
      });

      assert.equal(submission.claim.state, "manual_review");
      assert.equal(await orderStatus(createSqliteDatabase(pathname), buyer.id), "deposit_pending");
      const database = createSqliteDatabase(pathname);
      assert.equal(await database.prepare(`SELECT COUNT(*) AS count
        FROM review_stablecoin_payment_confirmations WHERE review_order_id = ?`)
        .bind(buyer.id).first("count"), 0);

      const updated = await adminUpdateReviewOrder({
        id: buyer.id,
        actorEmail: "info@nodezuno.com",
        body: {
          action: "confirm_payment_manually",
          note: "Checked official USDC, successful transaction, exact recipient and amount.",
        },
      });
      assert.equal(updated.status, "deposit_paid");
      assert.equal(await database.prepare(`SELECT COUNT(*) AS count
        FROM review_stablecoin_payment_confirmations WHERE review_order_id = ?`)
        .bind(buyer.id).first("count"), 0);

      const event = await database.prepare(`SELECT detail_json FROM review_order_events
        WHERE review_order_id = ? AND event_type = 'admin.confirm_payment_manually'`)
        .bind(buyer.id).first("detail_json");
      const detail = JSON.parse(event);
      assert.equal(detail.manualPaymentAudit.transactionHash, transactionHash);
      assert.match(detail.manualPaymentAudit.note, /official USDC/);

      const projection = await publicReviewOrder(updated);
      assert.equal(projection.status, "deposit_paid");
      assert.equal(projection.stablecoinPayment.claim.state, "manual_review");
      assert.equal(projection.stablecoinPayment.intent.state, "manual_review");
      const buyerMessages = await database.prepare(`SELECT payload_json FROM notification_outbox
        WHERE topic = 'review.lifecycle.buyer' AND entity_id = ? ORDER BY created_at ASC`)
        .bind(buyer.id).all();
      assert.ok(buyerMessages.results.some(({ payload_json }) => JSON.parse(payload_json).action === "payment_submission_received"));
      assert.ok(buyerMessages.results.some(({ payload_json }) => JSON.parse(payload_json).action === "payment_manually_confirmed"));
    }, "manual_ethereum");
  });

  await t.test("an issued payment can capture transaction evidence during an RPC outage", async () => {
    await withPaymentDatabase(async ({ pathname }) => {
      const buyer = await payableOrder("rpc-outage", 89);
      const instruction = (await createStablecoinPaymentIntent({
        request: buyer.request,
        id: buyer.id,
        phase: "deposit",
        proposalVersion: buyer.proposalVersion,
        asset: "USDC",
        idempotencyKey: "payment-outage-intent-2026",
      })).payment.intent;

      process.env.NODEZUNO_STABLECOIN_PAYMENT_MODE = "disabled";
      delete process.env.NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON;

      const submitted = await submitStablecoinPaymentClaim({
        request: buyer.request,
        reviewOrderId: buyer.id,
        paymentIntentId: instruction.id,
        transactionHash: `0x${"9".repeat(64)}`,
        telegramUsername: "@outagebuyer",
      });
      assert.equal(submitted.claim.state, "submitted");
      assert.equal(submitted.claim.telegramUsername, "@outagebuyer");

      const database = createSqliteDatabase(pathname);
      assert.equal(await orderStatus(database, buyer.id), "deposit_pending");
      assert.equal(
        await database.prepare("SELECT telegram_username FROM review_orders WHERE id = ?")
          .bind(buyer.id).first("telegram_username"),
        "@outagebuyer",
      );
      assert.equal(
        await database.prepare("SELECT COUNT(*) AS count FROM review_order_events WHERE review_order_id = ? AND event_type = 'payment.confirmed'")
          .bind(buyer.id).first("count"),
        0,
      );
    });
  });

  await t.test("unique exact amounts and global transaction replay protect separate orders", async () => {
    await withPaymentDatabase(async () => {
      const first = await payableOrder("amount-one", 82);
      const second = await payableOrder("amount-two", 83);
      const firstIntent = (await createStablecoinPaymentIntent({
        request: first.request,
        id: first.id,
        phase: "deposit",
        proposalVersion: first.proposalVersion,
        asset: "USDT",
        idempotencyKey: "payment-amount-one-intent-2026",
      })).payment.intent;
      const secondIntent = (await createStablecoinPaymentIntent({
        request: second.request,
        id: second.id,
        phase: "deposit",
        proposalVersion: second.proposalVersion,
        asset: "USDT",
        idempotencyKey: "payment-amount-two-intent-2026",
      })).payment.intent;
      assert.notEqual(firstIntent.amountAtomic, secondIntent.amountAtomic);
      assert.notEqual(firstIntent.tokenAmount, secondIntent.tokenAmount);

      const transactionHash = `0x${"2".repeat(64)}`;
      await submitStablecoinPaymentClaim({
        request: first.request,
        reviewOrderId: first.id,
        paymentIntentId: firstIntent.id,
        transactionHash,
        telegramUsername: "@firstbuyer",
      });
      await assert.rejects(
        submitStablecoinPaymentClaim({
          request: second.request,
          reviewOrderId: second.id,
          paymentIntentId: secondIntent.id,
          transactionHash,
          telegramUsername: "@secondbuyer",
        }),
        hasProblem(409, "transaction_already_claimed"),
      );
    });
  });

  await t.test("wrong amounts are rejected and commercial state conflicts stop for review", async () => {
    await withPaymentDatabase(async ({ pathname }) => {
      const wrongAmountOrder = await payableOrder("wrong-amount", 84);
      const wrongIntent = (await createStablecoinPaymentIntent({
        request: wrongAmountOrder.request,
        id: wrongAmountOrder.id,
        phase: "deposit",
        proposalVersion: wrongAmountOrder.proposalVersion,
        asset: "USDC",
        idempotencyKey: "payment-wrong-amount-intent-2026",
      })).payment.intent;
      const wrongHash = `0x${"3".repeat(64)}`;
      const wrongClaim = await submitStablecoinPaymentClaim({
        request: wrongAmountOrder.request,
        reviewOrderId: wrongAmountOrder.id,
        paymentIntentId: wrongIntent.id,
        transactionHash: wrongHash,
        telegramUsername: "@wrongamount",
      });
      await withRpcEvidence({
        transactionHash: wrongHash,
        tokenContract: wrongIntent.tokenContract,
        recipient: wrongIntent.recipient,
        amountAtomic: (BigInt(wrongIntent.amountAtomic) + 1n).toString(),
      }, async () => {
        assert.equal((await verifyStablecoinPaymentClaim(wrongClaim.claim.id)).state, "manual_review");
      });
      const database = createSqliteDatabase(pathname);
      assert.equal(await orderStatus(database, wrongAmountOrder.id), "deposit_pending");
      assert.equal(
        await database.prepare("SELECT failure_code FROM review_stablecoin_payment_claims WHERE id = ?")
          .bind(wrongClaim.claim.id).first("failure_code"),
        "amount_mismatch",
      );
      assert.equal(
        await database.prepare("SELECT state FROM review_stablecoin_payment_intents WHERE id = ?")
          .bind(wrongIntent.id).first("state"),
        "manual_review",
      );
      await assert.rejects(
        applyReconciledStablecoinPayment({
          reviewOrderId: wrongAmountOrder.id,
          paymentClaimId: wrongClaim.claim.id,
          actorEmail: "info@nodezuno.com",
          idempotencyKey: "unsafe-overpayment-decision-2026",
          body: {
            action: "apply_to_obligation",
            note: "This arbitrary amount must remain blocked from automatic application.",
          },
        }),
        hasProblem(409, "payment_reconciliation_not_applicable"),
      );

      const conflictOrder = await payableOrder("state-conflict", 85);
      const conflictIntent = (await createStablecoinPaymentIntent({
        request: conflictOrder.request,
        id: conflictOrder.id,
        phase: "deposit",
        proposalVersion: conflictOrder.proposalVersion,
        asset: "USDC",
        idempotencyKey: "payment-state-conflict-intent-2026",
      })).payment.intent;
      const conflictHash = `0x${"4".repeat(64)}`;
      const conflictClaim = await submitStablecoinPaymentClaim({
        request: conflictOrder.request,
        reviewOrderId: conflictOrder.id,
        paymentIntentId: conflictIntent.id,
        transactionHash: conflictHash,
        telegramUsername: "@conflictbuyer",
      });
      await database.prepare("UPDATE review_orders SET status = 'cancelled' WHERE id = ?")
        .bind(conflictOrder.id).run();
      await withRpcEvidence({
        transactionHash: conflictHash,
        tokenContract: conflictIntent.tokenContract,
        recipient: conflictIntent.recipient,
        amountAtomic: conflictIntent.amountAtomic,
      }, async () => {
        assert.equal((await verifyStablecoinPaymentClaim(conflictClaim.claim.id)).state, "manual_review");
      });
      assert.equal(await orderStatus(database, conflictOrder.id), "cancelled");
      assert.equal(
        await database.prepare("SELECT failure_code FROM review_stablecoin_payment_claims WHERE id = ?")
          .bind(conflictClaim.claim.id).first("failure_code"),
        "commercial_state_conflict",
      );
    });
  });

  await t.test("only finalized safe anomalies can be applied through an immutable reconciliation", async () => {
    await withPaymentDatabase(async ({ pathname }) => {
      const buyer = await payableOrder("safe-reconciliation", 86);
      const instruction = (await createStablecoinPaymentIntent({
        request: buyer.request,
        id: buyer.id,
        phase: "deposit",
        proposalVersion: buyer.proposalVersion,
        asset: "USDC",
        idempotencyKey: "payment-safe-reconciliation-intent-2026",
      })).payment.intent;
      const transactionHash = `0x${"6".repeat(64)}`;
      const claim = await submitStablecoinPaymentClaim({
        request: buyer.request,
        reviewOrderId: buyer.id,
        paymentIntentId: instruction.id,
        transactionHash,
        telegramUsername: "@reconcilebuyer",
      });
      const contractualAmountAtomic = "3750000000";
      await withRpcEvidence({
        transactionHash,
        tokenContract: instruction.tokenContract,
        recipient: instruction.recipient,
        amountAtomic: contractualAmountAtomic,
        finalizedBlockNumber: "0x6f",
      }, async () => {
        assert.equal((await verifyStablecoinPaymentClaim(claim.claim.id)).state, "confirming");
      });
      const database = createSqliteDatabase(pathname);
      assert.equal(
        await database.prepare("SELECT COUNT(*) AS count FROM review_stablecoin_reconciliation_cases WHERE payment_claim_id = ?")
          .bind(claim.claim.id).first("count"),
        0,
      );
      await withRpcEvidence({
        transactionHash,
        tokenContract: instruction.tokenContract,
        recipient: instruction.recipient,
        amountAtomic: contractualAmountAtomic,
      }, async () => {
        assert.equal((await verifyStablecoinPaymentClaim(claim.claim.id)).state, "manual_review");
      });
      assert.equal(
        await database.prepare("SELECT COUNT(*) AS count FROM review_stablecoin_reconciliation_cases WHERE payment_claim_id = ? AND state = 'open'")
          .bind(claim.claim.id).first("count"),
        1,
      );

      const applied = await applyReconciledStablecoinPayment({
        reviewOrderId: buyer.id,
        paymentClaimId: claim.claim.id,
        actorEmail: "info@nodezuno.com",
        idempotencyKey: "safe-reconciliation-decision-2026",
        body: {
          action: "apply_to_obligation",
          note: "The finalized official USDC transfer equals the exact contractual deposit amount.",
        },
      });
      assert.equal(applied.replayed, false);
      assert.equal(applied.confirmation.recordKind, "reconciliation");
      assert.equal(applied.confirmation.receivedAmountAtomic, contractualAmountAtomic);
      assert.match(applied.confirmation.receiptReference, /^NZ-RECON-[A-F0-9]{32}$/);
      assert.equal(await orderStatus(database, buyer.id), "deposit_paid");
      assert.equal(
        await database.prepare("SELECT state FROM review_stablecoin_payment_claims WHERE id = ?")
          .bind(claim.claim.id).first("state"),
        "manual_review",
      );
      assert.equal(
        await database.prepare("SELECT state FROM review_stablecoin_reconciliation_cases WHERE payment_claim_id = ?")
          .bind(claim.claim.id).first("state"),
        "resolved",
      );
      const replay = await applyReconciledStablecoinPayment({
        reviewOrderId: buyer.id,
        paymentClaimId: claim.claim.id,
        actorEmail: "info@nodezuno.com",
        idempotencyKey: "safe-reconciliation-decision-2026",
        body: {
          action: "apply_to_obligation",
          note: "The finalized official USDC transfer equals the exact contractual deposit amount.",
        },
      });
      assert.equal(replay.replayed, true);
      assert.equal(replay.confirmation.id, applied.confirmation.id);
      await assert.rejects(
        applyReconciledStablecoinPayment({
          reviewOrderId: buyer.id,
          paymentClaimId: claim.claim.id,
          actorEmail: "info@nodezuno.com",
          idempotencyKey: "safe-reconciliation-decision-2026",
          body: {
            action: "apply_to_obligation",
            note: "A different resolution note must not overwrite the immutable first decision.",
          },
        }),
        hasProblem(409, "payment_reconciliation_idempotency_conflict"),
      );
      await assert.rejects(
        database.prepare("UPDATE review_stablecoin_reconciliation_cases SET resolution_note = 'tampered record' WHERE payment_claim_id = ?")
          .bind(claim.claim.id).run(),
        /progression is invalid/,
      );
    });
  });
});

async function payableOrder(label, clientOctet) {
  const payloadResult = validateReviewOrderPayload({
    contactName: "Sanjay Payment Tester",
    workEmail: `${label}@example.com`,
    company: `Payment ${label}`,
    website: "https://example.com/",
    teamType: "Protocol engineering team",
    targetChain: "Ethereum",
    auditedBaseline: "audit-v1 and commit 1111111",
    proposedRelease: "release-v2 and commit 2222222",
    changeSummary: "A bounded upgrade changes accounting behavior within an audited contract boundary.",
    affectedContracts: 2,
    changedLines: 120,
    artifactReadyDate: "2026-09-01",
    targetReleaseDate: "2026-09-15",
    publicLinks: "https://github.com/example/protocol",
    consent: true,
    sourcePath: "/review/start?source=stablecoin-test",
  });
  assert.equal(payloadResult.ok, true);
  const baseRequest = paymentRequest(clientOctet);
  const created = await createReviewOrder({
    input: payloadResult.value,
    request: baseRequest,
    idempotencyKey: `stablecoin-${label}-idempotency-key-2026`,
    requestHash: await reviewCreateRequestHash(payloadResult.value),
    emailHash: await reviewEmailHash(payloadResult.value.workEmail),
  });
  const access = await exchangeReviewAccess({
    request: baseRequest,
    id: created.order.id,
    accessToken: created.accessToken,
  });
  return {
    id: created.order.id,
    proposalVersion: created.order.proposalVersion,
    request: paymentRequest(clientOctet, access.setCookie.split(";", 1)[0]),
  };
}

function paymentRequest(clientOctet, cookie) {
  return new Request(`${ORIGIN}/api/v1/review-orders/payment-test`, {
    headers: {
      origin: ORIGIN,
      "user-agent": "Nodezuno stablecoin security test",
      "x-nodezuno-client-ip": `203.0.113.${clientOctet}`,
      ...(cookie ? { cookie } : {}),
    },
  });
}

async function withRpcEvidence(evidence, callback) {
  const originalFetch = globalThis.fetch;
  const blockHash = `0x${"b".repeat(64)}`;
  const blockNumber = "0x70";
  const timestamp = `0x${Math.floor(Date.now() / 1_000).toString(16)}`;
  try {
    globalThis.fetch = async (url, init) => {
      assert.ok(
        [RPC_URL, RPC_URL_SECONDARY].map((value) => new URL(value).toString()).includes(String(url)),
      );
      assert.equal(init?.redirect, "error");
      const request = JSON.parse(String(init?.body));
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: rpcResult(request.method, request.params, {
          ...evidence,
          blockHash,
          blockNumber,
          timestamp,
        }),
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function rpcResult(method, params, evidence) {
  if (method === "eth_chainId") return "0x1";
  if (method === "eth_blockNumber") return "0x80";
  if (method === "eth_getTransactionReceipt") {
    return {
      transactionHash: evidence.transactionHash,
      blockHash: evidence.blockHash,
      blockNumber: evidence.blockNumber,
      status: "0x1",
      logs: [{
        address: evidence.tokenContract,
        topics: [
          ETHEREUM_TRANSFER_TOPIC,
          addressTopic("0x1111111111111111111111111111111111111111"),
          addressTopic(evidence.recipient),
        ],
        data: uint256Hex(evidence.amountAtomic),
        logIndex: "0x0",
      }],
    };
  }
  if (method === "eth_getBlockByNumber" && params[0] === "finalized") {
    return {
      number: evidence.finalizedBlockNumber ?? "0x7f",
      hash: `0x${"f".repeat(64)}`,
      timestamp: evidence.timestamp,
    };
  }
  if (method === "eth_getBlockByNumber" && params[0] === "latest") {
    return { number: "0x80", hash: `0x${"e".repeat(64)}`, timestamp: evidence.timestamp };
  }
  if (method === "eth_getBlockByHash" || method === "eth_getBlockByNumber") {
    return {
      number: evidence.blockNumber,
      hash: evidence.blockHash,
      timestamp: evidence.timestamp,
    };
  }
  throw new Error(`Unexpected RPC method: ${method}`);
}

function addressTopic(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function uint256Hex(value) {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

async function orderStatus(database, id) {
  return database.prepare("SELECT status FROM review_orders WHERE id = ?")
    .bind(id).first("status");
}

async function withPaymentDatabase(callback, mode = "ethereum_mainnet") {
  const directory = await mkdtemp(path.join(tmpdir(), "nodezuno-stablecoin-security-"));
  const pathname = path.join(directory, "nodezuno.sqlite");
  const previous = Object.fromEntries(MANAGED_ENVIRONMENT.map((name) => [name, process.env[name]]));
  try {
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_DATABASE_DRIVER = "sqlite";
    process.env.NODEZUNO_SQLITE_PATH = pathname;
    process.env.NODEZUNO_LOCAL_PREVIEW = "false";
    process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED = "true";
    process.env.NODEZUNO_STABLECOIN_PAYMENT_MODE = mode;
    if (mode === "ethereum_mainnet") {
      process.env.NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON = JSON.stringify([
        { name: "payment-primary", provider: "provider-primary", url: RPC_URL, timeoutMs: 2_000, headers: {} },
        { name: "payment-secondary", provider: "provider-secondary", url: RPC_URL_SECONDARY, timeoutMs: 2_000, headers: {} },
      ]);
    } else {
      delete process.env.NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON;
    }
    process.env.NODEZUNO_PAYMENT_CONFIRMATIONS = "12";
    process.env.PUBLIC_ORIGIN = ORIGIN;
    process.env.BETTER_AUTH_URL = ORIGIN;
    process.env.BETTER_AUTH_SECRET = "stablecoin-better-auth-secret-with-ample-entropy";
    process.env.RATE_LIMIT_SECRET = "stablecoin-rate-limit-secret-with-ample-entropy";
    process.env.REVIEW_CAPABILITY_SECRET = "stablecoin-review-capability-secret-with-ample-entropy";
    await migrateSqlite({ pathname });
    const database = createSqliteDatabase(pathname);
    if (mode === "ethereum_mainnet") {
      const configuration = await stablecoinPaymentConfiguration();
      const now = Date.now();
      await database.prepare(`INSERT INTO payment_verifier_health
        (id, configuration_hash, configured_endpoint_count,
         healthy_endpoint_count, latest_block, state, failure_code,
         checked_at, updated_at)
        VALUES (1, ?, ?, ?, '1', 'healthy', NULL, ?, ?)`)
        .bind(
          await paymentVerifierConfigurationHash(configuration),
          configuration.endpoints.length,
          configuration.endpoints.length,
          now,
          now,
        ).run();
    }
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

function hasProblem(status, code) {
  return (error) => error?.status === status && error?.code === code;
}
