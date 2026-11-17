PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `ethereum_rpc_usage_buckets` RENAME TO `__old_ethereum_rpc_usage_buckets`;--> statement-breakpoint
ALTER TABLE `developer_api_keys` RENAME TO `__old_developer_api_keys`;--> statement-breakpoint
ALTER TABLE `developer_services` RENAME TO `__old_developer_services`;--> statement-breakpoint
CREATE TABLE `developer_services` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product` text NOT NULL,
	`name` text NOT NULL,
	`environment` text NOT NULL,
	`network` text NOT NULL,
	`region` text NOT NULL,
	`status` text NOT NULL,
	`endpoint_path` text,
	`configuration_json` text DEFAULT '{}' NOT NULL,
	`created_by_account_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "developer_services_product_check" CHECK("developer_services"."product" IN ('platform-api', 'one', 'rpc-api', 'grpc-api', 'rollups', 'nft-api', 'webhooks', 'websockets', 'transfers-api', 'token-api', 'bundler-api', 'gas-manager-api', 'vault', 'atlas')),
	CONSTRAINT "developer_services_environment_check" CHECK("developer_services"."environment" IN ('development', 'staging', 'production')),
	CONSTRAINT "developer_services_status_check" CHECK("developer_services"."status" IN ('active', 'configuration_saved', 'archived'))
);--> statement-breakpoint
INSERT INTO `developer_services` (
	`id`, `workspace_id`, `product`, `name`, `environment`, `network`,
	`region`, `status`, `endpoint_path`, `configuration_json`,
	`created_by_account_id`, `created_at`, `updated_at`, `archived_at`
) SELECT
	`id`, `workspace_id`, `product`, `name`, `environment`, `network`,
	`region`, `status`, `endpoint_path`, `configuration_json`,
	`created_by_account_id`, `created_at`, `updated_at`, `archived_at`
FROM `__old_developer_services`;--> statement-breakpoint
CREATE TABLE `developer_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`service_id` text,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`last_four` text NOT NULL,
	`scopes_json` text DEFAULT '[]' NOT NULL,
	`secret_hash` text NOT NULL,
	`created_by_account_id` text,
	`created_by_email` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `developer_services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `developer_api_keys` (
	`id`, `workspace_id`, `service_id`, `name`, `prefix`, `last_four`,
	`scopes_json`, `secret_hash`, `created_by_account_id`,
	`created_by_email`, `created_at`, `last_used_at`, `expires_at`,
	`revoked_at`
) SELECT
	`id`, `workspace_id`, `service_id`, `name`, `prefix`, `last_four`,
	`scopes_json`, `secret_hash`, `created_by_account_id`,
	`created_by_email`, `created_at`, `last_used_at`, `expires_at`,
	`revoked_at`
FROM `__old_developer_api_keys`;--> statement-breakpoint
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
);--> statement-breakpoint
INSERT INTO `ethereum_rpc_usage_buckets` (
	`id`, `workspace_id`, `service_id`, `api_key_id`, `bucket_start`,
	`quota_units`, `quota_limit`, `request_count`, `rpc_call_count`,
	`error_count`, `upstream_failure_count`, `latency_ms_total`,
	`bytes_in`, `bytes_out`, `last_request_at`, `updated_at`, `expires_at`
) SELECT
	`id`, `workspace_id`, `service_id`, `api_key_id`, `bucket_start`,
	`quota_units`, `quota_limit`, `request_count`, `rpc_call_count`,
	`error_count`, `upstream_failure_count`, `latency_ms_total`,
	`bytes_in`, `bytes_out`, `last_request_at`, `updated_at`, `expires_at`
FROM `__old_ethereum_rpc_usage_buckets`;--> statement-breakpoint
DROP TABLE `__old_ethereum_rpc_usage_buckets`;--> statement-breakpoint
DROP TABLE `__old_developer_api_keys`;--> statement-breakpoint
DROP TABLE `__old_developer_services`;--> statement-breakpoint
CREATE INDEX `developer_services_workspace_status_created_idx` ON `developer_services` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `developer_services_creator_idx` ON `developer_services` (`created_by_account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `developer_api_keys_secret_hash_unique` ON `developer_api_keys` (`secret_hash`);--> statement-breakpoint
CREATE INDEX `developer_api_keys_workspace_revoked_created_idx` ON `developer_api_keys` (`workspace_id`,`revoked_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `developer_api_keys_service_revoked_created_idx` ON `developer_api_keys` (`service_id`,`revoked_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ethereum_rpc_usage_service_key_bucket_unique` ON `ethereum_rpc_usage_buckets` (`service_id`,`api_key_id`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `ethereum_rpc_usage_workspace_service_bucket_idx` ON `ethereum_rpc_usage_buckets` (`workspace_id`,`service_id`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `ethereum_rpc_usage_expiry_idx` ON `ethereum_rpc_usage_buckets` (`expires_at`);--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
