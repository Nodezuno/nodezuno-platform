CREATE TABLE `review_stablecoin_reconciliation_cases` (
  `id` text PRIMARY KEY NOT NULL,
  `review_order_id` text NOT NULL REFERENCES `review_orders`(`id`) ON DELETE RESTRICT,
  `payment_intent_id` text NOT NULL REFERENCES `review_stablecoin_payment_intents`(`id`) ON DELETE RESTRICT,
  `payment_claim_id` text NOT NULL REFERENCES `review_stablecoin_payment_claims`(`id`) ON DELETE RESTRICT,
  `transaction_hash` text NOT NULL,
  `case_type` text NOT NULL,
  `state` text DEFAULT 'open' NOT NULL,
  `phase` text NOT NULL,
  `expected_asset` text NOT NULL,
  `expected_token_contract` text NOT NULL,
  `expected_recipient_address` text NOT NULL,
  `expected_amount_atomic` text NOT NULL,
  `instruction_expires_at` integer NOT NULL,
  `observed_sender_address` text,
  `observed_token_contract` text,
  `observed_recipient_address` text,
  `observed_amount_atomic` text,
  `block_number` text,
  `block_hash` text,
  `log_index` text,
  `block_timestamp` integer,
  `confirmations_observed` integer DEFAULT 0 NOT NULL,
  `confirmations_required` integer NOT NULL,
  `rpc_agreement_count` integer DEFAULT 0 NOT NULL,
  `evidence_hash` text,
  `opened_at` integer NOT NULL,
  `investigation_started_at` integer,
  `resolution_idempotency_hash` text,
  `resolution_request_hash` text,
  `resolution_code` text,
  `resolution_note` text,
  `resolution_decided_by_email` text,
  `resolution_decided_at` integer,
  `refund_transaction_hash` text,
  `refund_recorded_at` integer,
  `resolved_at` integer,
  `updated_at` integer NOT NULL,
  CONSTRAINT `review_stablecoin_reconciliation_type_check` CHECK (
    `case_type` IN ('amount_mismatch','asset_mismatch','transfer_ambiguous','transfer_after_expiry')
  ),
  CONSTRAINT `review_stablecoin_reconciliation_state_check` CHECK (
    `state` IN ('open','investigating','application_pending','refund_pending','resolved')
  ),
  CONSTRAINT `review_stablecoin_reconciliation_phase_check` CHECK (`phase` IN ('deposit','balance')),
  CONSTRAINT `review_stablecoin_reconciliation_asset_check` CHECK (`expected_asset` IN ('USDC','USDT')),
  CONSTRAINT `review_stablecoin_reconciliation_expected_token_check` CHECK (
    (`expected_asset` = 'USDC' AND `expected_token_contract` = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') OR
    (`expected_asset` = 'USDT' AND `expected_token_contract` = '0xdAC17F958D2ee523a2206206994597C13D831ec7')
  ),
  CONSTRAINT `review_stablecoin_reconciliation_recipient_check` CHECK (
    `expected_recipient_address` = '0x07218C8E2B01fbff950Af65A0f36D3305520aC3b'
  ),
  CONSTRAINT `review_stablecoin_reconciliation_transaction_check` CHECK (
    length(`transaction_hash`) = 66 AND substr(`transaction_hash`, 1, 2) = '0x' AND
    substr(`transaction_hash`, 3) NOT GLOB '*[^a-f0-9]*'
  ),
  CONSTRAINT `review_stablecoin_reconciliation_amount_check` CHECK (
    length(`expected_amount_atomic`) BETWEEN 1 AND 78 AND
    `expected_amount_atomic` NOT GLOB '*[^0-9]*' AND
    `expected_amount_atomic` GLOB '*[1-9]*' AND
    (`observed_amount_atomic` IS NULL OR (
      length(`observed_amount_atomic`) BETWEEN 1 AND 78 AND
      `observed_amount_atomic` NOT GLOB '*[^0-9]*' AND
      `observed_amount_atomic` GLOB '*[1-9]*'
    ))
  ),
  CONSTRAINT `review_stablecoin_reconciliation_observed_address_check` CHECK (
    (`observed_sender_address` IS NULL OR (
      length(`observed_sender_address`) = 42 AND substr(`observed_sender_address`, 1, 2) = '0x' AND
      substr(`observed_sender_address`, 3) NOT GLOB '*[^a-f0-9]*'
    )) AND
    (`observed_token_contract` IS NULL OR (
      length(`observed_token_contract`) = 42 AND substr(`observed_token_contract`, 1, 2) = '0x' AND
      substr(`observed_token_contract`, 3) NOT GLOB '*[^a-f0-9]*'
    )) AND
    (`observed_recipient_address` IS NULL OR (
      length(`observed_recipient_address`) = 42 AND substr(`observed_recipient_address`, 1, 2) = '0x' AND
      substr(`observed_recipient_address`, 3) NOT GLOB '*[^a-f0-9]*'
    ))
  ),
  CONSTRAINT `review_stablecoin_reconciliation_block_check` CHECK (
    (`block_number` IS NULL OR (
      length(`block_number`) BETWEEN 1 AND 24 AND `block_number` NOT GLOB '*[^0-9]*'
    )) AND
    (`block_hash` IS NULL OR (
      length(`block_hash`) = 66 AND substr(`block_hash`, 1, 2) = '0x' AND
      substr(`block_hash`, 3) NOT GLOB '*[^a-f0-9]*'
    )) AND
    (`log_index` IS NULL OR (
      length(`log_index`) BETWEEN 1 AND 24 AND `log_index` NOT GLOB '*[^0-9]*'
    )) AND
    (`evidence_hash` IS NULL OR (
      length(`evidence_hash`) = 64 AND `evidence_hash` NOT GLOB '*[^a-f0-9]*'
    ))
  ),
  CONSTRAINT `review_stablecoin_reconciliation_evidence_group_check` CHECK (
    (`block_number` IS NULL AND `block_hash` IS NULL AND `log_index` IS NULL AND `block_timestamp` IS NULL)
    OR
    (`block_number` IS NOT NULL AND `block_hash` IS NOT NULL AND `log_index` IS NOT NULL AND `block_timestamp` IS NOT NULL)
  ),
  CONSTRAINT `review_stablecoin_reconciliation_counter_check` CHECK (
    `confirmations_observed` >= 0 AND `confirmations_required` BETWEEN 6 AND 64 AND `rpc_agreement_count` >= 0
  ),
  CONSTRAINT `review_stablecoin_reconciliation_case_evidence_check` CHECK (
    (`case_type` != 'amount_mismatch' OR (
      lower(`observed_token_contract`) = lower(`expected_token_contract`) AND
      lower(`observed_recipient_address`) = lower(`expected_recipient_address`) AND
      `observed_amount_atomic` != `expected_amount_atomic`
    )) AND
    (`case_type` != 'asset_mismatch' OR `observed_token_contract` IS NULL OR
      lower(`observed_token_contract`) != lower(`expected_token_contract`)) AND
    (`case_type` != 'transfer_after_expiry' OR
      (`block_timestamp` IS NOT NULL AND `block_timestamp` > `instruction_expires_at`))
  ),
  CONSTRAINT `review_stablecoin_reconciliation_resolution_check` CHECK (
    `resolution_code` IS NULL OR
    `resolution_code` IN ('applied_to_obligation','refund','no_funds_received','duplicate_transfer','written_off')
  ),
  CONSTRAINT `review_stablecoin_reconciliation_resolution_hash_check` CHECK (
    (`resolution_idempotency_hash` IS NULL) = (`resolution_request_hash` IS NULL) AND
    (`resolution_idempotency_hash` IS NULL OR (
      length(`resolution_idempotency_hash`) = 64 AND
      `resolution_idempotency_hash` NOT GLOB '*[^a-f0-9]*' AND
      length(`resolution_request_hash`) = 64 AND
      `resolution_request_hash` NOT GLOB '*[^a-f0-9]*'
    ))
  ),
  CONSTRAINT `review_stablecoin_reconciliation_refund_hash_check` CHECK (
    `refund_transaction_hash` IS NULL OR (
      length(`refund_transaction_hash`) = 66 AND substr(`refund_transaction_hash`, 1, 2) = '0x' AND
      substr(`refund_transaction_hash`, 3) NOT GLOB '*[^a-f0-9]*' AND
      `refund_transaction_hash` != `transaction_hash`
    )
  ),
  CONSTRAINT `review_stablecoin_reconciliation_timestamps_check` CHECK (
    `opened_at` >= 0 AND `instruction_expires_at` >= 0 AND `updated_at` >= `opened_at` AND
    (`investigation_started_at` IS NULL OR `investigation_started_at` >= `opened_at`) AND
    (`block_timestamp` IS NULL OR `block_timestamp` >= 0) AND
    (`resolution_decided_at` IS NULL OR `resolution_decided_at` >= `opened_at`) AND
    (`refund_recorded_at` IS NULL OR `refund_recorded_at` >= `resolution_decided_at`) AND
    (`resolved_at` IS NULL OR `resolved_at` >= `resolution_decided_at`)
  ),
  CONSTRAINT `review_stablecoin_reconciliation_workflow_check` CHECK (
    (`state` != 'open' OR (
      `investigation_started_at` IS NULL AND `resolution_idempotency_hash` IS NULL AND
      `resolution_request_hash` IS NULL AND `resolution_code` IS NULL AND
      `resolution_note` IS NULL AND `resolution_decided_by_email` IS NULL AND
      `resolution_decided_at` IS NULL AND `refund_transaction_hash` IS NULL AND
      `refund_recorded_at` IS NULL AND `resolved_at` IS NULL
    )) AND
    (`state` != 'investigating' OR (
      `investigation_started_at` IS NOT NULL AND `resolution_idempotency_hash` IS NULL AND
      `resolution_request_hash` IS NULL AND `resolution_code` IS NULL AND
      `resolution_note` IS NULL AND `resolution_decided_by_email` IS NULL AND
      `resolution_decided_at` IS NULL AND `refund_transaction_hash` IS NULL AND
      `refund_recorded_at` IS NULL AND `resolved_at` IS NULL
    )) AND
    (`state` != 'application_pending' OR (
      `resolution_idempotency_hash` IS NOT NULL AND `resolution_request_hash` IS NOT NULL AND
      `resolution_code` = 'applied_to_obligation' AND
      length(`resolution_note`) BETWEEN 8 AND 4000 AND
      length(`resolution_decided_by_email`) BETWEEN 3 AND 320 AND
      `resolution_decided_by_email` LIKE '%@%' AND `resolution_decided_at` IS NOT NULL AND
      `refund_transaction_hash` IS NULL AND `refund_recorded_at` IS NULL AND `resolved_at` IS NULL
    )) AND
    (`state` != 'refund_pending' OR (
      `resolution_idempotency_hash` IS NOT NULL AND `resolution_request_hash` IS NOT NULL AND
      `resolution_code` = 'refund' AND length(`resolution_note`) BETWEEN 8 AND 4000 AND
      length(`resolution_decided_by_email`) BETWEEN 3 AND 320 AND
      `resolution_decided_by_email` LIKE '%@%' AND `resolution_decided_at` IS NOT NULL AND
      `refund_transaction_hash` IS NULL AND `refund_recorded_at` IS NULL AND `resolved_at` IS NULL
    )) AND
    (`state` != 'resolved' OR (
      `resolution_idempotency_hash` IS NOT NULL AND `resolution_request_hash` IS NOT NULL AND
      `resolution_code` IS NOT NULL AND length(`resolution_note`) BETWEEN 8 AND 4000 AND
      length(`resolution_decided_by_email`) BETWEEN 3 AND 320 AND
      `resolution_decided_by_email` LIKE '%@%' AND `resolution_decided_at` IS NOT NULL AND
      `resolved_at` IS NOT NULL AND
      ((`resolution_code` = 'refund' AND `refund_transaction_hash` IS NOT NULL AND `refund_recorded_at` IS NOT NULL)
       OR (`resolution_code` != 'refund' AND `refund_transaction_hash` IS NULL AND `refund_recorded_at` IS NULL))
    ))
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_reconciliation_claim_unique`
ON `review_stablecoin_reconciliation_cases` (`payment_claim_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_reconciliation_transaction_unique`
ON `review_stablecoin_reconciliation_cases` (`transaction_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_reconciliation_resolution_idempotency_unique`
ON `review_stablecoin_reconciliation_cases` (`resolution_idempotency_hash`)
WHERE `resolution_idempotency_hash` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `review_stablecoin_reconciliation_state_opened_idx`
ON `review_stablecoin_reconciliation_cases` (`state`,`opened_at`);
--> statement-breakpoint
CREATE INDEX `review_stablecoin_reconciliation_order_opened_idx`
ON `review_stablecoin_reconciliation_cases` (`review_order_id`,`opened_at`);
--> statement-breakpoint
CREATE INDEX `review_stablecoin_reconciliation_intent_opened_idx`
ON `review_stablecoin_reconciliation_cases` (`payment_intent_id`,`opened_at`);
--> statement-breakpoint

CREATE TABLE `review_stablecoin_payment_confirmations` (
  `id` text PRIMARY KEY NOT NULL,
  `review_order_id` text NOT NULL REFERENCES `review_orders`(`id`) ON DELETE RESTRICT,
  `payment_intent_id` text NOT NULL REFERENCES `review_stablecoin_payment_intents`(`id`) ON DELETE RESTRICT,
  `payment_claim_id` text NOT NULL REFERENCES `review_stablecoin_payment_claims`(`id`) ON DELETE RESTRICT,
  `reconciliation_case_id` text REFERENCES `review_stablecoin_reconciliation_cases`(`id`) ON DELETE RESTRICT,
  `record_kind` text NOT NULL,
  `phase` text NOT NULL,
  `expected_asset` text NOT NULL,
  `expected_token_contract` text NOT NULL,
  `received_asset` text NOT NULL,
  `received_token_contract` text NOT NULL,
  `recipient_address` text NOT NULL,
  `sender_address` text NOT NULL,
  `expected_amount_atomic` text NOT NULL,
  `received_amount_atomic` text NOT NULL,
  `obligation_amount` integer NOT NULL,
  `obligation_currency` text DEFAULT 'usd' NOT NULL,
  `transaction_hash` text NOT NULL,
  `block_number` text NOT NULL,
  `block_hash` text NOT NULL,
  `log_index` text NOT NULL,
  `block_timestamp` integer NOT NULL,
  `confirmations_observed` integer NOT NULL,
  `confirmations_required` integer NOT NULL,
  `rpc_agreement_count` integer NOT NULL,
  `evidence_hash` text NOT NULL,
  `proposal_version` integer NOT NULL,
  `terms_version` text NOT NULL,
  `terms_hash` text NOT NULL,
  `terms_accepted_at` integer NOT NULL,
  `confirmed_at` integer NOT NULL,
  `recorded_at` integer NOT NULL,
  `recorded_by_type` text NOT NULL,
  `recorded_by_email` text,
  `public_record_hash` text NOT NULL,
  `receipt_reference` text NOT NULL,
  CONSTRAINT `review_stablecoin_confirmations_kind_check` CHECK (`record_kind` IN ('exact_match','reconciliation')),
  CONSTRAINT `review_stablecoin_confirmations_phase_check` CHECK (`phase` IN ('deposit','balance')),
  CONSTRAINT `review_stablecoin_confirmations_asset_check` CHECK (
    `expected_asset` IN ('USDC','USDT') AND `received_asset` IN ('USDC','USDT')
  ),
  CONSTRAINT `review_stablecoin_confirmations_token_check` CHECK (
    ((`expected_asset` = 'USDC' AND `expected_token_contract` = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') OR
     (`expected_asset` = 'USDT' AND `expected_token_contract` = '0xdAC17F958D2ee523a2206206994597C13D831ec7')) AND
    ((`received_asset` = 'USDC' AND lower(`received_token_contract`) = lower('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')) OR
     (`received_asset` = 'USDT' AND lower(`received_token_contract`) = lower('0xdAC17F958D2ee523a2206206994597C13D831ec7')))
  ),
  CONSTRAINT `review_stablecoin_confirmations_address_check` CHECK (
    lower(`recipient_address`) = lower('0x07218C8E2B01fbff950Af65A0f36D3305520aC3b') AND
    length(`sender_address`) = 42 AND substr(`sender_address`, 1, 2) = '0x' AND
    substr(`sender_address`, 3) NOT GLOB '*[^a-f0-9]*'
  ),
  CONSTRAINT `review_stablecoin_confirmations_amount_check` CHECK (
    length(`expected_amount_atomic`) BETWEEN 1 AND 78 AND
    `expected_amount_atomic` NOT GLOB '*[^0-9]*' AND `expected_amount_atomic` GLOB '*[1-9]*' AND
    length(`received_amount_atomic`) BETWEEN 1 AND 78 AND
    `received_amount_atomic` NOT GLOB '*[^0-9]*' AND `received_amount_atomic` GLOB '*[1-9]*' AND
    `obligation_amount` > 0 AND `obligation_currency` = 'usd'
  ),
  CONSTRAINT `review_stablecoin_confirmations_transaction_check` CHECK (
    length(`transaction_hash`) = 66 AND substr(`transaction_hash`, 1, 2) = '0x' AND
    substr(`transaction_hash`, 3) NOT GLOB '*[^a-f0-9]*' AND
    length(`block_hash`) = 66 AND substr(`block_hash`, 1, 2) = '0x' AND
    substr(`block_hash`, 3) NOT GLOB '*[^a-f0-9]*' AND
    length(`block_number`) BETWEEN 1 AND 24 AND `block_number` NOT GLOB '*[^0-9]*' AND
    length(`log_index`) BETWEEN 1 AND 24 AND `log_index` NOT GLOB '*[^0-9]*'
  ),
  CONSTRAINT `review_stablecoin_confirmations_evidence_check` CHECK (
    `confirmations_required` BETWEEN 6 AND 64 AND
    `confirmations_observed` >= `confirmations_required` AND
    `rpc_agreement_count` >= 2 AND
    length(`evidence_hash`) = 64 AND `evidence_hash` NOT GLOB '*[^a-f0-9]*'
  ),
  CONSTRAINT `review_stablecoin_confirmations_policy_check` CHECK (
    `proposal_version` >= 1 AND length(`terms_version`) BETWEEN 8 AND 80 AND
    length(`terms_hash`) = 64 AND `terms_hash` NOT GLOB '*[^a-f0-9]*'
  ),
  CONSTRAINT `review_stablecoin_confirmations_public_record_check` CHECK (
    length(`public_record_hash`) = 64 AND `public_record_hash` NOT GLOB '*[^a-f0-9]*' AND
    length(`receipt_reference`) BETWEEN 16 AND 96 AND
    `receipt_reference` NOT GLOB '*[^A-Z0-9-]*'
  ),
  CONSTRAINT `review_stablecoin_confirmations_time_check` CHECK (
    `block_timestamp` >= 0 AND `terms_accepted_at` >= 0 AND
    `confirmed_at` >= `block_timestamp` AND `recorded_at` >= `confirmed_at`
  ),
  CONSTRAINT `review_stablecoin_confirmations_origin_check` CHECK (
    (`record_kind` = 'exact_match' AND `reconciliation_case_id` IS NULL AND
      `recorded_by_type` = 'verifier' AND `recorded_by_email` IS NULL AND
      `public_record_hash` = `evidence_hash` AND
      `expected_asset` = `received_asset` AND
      lower(`expected_token_contract`) = lower(`received_token_contract`) AND
      `expected_amount_atomic` = `received_amount_atomic`)
    OR
    (`record_kind` = 'reconciliation' AND `reconciliation_case_id` IS NOT NULL AND
      `recorded_by_type` = 'operator' AND length(`recorded_by_email`) BETWEEN 3 AND 320 AND
      `recorded_by_email` LIKE '%@%')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_confirmations_order_phase_unique`
ON `review_stablecoin_payment_confirmations` (`review_order_id`,`phase`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_confirmations_intent_unique`
ON `review_stablecoin_payment_confirmations` (`payment_intent_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_confirmations_claim_unique`
ON `review_stablecoin_payment_confirmations` (`payment_claim_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_confirmations_transaction_unique`
ON `review_stablecoin_payment_confirmations` (`transaction_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_confirmations_reconciliation_unique`
ON `review_stablecoin_payment_confirmations` (`reconciliation_case_id`)
WHERE `reconciliation_case_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_confirmations_public_record_unique`
ON `review_stablecoin_payment_confirmations` (`public_record_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_stablecoin_confirmations_receipt_reference_unique`
ON `review_stablecoin_payment_confirmations` (`receipt_reference`);
--> statement-breakpoint
CREATE INDEX `review_stablecoin_confirmations_order_confirmed_idx`
ON `review_stablecoin_payment_confirmations` (`review_order_id`,`confirmed_at`);
--> statement-breakpoint
CREATE INDEX `review_stablecoin_confirmations_block_log_idx`
ON `review_stablecoin_payment_confirmations` (`block_number`,`log_index`);
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_reconciliation_identity_immutable`
BEFORE UPDATE OF
  `id`,`review_order_id`,`payment_intent_id`,`payment_claim_id`,`transaction_hash`,`case_type`,`phase`,
  `expected_asset`,`expected_token_contract`,`expected_recipient_address`,`expected_amount_atomic`,
  `instruction_expires_at`,`observed_sender_address`,`observed_token_contract`,
  `observed_recipient_address`,`observed_amount_atomic`,`block_number`,`block_hash`,`log_index`,
  `block_timestamp`,`confirmations_observed`,`confirmations_required`,`rpc_agreement_count`,
  `evidence_hash`,`opened_at`
ON `review_stablecoin_reconciliation_cases`
FOR EACH ROW
WHEN
  OLD.`id` IS NOT NEW.`id` OR OLD.`review_order_id` IS NOT NEW.`review_order_id` OR
  OLD.`payment_intent_id` IS NOT NEW.`payment_intent_id` OR OLD.`payment_claim_id` IS NOT NEW.`payment_claim_id` OR
  OLD.`transaction_hash` IS NOT NEW.`transaction_hash` OR OLD.`case_type` IS NOT NEW.`case_type` OR
  OLD.`phase` IS NOT NEW.`phase` OR OLD.`expected_asset` IS NOT NEW.`expected_asset` OR
  OLD.`expected_token_contract` IS NOT NEW.`expected_token_contract` OR
  OLD.`expected_recipient_address` IS NOT NEW.`expected_recipient_address` OR
  OLD.`expected_amount_atomic` IS NOT NEW.`expected_amount_atomic` OR
  OLD.`instruction_expires_at` IS NOT NEW.`instruction_expires_at` OR
  OLD.`observed_sender_address` IS NOT NEW.`observed_sender_address` OR
  OLD.`observed_token_contract` IS NOT NEW.`observed_token_contract` OR
  OLD.`observed_recipient_address` IS NOT NEW.`observed_recipient_address` OR
  OLD.`observed_amount_atomic` IS NOT NEW.`observed_amount_atomic` OR
  OLD.`block_number` IS NOT NEW.`block_number` OR OLD.`block_hash` IS NOT NEW.`block_hash` OR
  OLD.`log_index` IS NOT NEW.`log_index` OR OLD.`block_timestamp` IS NOT NEW.`block_timestamp` OR
  OLD.`confirmations_observed` IS NOT NEW.`confirmations_observed` OR
  OLD.`confirmations_required` IS NOT NEW.`confirmations_required` OR
  OLD.`rpc_agreement_count` IS NOT NEW.`rpc_agreement_count` OR
  OLD.`evidence_hash` IS NOT NEW.`evidence_hash` OR OLD.`opened_at` IS NOT NEW.`opened_at`
BEGIN
  SELECT RAISE(ABORT, 'stablecoin reconciliation evidence is immutable');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_reconciliation_relationship_guard`
BEFORE INSERT ON `review_stablecoin_reconciliation_cases`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM `review_stablecoin_payment_claims` c
  JOIN `review_stablecoin_payment_intents` i ON i.`id` = c.`payment_intent_id`
  WHERE c.`id` = NEW.`payment_claim_id`
    AND c.`payment_intent_id` = NEW.`payment_intent_id`
    AND c.`transaction_hash` = NEW.`transaction_hash`
    AND c.`failure_code` = NEW.`case_type`
    AND c.`state` = 'manual_review'
    AND i.`review_order_id` = NEW.`review_order_id`
    AND i.`phase` = NEW.`phase`
    AND i.`asset` = NEW.`expected_asset`
    AND i.`token_contract` = NEW.`expected_token_contract`
    AND i.`recipient_address` = NEW.`expected_recipient_address`
    AND i.`token_amount_atomic` = NEW.`expected_amount_atomic`
    AND i.`expires_at` = NEW.`instruction_expires_at`
    AND i.`confirmations_required` = NEW.`confirmations_required`
    AND c.`observed_sender` IS NEW.`observed_sender_address`
    AND c.`observed_token_contract` IS NEW.`observed_token_contract`
    AND c.`observed_recipient_address` IS NEW.`observed_recipient_address`
    AND c.`observed_amount_atomic` IS NEW.`observed_amount_atomic`
    AND c.`block_number` IS NEW.`block_number`
    AND c.`block_hash` IS NEW.`block_hash`
    AND c.`log_index` IS NEW.`log_index`
    AND c.`block_timestamp` IS NEW.`block_timestamp`
    AND c.`confirmations` = NEW.`confirmations_observed`
    AND c.`rpc_agreement_count` = NEW.`rpc_agreement_count`
    AND c.`evidence_hash` IS NEW.`evidence_hash`
)
BEGIN
  SELECT RAISE(ABORT, 'stablecoin reconciliation relationship is invalid');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_reconciliation_progression_guard`
BEFORE UPDATE ON `review_stablecoin_reconciliation_cases`
FOR EACH ROW
WHEN
  (OLD.`state` = 'open' AND NEW.`state` NOT IN ('open','investigating','application_pending','refund_pending','resolved')) OR
  (OLD.`state` = 'investigating' AND NEW.`state` NOT IN ('investigating','application_pending','refund_pending','resolved')) OR
  (OLD.`state` = 'application_pending' AND NEW.`state` NOT IN ('application_pending','resolved')) OR
  (OLD.`state` = 'refund_pending' AND NEW.`state` NOT IN ('refund_pending','resolved')) OR
  (OLD.`state` = 'resolved' AND NEW.`state` != 'resolved') OR
  (OLD.`investigation_started_at` IS NOT NULL AND NEW.`investigation_started_at` IS NOT OLD.`investigation_started_at`) OR
  (OLD.`resolution_idempotency_hash` IS NOT NULL AND NEW.`resolution_idempotency_hash` IS NOT OLD.`resolution_idempotency_hash`) OR
  (OLD.`resolution_request_hash` IS NOT NULL AND NEW.`resolution_request_hash` IS NOT OLD.`resolution_request_hash`) OR
  (OLD.`resolution_code` IS NOT NULL AND NEW.`resolution_code` IS NOT OLD.`resolution_code`) OR
  (OLD.`resolution_note` IS NOT NULL AND NEW.`resolution_note` IS NOT OLD.`resolution_note`) OR
  (OLD.`resolution_decided_by_email` IS NOT NULL AND NEW.`resolution_decided_by_email` IS NOT OLD.`resolution_decided_by_email`) OR
  (OLD.`resolution_decided_at` IS NOT NULL AND NEW.`resolution_decided_at` IS NOT OLD.`resolution_decided_at`) OR
  (OLD.`refund_transaction_hash` IS NOT NULL AND NEW.`refund_transaction_hash` IS NOT OLD.`refund_transaction_hash`) OR
  (OLD.`refund_recorded_at` IS NOT NULL AND NEW.`refund_recorded_at` IS NOT OLD.`refund_recorded_at`) OR
  (OLD.`resolved_at` IS NOT NULL AND NEW.`resolved_at` IS NOT OLD.`resolved_at`) OR
  NEW.`updated_at` < OLD.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'stablecoin reconciliation progression is invalid');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_reconciliation_application_guard`
BEFORE UPDATE OF `state` ON `review_stablecoin_reconciliation_cases`
FOR EACH ROW
WHEN NEW.`state` = 'resolved' AND NEW.`resolution_code` = 'applied_to_obligation' AND (
  NOT EXISTS (
    SELECT 1 FROM `review_stablecoin_payment_confirmations`
    WHERE `reconciliation_case_id` = NEW.`id` AND `record_kind` = 'reconciliation'
  ) OR
  NOT EXISTS (
    SELECT 1 FROM `review_stablecoin_payment_intents`
    WHERE `id` = NEW.`payment_intent_id` AND `state` = 'verified'
  ) OR
  NOT EXISTS (
    SELECT 1 FROM `review_orders`
    WHERE `id` = NEW.`review_order_id`
      AND `status` = CASE NEW.`phase`
        WHEN 'deposit' THEN 'deposit_paid'
        ELSE 'paid'
      END
  )
)
BEGIN
  SELECT RAISE(ABORT, 'reconciled payment requires an applied immutable confirmation');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_reconciliation_no_delete`
BEFORE DELETE ON `review_stablecoin_reconciliation_cases`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'stablecoin reconciliation cases cannot be deleted');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_confirmation_relationship_guard`
BEFORE INSERT ON `review_stablecoin_payment_confirmations`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM `review_stablecoin_payment_claims` c
  JOIN `review_stablecoin_payment_intents` i ON i.`id` = c.`payment_intent_id`
  WHERE c.`id` = NEW.`payment_claim_id`
    AND c.`payment_intent_id` = NEW.`payment_intent_id`
    AND c.`transaction_hash` = NEW.`transaction_hash`
    AND i.`review_order_id` = NEW.`review_order_id`
    AND i.`phase` = NEW.`phase`
    AND i.`asset` = NEW.`expected_asset`
    AND i.`token_contract` = NEW.`expected_token_contract`
    AND lower(i.`recipient_address`) = lower(NEW.`recipient_address`)
    AND i.`token_amount_atomic` = NEW.`expected_amount_atomic`
    AND i.`obligation_amount` = NEW.`obligation_amount`
    AND i.`obligation_currency` = NEW.`obligation_currency`
    AND i.`proposal_version` = NEW.`proposal_version`
    AND i.`confirmations_required` = NEW.`confirmations_required`
    AND i.`terms_version` = NEW.`terms_version`
    AND i.`terms_hash` = NEW.`terms_hash`
    AND i.`terms_accepted_at` = NEW.`terms_accepted_at`
    AND (
      (NEW.`record_kind` = 'exact_match' AND c.`state` = 'verified' AND
        c.`observed_sender` = NEW.`sender_address` AND
        lower(c.`observed_token_contract`) = lower(NEW.`received_token_contract`) AND
        lower(c.`observed_recipient_address`) = lower(NEW.`recipient_address`) AND
        c.`observed_amount_atomic` = NEW.`received_amount_atomic` AND
        c.`block_number` = NEW.`block_number` AND c.`block_hash` = NEW.`block_hash` AND
        c.`log_index` = NEW.`log_index` AND c.`block_timestamp` = NEW.`block_timestamp` AND
        c.`confirmations` = NEW.`confirmations_observed` AND
        c.`rpc_agreement_count` = NEW.`rpc_agreement_count` AND c.`evidence_hash` = NEW.`evidence_hash`)
      OR
      (NEW.`record_kind` = 'reconciliation' AND EXISTS (
        SELECT 1 FROM `review_stablecoin_reconciliation_cases` r
        WHERE r.`id` = NEW.`reconciliation_case_id`
          AND r.`review_order_id` = NEW.`review_order_id`
          AND r.`payment_intent_id` = NEW.`payment_intent_id`
          AND r.`payment_claim_id` = NEW.`payment_claim_id`
          AND r.`transaction_hash` = NEW.`transaction_hash`
          AND r.`state` = 'application_pending'
          AND r.`resolution_code` = 'applied_to_obligation'
      ))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'stablecoin confirmation relationship is invalid');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_confirmations_no_update`
BEFORE UPDATE ON `review_stablecoin_payment_confirmations`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'stablecoin payment confirmations are immutable');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_confirmations_no_delete`
BEFORE DELETE ON `review_stablecoin_payment_confirmations`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'stablecoin payment confirmations cannot be deleted');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_claims_terminal_evidence_immutable`
BEFORE UPDATE OF
  `failure_code`,`observed_sender`,`observed_token_contract`,`observed_recipient_address`,
  `observed_amount_atomic`,`block_number`,`block_hash`,`log_index`,`block_timestamp`,
  `confirmations`,`evidence_hash`,`rpc_agreement_count`
ON `review_stablecoin_payment_claims`
FOR EACH ROW
WHEN OLD.`state` IN ('verified','rejected','manual_review') AND (
  OLD.`failure_code` IS NOT NEW.`failure_code` OR
  OLD.`observed_sender` IS NOT NEW.`observed_sender` OR
  OLD.`observed_token_contract` IS NOT NEW.`observed_token_contract` OR
  OLD.`observed_recipient_address` IS NOT NEW.`observed_recipient_address` OR
  OLD.`observed_amount_atomic` IS NOT NEW.`observed_amount_atomic` OR
  OLD.`block_number` IS NOT NEW.`block_number` OR OLD.`block_hash` IS NOT NEW.`block_hash` OR
  OLD.`log_index` IS NOT NEW.`log_index` OR OLD.`block_timestamp` IS NOT NEW.`block_timestamp` OR
  OLD.`confirmations` IS NOT NEW.`confirmations` OR OLD.`evidence_hash` IS NOT NEW.`evidence_hash` OR
  OLD.`rpc_agreement_count` IS NOT NEW.`rpc_agreement_count`
)
BEGIN
  SELECT RAISE(ABORT, 'terminal stablecoin claim evidence is immutable');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_claims_terminal_state_immutable`
BEFORE UPDATE OF `state` ON `review_stablecoin_payment_claims`
FOR EACH ROW
WHEN OLD.`state` IN ('verified','rejected','manual_review') AND NEW.`state` != OLD.`state`
BEGIN
  SELECT RAISE(ABORT, 'terminal stablecoin claim state is immutable');
END;
--> statement-breakpoint

INSERT INTO `review_stablecoin_reconciliation_cases` (
  `id`,`review_order_id`,`payment_intent_id`,`payment_claim_id`,`transaction_hash`,`case_type`,`state`,`phase`,
  `expected_asset`,`expected_token_contract`,`expected_recipient_address`,`expected_amount_atomic`,`instruction_expires_at`,
  `observed_sender_address`,`observed_token_contract`,`observed_recipient_address`,`observed_amount_atomic`,
  `block_number`,`block_hash`,`log_index`,`block_timestamp`,`confirmations_observed`,`confirmations_required`,
  `rpc_agreement_count`,`evidence_hash`,`opened_at`,`updated_at`
)
SELECT
  'recon:' || c.`id`,i.`review_order_id`,i.`id`,c.`id`,c.`transaction_hash`,c.`failure_code`,'open',i.`phase`,
  i.`asset`,i.`token_contract`,i.`recipient_address`,i.`token_amount_atomic`,i.`expires_at`,
  c.`observed_sender`,c.`observed_token_contract`,c.`observed_recipient_address`,c.`observed_amount_atomic`,
  c.`block_number`,c.`block_hash`,c.`log_index`,c.`block_timestamp`,c.`confirmations`,i.`confirmations_required`,
  c.`rpc_agreement_count`,c.`evidence_hash`,c.`updated_at`,c.`updated_at`
FROM `review_stablecoin_payment_claims` c
JOIN `review_stablecoin_payment_intents` i ON i.`id` = c.`payment_intent_id`
WHERE c.`state` = 'manual_review'
  AND c.`failure_code` IN ('amount_mismatch','asset_mismatch','transfer_ambiguous','transfer_after_expiry');
--> statement-breakpoint

INSERT INTO `review_stablecoin_payment_confirmations` (
  `id`,`review_order_id`,`payment_intent_id`,`payment_claim_id`,`record_kind`,`phase`,
  `expected_asset`,`expected_token_contract`,`received_asset`,`received_token_contract`,
  `recipient_address`,`sender_address`,`expected_amount_atomic`,`received_amount_atomic`,
  `obligation_amount`,`obligation_currency`,`transaction_hash`,`block_number`,`block_hash`,`log_index`,
  `block_timestamp`,`confirmations_observed`,`confirmations_required`,`rpc_agreement_count`,`evidence_hash`,
  `proposal_version`,`terms_version`,`terms_hash`,`terms_accepted_at`,`confirmed_at`,`recorded_at`,
  `recorded_by_type`,`public_record_hash`,`receipt_reference`
)
SELECT
  'confirm:' || c.`id`,i.`review_order_id`,i.`id`,c.`id`,'exact_match',i.`phase`,
  i.`asset`,i.`token_contract`,i.`asset`,c.`observed_token_contract`,
  c.`observed_recipient_address`,c.`observed_sender`,i.`token_amount_atomic`,c.`observed_amount_atomic`,
  i.`obligation_amount`,i.`obligation_currency`,c.`transaction_hash`,c.`block_number`,c.`block_hash`,c.`log_index`,
  c.`block_timestamp`,c.`confirmations`,i.`confirmations_required`,c.`rpc_agreement_count`,c.`evidence_hash`,
  i.`proposal_version`,i.`terms_version`,i.`terms_hash`,i.`terms_accepted_at`,c.`verified_at`,c.`updated_at`,
  'verifier',c.`evidence_hash`,'NZ-ETH-' || upper(substr(c.`transaction_hash`, 3))
FROM `review_stablecoin_payment_claims` c
JOIN `review_stablecoin_payment_intents` i ON i.`id` = c.`payment_intent_id`
WHERE c.`state` = 'verified';
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_claims_open_reconciliation_case`
AFTER UPDATE OF `state`,`failure_code` ON `review_stablecoin_payment_claims`
FOR EACH ROW
WHEN NEW.`state` = 'manual_review'
  AND NEW.`failure_code` IN ('amount_mismatch','asset_mismatch','transfer_ambiguous','transfer_after_expiry')
BEGIN
  INSERT OR IGNORE INTO `review_stablecoin_reconciliation_cases` (
    `id`,`review_order_id`,`payment_intent_id`,`payment_claim_id`,`transaction_hash`,`case_type`,`state`,`phase`,
    `expected_asset`,`expected_token_contract`,`expected_recipient_address`,`expected_amount_atomic`,`instruction_expires_at`,
    `observed_sender_address`,`observed_token_contract`,`observed_recipient_address`,`observed_amount_atomic`,
    `block_number`,`block_hash`,`log_index`,`block_timestamp`,`confirmations_observed`,`confirmations_required`,
    `rpc_agreement_count`,`evidence_hash`,`opened_at`,`updated_at`
  )
  SELECT
    'recon:' || NEW.`id`,i.`review_order_id`,i.`id`,NEW.`id`,NEW.`transaction_hash`,NEW.`failure_code`,'open',i.`phase`,
    i.`asset`,i.`token_contract`,i.`recipient_address`,i.`token_amount_atomic`,i.`expires_at`,
    NEW.`observed_sender`,NEW.`observed_token_contract`,NEW.`observed_recipient_address`,NEW.`observed_amount_atomic`,
    NEW.`block_number`,NEW.`block_hash`,NEW.`log_index`,NEW.`block_timestamp`,NEW.`confirmations`,i.`confirmations_required`,
    NEW.`rpc_agreement_count`,NEW.`evidence_hash`,NEW.`updated_at`,NEW.`updated_at`
  FROM `review_stablecoin_payment_intents` i
  WHERE i.`id` = NEW.`payment_intent_id`;
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_claims_record_confirmation`
AFTER UPDATE OF `state` ON `review_stablecoin_payment_claims`
FOR EACH ROW
WHEN NEW.`state` = 'verified' AND OLD.`state` != 'verified'
BEGIN
  INSERT INTO `review_stablecoin_payment_confirmations` (
    `id`,`review_order_id`,`payment_intent_id`,`payment_claim_id`,`record_kind`,`phase`,
    `expected_asset`,`expected_token_contract`,`received_asset`,`received_token_contract`,
    `recipient_address`,`sender_address`,`expected_amount_atomic`,`received_amount_atomic`,
    `obligation_amount`,`obligation_currency`,`transaction_hash`,`block_number`,`block_hash`,`log_index`,
    `block_timestamp`,`confirmations_observed`,`confirmations_required`,`rpc_agreement_count`,`evidence_hash`,
    `proposal_version`,`terms_version`,`terms_hash`,`terms_accepted_at`,`confirmed_at`,`recorded_at`,
    `recorded_by_type`,`public_record_hash`,`receipt_reference`
  )
  SELECT
    'confirm:' || NEW.`id`,i.`review_order_id`,i.`id`,NEW.`id`,'exact_match',i.`phase`,
    i.`asset`,i.`token_contract`,i.`asset`,NEW.`observed_token_contract`,
    NEW.`observed_recipient_address`,NEW.`observed_sender`,i.`token_amount_atomic`,NEW.`observed_amount_atomic`,
    i.`obligation_amount`,i.`obligation_currency`,NEW.`transaction_hash`,NEW.`block_number`,NEW.`block_hash`,NEW.`log_index`,
    NEW.`block_timestamp`,NEW.`confirmations`,i.`confirmations_required`,NEW.`rpc_agreement_count`,NEW.`evidence_hash`,
    i.`proposal_version`,i.`terms_version`,i.`terms_hash`,i.`terms_accepted_at`,NEW.`verified_at`,NEW.`updated_at`,
    'verifier',NEW.`evidence_hash`,'NZ-ETH-' || upper(substr(NEW.`transaction_hash`, 3))
  FROM `review_stablecoin_payment_intents` i
  WHERE i.`id` = NEW.`payment_intent_id`;
END;
--> statement-breakpoint

PRAGMA optimize;
