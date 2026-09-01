import { projectRoot, runTsc } from "./workspace-tools.mjs";

process.chdir(projectRoot);
await runTsc(["-b", "lib/api-zod/tsconfig.json"]);
await runTsc(["-p", "artifacts/api-server/tsconfig.json", "--noEmit"]);
