import { resolve } from "node:path";
import { projectRoot, resolvePackageBin, run } from "./workspace-tools.mjs";

const apiSpec = resolve(projectRoot, "lib/api-spec");
const orval = await resolvePackageBin("orval", "orval", apiSpec);

await run(process.execPath, [orval, "--config", "./orval.config.ts"], { cwd: apiSpec });
await run(process.execPath, [resolve(projectRoot, "scripts/typecheck.mjs")]);
