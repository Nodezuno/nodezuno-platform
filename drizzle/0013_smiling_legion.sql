CREATE TABLE `developer_rpc_service_guardrails` (
	`service_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`hourly_quota_limit` integer,
	`warning_threshold_percent` integer DEFAULT 80 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`update_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `developer_services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "developer_rpc_service_guardrails_quota_check" CHECK("developer_rpc_service_guardrails"."hourly_quota_limit" IS NULL OR ("developer_rpc_service_guardrails"."hourly_quota_limit" >= 100 AND "developer_rpc_service_guardrails"."hourly_quota_limit" <= 10000000)),
	CONSTRAINT "developer_rpc_service_guardrails_warning_check" CHECK("developer_rpc_service_guardrails"."warning_threshold_percent" >= 50 AND "developer_rpc_service_guardrails"."warning_threshold_percent" <= 95),
	CONSTRAINT "developer_rpc_service_guardrails_revision_check" CHECK("developer_rpc_service_guardrails"."revision" >= 1),
	CONSTRAINT "developer_rpc_service_guardrails_timestamps_check" CHECK("developer_rpc_service_guardrails"."updated_at" >= "developer_rpc_service_guardrails"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `developer_rpc_service_guardrails_workspace_service_unique` ON `developer_rpc_service_guardrails` (`workspace_id`,`service_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `developer_rpc_service_guardrails_update_id_unique` ON `developer_rpc_service_guardrails` (`update_id`);--> statement-breakpoint
CREATE INDEX `developer_rpc_service_guardrails_workspace_updated_idx` ON `developer_rpc_service_guardrails` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ethereum_rpc_service_quota_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`service_id` text NOT NULL,
	`bucket_start` integer NOT NULL,
	`quota_units` integer DEFAULT 0 NOT NULL,
	`quota_limit` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `developer_services`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ethereum_rpc_service_quota_nonnegative_check" CHECK("ethereum_rpc_service_quota_buckets"."quota_units" >= 0),
	CONSTRAINT "ethereum_rpc_service_quota_limit_check" CHECK("ethereum_rpc_service_quota_buckets"."quota_units" <= "ethereum_rpc_service_quota_buckets"."quota_limit")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ethereum_rpc_service_quota_service_bucket_unique` ON `ethereum_rpc_service_quota_buckets` (`service_id`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `ethereum_rpc_service_quota_workspace_service_bucket_idx` ON `ethereum_rpc_service_quota_buckets` (`workspace_id`,`service_id`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `ethereum_rpc_service_quota_expiry_idx` ON `ethereum_rpc_service_quota_buckets` (`expires_at`);
