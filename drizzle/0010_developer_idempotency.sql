CREATE TABLE `developer_mutation_idempotency` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`operation` text NOT NULL,
	`idempotency_hash` text NOT NULL,
	`request_hash` text NOT NULL,
	`resource_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `developer_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "developer_mutation_idempotency_operation_check" CHECK("developer_mutation_idempotency"."operation" IN ('service.create', 'api_key.create')),
	CONSTRAINT "developer_mutation_idempotency_expiry_check" CHECK("developer_mutation_idempotency"."expires_at" > "developer_mutation_idempotency"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `developer_mutation_idempotency_workspace_key_unique` ON `developer_mutation_idempotency` (`workspace_id`,`operation`,`idempotency_hash`);--> statement-breakpoint
CREATE INDEX `developer_mutation_idempotency_expiry_idx` ON `developer_mutation_idempotency` (`expires_at`);--> statement-breakpoint
CREATE INDEX `developer_mutation_idempotency_resource_idx` ON `developer_mutation_idempotency` (`workspace_id`,`operation`,`resource_id`);
