#!/usr/bin/env node

console.error(
  "Migration generation is disabled. Ordered SQL files and the nodezuno_schema_migrations checksum ledger are the current migration authority. Read docs/MIGRATIONS.md before adding a migration.",
);
process.exitCode = 1;
