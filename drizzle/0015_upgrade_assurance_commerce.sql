CREATE TABLE `review_orders` (
  `id` text PRIMARY KEY NOT NULL,
  `reference` text NOT NULL,
  `status` text DEFAULT 'qualification_pending' NOT NULL,
  `contact_name` text NOT NULL,
  `work_email` text NOT NULL,
  `email_hash` text NOT NULL,
  `company` text NOT NULL,
  `website` text,
  `team_type` text NOT NULL,
  `target_chain` text NOT NULL,
  `audited_baseline` text NOT NULL,
  `proposed_release` text NOT NULL,
  `change_summary` text NOT NULL,
  `affected_contracts` integer NOT NULL,
  `changed_lines` integer,
  `artifact_ready_date` text,
  `target_release_date` text,
  `public_links` text,
  `source_path` text NOT NULL,
  `total_amount` integer DEFAULT 750000 NOT NULL,
  `deposit_amount` integer DEFAULT 375000 NOT NULL,
  `balance_amount` integer DEFAULT 375000 NOT NULL,
  `currency` text DEFAULT 'usd' NOT NULL,
  `proposal_version` integer,
  `proposal_title` text,
  `proposal_scope` text,
  `proposal_exclusions` text,
  `proposal_reviewer` text,
  `proposal_issued_at` integer,
  `proposal_expires_at` integer,
  `proposal_accepted_at` integer,
  `next_action` text,
  `submitted_by_account_id` text REFERENCES `auth_users`(`id`) ON DELETE SET NULL,
  `access_token_hash` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `ip_hash` text NOT NULL,
  `user_agent_hash` text,
  `consent_version` text NOT NULL,
  `consented_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  CONSTRAINT `review_orders_status_check` CHECK (`status` IN ('qualification_pending','needs_information','proposal_ready','deposit_pending','deposit_paid','scheduled','in_review','remediation','balance_due','paid','payment_refunded','completed','declined','cancelled')),
  CONSTRAINT `review_orders_amount_check` CHECK (`total_amount` = 750000 AND `deposit_amount` = 375000 AND `balance_amount` = 375000 AND `currency` = 'usd'),
  CONSTRAINT `review_orders_contracts_check` CHECK (`affected_contracts` >= 1 AND `affected_contracts` <= 10000),
  CONSTRAINT `review_orders_changed_lines_check` CHECK (`changed_lines` IS NULL OR (`changed_lines` >= 0 AND `changed_lines` <= 1000000))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_orders_reference_unique` ON `review_orders` (`reference`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_orders_idempotency_unique` ON `review_orders` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `review_orders_status_created_idx` ON `review_orders` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `review_orders_account_created_idx` ON `review_orders` (`submitted_by_account_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `review_orders_email_created_idx` ON `review_orders` (`email_hash`,`created_at`);
--> statement-breakpoint
CREATE INDEX `review_orders_expiry_idx` ON `review_orders` (`expires_at`);
--> statement-breakpoint

CREATE TABLE `review_order_events` (
  `id` text PRIMARY KEY NOT NULL,
  `review_order_id` text NOT NULL REFERENCES `review_orders`(`id`) ON DELETE CASCADE,
  `event_type` text NOT NULL,
  `actor_type` text NOT NULL,
  `actor_email` text,
  `detail_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `review_order_events_order_created_idx` ON `review_order_events` (`review_order_id`,`created_at`);
--> statement-breakpoint

CREATE TABLE `review_payments` (
  `id` text PRIMARY KEY NOT NULL,
  `review_order_id` text NOT NULL REFERENCES `review_orders`(`id`) ON DELETE CASCADE,
  `phase` text NOT NULL,
  `provider` text NOT NULL,
  `provider_session_id` text NOT NULL,
  `provider_payment_intent_id` text,
  `checkout_url` text NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `amount` integer NOT NULL,
  `currency` text DEFAULT 'usd' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `paid_at` integer,
  `refunded_at` integer,
  CONSTRAINT `review_payments_phase_check` CHECK (`phase` IN ('deposit','balance')),
  CONSTRAINT `review_payments_provider_check` CHECK (`provider` IN ('stripe','local_test')),
  CONSTRAINT `review_payments_status_check` CHECK (`status` IN ('open','paid','failed','expired','cancelled','refunded')),
  CONSTRAINT `review_payments_currency_check` CHECK (`currency` = 'usd'),
  CONSTRAINT `review_payments_amount_check` CHECK (`amount` IN (375000))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_payments_provider_session_unique` ON `review_payments` (`provider`,`provider_session_id`);
--> statement-breakpoint
CREATE INDEX `review_payments_order_created_idx` ON `review_payments` (`review_order_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_payments_open_phase_unique`
ON `review_payments` (`review_order_id`,`phase`) WHERE `status` = 'open';
--> statement-breakpoint

CREATE TABLE `payment_webhook_events` (
  `provider_event_id` text PRIMARY KEY NOT NULL,
  `event_type` text NOT NULL,
  `livemode` integer NOT NULL,
  `payload_hash` text NOT NULL,
  `processed_at` integer NOT NULL
);
--> statement-breakpoint

UPDATE `status_services`
SET `slug` = 'website', `name` = 'Public website',
    `description` = 'Public product, documentation, authentication, and buyer journey.',
    `state` = 'operational', `sort_order` = 1,
    `updated_at` = unixepoch() * 1000
WHERE `sort_order` = 1;
--> statement-breakpoint

UPDATE `status_services`
SET `slug` = 'review-intake', `name` = 'Upgrade review intake',
    `description` = 'Structured qualification and private tracking persistence.',
    `state` = 'operational', `sort_order` = 2,
    `updated_at` = unixepoch() * 1000
WHERE `sort_order` = 2;
--> statement-breakpoint

UPDATE `status_services`
SET `slug` = 'payment-checkout', `name` = 'Payment checkout',
    `description` = 'Hosted checkout for approved proposals. Availability depends on configured payment mode.',
    `state` = 'preview', `sort_order` = 3,
    `updated_at` = unixepoch() * 1000
WHERE `sort_order` = 3;
--> statement-breakpoint

UPDATE `status_services`
SET `slug` = 'review-portal', `name` = 'Private review portal',
    `description` = 'Capability-protected proposal, payment, and engagement status.',
    `state` = 'operational', `sort_order` = 4,
    `updated_at` = unixepoch() * 1000
WHERE `sort_order` = 4;
--> statement-breakpoint

UPDATE `status_services`
SET `visible` = 0, `updated_at` = unixepoch() * 1000
WHERE `sort_order` > 4;
