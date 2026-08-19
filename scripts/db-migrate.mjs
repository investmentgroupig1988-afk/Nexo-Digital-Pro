import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { projectRoot, resolvePackageBin, run } from "./workspace-tools.mjs";

const envPath = resolve(projectRoot, ".env");
if (!process.env.DATABASE_URL && existsSync(envPath)) process.loadEnvFile(envPath);
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to apply migrations. No database was modified.");
}

const databaseWorkspace = resolve(projectRoot, "lib/db");
const drizzleKit = await resolvePackageBin("drizzle-kit", "drizzle-kit", databaseWorkspace);
await run(process.execPath, [drizzleKit, "migrate", "--config", "./drizzle.config.ts"], { cwd: databaseWorkspace });
