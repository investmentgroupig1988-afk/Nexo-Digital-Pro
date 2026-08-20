import { createHash } from "node:crypto";
import type { HistoricalCandle, HistoricalTimeframe } from "./historical";
import type { TechnicalAnalysisResult } from "./technical";

export const SIGNAL_STRATEGY_VERSION = "NEXO_CONFLUENCE_V1";
export const MINIMUM_RISK_REWARD = 1.5;
export const SIGNAL_EXPIRATION_CANDLES = 12;

export type SignalDirection = "LONG" | "SHORT";
export type SignalEvaluation =
  | { outcome: "NO_SIGNAL"; reason: string; context: SignalContext }
  | {
      outcome: SignalDirection;
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      riskRewardRatio: number;
      openedAt: Date;
      expiresAt: Date;
      configurationFingerprint: string;
      snapshot: Record<string, unknown>;
      context: SignalContext;
    };

export type SignalContext = {
  trend: "bullish" | "bearish" | "sideways" | null;
  condition: "trending" | "mixed" | "insufficient_data";
  strength: "high" | "medium" | "low";
};

const timeframeMilliseconds: Record<HistoricalTimeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};

export function evaluateSignal(input: {
  symbol: "BTCUSDT";
  timeframe: HistoricalTimeframe;
  candles: HistoricalCandle[];
  technical: TechnicalAnalysisResult;
}): SignalEvaluation {
  const { candles, technical } = input;
  const latest = candles.at(-1);
  const { indicators, marketStructure, fibonacci } = technical;
  const context = marketContext(technical);
  if (!latest || technical.status !== "OK" || !technical.dataQuality.sufficient) return noSignal("insufficient_data", context);
  const required = [indicators.ema20, indicators.ema50, indicators.ema200, indicators.rsi14, indicators.atr14];
  if (required.some((value) => value === null) || indicators.atr14! <= 0) return noSignal("missing_indicators", context);

  const volumeConfirms = indicators.volumeRatio === null || indicators.volumeRatio >= 1;
  const long = marketStructure.trend === "bullish"
    && marketStructure.structure === "higher_high_and_higher_low"
    && indicators.ema20! > indicators.ema50!
    && indicators.ema50! > indicators.ema200!
    && latest.close > indicators.ema20!
    && indicators.rsi14! >= 52
    && indicators.rsi14! <= 70
    && fibonacci.direction === "uptrend"
    && volumeConfirms;
  const short = marketStructure.trend === "bearish"
    && marketStructure.structure === "lower_high_and_lower_low"
    && indicators.ema20! < indicators.ema50!
    && indicators.ema50! < indicators.ema200!
    && latest.close < indicators.ema20!
    && indicators.rsi14! >= 30
    && indicators.rsi14! <= 48
    && fibonacci.direction === "downtrend"
    && volumeConfirms;
  if (!long && !short) return noSignal("confluence_not_met", context);

  const direction: SignalDirection = long ? "LONG" : "SHORT";
  const entryPrice = latest.close;
  const atrRisk = indicators.atr14! * 1.5;
  const structuralStop = direction === "LONG" ? marketStructure.support : marketStructure.resistance;
  const stopLoss = direction === "LONG"
    ? Math.min(entryPrice - atrRisk, structuralStop && structuralStop < entryPrice ? structuralStop : entryPrice - atrRisk)
    : Math.max(entryPrice + atrRisk, structuralStop && structuralStop > entryPrice ? structuralStop : entryPrice + atrRisk);
  const risk = Math.abs(entryPrice - stopLoss);
  if (!Number.isFinite(risk) || risk <= 0) return noSignal("invalid_risk", context);
  const takeProfit = direction === "LONG" ? entryPrice + risk * MINIMUM_RISK_REWARD : entryPrice - risk * MINIMUM_RISK_REWARD;
  const riskRewardRatio = Math.abs(takeProfit - entryPrice) / risk;
  if (riskRewardRatio < MINIMUM_RISK_REWARD) return noSignal("risk_reward_below_minimum", context);

  const openedAt = new Date(latest.timestamp);
  const expiresAt = new Date(openedAt.getTime() + timeframeMilliseconds[input.timeframe] * SIGNAL_EXPIRATION_CANDLES);
  const configurationFingerprint = createHash("sha256").update([
    input.symbol, input.timeframe, SIGNAL_STRATEGY_VERSION, direction, latest.timestamp,
    round(entryPrice), round(stopLoss), round(takeProfit), marketStructure.structure,
  ].join(":" )).digest("hex");
  return {
    outcome: direction,
    entryPrice: round(entryPrice),
    stopLoss: round(stopLoss),
    takeProfit: round(takeProfit),
    riskRewardRatio: round(riskRewardRatio),
    openedAt,
    expiresAt,
    configurationFingerprint,
    context,
    snapshot: {
      strategyVersion: SIGNAL_STRATEGY_VERSION,
      evaluatedCandleTimestamp: latest.timestamp,
      provider: technical.dataQuality.provider,
      candleCount: technical.dataQuality.candleCount,
      indicators,
      fibonacci,
      marketStructure,
    },
  };
}

export function resolveSignal(input: {
  direction: SignalDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: Date;
  expiresAt: Date;
}, candles: HistoricalCandle[], now = new Date()): { status: "OPEN" | "WIN" | "LOSS" | "EXPIRED"; closedAt: Date | null; returnPct: number | null } {
  const eligible = candles.filter((candle) => {
    const timestamp = new Date(candle.timestamp);
    return timestamp > input.openedAt && timestamp <= input.expiresAt;
  });
  for (const candle of eligible) {
    const hitsTp = input.direction === "LONG" ? candle.high >= input.takeProfit : candle.low <= input.takeProfit;
    const hitsSl = input.direction === "LONG" ? candle.low <= input.stopLoss : candle.high >= input.stopLoss;
    const closedAt = new Date(candle.timestamp);
    if (hitsSl) return { status: "LOSS", closedAt, returnPct: directionalReturn(input.direction, input.entryPrice, input.stopLoss) };
    if (hitsTp) return { status: "WIN", closedAt, returnPct: directionalReturn(input.direction, input.entryPrice, input.takeProfit) };
  }
  if (now >= input.expiresAt) {
    const closing = eligible.at(-1)?.close ?? input.entryPrice;
    return { status: "EXPIRED", closedAt: input.expiresAt, returnPct: directionalReturn(input.direction, input.entryPrice, closing) };
  }
  return { status: "OPEN", closedAt: null, returnPct: null };
}

function marketContext(technical: TechnicalAnalysisResult): SignalContext {
  const trend = technical.marketStructure.trend;
  const aligned = technical.marketStructure.structure === "higher_high_and_higher_low" || technical.marketStructure.structure === "lower_high_and_lower_low";
  const volumeRatio = technical.indicators.volumeRatio;
  return {
    trend,
    condition: technical.status !== "OK" ? "insufficient_data" : trend === "sideways" || !aligned ? "mixed" : "trending",
    strength: aligned && (volumeRatio === null || volumeRatio >= 1.2) ? "high" : trend && trend !== "sideways" ? "medium" : "low",
  };
}

function noSignal(reason: string, context: SignalContext): SignalEvaluation {
  return { outcome: "NO_SIGNAL", reason, context };
}

function directionalReturn(direction: SignalDirection, entry: number, exit: number): number {
  return round((direction === "LONG" ? (exit - entry) / entry : (entry - exit) / entry) * 100);
}

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}
