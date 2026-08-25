import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema";

// Consumers must import Drizzle query helpers from this package as well as the
// schema.  This keeps columns and SQL expressions on the same Drizzle runtime
// instance when pnpm resolves optional peers differently between workspaces.
export { and, desc, eq, gt, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";

const { Pool } = pg;

let pool: pg.Pool | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDatabase() {
  if (db) return db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set before using persistence features.");
  }

  pool = new Pool({ connectionString, max: 10 });
  db = drizzle(pool, { schema });
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (!pool) return;
  const activePool = pool;
  pool = undefined;
  db = undefined;
  await activePool.end();
}

export async function migrateDatabase(migrationsFolder: string): Promise<void> {
  await migrate(getDatabase(), { migrationsFolder });
}

export * from "./schema";
