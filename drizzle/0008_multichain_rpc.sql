CREATE INDEX `developer_services_rpc_network_active_idx` ON `developer_services` (`product`,`network`,`archived_at`);--> statement-breakpoint
CREATE TRIGGER `developer_services_rpc_network_insert_guard`
BEFORE INSERT ON `developer_services`
WHEN NEW.`product` = 'rpc-api'
 AND NEW.`network` NOT IN ('ethereum', 'base', 'solana')
BEGIN
	SELECT RAISE(ABORT, 'developer_services_rpc_network_check');
END;--> statement-breakpoint
CREATE TRIGGER `developer_services_rpc_network_update_guard`
BEFORE UPDATE OF `product`, `network` ON `developer_services`
WHEN NEW.`product` = 'rpc-api'
 AND NEW.`network` NOT IN ('ethereum', 'base', 'solana')
BEGIN
	SELECT RAISE(ABORT, 'developer_services_rpc_network_check');
END;
