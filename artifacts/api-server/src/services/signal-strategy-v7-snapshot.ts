import { createHash } from "node:crypto";

export const V7_RESEARCH_ID = "SIGNAL_ENGINE_V7_STRUCTURAL_EDGE_2026_08_30";
export const V7_TIMEFRAMES = ["5m", "15m", "1h", "4h"] as const;
export const V7_STRUCTURAL_CANDIDATES = [
  "BASELINE_ALL",
  "LOCAL_TREND_DIRECTIONAL",
  "VOLATILITY_EXPANSION_DIRECTIONAL",
  "MTF_NEAREST_ALIGNED",
  "MTF_STACK_ALIGNED",
  "MTF_NO_CONTRADICTION",
  "REGIME_MTF_COMPOSITE",
  "SESSION_ASIA",
  "SESSION_EUROPE",
  "SESSION_NEW_YORK",
  "SESSION_EU_US_OVERLAP",
  "WEEKDAY_ONLY",
  "WEEKEND_ONLY",
] as const;
export const V7_FEATURE_IDS = [
  "TREND_QUALITY",
  "STRUCTURE_QUALITY",
  "HTF_ALIGNMENT",
  "ENTRY_EXTENSION",
  "VOLATILITY_FIT",
  "RELATIVE_VOLUME",
  "MOMENTUM_CONFIRMATION",
  "PATTERN_QUALITY",
  "RANGE_AND_CLOSE_QUALITY",
  "VOLATILITY_PERCENTILE",
  "VOLATILITY_CHANGE_RATIO",
  "DIRECTIONAL_MOVE_ATR",
  "BODY_RATIO",
  "ATR_PERCENT",
  "DIRECTIONAL_RSI",
  "NEAREST_MTF_ALIGNMENT",
  "STACKED_MTF_ALIGNMENT",
  "WEEKEND",
] as const;
export const V7_SELECTIVITY_FRACTIONS = [1, 0.75, 0.5, 0.25, 0.1] as const;

