import { getDatabase } from "./database-binding.ts";
import { HttpProblem } from "./http.ts";

const DELIVERABLE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._() -]{0,179}$/;
// Keep uploads below the Workers Free request-body ceiling with room for
// multipart-free HTTP framing and future platform changes.
export const MAX_DELIVERABLE_BYTES = 90 * 1024 * 1024;
const CONTENT_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/json",
  "text/plain",
]);
const KINDS = new Set(["final_report", "evidence_archive", "manifest"]);

type DeliverableKind = "final_report" | "evidence_archive" | "manifest";
type DeliverableState = "upload_pending" | "available" | "released" | "revoked";
type DeliverablesBucket = Pick<R2Bucket, "put" | "head" | "get" | "delete">;

type DeliverableRow = {
  id: string;
  reviewOrderId: string;
  kind: DeliverableKind;
  state: DeliverableState;
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storageEtag: string | null;
  storageVersionId: string | null;
  createdByEmail: string;
  createdAt: number;
  uploadedAt: number | null;
  releasedAt: number | null;
  revokedAt: number | null;
};

const DELIVERABLE_SELECT = `SELECT
  id, review_order_id AS reviewOrderId, kind, state,
  object_key AS objectKey, file_name AS fileName,
  content_type AS contentType, size_bytes AS sizeBytes, sha256,
  storage_etag AS storageEtag, storage_version_id AS storageVersionId,
  created_by_email AS createdByEmail,
  created_at AS createdAt, uploaded_at AS uploadedAt,
  released_at AS releasedAt, revoked_at AS revokedAt
  FROM review_deliverables`;

