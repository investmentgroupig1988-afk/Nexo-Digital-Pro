import { createHash } from "node:crypto";

export const V8_TIMEFRAMES = ["5m", "15m", "1h", "4h"] as const;
export type V8Timeframe = (typeof V8_TIMEFRAMES)[number];

export const V8_FAMILIES = [
  "BOS_RETEST_TREND",
  "CHOCH_CONFIRMATION",
  "BB_MACD_SQUEEZE",
  "TRIPLE_EMA_PULLBACK",
  "RSI_DIVERGENCE_STRUCTURE",
  "ORDER_BLOCK_RETEST",
] as const;
export type V8Family = (typeof V8_FAMILIES)[number];

export const V8_PREREGISTRATION = {
  id: "SIGNAL_ENGINE_V8_CAUSAL_SETUP_RESEARCH_2026_08_30",
  registeredAt: "2026-08-30T21:00:00Z",
  objective: "Test a small, fixed set of structurally different causal setup families instead of retuning the rejected baseline setup.",
  baseline: {
    id: "BASELINE_V6",
    rule: "Frozen current live strategy, used only as control.",
  },
  dataset: {
    symbol: "BTCUSDT",
    provider: "Binance public Spot klines",
    start: "2017-10-01T00:00:00Z",
    endExclusive: "2026-08-28T00:00:00Z",
    openCandlePolicy: "closeTime <= effective observation time",
    source: "Reuse V6/V7 checksummed gzip cache without interpolation.",
    contamination: "All intervals were inspected in V1-V7. Results are exploratory screening, not independent proof. True forward starts after 2026-08-28T00:00:00Z.",
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
    note: "One fixed exit policy isolates entry-family quality. No exit optimization is performed.",
  },
  indicators: {
    pivots: { leftBars: 2, rightBars: 2 },
    ema: [9, 21, 55],
    macd: { fast: 12, slow: 26, signal: 9 },
    rsi: 14,
    atr: 14,
    bollinger: { period: 20, deviations: 2, squeezeLookback: 100, squeezeQuantile: 0.2 },
    volumeAverage: 20,
  },
  families: {
    BOS_RETEST_TREND: "Closed break of a confirmed swing in EMA21/55 direction, followed within three bars by a level retest and directional close.",
    CHOCH_CONFIRMATION: "Closed break of the last confirmed opposite swing after a causal HH/HL or LH/LL structure, confirmed by MACD direction.",
    BB_MACD_SQUEEZE: "Closed Bollinger breakout after a causal low-bandwidth observation, with expanding MACD histogram and relative volume >= 1.20.",
    TRIPLE_EMA_PULLBACK: "EMA9/21/55 traffic-light alignment and slope, pullback to EMA21, directional reclaim of EMA9, bounded RSI and <= 1 ATR extension.",
    RSI_DIVERGENCE_STRUCTURE: "Confirmed two-pivot RSI divergence followed by a closed break of the causal neckline within six bars.",
    ORDER_BLOCK_RETEST: "Closed structure displacement with body >= 1.5 ATR, range >= 1.8 ATR and relative volume >= 1.30, followed by retest of the last opposite candle within six bars.",
  },
  selection: {
    rule: "No parameter search. Every family/timeframe is reported. A candidate is promotion-eligible only if TRAIN, DEVELOPMENT, VALIDATION and locked OOS expectancy at 5bps > 0, PF > 1, OOS PF >= 1.10, OOS expectancy at 10bps >= 0 and sample minimum passes.",
    minimumSignals: { "5m": 80, "15m": 40, "1h": 20, "4h": 10 },
    noPostResultRetuning: true,
  },
  excludedThisRound: [
    "harmonic patterns because ratio/pivot choices introduce too many unregistered degrees of freedom",
    "head-and-shoulders because neckline/symmetry tolerances require a separate preregistered study",
    "machine learning",
    "live strategy integration",
  ],
  liveIntegration: false,
  schedulerChanged: false,
  databaseWrites: false,
  telegramCalls: false,
} as const;

export function computeV8PreregistrationHash(): string {
  return createHash("sha256").update(canonicalJson(V8_PREREGISTRATION)).digest("hex");
}

export const V8_PREREGISTRATION_HASH = "eaca89cf5240c46f0fea0b18f9bd47d1734e0c156ccacd252306d5dcc21e90ed";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
