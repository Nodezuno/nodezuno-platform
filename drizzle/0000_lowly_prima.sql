CREATE TABLE `admin_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_actor_created_idx` ON `admin_audit_events` (`actor_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_entity_created_idx` ON `admin_audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chains` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`family` text NOT NULL,
	`finality_model` text NOT NULL,
	`support_stage` text DEFAULT 'planned' NOT NULL,
	`capabilities_json` text DEFAULT '[]' NOT NULL,
	`tone` text NOT NULL,
	`sort_order` integer NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`verified_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "chains_support_stage_check" CHECK("chains"."support_stage" IN ('planned', 'preview', 'full', 'data_only'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chains_name_unique` ON `chains` (`name`);--> statement-breakpoint
CREATE INDEX `chains_visible_sort_idx` ON `chains` (`visible`,`sort_order`);--> statement-breakpoint
CREATE TABLE `newsletter_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_hash` text NOT NULL,
	`name` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`source_path` text NOT NULL,
	`consent_version` text NOT NULL,
	`consented_at` integer NOT NULL,
	`unsubscribe_token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`unsubscribed_at` integer,
	CONSTRAINT "newsletter_subscriptions_state_check" CHECK("newsletter_subscriptions"."state" IN ('pending', 'subscribed', 'unsubscribed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscriptions_email_unique` ON `newsletter_subscriptions` (`email`);--> statement-breakpoint
CREATE INDEX `newsletter_subscriptions_state_created_idx` ON `newsletter_subscriptions` (`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`entity_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`payload_json` text NOT NULL,
	`available_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "notification_outbox_state_check" CHECK("notification_outbox"."state" IN ('pending', 'processing', 'delivered', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_outbox_topic_entity_unique` ON `notification_outbox` (`topic`,`entity_id`);--> statement-breakpoint
CREATE INDEX `notification_outbox_state_available_idx` ON `notification_outbox` (`state`,`available_at`);--> statement-breakpoint
CREATE TABLE `rate_limit_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`subject_hash` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_scope_subject_window_unique` ON `rate_limit_windows` (`scope`,`subject_hash`,`window_start`);--> statement-breakpoint
CREATE INDEX `rate_limit_expiry_idx` ON `rate_limit_windows` (`expires_at`);--> statement-breakpoint
CREATE TABLE `status_incident_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`state` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `status_incidents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `status_incident_updates_incident_created_idx` ON `status_incident_updates` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `status_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`severity` text NOT NULL,
	`state` text NOT NULL,
	`impact` text NOT NULL,
	`started_at` integer NOT NULL,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "status_incidents_severity_check" CHECK("status_incidents"."severity" IN ('none', 'minor', 'major', 'critical')),
	CONSTRAINT "status_incidents_state_check" CHECK("status_incidents"."state" IN ('investigating', 'identified', 'monitoring', 'resolved'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_incidents_slug_unique` ON `status_incidents` (`slug`);--> statement-breakpoint
CREATE INDEX `status_incidents_state_started_idx` ON `status_incidents` (`state`,`started_at`);--> statement-breakpoint
CREATE TABLE `status_services` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`state` text DEFAULT 'preview' NOT NULL,
	`sort_order` integer NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "status_services_state_check" CHECK("status_services"."state" IN ('preview', 'operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance'))
);
--> statement-breakpoint
CREATE INDEX `status_services_visible_sort_idx` ON `status_services` (`visible`,`sort_order`);--> statement-breakpoint
CREATE TABLE `submission_events` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_email` text,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_events_received_unique` ON `submission_events` (`submission_id`) WHERE "submission_events"."event_type" = 'received';--> statement-breakpoint
CREATE INDEX `submission_events_submission_created_idx` ON `submission_events` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_hash` text NOT NULL,
	`company` text NOT NULL,
	`team_type` text NOT NULL,
	`message` text NOT NULL,
	`source_path` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`consent_version` text NOT NULL,
	`consented_at` integer NOT NULL,
	`submitted_by_email` text,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`ip_hash` text NOT NULL,
	`user_agent_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "submissions_kind_check" CHECK("submissions"."kind" IN ('sales', 'workspace_access', 'support', 'startup_program', 'press', 'career_interest', 'security_contact', 'event_interest')),
	CONSTRAINT "submissions_status_check" CHECK("submissions"."status" IN ('received', 'reviewing', 'closed', 'spam'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_kind_idempotency_unique` ON `submissions` (`kind`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `submissions_status_created_idx` ON `submissions` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `submissions_email_created_idx` ON `submissions` (`email_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `submissions_expiry_idx` ON `submissions` (`expires_at`);--> statement-breakpoint
INSERT INTO `status_services`
  (`slug`, `name`, `description`, `state`, `sort_order`, `visible`, `updated_at`)
VALUES
  ('edge-regions', 'Edge regions', 'Regional routing surfaces are in private build.', 'preview', 1, 1, unixepoch() * 1000),
  ('rpc-mesh', 'RPC mesh', 'Multi-region RPC is in private build.', 'preview', 2, 1, unixepoch() * 1000),
  ('atlas-pipelines', 'Atlas pipelines', 'Data pipelines are in private build.', 'preview', 3, 1, unixepoch() * 1000),
  ('flow-orchestration', 'Flow orchestration', 'Transaction orchestration is in private build.', 'preview', 4, 1, unixepoch() * 1000),
  ('vault-policy', 'Vault policy', 'Signer policy surfaces are in private build.', 'preview', 5, 1, unixepoch() * 1000),
  ('developer-workspace', 'Developer workspace', 'Workspace access is limited to design partners.', 'preview', 6, 1, unixepoch() * 1000);--> statement-breakpoint
INSERT INTO `chains`
  (`slug`, `name`, `family`, `finality_model`, `support_stage`,
   `capabilities_json`, `tone`, `sort_order`, `visible`, `verified_at`, `updated_at`)
VALUES
  ('ethereum', 'Ethereum', 'EVM', 'Economic', 'planned', '[]', 'blue', 1, 1, NULL, unixepoch() * 1000),
  ('arbitrum', 'Arbitrum', 'EVM L2', 'Rollup', 'planned', '[]', 'aqua', 2, 1, NULL, unixepoch() * 1000),
  ('base', 'Base', 'EVM L2', 'Rollup', 'planned', '[]', 'blue', 3, 1, NULL, unixepoch() * 1000),
  ('optimism', 'Optimism', 'EVM L2', 'Rollup', 'planned', '[]', 'red', 4, 1, NULL, unixepoch() * 1000),
  ('polygon', 'Polygon', 'EVM', 'Checkpoint', 'planned', '[]', 'violet', 5, 1, NULL, unixepoch() * 1000),
  ('solana', 'Solana', 'SVM', 'Optimistic', 'planned', '[]', 'lime', 6, 1, NULL, unixepoch() * 1000),
  ('bitcoin', 'Bitcoin', 'UTXO', 'Probabilistic', 'planned', '[]', 'amber', 7, 1, NULL, unixepoch() * 1000),
  ('avalanche', 'Avalanche', 'EVM', 'BFT', 'planned', '[]', 'red', 8, 1, NULL, unixepoch() * 1000);
