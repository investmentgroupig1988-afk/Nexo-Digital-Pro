import { createHash } from "node:crypto";

export const V10_ASSETS = ["ETHUSDT", "BNBUSDT", "SOLUSDT"] as const;
export type V10Asset = (typeof V10_ASSETS)[number];

export const V10_FAMILIES = ["BB_MACD_SQUEEZE", "RSI_DIVERGENCE_STRUCTURE"] as const;
export type V10Family = (typeof V10_FAMILIES)[number];

export const V10_PREREGISTRATION = {
  id: "SIGNAL_ENGINE_V10_V8_EXTERNAL_GENERALIZATION_2026_08_31",
  registeredAt: "2026-08-31T15:00:00Z",
  objective: "Externally validate the two frozen V8 4h leads on a fixed asset set without parameter or asset selection.",
  sourceHypothesis: {
    preregistrationHash: "eaca89cf5240c46f0fea0b18f9bd47d1734e0c156ccacd252306d5dcc21e90ed",
    timeframe: "4h",
    families: ["BB_MACD_SQUEEZE", "RSI_DIVERGENCE_STRUCTURE"],
    rule: "Use the exact V8 detector and fixed exit implementation. No overrides or retuning.",
  },
  dataset: {
    assets: ["ETHUSDT", "BNBUSDT", "SOLUSDT"],
    provider: "Binance public Spot klines",
    start: "2020-09-01T00:00:00Z",
    endExclusive: "2026-08-28T00:00:00Z",
    timeframe: "4h",
    candlePolicy: "Only candles with closeTime <= effective observation time.",
    note: "All three assets are reported. No post-result asset selection.",
  },
  temporalChecks: {
    firstHalf: { start: "2020-09-01T00:00:00Z", end: "2023-09-01T00:00:00Z" },
    secondHalf: { start: "2023-09-01T00:00:00Z", end: "2026-08-28T00:00:00Z" },
  },
  costsBps: [0, 5, 10],
  selection: {
    minimumSignalsPerAsset: 30,
    minimumAggregateSignals: 120,
    gate: "Every asset expectancy 5bps > 0 and PF > 1; first and second half aggregate expectancy 5bps > 0 and PF > 1; aggregate PF 5bps >= 1.15; aggregate expectancy 10bps >= 0; bootstrap P(expectancy > 0) >= 70%.",
    bootstrap: { iterations: 10_000, blockLength: 5, seed: 0x51_30_20_26 },
    noPostResultRetuning: true,
  },
  liveIntegration: false,
  schedulerChanged: false,
  databaseWrites: false,
  telegramCalls: false,
} as const;

export function computeV10PreregistrationHash(): string {
  return createHash("sha256").update(canonicalJson(V10_PREREGISTRATION)).digest("hex");
}

export const V10_PREREGISTRATION_HASH = "da5f4d461d95106f325456d2d5b71522d488a4f0464602565c729563200d7f4f";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
