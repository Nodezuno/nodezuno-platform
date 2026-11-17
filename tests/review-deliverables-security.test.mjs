import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MAX_DELIVERABLE_BYTES,
  createReviewDeliverableUpload,
  finalizeReviewDeliverableUpload,
  signedReviewDeliverableDownload,
  uploadReviewDeliverableBytes,
} from "../lib/server/review-deliverables.ts";
import {
  closeSqliteDatabase,
  createSqliteDatabase,
} from "../lib/server/sqlite-database.ts";
import { migrateSqlite } from "../scripts/migrate-sqlite.mjs";

const ORDER_ID = "53fdeca4-97bb-4c9b-8a44-fb96cb022347";
const ACTOR_EMAIL = "info@nodezuno.com";
const FILE_NAME = "nodezuno-evidence-manifest.json";
const CONTENT_TYPE = "application/json";
const CONTENT = new TextEncoder().encode('{"result":"reviewed"}');
const SHA256 = await sha256Hex(CONTENT);
const MANAGED_ENVIRONMENT = [
  "NODEZUNO_DATABASE_DRIVER",
  "NODEZUNO_RUNTIME",
  "NODEZUNO_SQLITE_PATH",
];

test("review deliverables stay private and pinned to verified R2 content", async (t) => {
  await withDeliverableDatabase(async ({ database }) => {
    const bucket = new MemoryR2Bucket();

    await t.test("rejects malformed or oversized upload manifests", async () => {
      const valid = validManifest();
      for (const body of [
        null,
        [],
        { ...valid, unsupported: true },
        { ...valid, kind: "working_notes" },
        { ...valid, fileName: "../manifest.json" },
        { ...valid, fileName: "nested/manifest.json" },
        { ...valid, fileName: "nested\\manifest.json" },
        { ...valid, contentType: "text/html" },
        { ...valid, sizeBytes: 0 },
        { ...valid, sizeBytes: MAX_DELIVERABLE_BYTES + 1 },
        { ...valid, sizeBytes: 1.5 },
        { ...valid, sha256: "A".repeat(63) },
        { ...valid, sha256: "g".repeat(64) },
      ]) {
        await assertHttpProblem(
          createReviewDeliverableUpload({
            reviewOrderId: ORDER_ID,
            actorEmail: ACTOR_EMAIL,
            body,
            bucket,
          }),
          422,
          "deliverable_invalid",
        );
      }
      assert.equal(bucket.objects.size, 0);
      assert.equal(
        await database.prepare("SELECT COUNT(*) AS count FROM review_deliverables")
          .first("count"),
        0,
      );
    });

    let prepared;
    await t.test("prepares one same-origin upload without exposing storage identity", async () => {
      prepared = await createReviewDeliverableUpload({
        reviewOrderId: ORDER_ID,
        actorEmail: ACTOR_EMAIL,
        body: validManifest(),
        bucket,
      });
      assert.equal(prepared.upload.method, "PUT");
      assert.equal(prepared.upload.url.startsWith("/api/v1/admin/"), true);
      assert.equal(prepared.deliverable.state, "upload_pending");
      assert.equal(prepared.deliverable.sha256, SHA256);
      assert.equal(prepared.deliverable.sizeBytes, CONTENT.byteLength);
      assert.equal("objectKey" in prepared.deliverable, false);
      assert.equal("createdByEmail" in prepared.deliverable, false);
      assert.equal(JSON.stringify(prepared).includes("nodezuno-deliverables"), false);

      await assertHttpProblem(
        createReviewDeliverableUpload({
          reviewOrderId: ORDER_ID,
          actorEmail: ACTOR_EMAIL,
          body: validManifest(),
          bucket,
        }),
        409,
        "deliverable_exists",
      );
    });

    await t.test("checks byte length, type, checksum, and write-once behavior", async () => {
      assert.ok(prepared);
      const upload = (overrides = {}) => uploadReviewDeliverableBytes({
        reviewOrderId: ORDER_ID,
        deliverableId: prepared.deliverable.id,
        contentLength: String(CONTENT.byteLength),
        contentType: CONTENT_TYPE,
        sha256: SHA256,
        body: new Response(CONTENT).body,
        bucket,
        ...overrides,
      });

      await assertHttpProblem(upload({ contentLength: "1" }), 422, "deliverable_upload_manifest_mismatch");
      await assertHttpProblem(upload({ contentType: "text/html" }), 422, "deliverable_upload_manifest_mismatch");
      await assertHttpProblem(upload({ sha256: "f".repeat(64) }), 422, "deliverable_upload_manifest_mismatch");
      assert.equal(bucket.objects.size, 0);

      const uploaded = await upload();
      assert.deepEqual(uploaded, { uploaded: true, sizeBytes: CONTENT.byteLength });
      assert.equal(bucket.objects.size, 1);
      await assertHttpProblem(upload(), 409, "deliverable_already_uploaded");
      assert.equal(bucket.objects.size, 1);
    });

    await t.test("finalizes only exact checksum, metadata, and immutable object identity", async () => {
      assert.ok(prepared);
      const objectKey = `reviews/${ORDER_ID}/${prepared.deliverable.id}`;
      const object = bucket.objects.get(objectKey);
      assert.ok(object);
      object.checksums.sha256 = new Uint8Array(32).fill(7);
      await assertHttpProblem(
        finalizeReviewDeliverableUpload({
          reviewOrderId: ORDER_ID,
          deliverableId: prepared.deliverable.id,
          actorEmail: ACTOR_EMAIL,
          bucket,
        }),
        409,
        "deliverable_evidence_mismatch",
      );
      assert.equal(
        await database.prepare("SELECT state FROM review_deliverables WHERE id = ?")
          .bind(prepared.deliverable.id).first("state"),
        "upload_pending",
      );

      object.checksums.sha256 = await sha256Bytes(CONTENT);
      const finalized = await finalizeReviewDeliverableUpload({
        reviewOrderId: ORDER_ID,
        deliverableId: prepared.deliverable.id,
        actorEmail: ACTOR_EMAIL,
        bucket,
      });
      assert.equal(finalized.state, "available");
      assert.equal("objectKey" in finalized, false);
      const stored = await database.prepare(`SELECT state,
          storage_etag AS storageEtag, storage_version_id AS storageVersionId
        FROM review_deliverables WHERE id = ?`).bind(prepared.deliverable.id).first();
      assert.equal(stored.state, "available");
      assert.equal(stored.storageEtag, object.etag);
      assert.equal(stored.storageVersionId, object.version);
    });

    await t.test("downloads only the released exact object and rejects identity drift", async () => {
      assert.ok(prepared);
      await database.prepare(`UPDATE review_deliverables
        SET state = 'released', released_at = ? WHERE id = ? AND state = 'available'`)
        .bind(Date.now(), prepared.deliverable.id).run();

      const download = await signedReviewDeliverableDownload({
        reviewOrderId: ORDER_ID,
        deliverableId: prepared.deliverable.id,
        bucket,
      });
      assert.equal(download.status, 200);
      assert.equal(download.headers.get("cache-control"), "private, no-store, max-age=0");
      assert.equal(download.headers.get("content-disposition"), `attachment; filename="${FILE_NAME}"`);
      assert.equal(new TextDecoder().decode(await download.arrayBuffer()), new TextDecoder().decode(CONTENT));

      bucket.returnVersion = "changed-version";
      await assertHttpProblem(
        signedReviewDeliverableDownload({
          reviewOrderId: ORDER_ID,
          deliverableId: prepared.deliverable.id,
          bucket,
        }),
        503,
        "deliverable_storage_identity_changed",
      );
      bucket.returnVersion = null;
    });
  });
});

