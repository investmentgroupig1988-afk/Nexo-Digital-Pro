import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import app from "../app";

test("health endpoint is reachable and API responses have defensive headers", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not receive a TCP port.");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/healthz`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(await response.json(), { status: "ok" });

    const allowedOrigin = await fetch(`http://127.0.0.1:${address.port}/api/healthz`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(allowedOrigin.headers.get("access-control-allow-origin"), "http://localhost:5173");

    const deniedOrigin = await fetch(`http://127.0.0.1:${address.port}/api/healthz`, {
      headers: { Origin: "https://untrusted.example" },
    });
    assert.equal(deniedOrigin.headers.get("access-control-allow-origin"), null);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
