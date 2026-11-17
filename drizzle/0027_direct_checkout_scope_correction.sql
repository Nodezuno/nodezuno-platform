UPDATE `review_orders`
SET
  `status` = 'qualification_pending',
  `proposal_version` = NULL,
  `proposal_title` = NULL,
  `proposal_scope` = NULL,
  `proposal_exclusions` = NULL,
  `proposal_reviewer` = NULL,
  `proposal_issued_at` = NULL,
  `proposal_expires_at` = NULL,
  `next_action` =
    'Create a corrected service order with 1 to 8 affected components and 1 to 500 materially changed code lines. The new order opens checkout immediately without manual approval.',
  `updated_at` = unixepoch() * 1000
WHERE `status` = 'proposal_ready'
  AND `proposal_version` = 1
  AND `proposal_accepted_at` IS NULL
  AND (
    `affected_contracts` NOT BETWEEN 1 AND 8
    OR `changed_lines` IS NULL
    OR `changed_lines` NOT BETWEEN 1 AND 500
    OR `expires_at` <= unixepoch() * 1000
  )
  AND EXISTS (
    SELECT 1 FROM `review_order_events`
    WHERE `review_order_id` = `review_orders`.`id`
      AND `event_type` = 'order.direct_checkout_enabled'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `review_stablecoin_payment_intents`
    WHERE `review_order_id` = `review_orders`.`id`
  );
--> statement-breakpoint

INSERT OR IGNORE INTO `review_order_events`
  (`id`, `review_order_id`, `event_type`, `actor_type`, `actor_email`, `detail_json`, `created_at`)
SELECT
  'direct-checkout-correction:' || `id`,
  `id`,
  'order.direct_checkout_correction_required',
  'system',
  NULL,
  '{"source":"migration_0027","reason":"fixed_scope_bounds"}',
  `updated_at`
FROM `review_orders`
WHERE `status` = 'qualification_pending'
  AND `proposal_version` IS NULL
  AND `next_action` =
    'Create a corrected service order with 1 to 8 affected components and 1 to 500 materially changed code lines. The new order opens checkout immediately without manual approval.';
--> statement-breakpoint

PRAGMA optimize;
