CREATE TABLE `__new_zoho_notification_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `delivery_id` text,
  `topic` text NOT NULL,
  `entity_id` text NOT NULL,
  `state` text DEFAULT 'pending' NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `template_version` text,
  `payload_json` text NOT NULL,
  `payload_hash` text,
  `available_at` integer NOT NULL,
  `lease_token` text,
  `lease_expires_at` integer,
  `provider` text,
  `provider_message_id` text,
  `accepted_at` integer,
  `delivered_at` integer,
  `first_attempt_at` integer,
  `last_attempt_at` integer,
  `terminal_failure_code` text,
  `last_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `notification_outbox_state_check`
    CHECK (`state` IN ('pending', 'processing', 'accepted', 'delivered', 'failed')),
  CONSTRAINT `notification_outbox_topic_check`
    CHECK (`topic` IN (
      'submission.received',
      'review.application.received.operator',
      'review.application.received.buyer',
      'review.lifecycle.buyer',
      'newsletter.confirmation.requested',
      'newsletter.unsubscribe.requested'
    )),
  CONSTRAINT `notification_outbox_attempts_check` CHECK (`attempts` >= 0),
  CONSTRAINT `notification_outbox_seal_pair_check` CHECK (
    (`delivery_id` IS NULL AND `template_version` IS NULL AND `payload_hash` IS NULL)
    OR
    (`delivery_id` IS NOT NULL AND `template_version` IS NOT NULL AND `payload_hash` IS NOT NULL)
  ),
  CONSTRAINT `notification_outbox_delivery_id_check` CHECK (
    `delivery_id` IS NULL OR (
      length(`delivery_id`) = 36
      AND substr(`delivery_id`, 9, 1) = '-'
      AND substr(`delivery_id`, 14, 1) = '-'
      AND substr(`delivery_id`, 15, 1) = '4'
      AND substr(`delivery_id`, 19, 1) = '-'
      AND substr(`delivery_id`, 20, 1) GLOB '[89ab]'
      AND substr(`delivery_id`, 24, 1) = '-'
      AND `delivery_id` NOT GLOB '*[^a-f0-9-]*'
    )
  ),
  CONSTRAINT `notification_outbox_template_version_check`
    CHECK (`template_version` IS NULL OR length(`template_version`) BETWEEN 1 AND 80),
  CONSTRAINT `notification_outbox_payload_hash_check`
    CHECK (`payload_hash` IS NULL OR (length(`payload_hash`) = 64 AND `payload_hash` NOT GLOB '*[^a-f0-9]*')),
  CONSTRAINT `notification_outbox_payload_size_check`
    CHECK (length(`payload_json`) BETWEEN 2 AND 65536),
  CONSTRAINT `notification_outbox_lease_pair_check`
    CHECK ((`lease_token` IS NULL) = (`lease_expires_at` IS NULL)),
  CONSTRAINT `notification_outbox_lease_token_check`
    CHECK (`lease_token` IS NULL OR (length(`lease_token`) = 64 AND `lease_token` NOT GLOB '*[^a-f0-9]*')),
  CONSTRAINT `notification_outbox_provider_check`
    CHECK (`provider` IS NULL OR `provider` IN ('resend', 'zoho', 'internal')),
  CONSTRAINT `notification_outbox_provider_pair_check`
    CHECK (`provider_message_id` IS NULL OR `provider` IS NOT NULL),
  CONSTRAINT `notification_outbox_accepted_check`
    CHECK (`accepted_at` IS NULL OR `provider_message_id` IS NOT NULL),
  CONSTRAINT `notification_outbox_delivered_check`
    CHECK (`delivered_at` IS NULL OR `accepted_at` IS NOT NULL),
  CONSTRAINT `notification_outbox_state_evidence_check` CHECK (
    (`state` != 'processing' OR `lease_token` IS NOT NULL)
    AND (`state` != 'accepted' OR (`accepted_at` IS NOT NULL AND `delivered_at` IS NULL))
    AND (`state` != 'delivered' OR (`accepted_at` IS NOT NULL AND `delivered_at` IS NOT NULL))
  ),
  CONSTRAINT `notification_outbox_timestamps_check` CHECK (
    `available_at` >= 0 AND `created_at` >= 0 AND `updated_at` >= 0
    AND (`lease_expires_at` IS NULL OR `lease_expires_at` >= 0)
    AND (`accepted_at` IS NULL OR `accepted_at` >= 0)
    AND (`delivered_at` IS NULL OR `delivered_at` >= 0)
    AND (`first_attempt_at` IS NULL OR `first_attempt_at` >= 0)
    AND (`last_attempt_at` IS NULL OR `last_attempt_at` >= `first_attempt_at`)
  )
);
--> statement-breakpoint