export async function createReviewDeliverableUpload(options: {
  reviewOrderId: string;
  actorEmail: string;
  body: unknown;
  bucket?: DeliverablesBucket;
}) {
  const input = validateDeliverableInput(options.body);
  const bucket = await requireDeliverablesBucket(options.bucket);
  const db = await getDatabase();
  const order = await db.prepare(
    "SELECT id, reference, status FROM review_orders WHERE id = ? LIMIT 1",
  ).bind(options.reviewOrderId).first<{ id: string; reference: string; status: string }>();
  if (!order) throw new HttpProblem(404, "review_order_not_found", "The review request was not found.");
  if (!["scheduled", "in_review", "remediation", "balance_due", "paid"].includes(order.status)) {
    throw new HttpProblem(409, "deliverable_state_invalid", "Deliverables can be prepared only after the review is scheduled.");
  }

  const now = Date.now();
  const staleUploads = await db.prepare(`SELECT object_key AS objectKey
    FROM review_deliverables
    WHERE review_order_id = ? AND kind = ? AND state = 'upload_pending'
      AND created_at <= ? LIMIT 20`).bind(order.id, input.kind, now - 30 * 60_000).all<{ objectKey: string }>();
  await db.prepare(`UPDATE review_deliverables
    SET state = 'revoked', revoked_at = ?
    WHERE review_order_id = ? AND kind = ? AND state = 'upload_pending'
      AND created_at <= ?`).bind(now, order.id, input.kind, now - 30 * 60_000).run();
  await Promise.all((staleUploads.results ?? []).map(({ objectKey }) => bucket.delete(objectKey).catch(() => undefined)));

  const existing = await db.prepare(`${DELIVERABLE_SELECT}
    WHERE review_order_id = ? AND kind = ? AND state != 'revoked'
    LIMIT 1`).bind(order.id, input.kind).first<DeliverableRow>();
  if (existing) {
    throw new HttpProblem(409, "deliverable_exists", "An active file already exists for this deliverable type.");
  }

  const id = crypto.randomUUID();
  const objectKey = `reviews/${order.id}/${id}`;
  const prepared = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO review_deliverables
      (id, review_order_id, kind, state, object_key, file_name,
       content_type, size_bytes, sha256, created_by_email, created_at)
      VALUES (?, ?, ?, 'upload_pending', ?, ?, ?, ?, ?, ?, ?)`).bind(
        id, order.id, input.kind, objectKey, input.fileName, input.contentType,
        input.sizeBytes, input.sha256, options.actorEmail, now,
      ),
    db.prepare(`INSERT INTO admin_audit_events
      (id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at)
      SELECT ?, ?, 'review_deliverable.prepare', 'review_deliverable', ?, NULL, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_deliverables
        WHERE id = ? AND state = 'upload_pending' AND created_at = ?)`).bind(
          crypto.randomUUID(), options.actorEmail, id,
          JSON.stringify({
            reviewOrderId: order.id,
            kind: input.kind,
            fileName: input.fileName,
            contentType: input.contentType,
            sizeBytes: input.sizeBytes,
            sha256: input.sha256,
          }),
          now, id, now,
        ),
  ]);
  if (Number(prepared[0]?.meta?.changes ?? 0) !== 1) {
    throw new HttpProblem(409, "deliverable_exists", "An active file already exists for this deliverable type.");
  }
  return {
    deliverable: publicDeliverable({
      id,
      reviewOrderId: order.id,
      kind: input.kind,
      state: "upload_pending",
      objectKey,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      storageEtag: null,
      storageVersionId: null,
      createdByEmail: options.actorEmail,
      createdAt: now,
      uploadedAt: null,
      releasedAt: null,
      revokedAt: null,
    }),
    upload: {
      method: "PUT",
      url: `/api/v1/admin/review-orders/${encodeURIComponent(order.id)}/deliverables/${encodeURIComponent(id)}/upload`,
      expiresAt: new Date(now + 30 * 60_000).toISOString(),
      headers: {
        "Content-Type": input.contentType,
        "X-Nodezuno-SHA256": input.sha256,
      },
    },
  };
}

export async function uploadReviewDeliverableBytes(options: {
  reviewOrderId: string;
  deliverableId: string;
  contentLength: string | null;
  contentType: string | null;
  sha256: string | null;
  body: ReadableStream<Uint8Array> | null;
  bucket?: DeliverablesBucket;
}) {
  if (!DELIVERABLE_ID_PATTERN.test(options.deliverableId)) {
    throw new HttpProblem(400, "deliverable_id_invalid", "The deliverable identifier is invalid.");
  }
  const bucket = await requireDeliverablesBucket(options.bucket);
  const db = await getDatabase();
  const row = await db.prepare(`${DELIVERABLE_SELECT}
    WHERE id = ? AND review_order_id = ? LIMIT 1`).bind(
      options.deliverableId, options.reviewOrderId,
    ).first<DeliverableRow>();
  if (!row) throw new HttpProblem(404, "deliverable_not_found", "The deliverable was not found.");
  if (row.state !== "upload_pending" || Date.now() - row.createdAt > 30 * 60_000) {
    throw new HttpProblem(409, "deliverable_upload_closed", "This deliverable upload is no longer open.");
  }
  const contentLength = options.contentLength;
  if (
    !contentLength || !/^\d{1,9}$/.test(contentLength) ||
    Number(contentLength) !== row.sizeBytes ||
    row.sizeBytes > MAX_DELIVERABLE_BYTES ||
    options.contentType?.split(";", 1)[0]?.trim().toLowerCase() !== row.contentType ||
    options.sha256?.trim().toLowerCase() !== row.sha256 ||
    !options.body
  ) {
    throw new HttpProblem(422, "deliverable_upload_manifest_mismatch", "The upload does not match the approved file name, size, type, and SHA-256 manifest.");
  }

  try {
    const object = await bucket.put(row.objectKey, options.body, {
      sha256: hexToBytes(row.sha256),
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: {
        contentType: row.contentType,
        cacheControl: "private, no-store",
      },
      customMetadata: {
        nodezunoOrder: row.reviewOrderId,
        nodezunoDeliverable: row.id,
        nodezunoSha256: row.sha256,
      },
    });
    if (!object) {
      throw new HttpProblem(409, "deliverable_already_uploaded", "This upload has already been received. Verify it from the admin console.");
    }
    return { uploaded: true, sizeBytes: object.size };
  } catch (error) {
    if (error instanceof HttpProblem) throw error;
    throw new HttpProblem(422, "deliverable_upload_rejected", "Cloudflare R2 rejected the file stream or its SHA-256 checksum.");
  }
}

export async function finalizeReviewDeliverableUpload(options: {
  reviewOrderId: string;
  deliverableId: string;
  actorEmail: string;
  bucket?: DeliverablesBucket;
}) {
  if (!DELIVERABLE_ID_PATTERN.test(options.deliverableId)) {
    throw new HttpProblem(400, "deliverable_id_invalid", "The deliverable identifier is invalid.");
  }
  const bucket = await requireDeliverablesBucket(options.bucket);
  const db = await getDatabase();
  const row = await db.prepare(`${DELIVERABLE_SELECT}
    WHERE id = ? AND review_order_id = ? LIMIT 1`).bind(
      options.deliverableId, options.reviewOrderId,
    ).first<DeliverableRow>();
  if (!row) throw new HttpProblem(404, "deliverable_not_found", "The deliverable was not found.");
  if (row.state === "available" || row.state === "released") return publicDeliverable(row);
  if (row.state !== "upload_pending") {
    throw new HttpProblem(409, "deliverable_closed", "This deliverable upload is closed.");
  }

  let object;
  try {
    object = await bucket.head(row.objectKey);
  } catch {
    throw new HttpProblem(503, "deliverable_storage_unavailable", "Secure deliverable storage is temporarily unavailable.");
  }
  const checksum = object?.checksums?.sha256
    ? bytesToHex(object.checksums.sha256)
    : "";
  const storageEtag = normalizeEtag(object?.etag);
  const storageVersionId = normalizeStorageVersion(object?.version);
  if (
    !object ||
    object.size !== row.sizeBytes ||
    object.httpMetadata?.contentType !== row.contentType ||
    checksum !== row.sha256 ||
    object.customMetadata?.nodezunoOrder !== row.reviewOrderId ||
    object.customMetadata?.nodezunoDeliverable !== row.id ||
    object.customMetadata?.nodezunoSha256 !== row.sha256 ||
    !storageEtag ||
    !storageVersionId
  ) {
    throw new HttpProblem(409, "deliverable_evidence_mismatch", "The uploaded object does not match the sealed deliverable manifest.");
  }

  const now = Date.now();
  const result = await db.batch([
    db.prepare(`UPDATE review_deliverables
      SET state = 'available', storage_etag = ?, storage_version_id = ?, uploaded_at = ?
      WHERE id = ? AND review_order_id = ? AND state = 'upload_pending'`).bind(
        storageEtag, storageVersionId, now, row.id, row.reviewOrderId,
      ),
    db.prepare(`INSERT INTO admin_audit_events
      (id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at)
      SELECT ?, ?, 'review_deliverable.verify', 'review_deliverable', ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_deliverables
        WHERE id = ? AND state = 'available' AND uploaded_at = ?)`).bind(
          crypto.randomUUID(), options.actorEmail, row.id,
          JSON.stringify({ state: row.state }),
          JSON.stringify({ state: "available", storageEtag, storageVersionId }),
          now, row.id, now,
        ),
  ]);
  if (Number(result[0]?.meta?.changes ?? 0) !== 1) {
    throw new HttpProblem(409, "deliverable_upload_conflict", "The deliverable changed while the upload was verified.");
  }
  const updated = await db.prepare(`${DELIVERABLE_SELECT} WHERE id = ? LIMIT 1`)
    .bind(row.id).first<DeliverableRow>();
  if (!updated) throw new HttpProblem(503, "deliverable_unavailable", "The verified deliverable could not be read.");
  return publicDeliverable(updated);
}

export async function listReviewDeliverables(reviewOrderId: string, includeUnreleased = false) {
  const db = await getDatabase();
  const rows = await db.prepare(`${DELIVERABLE_SELECT}
    WHERE review_order_id = ? ${includeUnreleased ? "" : "AND state = 'released'"}
    ORDER BY kind ASC, created_at ASC`).bind(reviewOrderId).all<DeliverableRow>();
  return rows.results.map(publicDeliverable);
}

export async function signedReviewDeliverableDownload(options: {
  reviewOrderId: string;
  deliverableId: string;
  bucket?: DeliverablesBucket;
}) {
  if (!DELIVERABLE_ID_PATTERN.test(options.deliverableId)) {
    throw new HttpProblem(400, "deliverable_id_invalid", "The deliverable identifier is invalid.");
  }
  const bucket = await requireDeliverablesBucket(options.bucket);
  const db = await getDatabase();
  const row = await db.prepare(`${DELIVERABLE_SELECT}
    WHERE id = ? AND review_order_id = ? AND state = 'released' LIMIT 1`).bind(
      options.deliverableId, options.reviewOrderId,
    ).first<DeliverableRow>();
  if (!row) throw new HttpProblem(404, "deliverable_not_found", "The released deliverable was not found.");
  if (!row.storageEtag || !row.storageVersionId) {
    throw new HttpProblem(503, "deliverable_storage_identity_missing", "The released deliverable has no immutable storage identity.");
  }
  let object;
  try {
    object = await bucket.get(row.objectKey, { onlyIf: { etagMatches: row.storageEtag } });
  } catch {
    throw new HttpProblem(503, "deliverable_storage_unavailable", "Secure deliverable storage is temporarily unavailable.");
  }
  if (
    !object ||
    !object.body ||
    object.version !== row.storageVersionId ||
    object.etag !== row.storageEtag ||
    object.size !== row.sizeBytes ||
    object.checksums?.sha256 === undefined ||
    bytesToHex(object.checksums.sha256) !== row.sha256
  ) {
    throw new HttpProblem(503, "deliverable_storage_identity_changed", "The released object no longer matches its verified storage identity.");
  }
  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${row.fileName}"`,
      "Content-Length": String(row.sizeBytes),
      "Content-Type": row.contentType,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function requireDeliverablesBucket(override?: DeliverablesBucket) {
  if (override) return override;
  const { siteDeliverablesBucket } = await import("./sites-environment.ts");
  const bucket = await siteDeliverablesBucket();
  if (!bucket) {
    throw new HttpProblem(503, "deliverable_storage_unavailable", "The private Cloudflare R2 deliverables bucket is not bound to this Worker.");
  }
  return bucket;
}

