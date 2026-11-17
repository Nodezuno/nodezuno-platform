ALTER TABLE `developer_api_keys` ADD `service_id` text REFERENCES developer_services(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `developer_api_keys_service_revoked_created_idx` ON `developer_api_keys` (`service_id`,`revoked_at`,`created_at`);
