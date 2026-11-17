#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmod,
  constants,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rm,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as sqlite from "node:sqlite";

const { DatabaseSync } = sqlite;
const sqliteOnlineBackup = sqlite.backup;

const DATABASE_EXTENSION = /\.(?:db|sqlite|sqlite3)$/i;
const MANIFEST_SUFFIX = ".manifest.json";
const MANIFEST_VERSION = 1;
const MANIFEST_MAX_BYTES = 4 * 1024;
const MINIMUM_SCHEMA_MIGRATIONS = 13;
const MINIMUM_STATUS_SERVICES = 6;
const MINIMUM_CHAINS = 8;
const FILE_READ_CHUNK_BYTES = 64 * 1024;
const SAFE_READ_FLAGS =
  constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

export const sqliteBackupUsage = `Nodezuno SQLite backup

Usage:
  node scripts/backup-sqlite.mjs create /absolute/path/backup.sqlite
  node scripts/backup-sqlite.mjs verify /absolute/path/backup.sqlite

Environment:
  NODEZUNO_DATABASE_DRIVER=sqlite
  NODEZUNO_SQLITE_PATH=/absolute/path/nodezuno.sqlite
`;

export class SqliteBackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SqliteBackupError";
    this.code = code;
  }
}

export function parseSqliteBackupArguments(argv) {
  if (
    argv.length === 1 &&
    ["help", "--help", "-h"].includes(argv[0])
  ) {
    return { mode: "help" };
  }
  if (
    argv.length !== 2 ||
    !["create", "verify"].includes(argv[0])
  ) {
    throw new SqliteBackupError(
      "usage_invalid",
      "Choose create or verify and provide one absolute backup path.",
    );
  }
  return {
    mode: argv[0],
    pathname: validateSqlitePath(argv[1], "backup"),
  };
}

export async function createSqliteBackup(options = {}) {
  const environment = options.environment ?? process.env;
  requireSqliteDriver(environment);
  const sourcePath = validateSqlitePath(
    environment.NODEZUNO_SQLITE_PATH,
    "source",
  );
  const destinationPath = validateSqlitePath(
    options.destination,
    "backup",
  );
  const manifestPath = `${destinationPath}${MANIFEST_SUFFIX}`;
  const backupImplementation =
    options.backupImplementation ?? sqliteOnlineBackup;
  if (typeof backupImplementation !== "function") {
    throw new SqliteBackupError(
      "online_backup_unavailable",
      "This Node runtime does not provide the SQLite online backup API.",
    );
  }
  if (sourcePath === destinationPath) {
    throw new SqliteBackupError(
      "source_destination_conflict",
      "The backup destination must differ from the live database.",
    );
  }

  await assertRegularFile(sourcePath, "source_invalid");
  const destinationParent = await ensureSafeParent(destinationPath);
  const [sourceRealPath, destinationParentRealPath] =
    await Promise.all([
      safeRealpath(sourcePath, "source_invalid"),
      safeRealpath(destinationParent, "destination_parent_invalid"),
    ]);
  if (
    sourceRealPath ===
    path.join(
      destinationParentRealPath,
      path.basename(destinationPath),
    )
  ) {
    throw new SqliteBackupError(
      "source_destination_conflict",
      "The backup destination must differ from the live database.",
    );
  }
  await Promise.all([
    assertPathMissing(destinationPath, "destination_exists"),
    assertPathMissing(manifestPath, "manifest_exists"),
  ]);

  let stagingDirectory = null;
  let databasePublished = false;
  let manifestPublished = false;
  try {
    stagingDirectory = await mkdtemp(
      path.join(destinationParent, ".nodezuno-backup-"),
    );
    await chmod(stagingDirectory, 0o700);
    const temporaryBackup = path.join(
      stagingDirectory,
      "database.sqlite",
    );
    await performOnlineBackup({
      sourcePath,
      destinationPath: temporaryBackup,
      backupImplementation,
    });
    await chmod(temporaryBackup, 0o600);
    await syncRegularFile(temporaryBackup);

    const databaseVerification =
      await inspectSqliteDatabase(temporaryBackup);
    const fileIntegrity = await hashRegularFile(temporaryBackup);
    const createdAt = canonicalTimestamp(options.now);
    const manifest = {
      version: MANIFEST_VERSION,
      algorithm: "sha256",
      sha256: fileIntegrity.sha256,
      byteSize: fileIntegrity.byteSize,
      createdAt,
      schemaMigrationCount:
        databaseVerification.schemaMigrationCount,
    };

    await Promise.all([
      assertPathMissing(destinationPath, "destination_exists"),
      assertPathMissing(manifestPath, "manifest_exists"),
    ]);
    try {
      await link(temporaryBackup, destinationPath);
    } catch (error) {
      if (isFileSystemError(error, "EEXIST")) {
        throw new SqliteBackupError(
          "destination_exists",
          "The backup destination already exists.",
        );
      }
      throw new SqliteBackupError(
        "backup_publish_failed",
        "The verified backup could not be published.",
      );
    }
    databasePublished = true;
    await writeManifestExclusive(manifestPath, manifest);
    manifestPublished = true;
    await syncDirectory(destinationParent);

    return {
      mode: "create",
      sha256: manifest.sha256,
      byteSize: manifest.byteSize,
      createdAt: manifest.createdAt,
      schemaMigrationCount: manifest.schemaMigrationCount,
      statusServiceCount:
        databaseVerification.statusServiceCount,
      chainCount: databaseVerification.chainCount,
    };
  } catch (error) {
    if (manifestPublished) await safeUnlink(manifestPath);
    if (databasePublished) await safeUnlink(destinationPath);
    throw safeBackupError(
      error,
      "backup_create_failed",
      "SQLite backup creation failed.",
    );
  } finally {
    if (stagingDirectory !== null) {
      try {
        await rm(stagingDirectory, {
          recursive: true,
          force: true,
        });
      } catch {
        throw new SqliteBackupError(
          "backup_cleanup_failed",
          "The private backup staging directory could not be removed.",
        );
      }
    }
  }
}

