CREATE TABLE `__nodezuno_0024_payment_cutover_guard` (
  `unsafe_records` integer NOT NULL,
  CONSTRAINT `nodezuno_0024_payment_cutover_guard_check`
    CHECK (`unsafe_records` = 0)
);
--> statement-breakpoint

INSERT INTO `__nodezuno_0024_payment_cutover_guard` (`unsafe_records`)
SELECT COUNT(*) FROM `review_payments`
WHERE `provider` != 'local_test';
--> statement-breakpoint

INSERT INTO `__nodezuno_0024_payment_cutover_guard` (`unsafe_records`)
SELECT COUNT(*) FROM `payment_webhook_events`;
--> statement-breakpoint

INSERT INTO `__nodezuno_0024_payment_cutover_guard` (`unsafe_records`)
SELECT COUNT(*)
FROM `review_stablecoin_payment_intents` AS `intent`
WHERE `intent`.`review_order_id` IN (
  SELECT `review_order_id` FROM `review_payments`
);
--> statement-breakpoint

UPDATE `notification_outbox`
SET `state` = 'failed',
    `lease_token` = NULL,
    `lease_expires_at` = NULL,
    `terminal_failure_code` = 'preproduction_payment_retired',
    `last_error` = 'Pre-production provider payment workflow retired.',
    `updated_at` = unixepoch() * 1000
WHERE `state` IN ('pending','processing')
  AND `entity_id` IN (
    SELECT `review_order_id` FROM `review_payments`
  );
--> statement-breakpoint

UPDATE `review_orders`
SET `status` = 'cancelled',
    `next_action` = 'Start a new production Ethereum payment request if service is still required.',
    `updated_at` = unixepoch() * 1000
WHERE `id` IN (
  SELECT `review_order_id` FROM `review_payments`
);
--> statement-breakpoint

INSERT OR IGNORE INTO `review_order_events`
  (`id`, `review_order_id`, `event_type`, `actor_type`, `detail_json`, `created_at`)
SELECT
  'payment-cutover-' || `id`,
  `id`,
  'payment.preproduction_workflow_retired',
  'system',
  '{"reason":"production_ethereum_only"}',
  unixepoch() * 1000
FROM `review_orders`
WHERE `id` IN (
  SELECT `review_order_id` FROM `review_payments`
);
--> statement-breakpoint

DROP TABLE IF EXISTS `payment_webhook_events`;
--> statement-breakpoint

DROP TABLE IF EXISTS `review_payments`;
--> statement-breakpoint

DROP TABLE `__nodezuno_0024_payment_cutover_guard`;
--> statement-breakpoint

PRAGMA optimize;
