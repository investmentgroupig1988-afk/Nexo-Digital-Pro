import { resolve } from "node:path";
import { projectRoot, resolvePackageBin, run } from "./workspace-tools.mjs";

const scriptsWorkspace = resolve(projectRoot, "scripts");
const tsx = await resolvePackageBin("tsx", "tsx", scriptsWorkspace);
await run(process.execPath, [tsx, resolve(scriptsWorkspace, "src/bootstrap-admin.ts")], { cwd: projectRoot });