export async function verifySqliteBackup(options = {}) {
  const environment = options.environment ?? process.env;
  requireSqliteDriver(environment);
  const pathname = validateSqlitePath(options.pathname, "backup");
  const manifestPath = `${pathname}${MANIFEST_SUFFIX}`;
  try {
    await Promise.all([
      assertRegularFile(pathname, "backup_file_invalid"),
      assertRegularFile(manifestPath, "manifest_invalid"),
    ]);
    const manifest = await readManifest(manifestPath);
    const before = await hashRegularFile(pathname);
    assertManifestFileIntegrity(manifest, before);
    const databaseVerification = await inspectSqliteDatabase(pathname);
    const after = await hashRegularFile(pathname);
    if (
      before.sha256 !== after.sha256 ||
      before.byteSize !== after.byteSize
    ) {
      throw new SqliteBackupError(
        "backup_changed_during_verification",
        "The backup changed during verification.",
      );
    }
    assertManifestFileIntegrity(manifest, after);
    if (
      manifest.schemaMigrationCount !==
      databaseVerification.schemaMigrationCount
    ) {
      throw new SqliteBackupError(
        "backup_schema_mismatch",
        "The backup schema does not match its manifest.",
      );
    }
    return {
      mode: "verify",
      sha256: manifest.sha256,
      byteSize: manifest.byteSize,
      createdAt: manifest.createdAt,
      schemaMigrationCount: manifest.schemaMigrationCount,
      statusServiceCount:
        databaseVerification.statusServiceCount,
      chainCount: databaseVerification.chainCount,
    };
  } catch (error) {
    throw safeBackupError(
      error,
      "backup_verification_failed",
      "SQLite backup verification failed.",
    );
  }
}

