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
  globalThis.fetch = (async (input) => {
    requestedUrl = typeof input === "string" ? input : input.toString();
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  setBaseUrl("https://api.example.test/");
  const data = await customFetch<{ status: string }>("/api/healthz", {
    responseType: "json",
  });

  assert.equal(requestedUrl, "https://api.example.test/api/healthz");
  assert.deepEqual(data, { status: "ok" });
});

test("setBaseUrl rejects relative URLs and credentials", () => {
  assert.throws(() => setBaseUrl("/api"), /absolute http\(s\) URL/);
  assert.throws(
    () => setBaseUrl("https://user:secret@api.example.test"),
    /without credentials/,
  );
});
