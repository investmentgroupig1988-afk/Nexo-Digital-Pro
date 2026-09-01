import assert from "node:assert/strict";
import test from "node:test";
import type { ClosedAnalysisCandle } from "./signal-backtest";
import type { V2ContextPoint } from "./signal-strategy-v2";
import type { V6Entry } from "./signal-strategy-v6";
import {
  acceptsV7StructuralCandidate,
  annotateV7Entry,
  causalVolatilityChangeRatio,
  deriveManualScoreModel,
  fitV7LogisticModel,
  logisticQualityScore,
  manualStructuralScore,
  scoreThreshold,
  sessionsAt,
  volatilityEvolutionFromRatio,
  type V7Entry,
  type V7FeatureVector,
  type V7LabeledPoint,
  type V7Trade,
} from "./signal-strategy-v7";
import { V7_FEATURE_IDS } from "./signal-strategy-v7-snapshot";

test("V7 session windows use fixed UTC boundaries", () => {
  assert.deepEqual(sessionsAt(new Date("2026-08-29T07:30:00.000Z")), ["ASIA", "EUROPE", "ASIA_EU_OVERLAP", "WEEKEND"]);
  assert.deepEqual(sessionsAt(new Date("2026-08-31T14:30:00.000Z")), ["EUROPE", "NEW_YORK", "EU_US_OVERLAP", "WEEKDAY"]);
  assert.deepEqual(sessionsAt(new Date("2026-08-31T22:00:00.000Z")), ["WEEKDAY"]);
});

test("V7 volatility evolution uses only the trailing closed history", () => {
  const candles = Array.from({ length: 29 }, (_, index) => candle(index, index < 15 ? 0.5 : 1));
  const ratio = causalVolatilityChangeRatio(candles);
  assert.equal(ratio, 2);
  assert.equal(volatilityEvolutionFromRatio(ratio), "VOLATILITY_EXPANSION");
  assert.equal(volatilityEvolutionFromRatio(0.8), "VOLATILITY_COMPRESSION");
  assert.equal(volatilityEvolutionFromRatio(1), "VOLATILITY_STABLE");
});

test("V7 MTF annotation never selects a context candle after the execution close", () => {
  const candles = Array.from({ length: 29 }, (_, index) => candle(index, 0.5));
  const executionClose = candles[28].closeTime;
  const entry = baseV6Entry(28, executionClose, "LONG");
  const contexts15m: V2ContextPoint[] = [
    { closeTimeMs: Date.parse(executionClose) - 1, trend: "bullish", emaDirection: "LONG" },
    { closeTimeMs: Date.parse(executionClose) + 1, trend: "bearish", emaDirection: "SHORT" },
  ];
  const annotated = annotateV7Entry({ entry, candles, contexts15m, timeframe: "5m" });
  assert.equal(annotated.v7.htf15mDirection, "LONG");
  assert.equal(annotated.v7.nearestMtfState, "ALIGNED");
  assert.equal(annotated.v7.stackedMtfState, "ALIGNED");
});

test("V7 rejects mismatched execution evaluation timestamps", () => {
  const candles = Array.from({ length: 29 }, (_, index) => candle(index, 0.5));
  const entry = baseV6Entry(28, new Date(Date.parse(candles[28].closeTime) + 1).toISOString(), "LONG");
  assert.throws(() => annotateV7Entry({ entry, candles, contexts15m: [], timeframe: "5m" }), /must equal/);
});

test("manual structural score keeps only stable TRAIN and DEVELOPMENT associations", () => {
  const train = Array.from({ length: 40 }, (_, index) => labeled(index / 39, index / 39));
  const development = Array.from({ length: 30 }, (_, index) => labeled(index / 29, index / 29));
  const model = deriveManualScoreModel(train, development);
  assert.ok(model.features.some((feature) => feature.id === "TREND_QUALITY" && feature.direction === 1));
  assert.ok(manualStructuralScore(fakeEntry(0.9), model)! > manualStructuralScore(fakeEntry(0.1), model)!);
});

test("fixed logistic model ranks an obvious TRAIN-only relationship", () => {
  const train = Array.from({ length: 80 }, (_, index) => labeled(index / 79, index >= 40 ? 1 : -0.2, index >= 40 ? "WIN" : "EXPIRED"));
  const model = fitV7LogisticModel(train);
  assert.ok(logisticQualityScore(fakeEntry(0.9), model) > logisticQualityScore(fakeEntry(0.1), model));
  assert.equal(model.featureIds.length, V7_FEATURE_IDS.length);
});

