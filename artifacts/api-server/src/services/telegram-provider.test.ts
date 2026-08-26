import assert from "node:assert/strict";
import test from "node:test";
import { signalActiveMessage } from "./notification-provider";
import { TelegramProvider } from "./telegram-provider";

test("public notification contains only availability and the configured link", () => {
  const message = signalActiveMessage("https://staging.trenoro.com/", "15m");
  assert.equal(message, "🔔 Nueva señal disponible en TRENORO — STAGING\nTemporalidad: 15m\nAbrir TRENORO: https://staging.trenoro.com/?timeframe=15m");
  assert.doesNotMatch(message, /BTC|LONG|SHORT|entrada|precio|stop|take|\bSL\b|\bTP\b|RSI|EMA|score/i);
});

test("production notification omits the staging marker", () => {
  assert.equal(
    signalActiveMessage("https://www.trenoro.com/", "4h"),
    "🔔 Nueva señal disponible en TRENORO\nTemporalidad: 4h\nAbrir TRENORO: https://www.trenoro.com/?timeframe=4h",
  );
});

test("telegram sends no token or signal details in the JSON body", async () => {
  let payload = "";
  const request = (async (_input, init) => { payload = String(init?.body); return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }); }) as typeof fetch;
  await new TelegramProvider("secret-token", "@channel", request).sendSignalActive("https://staging.trenoro.com/", "5m");
  assert.doesNotMatch(payload, /secret-token|BTC|LONG|SHORT|stop|take|entrada|precio/i);
  assert.match(payload, /timeframe=5m/);
});

test("telegram errors do not include upstream response bodies", async () => {
  const request = (async () => new Response("sensitive upstream body", { status: 500 })) as typeof fetch;
  await assert.rejects(() => new TelegramProvider("secret-token", "@channel", request).sendSignalActive("https://staging.trenoro.com/", "1h"), /HTTP 500/);
});
