import assert from "node:assert/strict";
import test from "node:test";
import { signalActiveMessage } from "./notification-provider";
import { TelegramProvider } from "./telegram-provider";

test("public notification contains only availability and the configured link", () => {
  const message = signalActiveMessage("https://staging.trenoro.com/");
  assert.match(message, /SEÑAL ACTIVA/);
  assert.match(message, /https:\/\/staging\.trenoro\.com\//);
  assert.doesNotMatch(message, /BTC|LONG|SHORT|entrada|stop|take|\bSL\b|\bTP\b|RSI|EMA/i);
});

test("telegram sends no token or signal details in the JSON body", async () => {
  let payload = "";
  const request = (async (_input, init) => { payload = String(init?.body); return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }); }) as typeof fetch;
  await new TelegramProvider("secret-token", "@channel", request).sendSignalActive("https://staging.trenoro.com/");
  assert.doesNotMatch(payload, /secret-token|BTC|LONG|SHORT|stop|take/i);
});

test("telegram errors do not include upstream response bodies", async () => {
  const request = (async () => new Response("sensitive upstream body", { status: 500 })) as typeof fetch;
  await assert.rejects(() => new TelegramProvider("secret-token", "@channel", request).sendSignalActive("https://staging.trenoro.com/"), /HTTP 500/);
});
