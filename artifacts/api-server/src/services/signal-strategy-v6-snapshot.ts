import { createHash } from "node:crypto";

export const V6_RESEARCH_ID = "SIGNAL_ENGINE_V6_PREREGISTERED_2026_08_29";
export const V6_TIMEFRAMES = ["5m", "15m", "1h", "4h"] as const;
export const V6_ENTRY_FAMILIES = [
  "BASELINE_ALL",
  "HTF_COMPATIBLE",
  "HTF_STRONG",
  "TREND_REGIME",
  "NORMAL_VOLATILITY",
  "HIGH_VOLATILITY",
  "LIMITED_EXTENSION",
  "QUALITY_TOP_30",
  "QUALITY_TOP_20",
  "QUALITY_BREAKOUT_HTF",
  "QUALITY_PULLBACK_HTF",
  "QUALITY_MOMENTUM_HTF",
  "HIGH_VOL_TREND_QUALITY",
  "STRUCTURE_PULLBACK_REGIME",
] as const;
export const V6_ABLATIONS = [
  "WITHOUT_VOLUME",
  "WITHOUT_RSI_BAND",
  "WITHOUT_EMA_STACK",
  "WITHOUT_STRUCTURE",
  "WITHOUT_FIBONACCI_DIRECTION",
] as const;

