import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  closeSqliteDatabase,
  createSqliteDatabase,
} from "../lib/server/sqlite-database.ts";

test("SQLite adapter implements D1 reads, writes, raw rows, and atomic batches", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-sqlite-"),
  );
  const pathname = path.join(directory, "control-plane.sqlite");
  try {
    const database = createSqliteDatabase(pathname);
    assert.equal(
      await database
        .prepare("PRAGMA synchronous")
        .first("synchronous"),
      2,
    );
    assert.equal(
      await database
        .prepare("PRAGMA journal_mode")
        .first("journal_mode"),
      "wal",
    );
    await database.exec(
      `CREATE TABLE records (
        id TEXT PRIMARY KEY NOT NULL,
        label TEXT NOT NULL,
        count INTEGER NOT NULL
      )`,
    );

    const inserted = await database
      .prepare(
        "INSERT INTO records (id, label, count) VALUES (?, ?, ?)",
      )
      .bind("one", "Ready", 1)
      .run();
    assert.equal(inserted.meta.changes, 1);
    for (const sqliteFile of [
      pathname,
      `${pathname}-wal`,
      `${pathname}-shm`,
    ]) {
      assert.equal((await stat(sqliteFile)).mode & 0o777, 0o600);
    }

    const first = await database
      .prepare("SELECT id, label, count FROM records WHERE id = ?")
      .bind("one")
      .first();
    assert.deepEqual(first, {
      id: "one",
      label: "Ready",
      count: 1,
    });
    assert.equal(Object.getPrototypeOf(first), Object.prototype);
    assert.equal(
      await database
        .prepare("SELECT label FROM records WHERE id = ?")
        .bind("one")
        .first("label"),
      "Ready",
    );

    const batch = await database.batch([
      database
        .prepare(
          "INSERT INTO records (id, label, count) VALUES (?, ?, ?)",
        )
        .bind("two", "Second", 2),
      database
        .prepare("SELECT id, label FROM records ORDER BY id"),
    ]);
    assert.equal(batch[0].meta.changes, 1);
    assert.deepEqual(batch[1].results, [
      { id: "one", label: "Ready" },
      { id: "two", label: "Second" },
    ]);

    const raw = await database
      .prepare("SELECT id, count FROM records ORDER BY id")
      .raw({ columnNames: true });
    assert.deepEqual(raw, [
      ["id", "count"],
      ["one", 1],
      ["two", 2],
    ]);

    await assert.rejects(
      database.batch([
        database
          .prepare(
            "INSERT INTO records (id, label, count) VALUES (?, ?, ?)",
          )
          .bind("rollback", "Before conflict", 3),
        database
          .prepare(
            "INSERT INTO records (id, label, count) VALUES (?, ?, ?)",
          )
          .bind("rollback", "Conflict", 4),
      ]),
    );
    assert.equal(
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM records WHERE id = ?",
        )
        .bind("rollback")
        .first("count"),
      0,
    );

    const sameDatabase = createSqliteDatabase(pathname);
    assert.equal(
      await sameDatabase
        .prepare("SELECT COUNT(*) AS count FROM records")
        .first("count"),
      2,
    );
    await assert.rejects(
      database
        .prepare("SELECT ? AS value")
        .bind({ unsafe: true })
        .first(),
      /binding type/,
    );
  } finally {
    closeSqliteDatabase(pathname);
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite adapter rejects relative and ambiguous paths", () => {
  for (const pathname of [
    "nodezuno.sqlite",
    "/tmp/../nodezuno.sqlite",
    "/tmp/nodezuno",
    "/tmp//nodezuno.sqlite",
  ]) {
    assert.throws(
      () => createSqliteDatabase(pathname),
      /NODEZUNO_SQLITE_PATH is invalid/,
    );
  }
});

test("SQLite adapter refuses symbolic database and sidecar files", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-sqlite-links-"),
  );
  const target = path.join(directory, "target.sqlite");
  const pathname = path.join(directory, "control-plane.sqlite");
  try {
    await writeFile(target, "not a database", { mode: 0o600 });
    await symlink(target, pathname);
    assert.throws(
      () => createSqliteDatabase(pathname),
      /unsafe (?:file|link)/,
    );

    await rm(pathname);
    const database = createSqliteDatabase(pathname);
    closeSqliteDatabase(pathname);
    assert.ok(database);
    await symlink(target, `${pathname}-wal`);
    assert.throws(
      () => createSqliteDatabase(pathname),
      /unsafe (?:file|link)/,
    );
  } finally {
    closeSqliteDatabase(pathname);
    await rm(directory, { recursive: true, force: true });
  }
});
