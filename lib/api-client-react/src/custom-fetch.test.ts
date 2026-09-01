import assert from "node:assert/strict";
import { after, test } from "node:test";
import { customFetch, setBaseUrl } from "./custom-fetch";

const originalFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = originalFetch;
  setBaseUrl(null);
});

test("customFetch applies a configured absolute API base URL", async () => {
  let requestedUrl = "";
  let credentials: RequestCredentials | undefined;
  globalThis.fetch = (async (input, init) => {
    requestedUrl = typeof input === "string" ? input : input.toString();
    credentials = init?.credentials;
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  setBaseUrl("https://api.example.test/");
  const data = await customFetch<{ status: string }>("/api/healthz", {
    responseType: "json",
  });

  assert.equal(requestedUrl, "https://api.example.test/api/healthz");
  assert.equal(credentials, "include");
  assert.deepEqual(data, { status: "ok" });
});

test("customFetch preserves an explicit credential mode", async () => {
  let credentials: RequestCredentials | undefined;
  globalThis.fetch = (async (_input, init) => {
    credentials = init?.credentials;
    return new Response(JSON.stringify({ status: "ok" }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  await customFetch("/api/healthz", { credentials: "omit", responseType: "json" });
  assert.equal(credentials, "omit");
});

test("setBaseUrl rejects relative URLs and credentials", () => {
  assert.throws(() => setBaseUrl("/api"), /absolute http\(s\) URL/);
  assert.throws(
    () => setBaseUrl("https://user:secret@api.example.test"),
    /without credentials/,
  );
});
