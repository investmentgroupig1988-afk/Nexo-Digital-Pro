import { createHash } from "node:crypto";

export const V11_STRATEGY_VERSION = "RSI_DIVERGENCE_STRUCTURAL_4H_V1" as const;
export const V11_SHADOW_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"] as const;
export type V11ShadowSymbol = (typeof V11_SHADOW_SYMBOLS)[number];

/**
 * Immutable forward contract. Any research idea that changes one field must use
 * a new strategy version and a new cohort rather than updating V1 in place.
 */
export const V11_FROZEN_CANDIDATE = {
  strategyVersion: V11_STRATEGY_VERSION,
  sourceResearch: {
    family: "RSI_DIVERGENCE_STRUCTURE",
    preregistrationId: "SIGNAL_ENGINE_V8_CAUSAL_SETUP_RESEARCH_2026_08_30",
    preregistrationHash: "eaca89cf5240c46f0fea0b18f9bd47d1734e0c156ccacd252306d5dcc21e90ed",
    dataset: "Binance public Spot closed klines",
    symbol: "BTCUSDT",
    discoveryStart: "2017-10-01T00:00:00.000Z",
    discoveryEndExclusive: "2026-08-28T00:00:00.000Z",
    contaminationNotice: "All discovery intervals were observed during V1-V10; they are not forward evidence.",
  },
  forwardCohort: {
    eligibleAfter: "2026-08-31T00:00:00.000Z",
    symbols: V11_SHADOW_SYMBOLS,
    timeframe: "4h",
    candlePolicy: "Only Binance candles with closeTime <= effective server observation time are eligible.",
  },
  detector: {
    rsiPeriod: 14,
    pivotLeftBars: 2,
    pivotRightBars: 2,
    minimumRsiDivergencePoints: 3,
    structuralConfirmation: "Closed break of the causal neckline after a confirmed two-pivot RSI divergence.",
    confirmationWindowCandles: 6,
  },
  exits: {
    stop: "Divergence pivot anchor plus 0.10 ATR structural buffer, floored at 0.75 ATR and rejected above 2.50 ATR.",
    minimumStopAtr: 0.75,
    maximumStopAtr: 2.5,
    structuralBufferAtr: 0.1,
    rewardRisk: 1.5,
    expiryCandles: 12,
    sameCandleAmbiguity: "LOSS_FIRST",
    expiredMark: "Close of the twelfth fully closed 4h candle after entry.",
  },
  costs: {
    units: "round-trip basis points converted to R by entry risk percentage",
    scenariosBps: [0, 5, 10],
  },
  evaluationGate: {
    aggregateResolvedMinimum: 120,
    btcResolvedMinimum: 60,
    minimumObservationMonths: 36,
    netExpectancy5BpsGreaterThan: 0,
    netExpectancy10BpsAtLeast: 0,
    profitFactor5BpsAtLeast: 1.1,
    maximumObservedDrawdownR: 12,
    maximumBootstrap95DrawdownR: 20,
    blockBootstrap95ExpectancyLowerBoundGreaterThan: 0,
    positiveSymbolsMinimum: 3,
    positiveRollingWindowsFractionMinimum: 2 / 3,
    rule: "Reaching sample counts alone never promotes V1; every risk, cost, temporal-stability, uncertainty, and cross-symbol gate must pass, including BTC itself.",
  },
  immutability: {
    retuningAllowed: false,
    replacementPolicy: "Any parameter or rule change requires V2 and a new forward cohort.",
  },
} as const;

export function computeV11CandidateFingerprint(): string {
  return createHash("sha256").update(canonicalJson(V11_FROZEN_CANDIDATE)).digest("hex");
}

export const V11_CANDIDATE_FINGERPRINT = "9bfe79d79c73d17b73a9c7e1eb62532af644cc6065aeecc8b3020783142e6089";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
