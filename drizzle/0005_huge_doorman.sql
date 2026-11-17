CREATE TABLE `ethereum_rpc_usage_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`service_id` text NOT NULL,
	`api_key_id` text NOT NULL,
	`bucket_start` integer NOT NULL,
	`quota_units` integer DEFAULT 0 NOT NULL,
	`quota_limit` integer NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`rpc_call_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`upstream_failure_count` integer DEFAULT 0 NOT NULL,
	`latency_ms_total` integer DEFAULT 0 NOT NULL,
	`bytes_in` integer DEFAULT 0 NOT NULL,
	`bytes_out` integer DEFAULT 0 NOT NULL,
	`last_request_at` integer,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `developer_services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`api_key_id`) REFERENCES `developer_api_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ethereum_rpc_usage_nonnegative_check" CHECK("ethereum_rpc_usage_buckets"."quota_units" >= 0 AND "ethereum_rpc_usage_buckets"."request_count" >= 0 AND "ethereum_rpc_usage_buckets"."rpc_call_count" >= 0 AND "ethereum_rpc_usage_buckets"."error_count" >= 0 AND "ethereum_rpc_usage_buckets"."upstream_failure_count" >= 0 AND "ethereum_rpc_usage_buckets"."latency_ms_total" >= 0 AND "ethereum_rpc_usage_buckets"."bytes_in" >= 0 AND "ethereum_rpc_usage_buckets"."bytes_out" >= 0),
	CONSTRAINT "ethereum_rpc_usage_quota_check" CHECK("ethereum_rpc_usage_buckets"."quota_units" <= "ethereum_rpc_usage_buckets"."quota_limit")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ethereum_rpc_usage_service_key_bucket_unique` ON `ethereum_rpc_usage_buckets` (`service_id`,`api_key_id`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `ethereum_rpc_usage_workspace_service_bucket_idx` ON `ethereum_rpc_usage_buckets` (`workspace_id`,`service_id`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `ethereum_rpc_usage_expiry_idx` ON `ethereum_rpc_usage_buckets` (`expires_at`);--> statement-breakpoint
CREATE TABLE `ethereum_rpc_workspace_quota_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`bucket_start` integer NOT NULL,
	`quota_units` integer DEFAULT 0 NOT NULL,
	`quota_limit` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ethereum_rpc_workspace_quota_nonnegative_check" CHECK("ethereum_rpc_workspace_quota_buckets"."quota_units" >= 0),
	CONSTRAINT "ethereum_rpc_workspace_quota_limit_check" CHECK("ethereum_rpc_workspace_quota_buckets"."quota_units" <= "ethereum_rpc_workspace_quota_buckets"."quota_limit")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ethereum_rpc_workspace_quota_workspace_bucket_unique` ON `ethereum_rpc_workspace_quota_buckets` (`workspace_id`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `ethereum_rpc_workspace_quota_expiry_idx` ON `ethereum_rpc_workspace_quota_buckets` (`expires_at`);