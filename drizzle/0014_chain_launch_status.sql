UPDATE `status_services`
SET
  `slug` = 'chain-launch-cloud',
  `name` = 'Chain Launch Cloud',
  `description` = 'Design-partner roadmap. No external chain deployment is currently claimed.',
  `state` = 'preview',
  `sort_order` = 1,
  `updated_at` = unixepoch() * 1000
WHERE `slug` = 'edge-regions';

UPDATE `status_services`
SET
  `slug` = 'ai-explorer',
  `name` = 'AI Explorer',
  `description` = 'Synthetic evidence prototype. No live external chain index is currently claimed.',
  `state` = 'preview',
  `sort_order` = 3,
  `updated_at` = unixepoch() * 1000
WHERE `slug` = 'atlas-pipelines';

UPDATE `status_services`
SET
  `slug` = 'node-fleet',
  `name` = 'Managed Node Fleet',
  `description` = 'Roadmap capability. No managed external node fleet is currently claimed.',
  `state` = 'preview',
  `sort_order` = 4,
  `updated_at` = unixepoch() * 1000
WHERE `slug` = 'flow-orchestration';

UPDATE `status_services`
SET
  `slug` = 'consensus-operations',
  `name` = 'Consensus Operations',
  `description` = 'Roadmap capability for non-signing observability and rehearsed changes.',
  `state` = 'preview',
  `sort_order` = 5,
  `updated_at` = unixepoch() * 1000
WHERE `slug` = 'vault-policy';
