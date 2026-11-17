ALTER TABLE `newsletter_subscriptions`
ADD COLUMN `confirmation_token_id` text;
--> statement-breakpoint

ALTER TABLE `newsletter_subscriptions`
ADD COLUMN `confirmation_token_hash` text;
--> statement-breakpoint

ALTER TABLE `newsletter_subscriptions`
ADD COLUMN `confirmation_requested_at` integer;
--> statement-breakpoint

ALTER TABLE `newsletter_subscriptions`
ADD COLUMN `confirmation_expires_at` integer;
--> statement-breakpoint

ALTER TABLE `newsletter_subscriptions`
ADD COLUMN `confirmed_at` integer;
--> statement-breakpoint

CREATE UNIQUE INDEX `newsletter_subscriptions_confirmation_token_unique`
ON `newsletter_subscriptions` (`confirmation_token_id`)
WHERE `confirmation_token_id` IS NOT NULL;
--> statement-breakpoint

CREATE INDEX `newsletter_subscriptions_confirmation_expiry_idx`
ON `newsletter_subscriptions` (`state`, `confirmation_expires_at`);
