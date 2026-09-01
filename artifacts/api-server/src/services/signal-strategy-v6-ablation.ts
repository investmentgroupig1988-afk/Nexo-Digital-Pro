import {
  baselineConfiguration,
  causalVolatilityRegime,
  evaluateEntry,
  type BacktestTrade,
  type BaselineEntry,
  type ClosedAnalysisCandle,
} from "./signal-backtest";
import { evaluateSignal, MINIMUM_RISK_REWARD, type SignalDirection } from "./signal-engine";
import type { HistoricalTimeframe } from "./historical";
import { calculateTechnicalAnalysis, type TechnicalAnalysisResult } from "./technical";
import { V6_ABLATIONS, type V6Ablation } from "./signal-strategy-v6-snapshot";

export type V6AblationGeneration = {
  entries: Record<V6Ablation, BaselineEntry[]>;
  baselineSignalsCompared: number;
  baselineDirectionMismatches: number;
  baselineGeometryMismatches: number;
  baselineParityMismatches: number;
  firstMismatch: Record<string, unknown> | null;
};

export function generateV6AblationEntries(input: {
  candles: ClosedAnalysisCandle[];
  timeframe: Exclude<HistoricalTimeframe, "1m">;
  analysisStart: Date;
}): V6AblationGeneration {
  const entries: Record<V6Ablation, BaselineEntry[]> = {
    WITHOUT_VOLUME: [],
    WITHOUT_RSI_BAND: [],
    WITHOUT_EMA_STACK: [],
    WITHOUT_STRUCTURE: [],
    WITHOUT_FIBONACCI_DIRECTION: [],
  };
  let baselineSignalsCompared = 0;
  let baselineDirectionMismatches = 0;
  let baselineGeometryMismatches = 0;
  let firstMismatch: Record<string, unknown> | null = null;
  for (let index = 199; index < input.candles.length; index += 1) {
    const candle = input.candles[index];
    if (Date.parse(candle.timestamp) < input.analysisStart.getTime()) continue;
    const window = input.candles.slice(index - 199, index + 1);
    const technical = calculateTechnicalAnalysis(window, "binance");
    const live = evaluateSignal({ symbol: "BTCUSDT", timeframe: input.timeframe, candles: window, technical });
    const rawMirror = researchDirection(candle, technical, null);
    const parity = rawMirror === null
      ? null
      : buildV6ResearchEntry(candle, technical, rawMirror, input.timeframe, index, window);
    const mirror = parity?.direction ?? null;
    if (live.outcome !== "NO_SIGNAL") baselineSignalsCompared += 1;
    if ((live.outcome === "NO_SIGNAL" ? null : live.outcome) !== mirror) {
      baselineDirectionMismatches += 1;
      firstMismatch ??= {
        kind: "DIRECTION",
        timestamp: candle.timestamp,
        live: live.outcome,
        liveReason: live.outcome === "NO_SIGNAL" ? live.reason : null,
        mirror,
      };
    }
    if (live.outcome !== "NO_SIGNAL" && parity !== null) {
      if (parity.entryPrice !== live.entryPrice
        || parity.baselineStopLoss !== live.stopLoss
        || parity.baselineTakeProfit !== live.takeProfit
        || parity.baselineRiskReward !== live.riskRewardRatio) {
        baselineGeometryMismatches += 1;
        firstMismatch ??= {
          kind: "GEOMETRY",
          timestamp: candle.timestamp,
          live: { entryPrice: live.entryPrice, stopLoss: live.stopLoss, takeProfit: live.takeProfit, riskRewardRatio: live.riskRewardRatio },
          mirror: parity,
        };
      }
    }
    for (const ablation of V6_ABLATIONS) {
      const direction = researchDirection(candle, technical, ablation);
      if (direction === null) continue;
      const entry = buildV6ResearchEntry(candle, technical, direction, input.timeframe, index, window);
      if (entry !== null) entries[ablation].push(entry);
    }
  }
  return {
    entries,
    baselineSignalsCompared,
    baselineDirectionMismatches,
    baselineGeometryMismatches,
    baselineParityMismatches: baselineDirectionMismatches + baselineGeometryMismatches,
    firstMismatch,
  };
}