export const V7_PREREGISTRATION = deepFreeze({
  id: V7_RESEARCH_ID,
  registeredAt: "2026-08-30T16:30:00.000Z",
  objective: "Determine when the frozen live baseline has structural edge using causal regime, MTF, session and interpretable entry-quality evidence rather than re-tuning exits.",
  baseline: {
    id: "BASELINE_V6",
    rule: "Frozen current live entry, TP, SL, R:R, expiry and scheduler semantics.",
    exitResearchProhibited: true,
  },
  dataset: {
    symbol: "BTCUSDT",
    provider: "Binance public Spot klines",
    start: "2017-10-01T00:00:00.000Z",
    endExclusive: "2026-08-28T00:00:00.000Z",
    warmupCandles: 220,
    openCandlePolicy: "closeTime <= effective observation time",
    cacheFormat: "Reuse the V6 checksummed gzip candle cache; gaps are reported and never interpolated.",
    contamination: "All historical intervals were inspected in earlier V1-V6 work. V7 OOS is sealed from V7 selection in code, but is not genuinely untouched market evidence.",
    trueForwardStart: "2026-08-28T00:00:00.000Z",
  },
  periods: {
    train: { start: "2017-10-01T00:00:00.000Z", end: "2022-03-01T00:00:00.000Z" },
    development: { start: "2022-03-01T00:00:00.000Z", end: "2024-01-01T00:00:00.000Z" },
    validation: { start: "2024-01-01T00:00:00.000Z", end: "2025-04-01T00:00:00.000Z" },
    lockedOutOfSample: { start: "2025-04-01T00:00:00.000Z", end: "2026-08-28T00:00:00.000Z" },
  },
  costs: {
    idealBps: 0,
    realisticBps: 5,
    stressBps: 10,
    realisticComponents: { feeBps: 2, spreadBps: 1, slippageBps: 1, latencyBps: 1 },
    stressComponents: { feeBps: 5, spreadBps: 2, slippageBps: 2, latencyBps: 1 },
    interpretation: "Round-trip analytical friction assumptions; not claims about a venue or account.",
  },
  regimes: {
    trend: ["TREND_UP", "TREND_DOWN", "RANGE"],
    volatility: ["HIGH_VOLATILITY", "NORMAL_VOLATILITY", "LOW_VOLATILITY"],
    volatilityEvolution: ["VOLATILITY_EXPANSION", "VOLATILITY_STABLE", "VOLATILITY_COMPRESSION"],
    evolutionRule: "Current causal 14-bar true-range percentage divided by the preceding causal 14-bar value; expansion >= 1.25, compression <= 0.80.",
  },
  multiTimeframe: {
    nearest: { "5m": "15m", "15m": "1h", "1h": "4h", "4h": "local confirmed trend" },
    stack: { "5m": ["15m", "1h"], "15m": ["1h", "4h"], "1h": ["4h"], "4h": ["local confirmed trend"] },
    states: ["ALIGNED", "OPPOSED", "NEUTRAL"],
    rule: "Every higher-timeframe context candle must have closed no later than the execution entry close.",
  },
  sessionsUtc: {
    asia: { startHourInclusive: 0, endHourExclusive: 8 },
    europe: { startHourInclusive: 7, endHourExclusive: 16 },
    newYork: { startHourInclusive: 13, endHourExclusive: 22 },
    asiaEuropeOverlap: { startHourInclusive: 7, endHourExclusive: 8 },
    europeUsOverlap: { startHourInclusive: 13, endHourExclusive: 16 },
    weekend: "Saturday and Sunday in UTC",
    note: "Session labels overlap intentionally for attribution; candidate rules are fixed before results.",
  },
  features: {
    ids: V7_FEATURE_IDS,
    rule: "All features are available by the entry candle close. No MFE, MAE, future outcome, future regime or later candle is a feature.",
    attribution: "Outcome distributions, quintiles and Spearman association are reported independently in TRAIN/DEVELOPMENT/VALIDATION/OOS.",
  },
  qualityScore: {
    featureSelection: "A feature enters the manual structural score only when TRAIN and DEVELOPMENT Spearman correlations to net R at 5bps have the same non-zero sign and absolute value >= 0.03 in both periods.",
    weights: "Equal weight after orientation; each feature is transformed through its TRAIN empirical CDF.",
    thresholds: "Top fractions are frozen from TRAIN score quantiles before DEVELOPMENT selection.",
    acceptedFractions: V7_SELECTIVITY_FRACTIONS,
    monotonicityRule: "Higher selectivity must show non-decreasing expectancy across at least three adjacent acceptance levels in DEVELOPMENT to be considered informative.",
  },
  simpleModels: {
    logistic: {
      target: "WIN versus LOSS/EXPIRED for frozen baseline trades",
      fitPeriod: "TRAIN only",
      learningRate: 0.05,
      iterations: 400,
      l2: 0.1,
      standardization: "TRAIN mean and sample standard deviation",
      hyperparameterTuning: false,
    },
    decisionStump: {
      fitPeriod: "TRAIN only",
      thresholds: "TRAIN feature deciles from 10% through 90%",
      minimumAcceptedFraction: 0.1,
      objective: "Maximum TRAIN 5bps expectancy, diagnostic only until DEVELOPMENT/VALIDATION gates pass.",
    },
    boostedModel: "Not evaluated unless both manual score and logistic demonstrate stable DEVELOPMENT evidence; avoids adding degrees of freedom to a negative baseline.",
  },
  candidates: {
    structural: V7_STRUCTURAL_CANDIDATES,
    scoreFractions: V7_SELECTIVITY_FRACTIONS,
    maximumPreValidationPerTimeframe: 3,
    maximumOosFinalistsPerTimeframe: 1,
    ranking: "Maximum worst TRAIN/DEVELOPMENT expectancy at 5bps, then worst PF, then lower combined drawdown. VALIDATION and OOS are forbidden during ranking.",
  },
  selection: {
    minimumSignals: {
      train: { "5m": 200, "15m": 80, "1h": 30, "4h": 12 },
      development: { "5m": 80, "15m": 35, "1h": 12, "4h": 5 },
      validation: { "5m": 50, "15m": 20, "1h": 8, "4h": 4 },
      lockedOutOfSample: { "5m": 50, "15m": 20, "1h": 8, "4h": 4 },
    },
    preValidationGate: "TRAIN and DEVELOPMENT expectancy 5bps > 0, PF 5bps > 1 and expectancy 10bps >= 0 with minimum samples.",
    validationGate: "VALIDATION expectancy 5bps > 0, PF 5bps > 1.05 and expectancy 10bps >= 0 with minimum sample.",
    oosGate: "OOS expectancy 5bps > 0, PF 5bps > 1.10, expectancy 10bps >= 0, sufficient sample, walk-forward majority positive and bootstrap probability positive >= 70%.",
    fallback: "A deterministic least-negative diagnostic may be reported when no gate passes, but is never promotion-eligible.",
  },
  walkForward: { firstTestStart: "2019-10-01T00:00:00.000Z", testWindowMonths: 12, stepMonths: 12 },
  bootstrap: { iterations: 10_000, blockLength: 5, seed: 0x57_37_20_26 },
  liveIntegration: false,
  schedulerChanged: false,
  databaseWrites: false,
  telegramCalls: false,
  commercialStrategyChanged: false,
} as const);

export const V7_PREREGISTRATION_HASH = "998f797a609eff042bbcf074fb9300aed533c6b1a6c30d7e1da7fd7d1f0ff89e";

export type V7Timeframe = (typeof V7_TIMEFRAMES)[number];
export type V7StructuralCandidate = (typeof V7_STRUCTURAL_CANDIDATES)[number];
export type V7FeatureId = (typeof V7_FEATURE_IDS)[number];

export function computeV7PreregistrationHash(): string {
  return createHash("sha256").update(canonicalJson(V7_PREREGISTRATION)).digest("hex");
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