INSERT INTO `__new_zoho_notification_outbox` (
  `id`, `delivery_id`, `topic`, `entity_id`, `state`, `attempts`,
  `template_version`, `payload_json`, `payload_hash`, `available_at`,
  `lease_token`, `lease_expires_at`, `provider`, `provider_message_id`,
  `accepted_at`, `delivered_at`, `first_attempt_at`, `last_attempt_at`,
  `terminal_failure_code`, `last_error`, `created_at`, `updated_at`
)
SELECT
  `id`, `delivery_id`, `topic`, `entity_id`, `state`, `attempts`,
  `template_version`, `payload_json`, `payload_hash`, `available_at`,
  `lease_token`, `lease_expires_at`, `provider`, `provider_message_id`,
  `accepted_at`, `delivered_at`, `first_attempt_at`, `last_attempt_at`,
  `terminal_failure_code`, `last_error`, `created_at`, `updated_at`
FROM `notification_outbox`;
--> statement-breakpoint

DROP TABLE `notification_outbox`;
--> statement-breakpoint
ALTER TABLE `__new_zoho_notification_outbox` RENAME TO `notification_outbox`;
--> statement-breakpoint

CREATE UNIQUE INDEX `notification_outbox_delivery_id_unique`
ON `notification_outbox` (`delivery_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_outbox_provider_message_unique`
ON `notification_outbox` (`provider`, `provider_message_id`)
WHERE `provider_message_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `notification_outbox_state_available_idx`
ON `notification_outbox` (`state`, `available_at`);
--> statement-breakpoint
CREATE INDEX `notification_outbox_state_lease_idx`
ON `notification_outbox` (`state`, `lease_expires_at`);
--> statement-breakpoint
CREATE INDEX `notification_outbox_topic_entity_created_idx`
ON `notification_outbox` (`topic`, `entity_id`, `created_at`);
--> statement-breakpoint

CREATE TRIGGER `notification_outbox_seal_immutable`
BEFORE UPDATE ON `notification_outbox`
WHEN OLD.`delivery_id` IS NOT NULL AND (
  NEW.`delivery_id` IS NOT OLD.`delivery_id`
  OR NEW.`topic` IS NOT OLD.`topic`
  OR NEW.`entity_id` IS NOT OLD.`entity_id`
  OR NEW.`template_version` IS NOT OLD.`template_version`
  OR NEW.`payload_json` IS NOT OLD.`payload_json`
  OR NEW.`payload_hash` IS NOT OLD.`payload_hash`
  OR NEW.`created_at` IS NOT OLD.`created_at`
)
BEGIN
  SELECT RAISE(ABORT, 'notification delivery seal is immutable');
END;
--> statement-breakpoint

CREATE TRIGGER `notification_outbox_identity_immutable`
BEFORE UPDATE ON `notification_outbox`
WHEN NEW.`id` IS NOT OLD.`id`
  OR NEW.`topic` IS NOT OLD.`topic`
  OR NEW.`entity_id` IS NOT OLD.`entity_id`
  OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'notification delivery identity is immutable');
END;
--> statement-breakpoint

CREATE TRIGGER `notification_outbox_unsealed_payload_immutable`
BEFORE UPDATE ON `notification_outbox`
WHEN OLD.`delivery_id` IS NULL
  AND NEW.`delivery_id` IS NULL
  AND NEW.`payload_json` IS NOT OLD.`payload_json`
BEGIN
  SELECT RAISE(ABORT, 'notification payload can change only while sealing');
END;
--> statement-breakpoint

CREATE TRIGGER `notification_outbox_progression_guard`
BEFORE UPDATE ON `notification_outbox`
WHEN NEW.`attempts` < OLD.`attempts`
  OR (
    NEW.`state` IS NOT OLD.`state`
    AND NOT (
      (OLD.`state` = 'pending' AND NEW.`state` IN ('processing', 'accepted', 'delivered', 'failed'))
      OR (OLD.`state` = 'processing' AND NEW.`state` IN ('pending', 'accepted', 'delivered', 'failed'))
      OR (OLD.`state` = 'accepted' AND NEW.`state` IN ('delivered', 'failed'))
      OR (OLD.`state` = 'delivered' AND NEW.`state` = 'failed')
    )
  )
  OR (
    OLD.`provider_message_id` IS NOT NULL
    AND (
      NEW.`provider` IS NOT OLD.`provider`
      OR NEW.`provider_message_id` IS NOT OLD.`provider_message_id`
    )
  )
  OR (OLD.`accepted_at` IS NOT NULL AND NEW.`accepted_at` IS NOT OLD.`accepted_at`)
  OR (OLD.`delivered_at` IS NOT NULL AND NEW.`delivered_at` IS NOT OLD.`delivered_at`)
  OR (OLD.`first_attempt_at` IS NOT NULL AND NEW.`first_attempt_at` IS NOT OLD.`first_attempt_at`)
  OR (
    OLD.`last_attempt_at` IS NOT NULL
    AND (NEW.`last_attempt_at` IS NULL OR NEW.`last_attempt_at` < OLD.`last_attempt_at`)
  )
BEGIN
  SELECT RAISE(ABORT, 'notification delivery progression is immutable');
END;
--> statement-breakpoint

DROP TABLE IF EXISTS `email_webhook_events`;
--> statement-breakpoint

PRAGMA optimize;
