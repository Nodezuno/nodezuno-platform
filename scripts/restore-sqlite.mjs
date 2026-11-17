#!/usr/bin/env node

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
import {
  hashRegularFile,
  inspectSqliteDatabase,
  SqliteBackupError,
  validateSqlitePath,
  verifySqliteBackup,
} from "./backup-sqlite.mjs";

const COPY_BUFFER_BYTES = 1024 * 1024;
const SAFE_READ_FLAGS =
  constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
const SAFE_CREATE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  (constants.O_NOFOLLOW ?? 0);
const SQLITE_SIDECAR_SUFFIXES = ["-wal", "-shm", "-journal"];

export const sqliteRestoreUsage = `Nodezuno SQLite restore

Usage:
  node scripts/restore-sqlite.mjs /absolute/path/backup.sqlite

Environment:
  NODEZUNO_DATABASE_DRIVER=sqlite
  NODEZUNO_SQLITE_PATH=/absolute/path/empty-target.sqlite

The target database and every SQLite sidecar must be absent. Stop the
application and move the old database aside before running this command.
`;

export async function restoreSqliteBackup(options = {}) {
  const environment = options.environment ?? process.env;
  if (environment.NODEZUNO_DATABASE_DRIVER?.trim() !== "sqlite") {
    throw restoreError(
      "database_driver_invalid",
      "SQLite restore requires NODEZUNO_DATABASE_DRIVER=sqlite.",
    );
  }
  const backupPath = validateRestorePath(
    options.backupPath,
    "backup",
  );
  const destinationPath = validateRestorePath(
    environment.NODEZUNO_SQLITE_PATH,
    "target",
  );
  if (backupPath === destinationPath) {
    throw restoreError(
      "source_destination_conflict",
      "The restore source and target must differ.",
    );
  }

  const verified = await verifySqliteBackup({
    environment,
    pathname: backupPath,
  });
  const destinationParent = await ensureRestoreParent(destinationPath);
  const [backupRealPath, destinationParentRealPath] =
    await Promise.all([
      safeRealpath(backupPath, "backup_file_invalid"),
      safeRealpath(destinationParent, "target_parent_invalid"),
    ]);
  const resolvedDestination = path.join(
    destinationParentRealPath,
    path.basename(destinationPath),
  );
  if (backupRealPath === resolvedDestination) {
    throw restoreError(
      "source_destination_conflict",
      "The restore source and target must differ.",
    );
  }

  const protectedPaths = [
    destinationPath,
    ...SQLITE_SIDECAR_SUFFIXES.map(
      (suffix) => `${destinationPath}${suffix}`,
    ),
  ];
  await Promise.all(
    protectedPaths.map((pathname) =>
      assertMissing(pathname, "target_exists"),
    ),
  );

  let stagingDirectory = null;
  let destinationPublished = false;
  try {
    stagingDirectory = await mkdtemp(
      path.join(destinationParent, ".nodezuno-restore-"),
    );
    await chmod(stagingDirectory, 0o700);
    const temporaryDatabase = path.join(
      stagingDirectory,
      "database.sqlite",
    );
    await (
      options.copyImplementation ?? copyFileExclusive
    )(backupPath, temporaryDatabase);
    await assertPrivateRegularFile(temporaryDatabase);

    const [integrity, database] = await Promise.all([
      hashRegularFile(temporaryDatabase),
      inspectSqliteDatabase(temporaryDatabase),
    ]);
    if (
      integrity.sha256 !== verified.sha256 ||
      integrity.byteSize !== verified.byteSize ||
      database.schemaMigrationCount !==
        verified.schemaMigrationCount ||
      database.statusServiceCount !==
        verified.statusServiceCount ||
      database.chainCount !== verified.chainCount
    ) {
      throw restoreError(
        "restored_database_mismatch",
        "The restored database does not match the verified backup.",
      );
    }
    await Promise.all(
      protectedPaths.map((pathname) =>
        assertMissing(pathname, "target_exists"),
      ),
    );
    try {
      await link(temporaryDatabase, destinationPath);
      destinationPublished = true;
    } catch (error) {
      if (isFileSystemError(error, "EEXIST")) {
        throw restoreError(
          "target_exists",
          "The restore target or a SQLite sidecar already exists.",
        );
      }
      throw restoreError(
        "restore_publish_failed",
        "The verified database could not be published.",
      );
    }
    await chmod(destinationPath, 0o600);
    await syncDirectory(destinationParent);
    return {
      mode: "restore",
      sha256: integrity.sha256,
      byteSize: integrity.byteSize,
      schemaMigrationCount: database.schemaMigrationCount,
      statusServiceCount: database.statusServiceCount,
      chainCount: database.chainCount,
    };
  } catch (error) {
    if (destinationPublished) await safeUnlink(destinationPath);
    throw safeRestoreError(
      error,
      "restore_failed",
      "SQLite restore failed.",
    );
  } finally {
    if (stagingDirectory !== null) {
      await rm(stagingDirectory, {
        recursive: true,
        force: true,
      });
    }
  }
}