export function evaluateV6AblationEntries(
  candles: ClosedAnalysisCandle[],
  entries: BaselineEntry[],
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  let nextEligibleIndex = 0;
  for (const entry of entries) {
    if (entry.entryIndex < nextEligibleIndex) continue;
    const trade = evaluateEntry(candles, entry, baselineConfiguration());
    trades.push(trade);
    nextEligibleIndex = trade.durationCandles === null
      ? candles.length
      : entry.entryIndex + Math.max(1, trade.durationCandles);
  }
  return trades;
}

export function researchDirection(
  latest: ClosedAnalysisCandle,
  technical: TechnicalAnalysisResult,
  ablation: V6Ablation | null,
): SignalDirection | null {
  if (technical.status !== "OK" || !technical.dataQuality.sufficient) return null;
  const { indicators, marketStructure, fibonacci } = technical;
  const required = [indicators.ema20, indicators.ema50, indicators.ema200, indicators.rsi14, indicators.atr14];
  if (required.some((value) => value === null) || indicators.atr14! <= 0) return null;
  const volume = ablation === "WITHOUT_VOLUME" || indicators.volumeRatio === null || indicators.volumeRatio >= 1;
  const longStructure = ablation === "WITHOUT_STRUCTURE"
    || (marketStructure.trend === "bullish" && marketStructure.structure === "higher_high_and_higher_low");
  const shortStructure = ablation === "WITHOUT_STRUCTURE"
    || (marketStructure.trend === "bearish" && marketStructure.structure === "lower_high_and_lower_low");
  const longEma = ablation === "WITHOUT_EMA_STACK" || (indicators.ema20! > indicators.ema50! && indicators.ema50! > indicators.ema200!);
  const shortEma = ablation === "WITHOUT_EMA_STACK" || (indicators.ema20! < indicators.ema50! && indicators.ema50! < indicators.ema200!);
  const longRsi = ablation === "WITHOUT_RSI_BAND" || (indicators.rsi14! >= 52 && indicators.rsi14! <= 70);
  const shortRsi = ablation === "WITHOUT_RSI_BAND" || (indicators.rsi14! >= 30 && indicators.rsi14! <= 48);
  const longFibonacci = ablation === "WITHOUT_FIBONACCI_DIRECTION" || fibonacci.direction === "uptrend";
  const shortFibonacci = ablation === "WITHOUT_FIBONACCI_DIRECTION" || fibonacci.direction === "downtrend";
  const long = longStructure && longEma && latest.close > indicators.ema20! && longRsi && longFibonacci && volume;
  const short = shortStructure && shortEma && latest.close < indicators.ema20! && shortRsi && shortFibonacci && volume;
  return long === short ? null : long ? "LONG" : "SHORT";
}

export function buildV6ResearchEntry(
  candle: ClosedAnalysisCandle,
  technical: TechnicalAnalysisResult,
  direction: SignalDirection,
  timeframe: Exclude<HistoricalTimeframe, "1m">,
  entryIndex: number,
  window: ClosedAnalysisCandle[],
): BaselineEntry | null {
  const entryPrice = candle.close;
  const atr = technical.indicators.atr14!;
  const atrRisk = atr * 1.5;
  const structuralStop = direction === "LONG" ? technical.marketStructure.support : technical.marketStructure.resistance;
  const stopLoss = direction === "LONG"
    ? Math.min(entryPrice - atrRisk, structuralStop && structuralStop < entryPrice ? structuralStop : entryPrice - atrRisk)
    : Math.max(entryPrice + atrRisk, structuralStop && structuralStop > entryPrice ? structuralStop : entryPrice + atrRisk);
  const risk = Math.abs(entryPrice - stopLoss);
  if (!Number.isFinite(risk) || risk <= 0) return null;
  const takeProfit = direction === "LONG" ? entryPrice + risk * 1.5 : entryPrice - risk * 1.5;
  const riskReward = Math.abs(takeProfit - entryPrice) / risk;
  if (riskReward < MINIMUM_RISK_REWARD) return null;
  return {
    timeframe,
    direction,
    entryIndex,
    openedAt: new Date(candle.timestamp).toISOString(),
    entryPrice: round(entryPrice),
    baselineStopLoss: round(stopLoss),
    baselineTakeProfit: round(takeProfit),
    baselineRiskReward: round(riskReward),
    atrAtEntry: atr,
    atrPctAtEntry: atr / entryPrice * 100,
    rsiAtEntry: technical.indicators.rsi14,
    volumeRatioAtEntry: technical.indicators.volumeRatio,
    ...causalVolatilityRegime(window),
  };
}

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}
