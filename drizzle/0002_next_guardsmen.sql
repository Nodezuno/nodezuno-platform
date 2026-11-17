CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_provider_account_unique` ON `auth_accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `auth_accounts_user_idx` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_rate_limits_key_unique` ON `auth_rate_limits` (`key`);--> statement-breakpoint
CREATE INDEX `auth_rate_limits_last_request_idx` ON `auth_rate_limits` (`last_request`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_unique` ON `auth_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_solana_wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`address` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_solana_wallets_address_unique` ON `auth_solana_wallets` (`address`);--> statement-breakpoint
CREATE INDEX `auth_solana_wallets_user_idx` ON `auth_solana_wallets` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_email_unique` ON `auth_users` (`email`);--> statement-breakpoint
CREATE INDEX `auth_users_created_idx` ON `auth_users` (`created_at`);--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verifications_identifier_idx` ON `auth_verifications` (`identifier`);--> statement-breakpoint
CREATE INDEX `auth_verifications_expiry_idx` ON `auth_verifications` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_wallet_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`address` text NOT NULL,
	`chain_id` integer NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_wallet_addresses_address_chain_unique` ON `auth_wallet_addresses` (`address`,`chain_id`);--> statement-breakpoint
CREATE INDEX `auth_wallet_addresses_user_idx` ON `auth_wallet_addresses` (`user_id`);--> statement-breakpoint
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
	CONSTRAINT "developer_services_product_check" CHECK("developer_services"."product" IN ('platform-api', 'one', 'rpc-api', 'rollups', 'nft-api', 'webhooks', 'websockets', 'transfers-api', 'token-api', 'bundler-api', 'gas-manager-api', 'vault', 'atlas')),
	CONSTRAINT "developer_services_environment_check" CHECK("developer_services"."environment" IN ('development', 'staging', 'production')),
	CONSTRAINT "developer_services_status_check" CHECK("developer_services"."status" IN ('active', 'configuration_saved', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `developer_services_workspace_status_created_idx` ON `developer_services` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `developer_services_creator_idx` ON `developer_services` (`created_by_account_id`);--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_developer_workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text,
	`email` text,
	`role` text DEFAULT 'developer' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "developer_workspace_members_role_check" CHECK("role" IN ('owner', 'admin', 'developer')),
	CONSTRAINT "developer_workspace_members_identity_check" CHECK("account_id" IS NOT NULL OR "email" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_developer_workspace_members`("id", "workspace_id", "account_id", "email", "role", "created_at", "updated_at") SELECT "id", "workspace_id", NULL, "email", "role", "created_at", "updated_at" FROM `developer_workspace_members`;--> statement-breakpoint
DROP TABLE `developer_workspace_members`;--> statement-breakpoint
ALTER TABLE `__new_developer_workspace_members` RENAME TO `developer_workspace_members`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `developer_workspace_members_workspace_account_unique` ON `developer_workspace_members` (`workspace_id`,`account_id`) WHERE "developer_workspace_members"."account_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `developer_workspace_members_workspace_email_unique` ON `developer_workspace_members` (`workspace_id`,`email`);--> statement-breakpoint
CREATE INDEX `developer_workspace_members_account_idx` ON `developer_workspace_members` (`account_id`);--> statement-breakpoint
CREATE INDEX `developer_workspace_members_email_idx` ON `developer_workspace_members` (`email`);--> statement-breakpoint
CREATE TABLE `__new_developer_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
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
	FOREIGN KEY (`created_by_account_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_developer_api_keys`("id", "workspace_id", "name", "prefix", "last_four", "scopes_json", "secret_hash", "created_by_account_id", "created_by_email", "created_at", "last_used_at", "expires_at", "revoked_at") SELECT "id", "workspace_id", "name", "prefix", "last_four", "scopes_json", "secret_hash", NULL, "created_by_email", "created_at", "last_used_at", "expires_at", "revoked_at" FROM `developer_api_keys`;--> statement-breakpoint
DROP TABLE `developer_api_keys`;--> statement-breakpoint
ALTER TABLE `__new_developer_api_keys` RENAME TO `developer_api_keys`;--> statement-breakpoint
CREATE UNIQUE INDEX `developer_api_keys_secret_hash_unique` ON `developer_api_keys` (`secret_hash`);--> statement-breakpoint
CREATE INDEX `developer_api_keys_workspace_revoked_created_idx` ON `developer_api_keys` (`workspace_id`,`revoked_at`,`created_at`);--> statement-breakpoint
ALTER TABLE `developer_audit_events` ADD `actor_account_id` text REFERENCES auth_users(id);--> statement-breakpoint
CREATE INDEX `developer_audit_actor_account_created_idx` ON `developer_audit_events` (`actor_account_id`,`created_at`);
