const configuredBaseUrl = process.env.API_BASE_URL?.trim();

if (!configuredBaseUrl) {
  throw new Error("API_BASE_URL is required. Use the public API origin, for example https://api.example.com.");
}

let baseUrl;
try {
  baseUrl = new URL(configuredBaseUrl);
} catch {
  throw new Error("API_BASE_URL must be an absolute http(s) origin.");
}

if (
  (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
  baseUrl.username ||
  baseUrl.password ||
  baseUrl.pathname !== "/" ||
  baseUrl.search ||
  baseUrl.hash
) {
  throw new Error("API_BASE_URL must be an http(s) origin without a path, query, hash, or credentials.");
}

const healthcheckUrl = new URL("/api/healthz", baseUrl.origin);
const response = await fetch(healthcheckUrl, {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(10_000),
});

if (!response.ok) {
  throw new Error(`Healthcheck failed with HTTP ${response.status}.`);
}

const body = await response.json();
if (!body || typeof body !== "object" || body.status !== "ok") {
  throw new Error("Healthcheck returned an unexpected response.");
}

console.log(`API healthcheck passed: ${healthcheckUrl.origin}`);
