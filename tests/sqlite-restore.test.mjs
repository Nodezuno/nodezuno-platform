import assert from "node:assert/strict";
import {
  access,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createSqliteBackup,
  SqliteBackupError,
} from "../scripts/backup-sqlite.mjs";
import { migrateSqlite } from "../scripts/migrate-sqlite.mjs";
import {
  executeSqliteRestoreCli,
  restoreSqliteBackup,
} from "../scripts/restore-sqlite.mjs";

const privateRow =
  "restore-private-row-that-must-never-appear-in-cli-output";

test("restore publishes a verified private database into an empty target", async () => {
  const fixture = await createRestoreFixture();
  try {
    const result = await restoreSqliteBackup({
      environment: fixture.restoreEnvironment,
      backupPath: fixture.backup,
    });
    assert.equal(result.mode, "restore");
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.ok(result.byteSize > 0);
    assert.ok(result.schemaMigrationCount >= 13);
    assert.ok(result.statusServiceCount >= 6);
    assert.ok(result.chainCount >= 8);
    assert.equal((await lstat(fixture.target)).mode & 0o077, 0);
    await assertMissing(`${fixture.target}.manifest.json`);

    const database = new DatabaseSync(fixture.target, {
      readOnly: true,
    });
    try {
      assert.equal(
        database
          .prepare(
            "SELECT name FROM auth_users WHERE id = 'restore-user'",
          )
          .get().name,
        privateRow,
      );
    } finally {
      database.close();
    }
    assert.equal(
      (await readdir(fixture.directory)).some((entry) =>
        entry.startsWith(".nodezuno-restore-"),
      ),
      false,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("restore never overwrites a database or SQLite sidecar", async () => {
  const fixture = await createRestoreFixture();
  try {
    await writeFile(fixture.target, "keep-live-database", "utf8");
    await expectCode(
      restoreSqliteBackup({
        environment: fixture.restoreEnvironment,
        backupPath: fixture.backup,
      }),
      "target_exists",
    );
    assert.equal(
      await readFile(fixture.target, "utf8"),
      "keep-live-database",
    );

    await rm(fixture.target);
    await writeFile(`${fixture.target}-wal`, "keep-live-wal", "utf8");
    await expectCode(
      restoreSqliteBackup({
        environment: fixture.restoreEnvironment,
        backupPath: fixture.backup,
      }),
      "target_exists",
    );
    assert.equal(
      await readFile(`${fixture.target}-wal`, "utf8"),
      "keep-live-wal",
    );
    await assertMissing(fixture.target);
  } finally {
    await fixture.cleanup();
  }
});

test("restore rejects unsafe paths, aliases, and non-SQLite mode", async () => {
  const fixture = await createRestoreFixture();
  try {
    await expectCode(
      restoreSqliteBackup({
        environment: {
          ...fixture.restoreEnvironment,
          NODEZUNO_DATABASE_DRIVER: "d1-rest",
        },
        backupPath: fixture.backup,
      }),
      "database_driver_invalid",
    );
    await expectCode(
      restoreSqliteBackup({
        environment: {
          ...fixture.restoreEnvironment,
          NODEZUNO_SQLITE_PATH: "relative.sqlite",
        },
        backupPath: fixture.backup,
      }),
      "target_path_invalid",
    );
    await expectCode(
      restoreSqliteBackup({
        environment: {
          ...fixture.restoreEnvironment,
          NODEZUNO_SQLITE_PATH: fixture.backup,
        },
        backupPath: fixture.backup,
      }),
      "source_destination_conflict",
    );

    const targetLink = path.join(
      fixture.directory,
      "target-link.sqlite",
    );
    await symlink(fixture.source, targetLink);
    await expectCode(
      restoreSqliteBackup({
        environment: {
          ...fixture.restoreEnvironment,
          NODEZUNO_SQLITE_PATH: targetLink,
        },
        backupPath: fixture.backup,
      }),
      "target_exists",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("restore verifies the source before creating any target artifact", async () => {
  const fixture = await createRestoreFixture();
  try {
    const bytes = await readFile(fixture.backup);
    bytes[bytes.length - 29] ^= 0xff;
    await writeFile(fixture.backup, bytes);
    await expectCode(
      restoreSqliteBackup({
        environment: fixture.restoreEnvironment,
        backupPath: fixture.backup,
      }),
      "backup_digest_mismatch",
    );
    await assertMissing(fixture.target);
    assert.equal(
      (await readdir(fixture.directory)).some((entry) =>
        entry.startsWith(".nodezuno-restore-"),
      ),
      false,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("restore removes private staging after a copy failure", async () => {
  const fixture = await createRestoreFixture();
  try {
    await expectCode(
      restoreSqliteBackup({
        environment: fixture.restoreEnvironment,
        backupPath: fixture.backup,
        copyImplementation: async (_source, destination) => {
          await writeFile(destination, privateRow, "utf8");
          throw new Error("simulated restore copy failure");
        },
      }),
      "restore_failed",
    );
    await assertMissing(fixture.target);
    assert.equal(
      (await readdir(fixture.directory)).some((entry) =>
        entry.startsWith(".nodezuno-restore-"),
      ),
      false,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("restore CLI emits bounded metadata without paths or row data", async () => {
  const fixture = await createRestoreFixture();
  try {
    let output = "";
    await executeSqliteRestoreCli([fixture.backup], {
      environment: fixture.restoreEnvironment,
      stdout: {
        write(value) {
          output += value;
          return true;
        },
      },
    });
    const payload = JSON.parse(output);
    assert.equal(payload.mode, "restore");
    assert.deepEqual(Object.keys(payload).sort(), [
      "byteSize",
      "chainCount",
      "mode",
      "schemaMigrationCount",
      "sha256",
      "statusServiceCount",
    ]);
    for (const sensitive of [
      privateRow,
      fixture.source,
      fixture.backup,
      fixture.target,
      "NODEZUNO_SQLITE_PATH",
    ]) {
      assert.equal(output.includes(sensitive), false);
    }
    assert.doesNotMatch(output, /\u2014/);
  } finally {
    await fixture.cleanup();
  }
});

async function createRestoreFixture() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-restore-test-"),
  );
  const source = path.join(directory, "source.sqlite");
  const backup = path.join(directory, "backup.sqlite");
  const target = path.join(directory, "restored.sqlite");
  await migrateSqlite({ pathname: source });
  const database = new DatabaseSync(source);
  try {
    database
      .prepare(
        `INSERT INTO auth_users
          (id, name, email, email_verified, created_at, updated_at)
         VALUES ('restore-user', ?, 'restore@example.com', 1, 1, 1)`,
      )
      .run(privateRow);
  } finally {
    database.close();
  }
  const backupEnvironment = {
    NODEZUNO_DATABASE_DRIVER: "sqlite",
    NODEZUNO_SQLITE_PATH: source,
  };
  await createSqliteBackup({
    environment: backupEnvironment,
    destination: backup,
  });
  return {
    directory,
    source,
    backup,
    target,
    restoreEnvironment: {
      NODEZUNO_DATABASE_DRIVER: "sqlite",
      NODEZUNO_SQLITE_PATH: target,
    },
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

async function expectCode(promise, expectedCode) {
  await assert.rejects(
    promise,
    (error) =>
      error instanceof SqliteBackupError &&
      error.code === expectedCode,
  );
}

async function assertMissing(pathname) {
  await assert.rejects(access(pathname), { code: "ENOENT" });
}
