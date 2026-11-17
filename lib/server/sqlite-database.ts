import { DatabaseSync, type StatementSync } from "node:sqlite";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
} from "node:fs";
import { normalizeSqliteDatabasePath } from "./runtime-config.ts";

type SqliteBinding =
  | string
  | number
  | bigint
  | Uint8Array
  | null;

type SqliteRunResult = {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
};

const registry = (
  globalThis as typeof globalThis & {
    __nodezunoSqliteDatabases?: Map<string, DatabaseSync>;
  }
).__nodezunoSqliteDatabases ?? new Map<string, DatabaseSync>();

(
  globalThis as typeof globalThis & {
    __nodezunoSqliteDatabases?: Map<string, DatabaseSync>;
  }
).__nodezunoSqliteDatabases = registry;

export function createSqliteDatabase(pathname: string): D1Database {
  const normalizedPath = normalizeSqliteDatabasePath(pathname);
  if (!normalizedPath) {
    throw new Error("NODEZUNO_SQLITE_PATH is invalid.");
  }
  let sqlite = registry.get(normalizedPath);
  if (!sqlite) {
    sqlite = openSqliteDatabase(normalizedPath);
    registry.set(normalizedPath, sqlite);
  }
  return new SqliteD1Database(sqlite);
}

export function closeSqliteDatabase(pathname: string): void {
  const normalizedPath = normalizeSqliteDatabasePath(pathname);
  if (!normalizedPath) return;
  const sqlite = registry.get(normalizedPath);
  if (!sqlite) return;
  registry.delete(normalizedPath);
  sqlite.close();
}

function openSqliteDatabase(pathname: string): DatabaseSync {
  assertSafeSqliteCompanionFiles(pathname);
  createOrSecureSqliteFile(pathname);
  const previousUmask = process.umask(0o077);
  let sqlite: DatabaseSync | null = null;
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
    sqlite.exec("PRAGMA temp_store = MEMORY");
    sqlite.exec("PRAGMA trusted_schema = OFF");
    sqlite.exec("BEGIN IMMEDIATE; ROLLBACK");
    secureExistingSqliteFiles(pathname);
    return sqlite;
  } catch (error) {
    sqlite?.close();
    throw error;
  } finally {
    process.umask(previousUmask);
  }
}

function assertSafeSqliteCompanionFiles(pathname: string): void {
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

function createOrSecureSqliteFile(pathname: string): void {
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

function secureExistingSqliteFiles(pathname: string): void {
  for (const candidate of sqliteStorageFiles(pathname)) {
    let descriptor: number;
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

function sqliteStorageFiles(pathname: string): string[] {
  return [
    pathname,
    `${pathname}-wal`,
    `${pathname}-shm`,
    `${pathname}-journal`,
  ];
}

function openSqliteFile(
  pathname: string,
  flags: number,
  mode?: number,
): number {
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

function isMissingFileError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isUnsafeLinkError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "ELOOP" || error.code === "EMLINK")
  );
}

class SqliteD1PreparedStatement implements D1PreparedStatement {
  readonly database: SqliteD1Database;
  readonly query: string;
  readonly values: unknown[];

  constructor(
    database: SqliteD1Database,
    query: string,
    values: unknown[] = [],
  ) {
    this.database = database;
    this.query = query;
    this.values = values;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqliteD1PreparedStatement(
      this.database,
      this.query,
      values,
    );
  }

  async first<T = Record<string, unknown>>(
    column?: string,
  ): Promise<T | null> {
    const statement = this.database.sqlite.prepare(this.query);
    const row = statement.get(...sqliteBindings(this.values));
    if (!row) return null;
    const normalized = normalizeSqliteRow(row);
    if (column !== undefined) {
      return (normalized[column] ?? null) as T | null;
    }
    return normalized as T;
  }

  async all<T = Record<string, unknown>>(): Promise<{
    success: boolean;
    results: T[];
    meta?: D1Result["meta"];
  }> {
    const startedAt = performance.now();
    const statement = this.database.sqlite.prepare(this.query);
    const rows = statement
      .all(...sqliteBindings(this.values))
      .map(normalizeSqliteRow) as T[];
    return {
      success: true,
      results: rows,
      meta: {
        duration: performance.now() - startedAt,
        rows_read: rows.length,
        rows_written: 0,
      },
    };
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    return executeSqliteStatement<T>(
      this.database.sqlite.prepare(this.query),
      this.values,
    );
  }

  async raw<T = unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<T[]> {
    const statement = this.database.sqlite.prepare(this.query);
    const columns = statement.columns().map((column) => column.name);
    const rows = statement
      .all(...sqliteBindings(this.values))
      .map((row) => {
        const normalized = normalizeSqliteRow(row);
        return columns.map((column) => normalized[column]);
      });
    return (options?.columnNames
      ? [columns, ...rows]
      : rows) as T[];
  }
}

class SqliteD1Database implements D1Database {
  readonly sqlite: DatabaseSync;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
  }

  prepare(query: string): D1PreparedStatement {
    if (!query.trim()) throw new TypeError("SQL query cannot be empty.");
    return new SqliteD1PreparedStatement(this, query);
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    if (statements.length === 0) return [];
    for (const statement of statements) {
      if (
        !(statement instanceof SqliteD1PreparedStatement) ||
        statement.database !== this
      ) {
        throw new TypeError(
          "Every batch statement must belong to this SQLite database.",
        );
      }
    }
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => {
        const sqliteStatement =
          statement as SqliteD1PreparedStatement;
        return executeSqliteStatement<T>(
          this.sqlite.prepare(sqliteStatement.query),
          sqliteStatement.values,
        );
      });
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      try {
        this.sqlite.exec("ROLLBACK");
      } catch {
        // Preserve the original database failure.
      }
      throw error;
    }
  }

  async exec(query: string): Promise<{
    count: number;
    duration: number;
  }> {
    if (!query.trim()) throw new TypeError("SQL query cannot be empty.");
    const startedAt = performance.now();
    this.sqlite.exec(query);
    return {
      count: 1,
      duration: performance.now() - startedAt,
    };
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error(
      "Use a reviewed SQLite backup command against the persistent volume.",
    );
  }
}

function executeSqliteStatement<T>(
  statement: StatementSync,
  values: unknown[],
): D1Result<T> {
  const startedAt = performance.now();
  const bindings = sqliteBindings(values);
  if (statement.columns().length > 0) {
    const rows = statement
      .all(...bindings)
      .map(normalizeSqliteRow) as T[];
    return {
      success: true,
      results: rows,
      meta: {
        duration: performance.now() - startedAt,
        changes: 0,
        rows_read: rows.length,
        rows_written: 0,
      },
    };
  }
  const result = statement.run(...bindings) as SqliteRunResult;
  const changes = safeSqliteInteger(result.changes);
  return {
    success: true,
    results: [],
    meta: {
      duration: performance.now() - startedAt,
      changes,
      last_row_id: safeSqliteInteger(result.lastInsertRowid),
      rows_read: 0,
      rows_written: changes,
    },
  };
}

function sqliteBindings(values: unknown[]): SqliteBinding[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "bigint" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    throw new TypeError("This SQLite binding type is not supported.");
  });
}

function normalizeSqliteRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return { ...row };
}

function safeSqliteInteger(value: number | bigint): number {
  const numeric =
    typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new TypeError("SQLite returned an unsafe result counter.");
  }
  return numeric;
}
