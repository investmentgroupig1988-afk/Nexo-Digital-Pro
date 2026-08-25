import assert from "node:assert/strict";
import test from "node:test";
import { sendAuthEmailUsing } from "./email";

test("Resend adapter builds a TRENORO single-use action link without putting the API key in the body", async () => {
  let authorization = "";
  let body = "";
  const request = (async (_url, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ id: "email-test" }), { status: 200 });
  }) as typeof fetch;
  await sendAuthEmailUsing({ to: "member@example.test", token: "one-time-token", kind: "password-reset" }, { apiKey: "resend-test-key", from: "TRENORO <no-reply@example.test>", appPublicUrl: "https://www.trenoro.com" }, request);
  assert.equal(authorization, "Bearer resend-test-key");
  assert.match(body, /TRENORO/);
  assert.match(body, /https:\/\/www\.trenoro\.com\/restablecer-contrasena\?token=one-time-token/);
  assert.doesNotMatch(body, /resend-test-key/);
});

test("email adapter fails closed when configuration is incomplete", async () => {
  await assert.rejects(() => sendAuthEmailUsing({ to: "member@example.test", token: "token", kind: "email-verification" }, {}, fetch), /not configured/);
});

test("provider errors never expose the upstream response body", async () => {
  const request = (async () => new Response("provider-sensitive-body", { status: 500 })) as typeof fetch;
  await assert.rejects(() => sendAuthEmailUsing({ to: "member@example.test", token: "token", kind: "email-verification" }, { apiKey: "test", from: "no-reply@example.test", appPublicUrl: "https://www.trenoro.com" }, request), (error: Error) => !error.message.includes("provider-sensitive-body"));
});
