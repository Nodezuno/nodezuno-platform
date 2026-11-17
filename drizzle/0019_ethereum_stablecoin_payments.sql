ALTER TABLE `review_orders` ADD `telegram_username` text;
--> statement-breakpoint

CREATE TABLE `review_stablecoin_payment_intents` (
  `id` text PRIMARY KEY NOT NULL,
  `review_order_id` text NOT NULL REFERENCES `review_orders`(`id`) ON DELETE CASCADE,
  `phase` text NOT NULL,
  `state` text DEFAULT 'awaiting_transfer' NOT NULL,
  `asset` text NOT NULL,
  `chain_id` integer DEFAULT 1 NOT NULL,
  `network` text DEFAULT 'ethereum' NOT NULL,
  `token_contract` text NOT NULL,
  `token_decimals` integer DEFAULT 6 NOT NULL,
  `recipient_address` text NOT NULL,
  `obligation_amount` integer NOT NULL,
  `obligation_currency` text DEFAULT 'usd' NOT NULL,
  `token_amount_atomic` text NOT NULL,
  `token_amount_display` text NOT NULL,
  `reference_units` integer NOT NULL,
  `proposal_version` integer NOT NULL,
  `terms_accepted_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `verified_at` integer,
  `cancelled_at` integer,
  CONSTRAINT `review_stablecoin_intents_phase_check` CHECK (`phase` IN ('deposit','balance')),
  CONSTRAINT `review_stablecoin_intents_state_check` CHECK (`state` IN ('awaiting_transfer','submitted','confirming','verified','manual_review','expired','cancelled','refunded')),
  CONSTRAINT `review_stablecoin_intents_asset_check` CHECK (`asset` IN ('USDC','USDT')),
  CONSTRAINT `review_stablecoin_intents_chain_check` CHECK (`chain_id` = 1 AND `network` = 'ethereum'),
  CONSTRAINT `review_stablecoin_intents_token_check` CHECK (
    `token_decimals` = 6 AND (
      (`asset` = 'USDC' AND `token_contract` = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') OR
      (`asset` = 'USDT' AND `token_contract` = '0xdAC17F958D2ee523a2206206994597C13D831ec7')
    )
  ),
  CONSTRAINT `review_stablecoin_intents_recipient_check` CHECK (`recipient_address` = '0x07218C8E2B01fbff950Af65A0f36D3305520aC3b'),
  CONSTRAINT `review_stablecoin_intents_amount_check` CHECK (
    `obligation_amount` = 375000 AND
    `obligation_currency` = 'usd' AND
    `token_amount_atomic` NOT GLOB '*[^0-9]*' AND
    CAST(`token_amount_atomic` AS integer) = (`obligation_amount` * 10000) + `reference_units` AND
    `token_amount_display` = printf(
      '%d.%06d',
      CAST(`token_amount_atomic` AS integer) / 1000000,
      CAST(`token_amount_atomic` AS integer) % 1000000
    ) AND
    `reference_units` BETWEEN 1 AND 9999
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_intents_asset_amount_unique`
ON `review_stablecoin_payment_intents` (`asset`,`token_amount_atomic`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_intents_active_phase_unique`
ON `review_stablecoin_payment_intents` (`review_order_id`,`phase`)
WHERE `state` IN ('awaiting_transfer','submitted','confirming','manual_review');
--> statement-breakpoint
CREATE INDEX `review_stablecoin_intents_order_created_idx`
ON `review_stablecoin_payment_intents` (`review_order_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `review_stablecoin_intents_state_expiry_idx`
ON `review_stablecoin_payment_intents` (`state`,`expires_at`);
--> statement-breakpoint

CREATE TABLE `review_stablecoin_payment_claims` (
  `id` text PRIMARY KEY NOT NULL,
  `payment_intent_id` text NOT NULL REFERENCES `review_stablecoin_payment_intents`(`id`) ON DELETE CASCADE,
  `transaction_hash` text NOT NULL,
  `telegram_username` text NOT NULL,
  `state` text DEFAULT 'submitted' NOT NULL,
  `failure_code` text,
  `observed_sender` text,
  `observed_token_contract` text,
  `observed_recipient_address` text,
  `observed_amount_atomic` text,
  `block_number` text,
  `block_hash` text,
  `log_index` text,
  `block_timestamp` integer,
  `confirmations` integer DEFAULT 0 NOT NULL,
  `evidence_hash` text,
  `rpc_agreement_count` integer DEFAULT 0 NOT NULL,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `next_check_at` integer NOT NULL,
  `last_checked_at` integer,
  `lease_token` text,
  `lease_expires_at` integer,
  `submitted_at` integer NOT NULL,
  `verified_at` integer,
  `rejected_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `review_stablecoin_claims_state_check` CHECK (`state` IN ('submitted','checking','confirming','verified','rejected','manual_review')),
  CONSTRAINT `review_stablecoin_claims_tx_hash_check` CHECK (length(`transaction_hash`) = 66 AND substr(`transaction_hash`, 1, 2) = '0x' AND substr(`transaction_hash`, 3) NOT GLOB '*[^a-f0-9]*'),
  CONSTRAINT `review_stablecoin_claims_telegram_check` CHECK (
    length(`telegram_username`) BETWEEN 6 AND 33 AND
    substr(`telegram_username`, 1, 1) = '@' AND
    substr(`telegram_username`, 2, 1) GLOB '[a-z]' AND
    substr(`telegram_username`, 2) NOT GLOB '*[^a-z0-9_]*'
  ),
  CONSTRAINT `review_stablecoin_claims_nonnegative_check` CHECK (`confirmations` >= 0 AND `rpc_agreement_count` >= 0 AND `attempt_count` >= 0),
  CONSTRAINT `review_stablecoin_claims_lease_pair_check` CHECK ((`lease_token` IS NULL) = (`lease_expires_at` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_claims_tx_hash_unique`
ON `review_stablecoin_payment_claims` (`transaction_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_claims_active_intent_unique`
ON `review_stablecoin_payment_claims` (`payment_intent_id`)
WHERE `state` IN ('submitted','checking','confirming','verified','manual_review');
--> statement-breakpoint
CREATE INDEX `review_stablecoin_claims_state_next_check_idx`
ON `review_stablecoin_payment_claims` (`state`,`next_check_at`);
--> statement-breakpoint
CREATE INDEX `review_stablecoin_claims_intent_created_idx`
ON `review_stablecoin_payment_claims` (`payment_intent_id`,`created_at`);
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_intents_immutable`
BEFORE UPDATE OF
  `review_order_id`,`phase`,`asset`,`chain_id`,`network`,`token_contract`,
  `token_decimals`,`recipient_address`,`obligation_amount`,`obligation_currency`,
  `token_amount_atomic`,`token_amount_display`,`reference_units`,`proposal_version`,
  `terms_accepted_at`,`created_at`
ON `review_stablecoin_payment_intents`
FOR EACH ROW
WHEN
  OLD.`review_order_id` IS NOT NEW.`review_order_id` OR
  OLD.`phase` IS NOT NEW.`phase` OR
  OLD.`asset` IS NOT NEW.`asset` OR
  OLD.`chain_id` IS NOT NEW.`chain_id` OR
  OLD.`network` IS NOT NEW.`network` OR
  OLD.`token_contract` IS NOT NEW.`token_contract` OR
  OLD.`token_decimals` IS NOT NEW.`token_decimals` OR
  OLD.`recipient_address` IS NOT NEW.`recipient_address` OR
  OLD.`obligation_amount` IS NOT NEW.`obligation_amount` OR
  OLD.`obligation_currency` IS NOT NEW.`obligation_currency` OR
  OLD.`token_amount_atomic` IS NOT NEW.`token_amount_atomic` OR
  OLD.`token_amount_display` IS NOT NEW.`token_amount_display` OR
  OLD.`reference_units` IS NOT NEW.`reference_units` OR
  OLD.`proposal_version` IS NOT NEW.`proposal_version` OR
  OLD.`terms_accepted_at` IS NOT NEW.`terms_accepted_at` OR
  OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'stablecoin payment instruction facts are immutable');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_claims_identity_immutable`
BEFORE UPDATE OF
  `payment_intent_id`,`transaction_hash`,`telegram_username`,`submitted_at`,`created_at`
ON `review_stablecoin_payment_claims`
FOR EACH ROW
WHEN
  OLD.`payment_intent_id` IS NOT NEW.`payment_intent_id` OR
  OLD.`transaction_hash` IS NOT NEW.`transaction_hash` OR
  OLD.`telegram_username` IS NOT NEW.`telegram_username` OR
  OLD.`submitted_at` IS NOT NEW.`submitted_at` OR
  OLD.`created_at` IS NOT NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'stablecoin payment claim identity is immutable');
END;
--> statement-breakpoint

UPDATE `status_services`
SET `slug` = 'payment-verification',
    `name` = 'Ethereum payment verification',
    `description` = 'Self-custody USDC and USDT payment claims verified from Ethereum mainnet evidence.',
    `state` = 'preview',
    `updated_at` = unixepoch() * 1000
WHERE `slug` = 'payment-checkout';
--> statement-breakpoint

PRAGMA optimize;
