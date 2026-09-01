import { projectRoot, runTsc } from "./workspace-tools.mjs";

const projects = [
  // A clean delivery intentionally omits dist files. Force this declaration
  // build so a stale incremental metadata file can never make API typecheck
  // depend on an earlier manual build of @workspace/api-zod.
  ["-b", "lib/api-zod/tsconfig.json", "--force"],
  ["-p", "lib/product/tsconfig.json", "--noEmit", "--emitDeclarationOnly", "false"],
  ["-p", "lib/api-client-react/tsconfig.json", "--noEmit", "--emitDeclarationOnly", "false"],
  ["-p", "lib/db/tsconfig.json", "--noEmit", "--emitDeclarationOnly", "false"],
  ["-p", "artifacts/api-server/tsconfig.json", "--noEmit"],
  ["-p", "artifacts/mockup-sandbox/tsconfig.json", "--noEmit"],
  ["-p", "scripts/tsconfig.json", "--noEmit"],
];

process.chdir(projectRoot);
for (const args of projects) {
  await runTsc(args);
}
