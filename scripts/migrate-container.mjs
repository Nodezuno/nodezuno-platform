#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { containerDatabaseDriver } from "../lib/server/runtime-config.ts";
import { migrateD1 } from "./migrate-d1-rest.mjs";
import { migrateSqlite } from "./migrate-sqlite.mjs";

export async function migrateContainer(options = {}) {
  const environment = options.environment ?? process.env;
  const driver = containerDatabaseDriver(
    environment.NODEZUNO_DATABASE_DRIVER,
  );
  if (driver === "sqlite") {
    const result = await migrateSqlite({
      environment,
      migrationDirectory: options.migrationDirectory,
      pathname: options.pathname,
    });
    return {
      driver,
      migrations: result.migrations,
      services: result.services,
      chains: result.chains,
    };
  }
  if (driver === "d1-rest") {
    const result = await migrateD1({
      environment,
      migrationDirectory: options.migrationDirectory,
      query: options.query,
    });
    return { driver, ...result };
  }
  throw new Error(
    "NODEZUNO_DATABASE_DRIVER must be d1-rest or sqlite.",
  );
}

async function main() {
  const result = await migrateContainer();
  process.stdout.write(
    `Database ready (${result.driver}): ` +
      `${result.migrations} migration file(s), ` +
      `${result.services} services, ${result.chains} chains.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Migration failed."}\n`,
    );
    process.exitCode = 1;
  });
}
