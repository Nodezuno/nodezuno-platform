import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createSqliteBackup,
  executeSqliteBackupCli,
  parseSqliteBackupArguments,
  SqliteBackupError,
  verifySqliteBackup,
} from "../scripts/backup-sqlite.mjs";
import { migrateSqlite } from "../scripts/migrate-sqlite.mjs";

const fixedTimestamp = "2026-07-18T12:34:56.000Z";
const privateRowValue =
  "backup-secret-row-value-that-must-never-be-printed";

test("online backup creates a verified database and exact digest manifest", async () => {
  const fixture = await createFixture();
  try {
    const destination = path.join(
      fixture.directory,
      "nested",
      "daily.sqlite",
    );
    const result = await createSqliteBackup({
      environment: fixture.environment,
      destination,
      now: new Date(fixedTimestamp),
    });
    const manifestPath = `${destination}.manifest.json`;
    const [databaseBytes, manifestText, mode] =
      await Promise.all([
        readFile(destination),
        readFile(manifestPath, "utf8"),
        stat(destination),
      ]);
    const manifest = JSON.parse(manifestText);
    const independentDigest = createHash("sha256")
      .update(databaseBytes)
      .digest("hex");

    assert.equal(result.mode, "create");
    assert.equal(result.sha256, independentDigest);
    assert.equal(manifest.sha256, independentDigest);
    assert.equal(manifest.byteSize, databaseBytes.length);
    assert.equal(manifest.createdAt, fixedTimestamp);
    assert.equal(
      manifest.schemaMigrationCount,
      result.schemaMigrationCount,
    );
    assert.ok(manifest.schemaMigrationCount >= 13);
    assert.ok(result.statusServiceCount >= 6);
    assert.ok(result.chainCount >= 8);
    assert.equal(mode.mode & 0o077, 0);
    assert.equal(
      (await lstat(manifestPath)).isSymbolicLink(),
      false,
    );
    assert.deepEqual(Object.keys(manifest).sort(), [
      "algorithm",
      "byteSize",
      "createdAt",
      "schemaMigrationCount",
      "sha256",
      "version",
    ]);
    assert.equal(manifestText.includes(privateRowValue), false);
    assert.equal(manifestText.includes(fixture.source), false);
    assert.equal(manifestText.includes(destination), false);

    const verified = await verifySqliteBackup({
      environment: fixture.environment,
      pathname: destination,
    });
    assert.equal(verified.mode, "verify");
    assert.equal(verified.sha256, independentDigest);
    assert.equal(
      verified.schemaMigrationCount,
      result.schemaMigrationCount,
    );

    const backupDatabase = new DatabaseSync(destination, {
      readOnly: true,
    });
    try {
      assert.equal(
        backupDatabase
          .prepare(
            "SELECT name FROM auth_users WHERE id = 'backup-secret-user'",
          )
          .get().name,
        privateRowValue,
      );
    } finally {
      backupDatabase.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("verify rejects a same-size digest change before opening the database", async () => {
  const fixture = await createFixture();
  try {
    const destination = path.join(
      fixture.directory,
      "digest.sqlite3",
    );
    await createSqliteBackup({
      environment: fixture.environment,
      destination,
    });
    const bytes = await readFile(destination);
    bytes[bytes.length - 17] ^= 0xff;
    await writeFile(destination, bytes);

    await expectCode(
      verifySqliteBackup({
        environment: fixture.environment,
        pathname: destination,
      }),
      "backup_digest_mismatch",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("verify rejects corruption even when a forged digest matches", async () => {
  const fixture = await createFixture();
  try {
    const destination = path.join(
      fixture.directory,
      "corrupt.db",
    );
    await createSqliteBackup({
      environment: fixture.environment,
      destination,
    });
    const bytes = await readFile(destination);
    bytes.fill(0, 0, 16);
    await writeFile(destination, bytes);
    await rewriteManifestIntegrity(destination);

    await expectCode(
      verifySqliteBackup({
        environment: fixture.environment,
        pathname: destination,
      }),
      "backup_integrity_failed",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("verification enforces migration ledger and seed minimums", async () => {
  const fixture = await createFixture();
  try {
    const missingLedger = path.join(
      fixture.directory,
      "missing-ledger.sqlite",
    );
    await createSqliteBackup({
      environment: fixture.environment,
      destination: missingLedger,
    });
    mutateDatabase(
      missingLedger,
      "DROP TABLE nodezuno_schema_migrations",
    );
    await rewriteManifestIntegrity(missingLedger);
    await expectCode(
      verifySqliteBackup({
        environment: fixture.environment,
        pathname: missingLedger,
      }),
      "backup_schema_invalid",
    );

    const missingSeeds = path.join(
      fixture.directory,
      "missing-seeds.sqlite",
    );
    await createSqliteBackup({
      environment: fixture.environment,
      destination: missingSeeds,
    });
    mutateDatabase(missingSeeds, "DELETE FROM status_services");
    await rewriteManifestIntegrity(missingSeeds);
    await expectCode(
      verifySqliteBackup({
        environment: fixture.environment,
        pathname: missingSeeds,
      }),
      "backup_seed_invalid",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("create refuses unsafe destinations without overwriting artifacts", async () => {
  const fixture = await createFixture();
  try {
    const existing = path.join(
      fixture.directory,
      "existing.sqlite",
    );
    const symlinkPath = path.join(
      fixture.directory,
      "symlink.sqlite",
    );
    const manifestCollision = path.join(
      fixture.directory,
      "manifest-collision.sqlite",
    );
    await writeFile(existing, "keep-this-file", "utf8");
    await symlink(fixture.source, symlinkPath);
    await writeFile(
      `${manifestCollision}.manifest.json`,
      "keep-this-manifest",
      "utf8",
    );

    await expectCode(
      createSqliteBackup({
        environment: {
          ...fixture.environment,
          NODEZUNO_DATABASE_DRIVER: "d1-rest",
        },
        destination: path.join(
          fixture.directory,
          "wrong-driver.sqlite",
        ),
      }),
      "database_driver_invalid",
    );
    for (const [destination, code] of [
      ["relative.sqlite", "backup_path_invalid"],
      [
        `${fixture.directory}/nested/../unsafe.sqlite`,
        "backup_path_invalid",
      ],
      [
        path.join(fixture.directory, "wrong-extension.json"),
        "backup_path_invalid",
      ],
      [fixture.source, "source_destination_conflict"],
      [existing, "destination_exists"],
      [symlinkPath, "destination_exists"],
      [manifestCollision, "manifest_exists"],
    ]) {
      await expectCode(
        createSqliteBackup({
          environment: fixture.environment,
          destination,
        }),
        code,
      );
    }

    assert.equal(await readFile(existing, "utf8"), "keep-this-file");
    assert.equal(
      await readFile(
        `${manifestCollision}.manifest.json`,
        "utf8",
      ),
      "keep-this-manifest",
    );
    await assertMissing(manifestCollision);

    const sourceSymlink = path.join(
      fixture.directory,
      "source-link.sqlite",
    );
    await symlink(fixture.source, sourceSymlink);
    await expectCode(
      createSqliteBackup({
        environment: {
          ...fixture.environment,
          NODEZUNO_SQLITE_PATH: sourceSymlink,
        },
        destination: path.join(
          fixture.directory,
          "from-symlink.sqlite",
        ),
      }),
      "source_invalid",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("failed online backup removes every incomplete artifact", async () => {
  const fixture = await createFixture();
  try {
    const destination = path.join(
      fixture.directory,
      "incomplete.sqlite",
    );
    await expectCode(
      createSqliteBackup({
        environment: fixture.environment,
        destination,
        backupImplementation: async (_source, pathname) => {
          await writeFile(pathname, privateRowValue, "utf8");
          throw new Error("simulated provider failure");
        },
      }),
      "online_backup_failed",
    );
    await assertMissing(destination);
    await assertMissing(`${destination}.manifest.json`);
    assert.equal(
      (await readdir(fixture.directory)).some((entry) =>
        entry.startsWith(".nodezuno-backup-"),
      ),
      false,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("CLI modes emit bounded metadata and never row data or paths", async () => {
  const fixture = await createFixture();
  try {
    const destination = path.join(
      fixture.directory,
      "cli.sqlite",
    );
    let output = "";
    const stdout = {
      write(value) {
        output += value;
        return true;
      },
    };
    assert.deepEqual(
      parseSqliteBackupArguments(["create", destination]),
      { mode: "create", pathname: destination },
    );
    await executeSqliteBackupCli(["create", destination], {
      environment: fixture.environment,
      stdout,
      now: fixedTimestamp,
    });
    await executeSqliteBackupCli(["verify", destination], {
      environment: fixture.environment,
      stdout,
    });
    const lines = output.trim().split("\n").map(JSON.parse);
    assert.deepEqual(
      lines.map((line) => line.mode),
      ["create", "verify"],
    );
    for (const value of [
      privateRowValue,
      fixture.source,
      destination,
      "NODEZUNO_SQLITE_PATH",
    ]) {
      assert.equal(output.includes(value), false);
    }
    assert.doesNotMatch(output, /\u2014/);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-backup-test-"),
  );
  const source = path.join(directory, "source.sqlite");
  await migrateSqlite({ pathname: source });
  const database = new DatabaseSync(source);
  try {
    database
      .prepare(
        `INSERT INTO auth_users
          (id, name, email, email_verified, created_at, updated_at)
         VALUES ('backup-secret-user', ?, 'backup@example.com', 1, 1, 1)`,
      )
      .run(privateRowValue);
  } finally {
    database.close();
  }
  return {
    directory,
    source,
    environment: {
      NODEZUNO_DATABASE_DRIVER: "sqlite",
      NODEZUNO_SQLITE_PATH: source,
    },
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

async function rewriteManifestIntegrity(destination) {
  const bytes = await readFile(destination);
  const manifestPath = `${destination}.manifest.json`;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.sha256 = createHash("sha256")
    .update(bytes)
    .digest("hex");
  manifest.byteSize = bytes.length;
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest)}\n`,
    "utf8",
  );
}

function mutateDatabase(pathname, sql) {
  const database = new DatabaseSync(pathname);
  try {
    database.exec(sql);
  } finally {
    database.close();
  }
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
