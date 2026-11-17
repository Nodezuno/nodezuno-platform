ALTER TABLE `review_stablecoin_payment_intents`
ADD `confirmations_required` integer DEFAULT 12 NOT NULL;
--> statement-breakpoint
ALTER TABLE `review_stablecoin_payment_intents`
ADD `terms_version` text DEFAULT 'nodezuno-service-terms-2026-08-25' NOT NULL;
--> statement-breakpoint
ALTER TABLE `review_stablecoin_payment_intents`
ADD `terms_hash` text DEFAULT '0000000000000000000000000000000000000000000000000000000000000000' NOT NULL;
--> statement-breakpoint
ALTER TABLE `review_stablecoin_payment_intents`
ADD `creation_idempotency_hash` text;
--> statement-breakpoint
ALTER TABLE `review_stablecoin_payment_intents`
ADD `creation_request_hash` text;
--> statement-breakpoint

CREATE UNIQUE INDEX `review_stablecoin_intents_creation_idempotency_unique`
ON `review_stablecoin_payment_intents` (`creation_idempotency_hash`)
WHERE `creation_idempotency_hash` IS NOT NULL;
--> statement-breakpoint

CREATE TABLE `payment_verifier_health` (
  `id` integer PRIMARY KEY NOT NULL,
  `configuration_hash` text NOT NULL,
  `configured_endpoint_count` integer NOT NULL,
  `healthy_endpoint_count` integer NOT NULL,
  `latest_block` text,
  `state` text NOT NULL,
  `failure_code` text,
  `checked_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `payment_verifier_health_singleton_check` CHECK (`id` = 1),
  CONSTRAINT `payment_verifier_health_state_check` CHECK (`state` IN ('healthy','unavailable')),
  CONSTRAINT `payment_verifier_health_endpoint_check` CHECK (
    `configured_endpoint_count` BETWEEN 0 AND 3 AND
    `healthy_endpoint_count` BETWEEN 0 AND `configured_endpoint_count`
  )
);
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_intents_policy_immutable`
BEFORE UPDATE OF
  `confirmations_required`,`terms_version`,`terms_hash`,
  `creation_idempotency_hash`,`creation_request_hash`
ON `review_stablecoin_payment_intents`
FOR EACH ROW
WHEN
  OLD.`confirmations_required` IS NOT NEW.`confirmations_required` OR
  OLD.`terms_version` IS NOT NEW.`terms_version` OR
  OLD.`terms_hash` IS NOT NEW.`terms_hash` OR
  OLD.`creation_idempotency_hash` IS NOT NEW.`creation_idempotency_hash` OR
  OLD.`creation_request_hash` IS NOT NEW.`creation_request_hash`
BEGIN
  SELECT RAISE(ABORT, 'stablecoin payment acceptance policy is immutable');
END;
--> statement-breakpoint

CREATE TRIGGER `review_stablecoin_intents_policy_valid`
BEFORE INSERT ON `review_stablecoin_payment_intents`
FOR EACH ROW
WHEN
  NEW.`confirmations_required` NOT BETWEEN 6 AND 64 OR
  length(NEW.`terms_version`) NOT BETWEEN 8 AND 80 OR
  length(NEW.`terms_hash`) != 64 OR
  (NEW.`creation_idempotency_hash` IS NOT NULL AND length(NEW.`creation_idempotency_hash`) != 64) OR
  (NEW.`creation_request_hash` IS NOT NULL AND length(NEW.`creation_request_hash`) != 64)
BEGIN
  SELECT RAISE(ABORT, 'stablecoin payment acceptance policy is invalid');
END;
--> statement-breakpoint

PRAGMA optimize;
