/**
 * Database access. The dashboard runs without a database (mockup mode);
 * anything that needs persistence checks isDbConfigured() first and
 * fails soft with a clear message instead of crashing the app.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

let pool: Pool | null = null;
let database: NodePgDatabase<typeof schema> | null = null;

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Lazily create the pool so the app boots cleanly with no DATABASE_URL. */
export function getDb(): NodePgDatabase<typeof schema> {
  if (!isDbConfigured()) {
    throw new Error("DATABASE_URL is not set — database features are disabled");
  }
  if (!database) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = drizzle(pool, { schema });
  }
  return database;
}

export function getPool(): Pool | null {
  if (!isDbConfigured()) return null;
  if (!pool) getDb();
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    database = null;
  }
}
