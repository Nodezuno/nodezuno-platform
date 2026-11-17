#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { normalizeSqliteDatabasePath } from "../lib/server/runtime-config.ts";
import { migrateD1 } from "./migrate-d1-rest.mjs";

export async function migrateSqlite(options = {}) {
  const environment = options.environment ?? process.env;
  const pathname = normalizeSqliteDatabasePath(
    options.pathname ?? environment.NODEZUNO_SQLITE_PATH,
  );
  if (!pathname) {
    throw new Error(
      "NODEZUNO_SQLITE_PATH must be an absolute .db, .sqlite, or .sqlite3 path.",
    );
  }
  await mkdir(path.dirname(pathname), {
    recursive: true,
    mode: 0o750,
  });
  assertSafeSqliteCompanionFiles(pathname);
  createOrSecureSqliteFile(pathname);
  const previousUmask = process.umask(0o077);
  let sqlite = null;
  try {
    sqlite = new DatabaseSync(pathname, { timeout: 5_000 });
    sqlite.exec("PRAGMA foreign_keys = ON");
    const journalMode = sqlite
      .prepare("PRAGMA journal_mode = WAL")
      .get()?.journal_mode;
    if (journalMode !== "wal") {
      throw new Error("SQLite WAL mode is unavailable.");
    }
    sqlite.exec("PRAGMA synchronous = FULL");
    const synchronous = sqlite
      .prepare("PRAGMA synchronous")
      .get()?.synchronous;
    if (synchronous !== 2) {
      throw new Error("SQLite full durability mode is unavailable.");
    }
    sqlite.exec("PRAGMA busy_timeout = 5000");
    sqlite.exec("PRAGMA trusted_schema = OFF");
    sqlite.exec("BEGIN IMMEDIATE; ROLLBACK");
    secureExistingSqliteFiles(pathname);
  } catch (error) {
    sqlite?.close();
    throw error;
  } finally {
    process.umask(previousUmask);
  }
  try {
    const result = await migrateD1({
      environment: {
        CLOUDFLARE_ACCOUNT_ID: "0".repeat(32),
        CLOUDFLARE_D1_DATABASE_ID:
          "00000000-0000-4000-8000-000000000000",
        CLOUDFLARE_D1_API_TOKEN: "local-sqlite-migration-token-".padEnd(
          48,
          "0",
        ),
        NODEZUNO_ALLOW_SCHEMA_BASELINE:
          environment.NODEZUNO_ALLOW_SCHEMA_BASELINE,
        NODEZUNO_ALLOW_CONTRACT_MIGRATIONS:
          environment.NODEZUNO_ALLOW_CONTRACT_MIGRATIONS,
      },
      migrationDirectory:
        options.migrationDirectory ?? path.resolve("drizzle"),
      query: createSqliteMigrationQuery(sqlite),
    });
    const integrity = sqlite
      .prepare("PRAGMA quick_check")
      .get();
    if (integrity?.quick_check !== "ok") {
      throw new Error("SQLite integrity verification failed.");
    }
    secureExistingSqliteFiles(pathname);
    return { ...result, pathname };
  } finally {
    sqlite.close();
  }
}

function assertSafeSqliteCompanionFiles(pathname) {
  for (const candidate of sqliteStorageFiles(pathname)) {
    try {
      const metadata = lstatSync(candidate);
      if (
        metadata.isSymbolicLink() ||
        !metadata.isFile() ||
        metadata.nlink !== 1
      ) {
        throw new Error("SQLite storage contains an unsafe file.");
      }
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
  }
}

function createOrSecureSqliteFile(pathname) {
  const descriptor = openSqliteFile(
    pathname,
    constants.O_CREAT | constants.O_RDWR,
    0o600,
  );
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.nlink !== 1) {
      throw new Error("SQLite storage path must be a regular file.");
    }
    fchmodSync(descriptor, 0o600);
  } finally {
    closeSync(descriptor);
  }
}

function secureExistingSqliteFiles(pathname) {
  for (const candidate of sqliteStorageFiles(pathname)) {
    let descriptor;
    try {
      descriptor = openSqliteFile(candidate, constants.O_RDONLY);
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
    try {
      const metadata = fstatSync(descriptor);
      if (!metadata.isFile() || metadata.nlink !== 1) {
        throw new Error("SQLite storage contains an unsafe file.");
      }
      fchmodSync(descriptor, 0o600);
    } finally {
      closeSync(descriptor);
    }
  }
}

function sqliteStorageFiles(pathname) {
  return [
    pathname,
    `${pathname}-wal`,
    `${pathname}-shm`,
    `${pathname}-journal`,
  ];
}

function openSqliteFile(pathname, flags, mode) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  try {
    return openSync(pathname, flags | noFollow, mode);
  } catch (error) {
    if (isUnsafeLinkError(error)) {
      throw new Error("SQLite storage contains an unsafe link.");
    }
    throw error;
  }
}

function isMissingFileError(error) {
  return error?.code === "ENOENT";
}

function isUnsafeLinkError(error) {
  return error?.code === "ELOOP" || error?.code === "EMLINK";
}

export function createSqliteMigrationQuery(sqlite) {
  return async function query(body) {
    if (body && Array.isArray(body.batch)) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = body.batch.map((entry) =>
          executeMigrationStatement(sqlite, entry),
        );
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        try {
          sqlite.exec("ROLLBACK");
        } catch {
          // Preserve the original migration failure.
        }
        throw error;
      }
    }
    return [executeMigrationStatement(sqlite, body)];
  };
}

function executeMigrationStatement(sqlite, entry) {
  if (
    !entry ||
    typeof entry.sql !== "string" ||
    !entry.sql.trim() ||
    (entry.params !== undefined && !Array.isArray(entry.params))
  ) {
    throw new TypeError("The SQLite migration statement is invalid.");
  }
  const statement = sqlite.prepare(entry.sql);
  const params = (entry.params ?? []).map(sqliteMigrationBinding);
  if (statement.columns().length > 0) {
    const results = statement
      .all(...params)
      .map((row) => ({ ...row }));
    return {
      success: true,
      results,
      meta: { changes: 0 },
    };
  }
  const result = statement.run(...params);
  return {
    success: true,
    results: [],
    meta: { changes: Number(result.changes) },
  };
}

function sqliteMigrationBinding(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new TypeError(
    "The SQLite migration binding type is not supported.",
  );
}

async function main() {
  const result = await migrateSqlite();
  process.stdout.write(
    `SQLite ready: ${result.migrations} migration file(s), ` +
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
