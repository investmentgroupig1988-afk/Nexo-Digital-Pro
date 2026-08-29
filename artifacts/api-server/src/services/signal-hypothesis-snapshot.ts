import { createHash } from "node:crypto";

export const FROZEN_1H_HYPOTHESIS_ID = "TRENORO_1H_QUALITY_PULLBACK_HTF_V3_FROZEN_2026_08_28";
export const FROZEN_1H_FORWARD_CUTOFF = "2026-08-28T00:00:00.000Z";
export const FROZEN_1H_EXTERNAL_ASSETS = ["ETHUSDT", "BNBUSDT", "SOLUSDT"] as const;

export const FROZEN_1H_HYPOTHESIS = deepFreeze({
  id: FROZEN_1H_HYPOTHESIS_ID,
  discoveryCutoff: FROZEN_1H_FORWARD_CUTOFF,
  sourceResearch: "Strategy V3/V4",
  market: "spot",
  provider: "Binance public klines",
  executionTimeframe: "1h",
  candlePolicy: "Only candles with closeTime <= effective observation time are usable.",
  baselineStrategyVersion: "TRENORO_CONFLUENCE_V1",
  entryCandidate: "QUALITY_PULLBACK_HTF",
  entryRules: {
    baselineConfluenceRequired: true,
    pullbackContinuation: {
      localEmaDirectionMustMatchSignal: true,
      candleMustTouchEma20: true,
      candleBodyMustCloseInSignalDirection: true,
      maximumCloseExtensionFromEma20Atr: 0.75,
    },
    contextAlignment: {
      timeframe: "1h",
      rule: "confirmed trend and EMA direction must both match the signal direction",
      fourHourAlignmentRequired: false,
      note: "For 1h execution this is the exact discovered same-timeframe confirmed context rule; 4h was not part of this frozen filter.",
    },
    volatilityRegime: {
      required: "NORMAL",
      causalPercentileLowerExclusive: 0.25,
      causalPercentileUpperExclusive: 0.75,
    },
  },
  exit: {
    name: "V3_ATR_1_5_RR1_5_E12",
    riskMode: "ATR",
    atrMultiple: 1.5,
    rewardRisk: 1.5,
    expiryCandles: 12,
    sameCandleTpAndSlResolution: "LOSS",
    firstResolutionCandle: "the next closed candle after entry",
  },
  costs: {
    primary: { totalBps: 5, feeBps: 3, spreadBps: 1, slippageBps: 1 },
    sensitivity: { totalBps: 10, feeBps: 6, spreadBps: 2, slippageBps: 2 },
  },
  externalValidation: {
    assets: FROZEN_1H_EXTERNAL_ASSETS,
    start: "2022-08-28T00:00:00.000Z",
    end: FROZEN_1H_FORWARD_CUTOFF,
    retuningAllowed: false,
  },
  forwardValidation: {
    asset: "BTCUSDT",
    startsStrictlyAfter: FROZEN_1H_FORWARD_CUTOFF,
    commercialPublishing: false,
    telegram: false,
    databaseWrites: false,
  },
} as const);

export const FROZEN_1H_HYPOTHESIS_HASH = "de60baccbfe80ee6a5c8fd516470ff1d845b86f271f6710a266bd6bfba659da4";
export type FrozenExternalAsset = (typeof FROZEN_1H_EXTERNAL_ASSETS)[number];

export function computeFrozen1hHypothesisHash(): string {
  return createHash("sha256").update(canonicalJson(FROZEN_1H_HYPOTHESIS)).digest("hex");
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