export async function executeSqliteBackupCli(
  argv,
  options = {},
) {
  const command = parseSqliteBackupArguments(argv);
  const stdout = options.stdout ?? process.stdout;
  if (command.mode === "help") {
    stdout.write(sqliteBackupUsage);
    return { mode: "help" };
  }
  const result =
    command.mode === "create"
      ? await createSqliteBackup({
          environment: options.environment,
          destination: command.pathname,
          backupImplementation: options.backupImplementation,
          now: options.now,
        })
      : await verifySqliteBackup({
          environment: options.environment,
          pathname: command.pathname,
        });
  stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

async function performOnlineBackup(options) {
  let sourceDatabase;
  try {
    sourceDatabase = new DatabaseSync(options.sourcePath, {
      readOnly: true,
      timeout: 5_000,
    });
    sourceDatabase.exec(
      "PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;",
    );
    await options.backupImplementation(
      sourceDatabase,
      options.destinationPath,
      { rate: 256 },
    );
  } catch {
    throw new SqliteBackupError(
      "online_backup_failed",
      "The online SQLite backup did not complete.",
    );
  } finally {
    if (sourceDatabase) {
      try {
        sourceDatabase.close();
      } catch {
        // The backup failure remains authoritative.
      }
    }
  }
}

export async function inspectSqliteDatabase(pathname) {
  let database;
  let stage = "integrity";
  try {
    database = new DatabaseSync(pathname, {
      readOnly: true,
      timeout: 5_000,
    });
    database.exec(
      "PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;",
    );
    const quickCheck = database
      .prepare("PRAGMA quick_check")
      .all();
    if (
      quickCheck.length !== 1 ||
      String(Object.values(quickCheck[0] ?? {})[0]) !== "ok"
    ) {
      throw new SqliteBackupError(
        "backup_integrity_failed",
        "SQLite quick_check did not pass.",
      );
    }
    stage = "schema";
    const ledger = database
      .prepare(
        `SELECT type
         FROM sqlite_master
         WHERE name = 'nodezuno_schema_migrations'
         LIMIT 1`,
      )
      .get();
    if (ledger?.type !== "table") {
      throw new SqliteBackupError(
        "backup_schema_invalid",
        "The required migration ledger is missing.",
      );
    }
    const migration = database
      .prepare(
        `SELECT COUNT(*) AS count,
                COUNT(DISTINCT filename) AS distinctCount,
                MIN(LENGTH(checksum)) AS minimumChecksumLength,
                MAX(LENGTH(checksum)) AS maximumChecksumLength
         FROM nodezuno_schema_migrations`,
      )
      .get();
    const schemaMigrationCount = safeCount(migration?.count);
    if (
      schemaMigrationCount < MINIMUM_SCHEMA_MIGRATIONS ||
      safeCount(migration?.distinctCount) !==
        schemaMigrationCount ||
      safeCount(migration?.minimumChecksumLength) !== 64 ||
      safeCount(migration?.maximumChecksumLength) !== 64
    ) {
      throw new SqliteBackupError(
        "backup_schema_invalid",
        "The migration ledger is incomplete.",
      );
    }
    const seeds = database
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM status_services)
            AS statusServiceCount,
          (SELECT COUNT(*) FROM chains) AS chainCount`,
      )
      .get();
    const statusServiceCount = safeCount(
      seeds?.statusServiceCount,
    );
    const chainCount = safeCount(seeds?.chainCount);
    if (
      statusServiceCount < MINIMUM_STATUS_SERVICES ||
      chainCount < MINIMUM_CHAINS
    ) {
      throw new SqliteBackupError(
        "backup_seed_invalid",
        "The required status and chain seed catalogs are incomplete.",
      );
    }
    return {
      schemaMigrationCount,
      statusServiceCount,
      chainCount,
    };
  } catch (error) {
    if (error instanceof SqliteBackupError) throw error;
    throw new SqliteBackupError(
      stage === "integrity"
        ? "backup_integrity_failed"
        : "backup_schema_invalid",
      stage === "integrity"
        ? "SQLite quick_check did not pass."
        : "The required SQLite schema could not be verified.",
    );
  } finally {
    if (database) {
      try {
        database.close();
      } catch {
        // Verification has already completed or failed.
      }
    }
  }
}

export function validateSqlitePath(value, kind) {
  const pathname = typeof value === "string" ? value : "";
  const normalized = path.normalize(pathname);
  const parent = path.dirname(pathname);
  const root = path.parse(pathname).root;
  if (
    !pathname ||
    !path.isAbsolute(pathname) ||
    pathname !== normalized ||
    /[\u0000-\u001f\u007f]/.test(pathname) ||
    !DATABASE_EXTENSION.test(path.basename(pathname)) ||
    parent === root
  ) {
    throw new SqliteBackupError(
      `${kind}_path_invalid`,
      `Use a canonical absolute ${kind} path ending in .db, .sqlite, or .sqlite3.`,
    );
  }
  return pathname;
}

function requireSqliteDriver(environment) {
  if (environment?.NODEZUNO_DATABASE_DRIVER?.trim() !== "sqlite") {
    throw new SqliteBackupError(
      "database_driver_invalid",
      "SQLite backup requires NODEZUNO_DATABASE_DRIVER=sqlite.",
    );
  }
}

async function ensureSafeParent(destinationPath) {
  const parent = path.dirname(destinationPath);
  try {
    await mkdir(parent, { recursive: true, mode: 0o750 });
    const information = await lstat(parent);
    if (
      information.isSymbolicLink() ||
      !information.isDirectory()
    ) {
      throw new SqliteBackupError(
        "destination_parent_invalid",
        "The backup parent must be a real directory.",
      );
    }
    return parent;
  } catch (error) {
    throw safeBackupError(
      error,
      "destination_parent_invalid",
      "The backup parent could not be created safely.",
    );
  }
}

async function assertRegularFile(pathname, code) {
  try {
    const information = await lstat(pathname);
    if (
      information.isSymbolicLink() ||
      !information.isFile()
    ) {
      throw new SqliteBackupError(
        code,
        "The SQLite artifact must be a regular file, not a symlink.",
      );
    }
  } catch (error) {
    throw safeBackupError(
      error,
      code,
      "The required SQLite artifact is unavailable.",
    );
  }
}

async function assertPathMissing(pathname, code) {
  try {
    await lstat(pathname);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return;
    throw safeBackupError(
      error,
      code,
      "The destination path could not be checked safely.",
    );
  }
  throw new SqliteBackupError(
    code,
    code === "manifest_exists"
      ? "The backup manifest already exists."
      : "The backup destination already exists.",
  );
}

async function safeRealpath(pathname, code) {
  try {
    return await realpath(pathname);
  } catch (error) {
    throw safeBackupError(
      error,
      code,
      "The filesystem path could not be resolved safely.",
    );
  }
}

async function syncRegularFile(pathname) {
  let handle;
  try {
    handle = await open(pathname, SAFE_READ_FLAGS);
    const information = await handle.stat();
    if (!information.isFile()) {
      throw new SqliteBackupError(
        "online_backup_failed",
        "The online backup did not produce a regular file.",
      );
    }
    await handle.sync();
  } catch (error) {
    throw safeBackupError(
      error,
      "online_backup_failed",
      "The online backup could not be synchronized.",
    );
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function hashRegularFile(pathname) {
  let handle;
  try {
    handle = await open(pathname, SAFE_READ_FLAGS);
    const information = await handle.stat();
    if (
      !information.isFile() ||
      !Number.isSafeInteger(information.size) ||
      information.size <= 0
    ) {
      throw new SqliteBackupError(
        "backup_file_invalid",
        "The backup must be a nonempty regular file.",
      );
    }
    const hash = createHash("sha256");
    const chunk = Buffer.allocUnsafe(FILE_READ_CHUNK_BYTES);
    let position = 0;
    while (position < information.size) {
      const { bytesRead } = await handle.read(
        chunk,
        0,
        Math.min(chunk.length, information.size - position),
        position,
      );
      if (bytesRead <= 0) {
        throw new SqliteBackupError(
          "backup_file_invalid",
          "The backup could not be read completely.",
        );
      }
      hash.update(chunk.subarray(0, bytesRead));
      position += bytesRead;
    }
    return {
      sha256: hash.digest("hex"),
      byteSize: information.size,
    };
  } catch (error) {
    throw safeBackupError(
      error,
      "backup_file_invalid",
      "The backup file could not be read safely.",
    );
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function writeManifestExclusive(pathname, manifest) {
  let handle;
  let created = false;
  try {
    handle = await open(
      pathname,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    created = true;
    await handle.writeFile(`${JSON.stringify(manifest)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    if (created) await safeUnlink(pathname);
    if (isFileSystemError(error, "EEXIST")) {
      throw new SqliteBackupError(
        "manifest_exists",
        "The backup manifest already exists.",
      );
    }
    throw safeBackupError(
      error,
      "manifest_publish_failed",
      "The backup manifest could not be created exclusively.",
    );
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function readManifest(pathname) {
  let handle;
  try {
    handle = await open(pathname, SAFE_READ_FLAGS);
    const information = await handle.stat();
    if (
      !information.isFile() ||
      information.size <= 0 ||
      information.size > MANIFEST_MAX_BYTES
    ) {
      throw new SqliteBackupError(
        "manifest_invalid",
        "The backup manifest size is invalid.",
      );
    }
    const manifest = JSON.parse(
      await handle.readFile({ encoding: "utf8" }),
    );
    validateManifest(manifest);
    return manifest;
  } catch (error) {
    throw safeBackupError(
      error,
      "manifest_invalid",
      "The backup manifest is invalid.",
    );
  } finally {
    await handle?.close().catch(() => {});
  }
}

function validateManifest(value) {
  const expectedKeys = [
    "algorithm",
    "byteSize",
    "createdAt",
    "schemaMigrationCount",
    "sha256",
    "version",
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !==
      expectedKeys.join(",") ||
    value.version !== MANIFEST_VERSION ||
    value.algorithm !== "sha256" ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !Number.isSafeInteger(value.byteSize) ||
    value.byteSize <= 0 ||
    !Number.isSafeInteger(value.schemaMigrationCount) ||
    value.schemaMigrationCount < MINIMUM_SCHEMA_MIGRATIONS ||
    !isCanonicalTimestamp(value.createdAt)
  ) {
    throw new SqliteBackupError(
      "manifest_invalid",
      "The backup manifest contract is invalid.",
    );
  }
}

function assertManifestFileIntegrity(manifest, integrity) {
  if (manifest.byteSize !== integrity.byteSize) {
    throw new SqliteBackupError(
      "backup_size_mismatch",
      "The backup byte size does not match its manifest.",
    );
  }
  if (manifest.sha256 !== integrity.sha256) {
    throw new SqliteBackupError(
      "backup_digest_mismatch",
      "The backup digest does not match its manifest.",
    );
  }
}

function canonicalTimestamp(now) {
  const value =
    typeof now === "function"
      ? now()
      : (now ?? new Date());
  const date =
    value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new SqliteBackupError(
      "backup_timestamp_invalid",
      "The backup timestamp is invalid.",
    );
  }
  return date.toISOString();
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === value
  );
}

function safeCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new SqliteBackupError(
      "backup_schema_invalid",
      "A required SQLite count is invalid.",
    );
  }
  return count;
}

async function syncDirectory(pathname) {
  let handle;
  try {
    handle = await open(
      pathname,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0),
    );
    await handle.sync();
  } catch (error) {
    if (
      !isFileSystemError(error, "EINVAL") &&
      !isFileSystemError(error, "ENOTSUP") &&
      !isFileSystemError(error, "EPERM")
    ) {
      throw new SqliteBackupError(
        "backup_publish_failed",
        "The backup directory could not be synchronized.",
      );
    }
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function safeUnlink(pathname) {
  try {
    await unlink(pathname);
  } catch (error) {
    if (!isFileSystemError(error, "ENOENT")) {
      // Cleanup is best effort and never replaces the original failure.
    }
  }
}

function safeBackupError(error, code, message) {
  return error instanceof SqliteBackupError
    ? error
    : new SqliteBackupError(code, message);
}

function isFileSystemError(error, code) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code
  );
}

async function main() {
  try {
    await executeSqliteBackupCli(process.argv.slice(2));
  } catch (error) {
    const safe = safeBackupError(
      error,
      "backup_failed",
      "SQLite backup command failed.",
    );
    process.stderr.write(`${safe.code}: ${safe.message}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