class MemoryR2Bucket {
  objects = new Map();
  returnVersion = null;

  async put(key, value, options = {}) {
    if (this.objects.has(key) && options.onlyIf?.etagDoesNotMatch === "*") return null;
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    const checksum = await sha256Bytes(bytes);
    if (options.sha256 && !equalBytes(options.sha256, checksum)) {
      throw new Error("R2 checksum validation failed");
    }
    const object = {
      etag: (await sha256Hex(bytes)).slice(0, 32),
      version: crypto.randomUUID(),
      size: bytes.byteLength,
      checksums: { sha256: checksum },
      httpMetadata: structuredClone(options.httpMetadata ?? {}),
      customMetadata: structuredClone(options.customMetadata ?? {}),
      bytes,
    };
    this.objects.set(key, object);
    return this.withoutBody(object);
  }

  async head(key) {
    const object = this.objects.get(key);
    return object ? this.withoutBody(object) : null;
  }

  async get(key, options = {}) {
    const object = this.objects.get(key);
    if (!object || (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== object.etag)) return null;
    return {
      ...this.withoutBody(object),
      version: this.returnVersion ?? object.version,
      body: new Response(object.bytes).body,
    };
  }

  async delete(key) {
    this.objects.delete(key);
  }

  withoutBody(object) {
    const metadata = { ...object };
    delete metadata.bytes;
    return structuredClone(metadata);
  }
}

