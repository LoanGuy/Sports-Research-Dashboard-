import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Any standard PostgreSQL: Supabase, Neon, Railway, or self-managed.
    url: process.env.DATABASE_URL ?? "",
  },
});
