import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// On serverless (Vercel) keep the pool tiny — each function instance holds
// its own connections; use a pooled (pgBouncer) DATABASE_URL in production.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env["VERCEL"] ? 3 : 10,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
