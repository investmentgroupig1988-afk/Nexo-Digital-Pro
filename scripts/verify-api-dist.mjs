import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import net from "node:net";
import { resolve } from "node:path";
import { projectRoot } from "./workspace-tools.mjs";

const apiDirectory = resolve(projectRoot, "artifacts/api-server");
const entrypoint = resolve(apiDirectory, "dist/index.mjs");
const apiManifestPath = resolve(apiDirectory, "package.json");
const startupTimeoutMs = 10_000;

function packageName(specifier) {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}

async function assertStaticRuntimeImportsAreDeclared() {
  const [artifact, manifestContents] = await Promise.all([
    readFile(entrypoint, "utf8"),
    readFile(apiManifestPath, "utf8"),
  ]);
  const manifest = JSON.parse(manifestContents);
  const declaredDependencies = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  const nodeBuiltins = new Set([
    ...builtinModules,
    ...builtinModules.map((specifier) => `node:${specifier}`),
  ]);
  const staticImportPattern = /(?:import|export)\s+(?:[^'"\n]*?\s+from\s+)?["']([^"']+)["']/g;
  const missingDependencies = new Set();

  for (const match of artifact.matchAll(staticImportPattern)) {
    const specifier = match[1];
    if (specifier.startsWith(".") || specifier.startsWith("/") || nodeBuiltins.has(specifier)) continue;
    const dependency = packageName(specifier);
    if (!declaredDependencies.has(dependency)) missingDependencies.add(dependency);
  }

  if (missingDependencies.size > 0) {
    throw new Error(
      `The API artifact has undeclared static runtime imports: ${[...missingDependencies].join(", ")}. ` +
      "Declare each external dependency in artifacts/api-server/package.json or bundle it.",
    );
  }
}

async function reserveLocalPort() {
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string") {
    reservation.close();
    throw new Error("Could not reserve a loopback port for API artifact verification.");
  }
  await new Promise((resolveClose, rejectClose) => reservation.close((error) => error ? rejectClose(error) : resolveClose()));
  return address.port;
}

function pause(milliseconds) {
  return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const terminated = await Promise.race([exited.then(() => true), pause(3_000).then(() => false)]);
  if (!terminated && child.exitCode === null) {
    child.kill();
    await exited;
  }
}

async function assertArtifactStarts() {
  const port = await reserveLocalPort();
  const environment = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    LOG_LEVEL: "silent",
    CORS_ALLOWED_ORIGINS: "https://frontend.example.test",
    // Do not use a developer's credentials or contact a database. Persistence
    // is lazy and the health check remains available without authentication.
    DATABASE_URL: "",
    BETTER_AUTH_SECRET: "",
    BETTER_AUTH_URL: "",
    TWELVEDATA_API_KEY: "",
  };
  const child = spawn(process.execPath, ["--enable-source-maps", entrypoint], {
    cwd: apiDirectory,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  try {
    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`API artifact exited before becoming healthy.\n${output}`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
        if (response.ok) return;
      } catch {
        // The process is still starting; retry until the bounded deadline.
      }
      await pause(100);
    }
    throw new Error(`Timed out waiting for the API artifact health check.\n${output}`);
  } finally {
    await stop(child);
  }
}

await assertStaticRuntimeImportsAreDeclared();
await assertArtifactStarts();
console.log("API production artifact verification passed.");
