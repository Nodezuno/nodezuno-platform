import { drizzle } from "drizzle-orm/d1";
import { getDatabase } from "../lib/server/database-binding.ts";
import * as schema from "./schema.ts";

export async function getDb() {
  return drizzle(await getDatabase(), { schema });
}
