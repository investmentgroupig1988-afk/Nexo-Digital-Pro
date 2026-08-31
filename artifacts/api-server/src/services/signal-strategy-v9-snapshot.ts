import { createHash } from "node:crypto";

export const V9_TIMEFRAMES = ["5m", "15m", "1h", "4h"] as const;
export type V9Timeframe = (typeof V9_TIMEFRAMES)[number];

export const V9_FAMILIES = [
  "DOUBLE_TOP_BOTTOM_CONFIRMATION",
  "HEAD_SHOULDERS_CONFIRMATION",
  "ABCD_REVERSAL_CONFIRMATION",
  "BB_RSI_RANGE_REVERSION",
] as const;
export type V9Family = (typeof V9_FAMILIES)[number];

export const V9_PREREGISTRATION = {
  id: "SIGNAL_ENGINE_V9_CAUSAL_CHART_PATTERNS_2026_08_31",
  registeredAt: "2026-08-31T13:00:00Z",
  objective: "Test a small fixed set of causal chart-pattern and range-reversion entries without tuning the rejected live setup or V8 families.",
  dataset: {
    symbol: "BTCUSDT",
    provider: "Binance public Spot klines",
    start: "2017-10-01T00:00:00Z",
    endExclusive: "2026-08-28T00:00:00Z",
    candlePolicy: "Only candles with closeTime <= effective observation time; confirmed pivots require three already-closed right bars.",
    source: "Reuse the checksummed V6-V8 gzip cache without interpolation.",
    contamination: "The historical interval was inspected in V1-V8. V9 is exploratory screening; independent evidence must be forward or external after the rules are frozen.",
  },
  periods: {
    train: { start: "2017-10-01T00:00:00Z", end: "2022-03-01T00:00:00Z" },
    development: { start: "2022-03-01T00:00:00Z", end: "2024-01-01T00:00:00Z" },
    validation: { start: "2024-01-01T00:00:00Z", end: "2025-04-01T00:00:00Z" },
    lockedOutOfSample: { start: "2025-04-01T00:00:00Z", end: "2026-08-28T00:00:00Z" },
  },
  costsBps: [0, 5, 10],
  commonRisk: {
    rewardRisk: 1.5,
    expiryCandles: 12,
    minimumStopAtr: 0.75,
    maximumStopAtr: 2.5,
    structuralBufferAtr: 0.1,
    note: "The fixed V8 exit geometry isolates entry quality; exits are not optimized in V9.",
  },
  pivots: { leftBars: 3, rightBars: 3 },
  families: {
    DOUBLE_TOP_BOTTOM_CONFIRMATION: {
      separationBars: [6, 60],
      peakToleranceAtr: 0.4,
      minimumDepthAtr: 1,
      confirmationBars: 24,
      rule: "Two confirmed similar extrema separated by an opposite pivot; entry only after a closed neckline break.",
    },
    HEAD_SHOULDERS_CONFIRMATION: {
      spanBars: [12, 120],
      shoulderToleranceAtr: 0.75,
      minimumHeadHeightAtr: 0.5,
      symmetryRatio: [0.5, 2],
      confirmationBars: 24,
      rule: "Five alternating confirmed pivots with a distinct head, comparable shoulders and a subsequent closed neckline break.",
    },
    ABCD_REVERSAL_CONFIRMATION: {
      spanBars: [10, 100],
      bcRetracement: [0.5, 0.786],
      cdToAb: [0.9, 1.1],
      confirmationBars: 4,
      rsiLongMaximum: 40,
      rsiShortMinimum: 60,
      rule: "Four confirmed alternating pivots satisfying fixed AB=CD ratios; entry only after a closed reversal break and RSI confirmation.",
    },
    BB_RSI_RANGE_REVERSION: {
      emaSeparationAtrMaximum: 0.5,
      ema55Slope10AtrMaximum: 0.25,
      rsiLongMaximum: 40,
      rsiShortMinimum: 60,
      volumeRatioMaximum: 1.5,
      rule: "Re-entry into Bollinger bands after a closed excursion, only when EMA structure is flat/ranging and relative volume is not breakout-like.",
    },
  },
  selection: {
    rule: "No parameter search or runtime overrides. Report every family/timeframe. Promotion requires positive TRAIN/DEV/VALIDATION/OOS expectancy at 5bps, PF > 1 in every split, OOS PF >= 1.15, OOS expectancy at 10bps >= 0, minimum sample, at least 60% positive calendar years and bootstrap P(expectancy > 0) >= 70%.",
    minimumOosSignals: { "5m": 100, "15m": 60, "1h": 40, "4h": 30 },
    bootstrap: { iterations: 10_000, blockLength: 5, seed: 0x59_39_20_26 },
    noPostResultRetuning: true,
  },
  exclusions: [
    "No Gartley/Bat/Butterfly variants: each would add ratio families and pivot degrees of freedom beyond this bounded round.",
    "No ML, genetic optimization, parameter grid or random split.",
    "No changes to live strategy, scheduler, database, Telegram or commercial metrics.",
  ],
  liveIntegration: false,
  schedulerChanged: false,
  databaseWrites: false,
  telegramCalls: false,
} as const;

export function computeV9PreregistrationHash(): string {
  return createHash("sha256").update(canonicalJson(V9_PREREGISTRATION)).digest("hex");
}

export const V9_PREREGISTRATION_HASH = "719f80b0da84437a2996f253f8392707446e34d92a6815d198c59428c5a14f24";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
