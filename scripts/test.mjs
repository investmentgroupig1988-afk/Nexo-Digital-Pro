import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { projectRoot, resolvePackageBin, run } from "./workspace-tools.mjs";

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const tests = await Promise.all(entries.map(async (entry) => {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) return findTests(location);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [location] : [];
  }));
  return tests.flat().sort();
}

for (const relativeWorkspace of ["lib/api-client-react", "artifacts/api-server"]) {
  const workspace = resolve(projectRoot, relativeWorkspace);
  const tests = await findTests(resolve(workspace, "src"));
  if (tests.length === 0) {
    throw new Error(`No tests were found in ${relativeWorkspace}.`);
  }

  const tsx = await resolvePackageBin("tsx", "tsx", workspace);
  await run(process.execPath, [tsx, "--test", ...tests], { cwd: workspace });
}

const mockupWorkspace = resolve(projectRoot, "artifacts/mockup-sandbox");
const vitest = await resolvePackageBin("vitest", "vitest", mockupWorkspace);
await run(process.execPath, [vitest, "run"], { cwd: mockupWorkspace });
