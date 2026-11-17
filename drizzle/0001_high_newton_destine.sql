CREATE TABLE `developer_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`last_four` text NOT NULL,
	`scopes_json` text DEFAULT '[]' NOT NULL,
	`secret_hash` text NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `developer_api_keys_secret_hash_unique` ON `developer_api_keys` (`secret_hash`);--> statement-breakpoint
CREATE INDEX `developer_api_keys_workspace_revoked_created_idx` ON `developer_api_keys` (`workspace_id`,`revoked_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `developer_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_email` text,
	`api_key_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `developer_audit_workspace_created_idx` ON `developer_audit_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `developer_audit_entity_created_idx` ON `developer_audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `developer_workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'developer' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "developer_workspace_members_role_check" CHECK("developer_workspace_members"."role" IN ('owner', 'admin', 'developer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `developer_workspace_members_workspace_email_unique` ON `developer_workspace_members` (`workspace_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `developer_workspace_members_owner_unique` ON `developer_workspace_members` (`email`) WHERE "developer_workspace_members"."role" = 'owner';--> statement-breakpoint
CREATE INDEX `developer_workspace_members_email_idx` ON `developer_workspace_members` (`email`);--> statement-breakpoint
CREATE TABLE `developer_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "developer_workspaces_status_check" CHECK("developer_workspaces"."status" IN ('active', 'suspended', 'closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `developer_workspaces_slug_unique` ON `developer_workspaces` (`slug`);--> statement-breakpoint
CREATE INDEX `developer_workspaces_status_created_idx` ON `developer_workspaces` (`status`,`created_at`);