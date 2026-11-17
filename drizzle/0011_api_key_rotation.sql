PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_developer_mutation_idempotency` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`operation` text NOT NULL,
	`idempotency_hash` text NOT NULL,
	`request_hash` text NOT NULL,
	`resource_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "developer_mutation_idempotency_operation_check" CHECK("__new_developer_mutation_idempotency"."operation" IN ('service.create', 'api_key.create', 'api_key.rotate')),
	CONSTRAINT "developer_mutation_idempotency_expiry_check" CHECK("__new_developer_mutation_idempotency"."expires_at" > "__new_developer_mutation_idempotency"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_developer_mutation_idempotency`("id", "workspace_id", "operation", "idempotency_hash", "request_hash", "resource_id", "created_at", "expires_at") SELECT "id", "workspace_id", "operation", "idempotency_hash", "request_hash", "resource_id", "created_at", "expires_at" FROM `developer_mutation_idempotency`;--> statement-breakpoint
DROP TABLE `developer_mutation_idempotency`;--> statement-breakpoint
ALTER TABLE `__new_developer_mutation_idempotency` RENAME TO `developer_mutation_idempotency`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `developer_mutation_idempotency_workspace_key_unique` ON `developer_mutation_idempotency` (`workspace_id`,`operation`,`idempotency_hash`);--> statement-breakpoint
CREATE INDEX `developer_mutation_idempotency_expiry_idx` ON `developer_mutation_idempotency` (`expires_at`);--> statement-breakpoint
CREATE INDEX `developer_mutation_idempotency_resource_idx` ON `developer_mutation_idempotency` (`workspace_id`,`operation`,`resource_id`);
