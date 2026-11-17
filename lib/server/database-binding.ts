import { HttpProblem } from "./http.ts";
import { createD1RestDatabase } from "./d1-rest-database.ts";
import {
  containerDatabaseDriver,
  isContainerRuntime,
  normalizeSqliteDatabasePath,
} from "./runtime-config.ts";

export async function getDatabase(): Promise<D1Database> {
  if (isContainerRuntime()) {
    try {
      const driver = containerDatabaseDriver(
        process.env.NODEZUNO_DATABASE_DRIVER,
      );
      if (driver === "sqlite") {
        const pathname = normalizeSqliteDatabasePath(
          process.env.NODEZUNO_SQLITE_PATH,
        );
        if (!pathname) throw new Error("SQLite is not configured.");
        const { createSqliteDatabase } = await import(
          "./sqlite-database.ts"
        );
        return createSqliteDatabase(pathname);
      }
      if (driver !== "d1-rest") {
        throw new Error("The database driver is invalid.");
      }
      return createD1RestDatabase({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
        databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID ?? "",
        apiToken: process.env.CLOUDFLARE_D1_API_TOKEN ?? "",
      });
    } catch {
      throw new HttpProblem(
        503,
        "database_unavailable",
        "Persistent storage is temporarily unavailable.",
      );
    }
  }
  const { siteDatabaseBinding } = await import("./sites-environment.ts");
  const database = await siteDatabaseBinding();
  if (!database) {
    throw new HttpProblem(
      503,
      "database_unavailable",
      "Persistent storage is temporarily unavailable.",
    );
  }
  return database;
}