function validateDeliverableInput(value: unknown): {
  kind: DeliverableKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
} {
  if (!isRecord(value)) throw new HttpProblem(422, "deliverable_invalid", "Choose a valid deliverable file.");
  const allowed = new Set(["kind", "fileName", "contentType", "sizeBytes", "sha256"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new HttpProblem(422, "deliverable_invalid", "Remove unsupported deliverable fields.");
  }
  const kind = typeof value.kind === "string" && KINDS.has(value.kind)
    ? value.kind as DeliverableKind
    : null;
  const fileName = typeof value.fileName === "string" ? value.fileName.trim() : "";
  const contentType = typeof value.contentType === "string" ? value.contentType.trim().toLowerCase() : "";
  const sizeBytes = value.sizeBytes;
  const sha256 = typeof value.sha256 === "string" ? value.sha256.trim().toLowerCase() : "";
  if (
    !kind || !FILE_NAME_PATTERN.test(fileName) || !CONTENT_TYPES.has(contentType) ||
    !Number.isSafeInteger(sizeBytes) || (sizeBytes as number) < 1 ||
    (sizeBytes as number) > MAX_DELIVERABLE_BYTES || !SHA256_PATTERN.test(sha256)
  ) {
    throw new HttpProblem(422, "deliverable_invalid", "Choose a PDF, ZIP, JSON, or plain-text file under 90 MB with a valid checksum.");
  }
  return { kind, fileName, contentType, sizeBytes: sizeBytes as number, sha256 };
}

function publicDeliverable(row: DeliverableRow) {
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    createdAt: new Date(row.createdAt).toISOString(),
    uploadedAt: row.uploadedAt ? new Date(row.uploadedAt).toISOString() : null,
    releasedAt: row.releasedAt ? new Date(row.releasedAt).toISOString() : null,
  };
}

function hexToBytes(value: string): Uint8Array {
  const bytes = value.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
  return new Uint8Array(bytes);
}

function bytesToHex(value: ArrayBuffer | ArrayBufferView): string {
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return [...bytes].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function normalizeEtag(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/^"|"$/g, "").toLowerCase();
  return /^[a-f0-9-]{1,128}$/.test(normalized) ? normalized : null;
}

function normalizeStorageVersion(value: string | undefined): string | null {
  if (!value || value.length > 1024 || /[\u0000-\u0020\u007f]/.test(value)) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