test("selectivity thresholds are derived from score ranks", () => {
  assert.equal(scoreThreshold([1, 2, 3, 4], 1), Number.NEGATIVE_INFINITY);
  assert.equal(scoreThreshold([1, 2, 3, 4], 0.5), 2.5);
});

test("V7 structural filters preserve baseline and require their declared context", () => {
  const entry = fakeEntry(0.5);
  entry.v7.trendRegime = "TREND_UP";
  entry.v7.nearestMtfState = "ALIGNED";
  entry.v7.stackedMtfState = "ALIGNED";
  entry.v7.volatilityRegime = "NORMAL_VOLATILITY";
  assert.equal(acceptsV7StructuralCandidate(entry, "BASELINE_ALL"), true);
  assert.equal(acceptsV7StructuralCandidate(entry, "REGIME_MTF_COMPOSITE"), true);
  entry.v7.stackedMtfState = "OPPOSED";
  assert.equal(acceptsV7StructuralCandidate(entry, "MTF_NO_CONTRADICTION"), false);
});

function candle(index: number, halfRange: number): ClosedAnalysisCandle {
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index * 5)).toISOString();
  const closeTime = new Date(Date.parse(timestamp) + 5 * 60_000 - 1).toISOString();
  return { timestamp, closeTime, open: 100, high: 100 + halfRange, low: 100 - halfRange, close: 100, volume: 1 };
}

function baseV6Entry(entryIndex: number, evaluatedAt: string, direction: "LONG" | "SHORT"): V6Entry {
  const factors = Object.fromEntries([
    "TREND_QUALITY", "STRUCTURE_QUALITY", "HTF_ALIGNMENT", "ENTRY_EXTENSION", "VOLATILITY_FIT",
    "RELATIVE_VOLUME", "MOMENTUM_CONFIRMATION", "PATTERN_QUALITY", "RANGE_AND_CLOSE_QUALITY",
  ].map((id) => [id, 0.5])) as V6Entry["qualityFactors"];
  return {
    timeframe: "5m",
    direction,
    entryIndex,
    openedAt: evaluatedAt,
    entryPrice: 100,
    baselineStopLoss: direction === "LONG" ? 99 : 101,
    baselineTakeProfit: direction === "LONG" ? 101.5 : 98.5,
    baselineRiskReward: 1.5,
    atrAtEntry: 1,
    atrPctAtEntry: 1,
    rsiAtEntry: direction === "LONG" ? 60 : 40,
    volumeRatioAtEntry: 1,
    qualityScore: 50,
    qualityFactors: factors,
    feature: {
      localTrend: direction === "LONG" ? "bullish" : "bearish",
      localEmaDirection: direction,
      localStructure: direction === "LONG" ? "higher_high_and_higher_low" : "lower_high_and_lower_low",
      volatilityRegime: "NORMAL",
      volatilityPercentile: 0.5,
      htf1hDirection: direction,
      htf4hDirection: direction,
      trendRegime: "ALIGNED_TREND",
      extensionAtr: 0.5,
      directionalMoveAtr: 0.5,
      volumeRatio: 1,
      bodyRatio: 0.5,
      breakoutDirect: false,
      breakoutConfirmed: false,
      breakoutRetest: false,
      pullbackContinuation: true,
      momentumConfirmed: true,
      structureRejection: false,
      utcHour: 12,
      argBraHour: 9,
    },
    v6: { evaluatedAt, fourHourVolatilityPercentile: 0.5 },
  };
}

function emptyFeatures(): V7FeatureVector {
  return Object.fromEntries(V7_FEATURE_IDS.map((id) => [id, 0])) as V7FeatureVector;
}

function fakeEntry(trendQuality: number): V7Entry {
  const base = baseV6Entry(28, "2026-01-01T02:24:59.999Z", "LONG");
  const features = emptyFeatures();
  features.TREND_QUALITY = trendQuality;
  return {
    ...base,
    v7: {
      htf15mDirection: "LONG",
      nearestMtfState: "ALIGNED",
      stackedMtfState: "ALIGNED",
      trendRegime: "TREND_UP",
      volatilityRegime: "NORMAL_VOLATILITY",
      volatilityEvolution: "VOLATILITY_STABLE",
      volatilityChangeRatio: 1,
      sessions: ["ASIA", "WEEKDAY"],
      weekend: false,
      features,
    },
  };
}

function labeled(trendQuality: number, netR: number, outcome: "WIN" | "LOSS" | "EXPIRED" = netR > 0.5 ? "WIN" : "EXPIRED"): V7LabeledPoint {
  const entry = fakeEntry(trendQuality);
  const trade = { ...entry, outcome } as unknown as V7Trade;
  return { entry, trade, netR5Bps: netR };
}
