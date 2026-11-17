CREATE TABLE `developer_rpc_access_policies` (
	`service_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`allowed_origins_json` text DEFAULT '[]' NOT NULL,
	`allowed_ip_cidrs_json` text DEFAULT '[]' NOT NULL,
	`allowed_methods_json` text DEFAULT '[]' NOT NULL,
	`revision` integer NOT NULL,
	`update_id` text NOT NULL,
	`updated_by_account_id` text,
	`updated_by_email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `developer_services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_account_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "developer_rpc_access_policies_revision_check" CHECK("developer_rpc_access_policies"."revision" >= 1),
	CONSTRAINT "developer_rpc_access_policies_origins_json_check" CHECK(json_valid("developer_rpc_access_policies"."allowed_origins_json") AND json_type("developer_rpc_access_policies"."allowed_origins_json") = 'array'),
	CONSTRAINT "developer_rpc_access_policies_ip_cidrs_json_check" CHECK(json_valid("developer_rpc_access_policies"."allowed_ip_cidrs_json") AND json_type("developer_rpc_access_policies"."allowed_ip_cidrs_json") = 'array'),
	CONSTRAINT "developer_rpc_access_policies_methods_json_check" CHECK(json_valid("developer_rpc_access_policies"."allowed_methods_json") AND json_type("developer_rpc_access_policies"."allowed_methods_json") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `developer_rpc_access_policies_update_id_unique` ON `developer_rpc_access_policies` (`update_id`);--> statement-breakpoint
CREATE INDEX `developer_rpc_access_policies_workspace_updated_idx` ON `developer_rpc_access_policies` (`workspace_id`,`updated_at`);
