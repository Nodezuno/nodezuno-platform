CREATE TABLE `review_deliverables` (
  `id` text PRIMARY KEY NOT NULL,
  `review_order_id` text NOT NULL REFERENCES `review_orders`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL,
  `state` text DEFAULT 'upload_pending' NOT NULL,
  `object_key` text NOT NULL,
  `file_name` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `sha256` text NOT NULL,
  `storage_etag` text,
  `storage_version_id` text,
  `created_by_email` text NOT NULL,
  `created_at` integer NOT NULL,
  `uploaded_at` integer,
  `released_at` integer,
  `revoked_at` integer,
  CONSTRAINT `review_deliverables_kind_check`
    CHECK (`kind` IN ('final_report','evidence_archive','manifest')),
  CONSTRAINT `review_deliverables_state_check`
    CHECK (`state` IN ('upload_pending','available','released','revoked')),
  CONSTRAINT `review_deliverables_name_check`
    CHECK (length(`file_name`) BETWEEN 1 AND 180 AND `file_name` NOT LIKE '%/%' AND `file_name` NOT LIKE '%\\%'),
  CONSTRAINT `review_deliverables_content_type_check`
    CHECK (`content_type` IN ('application/pdf','application/zip','application/json','text/plain')),
  CONSTRAINT `review_deliverables_size_check`
    CHECK (`size_bytes` BETWEEN 1 AND 104857600),
  CONSTRAINT `review_deliverables_sha_check`
    CHECK (length(`sha256`) = 64 AND `sha256` NOT GLOB '*[^a-f0-9]*'),
  CONSTRAINT `review_deliverables_version_check`
    CHECK (`storage_version_id` IS NULL OR length(`storage_version_id`) BETWEEN 1 AND 1024),
  CONSTRAINT `review_deliverables_progress_check` CHECK (
    (`state` != 'upload_pending' OR (`uploaded_at` IS NULL AND `released_at` IS NULL AND `revoked_at` IS NULL AND `storage_etag` IS NULL AND `storage_version_id` IS NULL))
    AND (`state` != 'available' OR (`uploaded_at` IS NOT NULL AND `released_at` IS NULL AND `revoked_at` IS NULL AND `storage_etag` IS NOT NULL AND `storage_version_id` IS NOT NULL))
    AND (`state` != 'released' OR (`uploaded_at` IS NOT NULL AND `released_at` IS NOT NULL AND `revoked_at` IS NULL AND `storage_etag` IS NOT NULL AND `storage_version_id` IS NOT NULL))
    AND (`state` != 'revoked' OR `revoked_at` IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_deliverables_object_key_unique`
ON `review_deliverables` (`object_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_deliverables_active_kind_unique`
ON `review_deliverables` (`review_order_id`,`kind`)
WHERE `state` != 'revoked';
--> statement-breakpoint
CREATE INDEX `review_deliverables_order_state_idx`
ON `review_deliverables` (`review_order_id`,`state`,`created_at`);
--> statement-breakpoint

CREATE TRIGGER `review_deliverables_identity_immutable`
BEFORE UPDATE OF
  `id`,`review_order_id`,`kind`,`object_key`,`file_name`,`content_type`,
  `size_bytes`,`sha256`,`created_by_email`,`created_at`
ON `review_deliverables`
FOR EACH ROW
WHEN
  OLD.`id` IS NOT NEW.`id` OR
  OLD.`review_order_id` IS NOT NEW.`review_order_id` OR
  OLD.`kind` IS NOT NEW.`kind` OR
  OLD.`object_key` IS NOT NEW.`object_key` OR
  OLD.`file_name` IS NOT NEW.`file_name` OR
  OLD.`content_type` IS NOT NEW.`content_type` OR
  OLD.`size_bytes` IS NOT NEW.`size_bytes` OR
  OLD.`sha256` IS NOT NEW.`sha256` OR
  OLD.`created_by_email` IS NOT NEW.`created_by_email` OR
  OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'review deliverable identity is immutable');
END;
--> statement-breakpoint

CREATE TRIGGER `review_deliverables_progression_guard`
BEFORE UPDATE ON `review_deliverables`
FOR EACH ROW
WHEN
  (OLD.`state` = 'upload_pending' AND NEW.`state` NOT IN ('upload_pending','available','revoked')) OR
  (OLD.`state` = 'available' AND NEW.`state` NOT IN ('available','released','revoked')) OR
  (OLD.`state` = 'released' AND NEW.`state` NOT IN ('released','revoked')) OR
  (OLD.`state` = 'revoked' AND NEW.`state` != 'revoked') OR
  (OLD.`uploaded_at` IS NOT NULL AND NEW.`uploaded_at` IS NOT OLD.`uploaded_at`) OR
  (OLD.`released_at` IS NOT NULL AND NEW.`released_at` IS NOT OLD.`released_at`) OR
  (OLD.`revoked_at` IS NOT NULL AND NEW.`revoked_at` IS NOT OLD.`revoked_at`) OR
  (OLD.`storage_etag` IS NOT NULL AND NEW.`storage_etag` IS NOT OLD.`storage_etag`) OR
  (OLD.`storage_version_id` IS NOT NULL AND NEW.`storage_version_id` IS NOT OLD.`storage_version_id`)
BEGIN
  SELECT RAISE(ABORT, 'review deliverable progression is invalid');
END;
--> statement-breakpoint

PRAGMA optimize;
