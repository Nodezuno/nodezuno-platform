UPDATE `review_orders`
SET
  `status` = 'proposal_ready',
  `proposal_version` = 1,
  `proposal_title` = 'Blockchain upgrade security review',
  `proposal_scope` =
    'One frozen upgrade to the already-audited or reviewed protocol identified in this order on ' ||
    `target_chain` || '. The service covers the submitted release boundary of ' ||
    CAST(`affected_contracts` AS text) ||
    ' affected contracts, programs, or modules' ||
    CASE
      WHEN `changed_lines` IS NULL THEN '. The customer must provide the exact code diff before work begins.'
      ELSE ' and ' || CAST(`changed_lines` AS text) || ' materially changed protocol code lines.'
    END ||
    ' It includes one evidence-backed review report, one human-signed Proceed, Remediate, or Hold recommendation, and one consolidated fix review.',
  `proposal_exclusions` =
    'New protocol design or a full protocol audit, more than one target network, more than one release, custody, deployment, live key access, incident response, formal verification, and work outside the submitted frozen release boundary.',
  `proposal_reviewer` = 'Sanjay Sudagani',
  `proposal_issued_at` = unixepoch() * 1000,
  `proposal_expires_at` = unixepoch('now', '+30 days') * 1000,
  `proposal_accepted_at` = NULL,
  `next_action` =
    'Accept the fixed service order and terms, choose USDC or USDT on Ethereum Mainnet, then complete the scheduling deposit.',
  `updated_at` = unixepoch() * 1000
WHERE `status` = 'qualification_pending'
  AND `proposal_version` IS NULL
  AND `target_chain` IN (
    'Ethereum',
    'Base',
    'Arbitrum',
    'Optimism',
    'Polygon',
    'Avalanche',
    'BNB Chain',
    'Other EVM network',
    'Solana',
    'Other SVM network',
    'Cosmos SDK chain',
    'CosmWasm chain',
    'Sui',
    'Aptos',
    'Polkadot / Substrate chain',
    'Starknet',
    'Bitcoin / UTXO ecosystem',
    'Other non-EVM network'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `review_stablecoin_payment_intents`
    WHERE `review_order_id` = `review_orders`.`id`
  );
--> statement-breakpoint

INSERT OR IGNORE INTO `review_order_events`
  (`id`, `review_order_id`, `event_type`, `actor_type`, `actor_email`, `detail_json`, `created_at`)
SELECT
  'direct-checkout:' || `id`,
  `id`,
  'order.direct_checkout_enabled',
  'system',
  NULL,
  '{"source":"migration_0026"}',
  `updated_at`
FROM `review_orders`
WHERE `status` = 'proposal_ready'
  AND `proposal_version` = 1
  AND `proposal_reviewer` = 'Sanjay Sudagani'
  AND `proposal_issued_at` = `updated_at`
  AND `next_action` =
    'Accept the fixed service order and terms, choose USDC or USDT on Ethereum Mainnet, then complete the scheduling deposit.';
--> statement-breakpoint

UPDATE `status_services`
SET
  `description` = 'Direct fixed-scope service-order creation and private checkout.',
  `updated_at` = unixepoch() * 1000
WHERE `slug` = 'review-intake';
--> statement-breakpoint

UPDATE `status_services`
SET
  `description` = 'Self-service Ethereum Mainnet USDC and USDT payment verification.',
  `updated_at` = unixepoch() * 1000
WHERE `slug` = 'payment-checkout';
--> statement-breakpoint

PRAGMA optimize;