function validManifest() {
  return {
    kind: "manifest",
    fileName: FILE_NAME,
    contentType: CONTENT_TYPE,
    sizeBytes: CONTENT.byteLength,
    sha256: SHA256,
  };
}

async function withDeliverableDatabase(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "nodezuno-r2-deliverables-"));
  const pathname = path.join(directory, "nodezuno.sqlite");
  const previous = Object.fromEntries(MANAGED_ENVIRONMENT.map((name) => [name, process.env[name]]));
  try {
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_DATABASE_DRIVER = "sqlite";
    process.env.NODEZUNO_SQLITE_PATH = pathname;
    await migrateSqlite({ pathname });
    const database = createSqliteDatabase(pathname);
    await insertScheduledReviewOrder(database);
    await callback({ database, pathname });
  } finally {
    closeSqliteDatabase(pathname);
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

async function insertScheduledReviewOrder(database) {
  const now = Date.now();
  await database.prepare(`INSERT INTO review_orders (
    id, reference, status, contact_name, work_email, email_hash,
    company, team_type, target_chain, audited_baseline, proposed_release,
    change_summary, affected_contracts, source_path, access_token_hash,
    idempotency_key, request_hash, ip_hash, consent_version, consented_at,
    created_at, updated_at, expires_at
  ) VALUES (
    ?, ?, 'scheduled', 'Deliverable Security Tester', 'buyer@example.com', ?,
    'Nodezuno Test Protocol', 'Protocol engineering team', 'Ethereum',
    'audit-v1', 'release-v2', 'A frozen production upgrade.', 2,
    '/review/start', ?, ?, ?, ?, 'review-intake-v1', ?, ?, ?, ?
  )`).bind(
    ORDER_ID,
    "NZ-DELIVERABLE-SECURITY-0001",
    "e".repeat(64),
    "a".repeat(64),
    "deliverable-security-idempotency-key-0001",
    "b".repeat(64),
    "c".repeat(64),
    now,
    now,
    now,
    now + 7 * 24 * 60 * 60 * 1000,
  ).run();
}

async function sha256Bytes(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", value));
}

async function sha256Hex(value) {
  return [...await sha256Bytes(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalBytes(left, right) {
  const a = new Uint8Array(left.buffer ?? left, left.byteOffset ?? 0, left.byteLength);
  const b = new Uint8Array(right.buffer ?? right, right.byteOffset ?? 0, right.byteLength);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function assertHttpProblem(promise, status, code) {
  await assert.rejects(
    promise,
    (error) => error?.status === status && error?.code === code,
  );
}
