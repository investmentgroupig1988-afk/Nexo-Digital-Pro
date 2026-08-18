import { resolve } from "node:path";
import { projectRoot, resolvePackageBin, run } from "./workspace-tools.mjs";

const apiServer = resolve(projectRoot, "artifacts/api-server");
const mockup = resolve(projectRoot, "artifacts/mockup-sandbox");

await run(process.execPath, [resolve(projectRoot, "scripts/typecheck.mjs")]);
await run(process.execPath, [resolve(apiServer, "build.mjs")], { cwd: apiServer });

const vite = await resolvePackageBin("vite", "vite", mockup);
await run(process.execPath, [vite, "build"], { cwd: mockup });