export const V6_PREREGISTRATION = deepFreeze({
  id: V6_RESEARCH_ID,
  registeredAt: "2026-08-29T00:00:00.000Z",
  objective: "Test whether selective causal entries plus attainable volatility-normalized exits produce a stable positive edge after costs.",
  symbol: "BTCUSDT",
  provider: "Binance public Spot klines",
  dataset: {
    start: "2017-10-01T00:00:00.000Z",
    endExclusive: "2026-08-28T00:00:00.000Z",
    warmupCandles: 220,
    cacheFormat: "gzip compact JSON with SHA-256 over canonical candle rows",
    openCandlePolicy: "closeTime <= effective observation time",
    missingCandlesPolicy: "report, never interpolate",
    contamination: "Every interval from 2018 onward was inspected in V3/V4/V5. V6 OOS is code-sealed for V6 selection but is not genuinely untouched historical evidence.",
    trueForwardStart: "2026-08-28T00:00:00.000Z",
  },
  periods: {
    train: { start: "2017-10-01T00:00:00.000Z", end: "2022-03-01T00:00:00.000Z" },
    development: { start: "2022-03-01T00:00:00.000Z", end: "2024-01-01T00:00:00.000Z" },
    validation: { start: "2024-01-01T00:00:00.000Z", end: "2025-04-01T00:00:00.000Z" },
    lockedOutOfSample: { start: "2025-04-01T00:00:00.000Z", end: "2026-08-28T00:00:00.000Z" },
  },
  costs: {
    ideal: { totalBps: 0, feeBps: 0, spreadBps: 0, slippageBps: 0, latencyBps: 0 },
    realistic: { totalBps: 5, feeBps: 2, spreadBps: 1, slippageBps: 1, latencyBps: 1 },
    stress: { totalBps: 10, feeBps: 5, spreadBps: 2, slippageBps: 2, latencyBps: 1 },
    interpretation: "Total round-trip analytical friction. Components are assumptions, not venue/account claims.",
  },
  entryResearch: {
    families: V6_ENTRY_FAMILIES,
    rule: "Every feature must be known at the entry candle close; baseline exit is retained while entry families are screened.",
    ablations: V6_ABLATIONS,
    ablationPurpose: "Diagnostic only. Removing one current condition may explain opportunity loss/noise but cannot be promoted directly.",
    qualityThresholds: "Any score percentile is derived on TRAIN only and frozen before DEVELOPMENT.",
  },
  exitResearch: {
    rule: "Run only for entry shortlists; baseline remains control and live parameters never change.",
    atrRiskMultiples: [0.5, 0.75, 1, 1.25, 1.5, 2],
    targetAtrDiagnostics: [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4],
    rewardRisk: [1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.75, 2],
    percentageRisk: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5],
    percentageRewardRisk: [1.2, 1.5, 2],
    expiryCandles: [6, 8, 12, 18, 24, 32],
    selectionGrid: "ATR uses every risk/R:R pair at expiry 8/12/18/24; percentage uses each risk with R:R 1.2/1.5/2 at expiry 12. Expiry sensitivity is applied only around selected geometry.",
    smartExitDiagnostics: ["FIXED", "BREAKEVEN_AFTER_1R", "PARTIAL_1R_THEN_2R", "TIME_STOP"],
  },
  selection: {
    primaryCostBps: 5,
    stressCostBps: 10,
    entryShortlistLimitPerTimeframe: 3,
    finalCandidateLimit: 4,
    minimumSignals: {
      train: { "5m": 200, "15m": 80, "1h": 30, "4h": 12 },
      development: { "5m": 80, "15m": 35, "1h": 12, "4h": 5 },
      validation: { "5m": 50, "15m": 20, "1h": 8, "4h": 4 },
      lockedOutOfSample: { "5m": 50, "15m": 20, "1h": 8, "4h": 4 },
    },
    entryGate: "TRAIN and DEVELOPMENT expectancy 5bps > 0, PF 5bps > 1, expectancy 10bps >= 0, with minimum samples.",
    validationGate: "VALIDATION expectancy 5bps > 0, PF 5bps > 1.05, expectancy 10bps >= 0, with minimum sample.",
    ranking: "maximize worst TRAIN/DEVELOPMENT 5bps expectancy, then worst PF, then lower combined drawdown; validation/OOS fields are forbidden.",
    fallback: "If no entry passes, the least-negative deterministic diagnostic may continue through exits but is ineligible for promotion.",
  },
  promotion: {
    oosMinimumExpectancy5Bps: 0,
    oosMinimumProfitFactor5Bps: 1.1,
    oosMinimumExpectancy10Bps: 0,
    walkForwardMinimumPositiveWindowFraction: 0.6,
    stabilityMinimumPositiveCellFraction: 0.6,
    bootstrapMinimumProbabilityPositiveExpectancyPct: 70,
    profitableMonthMinimumFraction: 0.5,
    rule: "All gates plus sufficient sample must pass. Passing permits only a later separately-authorized shadow proposal.",
  },
  stability: {
    riskMultipliersRelative: [0.9, 1, 1.1],
    rewardRiskMultipliersRelative: [0.9, 1, 1.1],
    expiryOffsets: [-2, 0, 2],
  },
  walkForward: {
    firstTestStart: "2019-10-01T00:00:00.000Z",
    testWindowMonths: 12,
    stepMonths: 12,
    metric: "chronological test-window 5bps expectancy/PF/DD with frozen candidate",
  },
  monteCarlo: {
    iterations: 10_000,
    blockLength: 5,
    seed: 0x56_36_20_26,
    limitation: "Moving-block bootstrap estimates sequence risk only; it cannot model non-stationary market regimes or establish independence.",
  },
  liveIntegration: false,
  schedulerChanged: false,
  databaseWrites: false,
  telegramCalls: false,
  commercialStrategyChanged: false,
} as const);

// Filled from computeV6PreregistrationHash() before any market results are inspected.
export const V6_PREREGISTRATION_HASH = "77b20006436f490760b6967dc60bb5293e62fab9e10db9657e85372535b70788";

export type V6Timeframe = (typeof V6_TIMEFRAMES)[number];
export type V6EntryFamily = (typeof V6_ENTRY_FAMILIES)[number];
export type V6Ablation = (typeof V6_ABLATIONS)[number];

export function computeV6PreregistrationHash(): string {
  return createHash("sha256").update(canonicalJson(V6_PREREGISTRATION)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
