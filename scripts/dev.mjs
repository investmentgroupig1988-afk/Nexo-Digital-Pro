import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { projectRoot, resolvePackageBin, run } from "./workspace-tools.mjs";

const apiWorkspace = resolve(projectRoot, "artifacts/api-server");
const mockupWorkspace = resolve(projectRoot, "artifacts/mockup-sandbox");
const apiEntry = resolve(apiWorkspace, "dist/index.mjs");

// Build only the API bundle before starting it; Vite compiles the frontend in
// development itself. No shell syntax is used, so this works through Corepack
// on Windows as well as on Unix-like hosts.
await run(process.execPath, [resolve(apiWorkspace, "build.mjs")], { cwd: apiWorkspace });

const vite = await resolvePackageBin("vite", "vite", mockupWorkspace);
const api = spawn(process.execPath, ["--enable-source-maps", apiEntry], {
  cwd: apiWorkspace,
  stdio: "inherit",
});
const frontend = spawn(process.execPath, [vite, "dev"], {
  cwd: mockupWorkspace,
  stdio: "inherit",
});

const children = [api, frontend];
let stopping = false;

function stopChildren() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

function waitForExit(child, name) {
  return new Promise((resolveExit) => {
    child.once("error", (error) => resolveExit({ name, code: 1, error }));
    child.once("exit", (code, signal) => resolveExit({ name, code: code ?? 1, signal }));
  });
}

process.once("SIGINT", stopChildren);
process.once("SIGTERM", stopChildren);

const result = await Promise.race([
  waitForExit(api, "API"),
  waitForExit(frontend, "frontend"),
]);

if (!stopping) {
  console.error(`${result.name} process stopped unexpectedly.`);
  if (result.error) console.error(result.error);
  process.exitCode = result.code;
  stopChildren();
}
