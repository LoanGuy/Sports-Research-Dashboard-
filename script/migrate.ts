/**
 * Apply pending SQL migrations from ./drizzle to DATABASE_URL.
 *
 * Safe to run on every deploy (Railway pre-deploy command): it exits 0
 * without doing anything when DATABASE_URL is unset, and drizzle's migrator
 * only applies migrations that have not run yet.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[migrate] DATABASE_URL not set — skipping migrations");
    return;
  }
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("[migrate] migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