export async function executeSqliteRestoreCli(
  argv,
  options = {},
) {
  const stdout = options.stdout ?? process.stdout;
  if (
    argv.length === 1 &&
    ["help", "--help", "-h"].includes(argv[0])
  ) {
    stdout.write(sqliteRestoreUsage);
    return { mode: "help" };
  }
  if (argv.length !== 1) {
    throw restoreError(
      "usage_invalid",
      "Provide exactly one absolute SQLite backup path.",
    );
  }
  const result = await restoreSqliteBackup({
    environment: options.environment,
    backupPath: argv[0],
    copyImplementation: options.copyImplementation,
  });
  stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

async function copyFileExclusive(sourcePath, destinationPath) {
  let source;
  let destination;
  let destinationCreated = false;
  let failure = null;
  try {
    source = await open(sourcePath, SAFE_READ_FLAGS);
    const sourceInformation = await source.stat();
    if (
      !sourceInformation.isFile() ||
      sourceInformation.size <= 0
    ) {
      throw restoreError(
        "backup_file_invalid",
        "The verified backup is not a nonempty regular file.",
      );
    }
    destination = await open(
      destinationPath,
      SAFE_CREATE_FLAGS,
      0o600,
    );
    destinationCreated = true;
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let position = 0;
    while (position < sourceInformation.size) {
      const { bytesRead } = await source.read(
        buffer,
        0,
        Math.min(
          buffer.byteLength,
          sourceInformation.size - position,
        ),
        position,
      );
      if (bytesRead <= 0) {
        throw restoreError(
          "backup_file_invalid",
          "The verified backup could not be read completely.",
        );
      }
      let written = 0;
      while (written < bytesRead) {
        const result = await destination.write(
          buffer,
          written,
          bytesRead - written,
          position + written,
        );
        if (result.bytesWritten <= 0) {
          throw restoreError(
            "restore_write_failed",
            "The restored database could not be written completely.",
          );
        }
        written += result.bytesWritten;
      }
      position += bytesRead;
    }
    await destination.sync();
    await chmod(destinationPath, 0o600);
  } catch (error) {
    failure = safeRestoreError(
      error,
      "restore_copy_failed",
      "The verified backup could not be copied safely.",
    );
  } finally {
    await destination?.close().catch(() => {});
    await source?.close().catch(() => {});
  }
  if (failure !== null) {
    if (destinationCreated) await safeUnlink(destinationPath);
    throw failure;
  }
}

function validateRestorePath(value, kind) {
  try {
    return validateSqlitePath(value, kind);
  } catch (error) {
    throw safeRestoreError(
      error,
      `${kind}_path_invalid`,
      `Use a canonical absolute ${kind} path ending in .db, .sqlite, or .sqlite3.`,
    );
  }
}

async function ensureRestoreParent(destinationPath) {
  const parent = path.dirname(destinationPath);
  try {
    await mkdir(parent, { recursive: true, mode: 0o750 });
    const information = await lstat(parent);
    if (
      information.isSymbolicLink() ||
      !information.isDirectory()
    ) {
      throw restoreError(
        "target_parent_invalid",
        "The restore target parent must be a real directory.",
      );
    }
    return parent;
  } catch (error) {
    throw safeRestoreError(
      error,
      "target_parent_invalid",
      "The restore target parent is unavailable.",
    );
  }
}

async function assertMissing(pathname, code) {
  try {
    await lstat(pathname);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return;
    throw safeRestoreError(
      error,
      code,
      "The restore target could not be checked safely.",
    );
  }
  throw restoreError(
    code,
    "The restore target or a SQLite sidecar already exists.",
  );
}

async function assertPrivateRegularFile(pathname) {
  try {
    const information = await lstat(pathname);
    if (
      information.isSymbolicLink() ||
      !information.isFile() ||
      information.nlink !== 1
    ) {
      throw restoreError(
        "restored_database_invalid",
        "The restored database must be one private regular file.",
      );
    }
    await chmod(pathname, 0o600);
  } catch (error) {
    throw safeRestoreError(
      error,
      "restored_database_invalid",
      "The restored database file is invalid.",
    );
  }
}

async function safeRealpath(pathname, code) {
  try {
    return await realpath(pathname);
  } catch (error) {
    throw safeRestoreError(
      error,
      code,
      "The restore path could not be resolved safely.",
    );
  }
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
      throw restoreError(
        "restore_publish_failed",
        "The restore target directory could not be synchronized.",
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

function restoreError(code, message) {
  return new SqliteBackupError(code, message);
}

function safeRestoreError(error, code, message) {
  return error instanceof SqliteBackupError
    ? error
    : restoreError(code, message);
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
    await executeSqliteRestoreCli(process.argv.slice(2));
  } catch (error) {
    const safe = safeRestoreError(
      error,
      "restore_failed",
      "SQLite restore failed.",
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
