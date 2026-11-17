CREATE TABLE `email_webhook_events` (
  `provider_event_id` text PRIMARY KEY NOT NULL,
  `event_type` text NOT NULL,
  `provider_message_id` text NOT NULL,
  `payload_hash` text NOT NULL,
  `event_created_at` integer NOT NULL,
  `event_rank` integer NOT NULL,
  `processed_at` integer NOT NULL,
  CONSTRAINT `email_webhook_events_type_check`
    CHECK (`event_type` IN (
      'email.sent',
      'email.delivered',
      'email.bounced',
      'email.failed',
      'email.suppressed',
      'email.complained'
    )),
  CONSTRAINT `email_webhook_events_rank_check`
    CHECK (
      (`event_type` = 'email.sent' AND `event_rank` = 1)
      OR (`event_type` = 'email.delivered' AND `event_rank` = 2)
      OR (`event_type` IN (
        'email.bounced',
        'email.failed',
        'email.suppressed',
        'email.complained'
      ) AND `event_rank` = 3)
    ),
  CONSTRAINT `email_webhook_events_provider_event_id_check`
    CHECK (
      length(`provider_event_id`) BETWEEN 1 AND 128
      AND `provider_event_id` NOT GLOB '*[^A-Za-z0-9_.-]*'
    ),
  CONSTRAINT `email_webhook_events_provider_message_id_check`
    CHECK (
      length(`provider_message_id`) = 36
      AND substr(`provider_message_id`, 9, 1) = '-'
      AND substr(`provider_message_id`, 14, 1) = '-'
      AND substr(`provider_message_id`, 15, 1) GLOB '[1-8]'
      AND substr(`provider_message_id`, 19, 1) = '-'
      AND substr(`provider_message_id`, 20, 1) GLOB '[89ab]'
      AND substr(`provider_message_id`, 24, 1) = '-'
      AND `provider_message_id` NOT GLOB '*[^a-f0-9-]*'
    ),
  CONSTRAINT `email_webhook_events_payload_hash_check`
    CHECK (
      length(`payload_hash`) = 64
      AND `payload_hash` NOT GLOB '*[^a-f0-9]*'
    ),
  CONSTRAINT `email_webhook_events_timestamps_check`
    CHECK (`event_created_at` >= 0 AND `processed_at` >= 0)
);

CREATE INDEX `email_webhook_events_message_created_idx`
  ON `email_webhook_events`
  (`provider_message_id`, `event_created_at`, `event_rank`);

CREATE INDEX `email_webhook_events_processed_idx`
  ON `email_webhook_events` (`processed_at`);
