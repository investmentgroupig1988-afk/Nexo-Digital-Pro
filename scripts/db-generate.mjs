import { resolve } from "node:path";
import { projectRoot, resolvePackageBin, run } from "./workspace-tools.mjs";

const databaseWorkspace = resolve(projectRoot, "lib/db");
const drizzleKit = await resolvePackageBin("drizzle-kit", "drizzle-kit", databaseWorkspace);
await run(process.execPath, [drizzleKit, "generate", "--config", "./drizzle.config.ts"], { cwd: databaseWorkspace });
