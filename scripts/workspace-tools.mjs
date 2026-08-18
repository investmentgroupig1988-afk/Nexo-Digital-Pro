import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function run(command, args, { cwd = projectRoot } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? `code ${code}`}.`));
    });
  });
}

export async function resolvePackageBin(packageName, binaryName, workspaceDir) {
  const requireFromWorkspace = createRequire(resolve(workspaceDir, "package.json"));
  const manifestPath = requireFromWorkspace.resolve(`${packageName}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[binaryName];

  if (!bin) {
    throw new Error(`${packageName} does not declare a ${binaryName} executable.`);
  }

  return resolve(dirname(manifestPath), bin);
}

export async function runTsc(args) {
  const tsc = await resolvePackageBin("typescript", "tsc", projectRoot);
  await run(process.execPath, [tsc, ...args]);
}
