import {
  baselineConfiguration,
  evaluateEntry,
  percentile,
  type BacktestTrade,
  type BaselineEntry,
  type ClosedAnalysisCandle,
} from "./signal-backtest";
import type { SignalDirection } from "./signal-engine";
import {
  V8_FAMILIES,
  V8_PREREGISTRATION,
  type V8Family,
  type V8Timeframe,
} from "./signal-strategy-v8-snapshot";

const MISSING = Number.NaN;

export type V8IndicatorSeries = {
  ema9: number[];
  ema21: number[];
  ema55: number[];
  atr14: number[];
  rsi14: number[];
  macd: number[];
  macdSignal: number[];
  macdHistogram: number[];
  bollingerMiddle: number[];
  bollingerUpper: number[];
  bollingerLower: number[];
  bollingerBandwidth: number[];
  volumeRatio: number[];
};

export type V8Entry = BaselineEntry & {
  v8: {
    family: V8Family;
    detectedAt: string;
    stopAtr: number;
    diagnostics: Record<string, number | string | boolean | null>;
  };
};

export function isV8CandleClosed(closeTime: string | number | Date, observedAt: Date): boolean {
  const value = closeTime instanceof Date ? closeTime.getTime() : typeof closeTime === "number" ? closeTime : Date.parse(closeTime);
  return Number.isFinite(value) && value <= observedAt.getTime();
}

type PendingRetest = {
  direction: SignalDirection;
  createdIndex: number;
  expiresIndex: number;
  level: number;
  stopAnchor: number;
};

type PendingDivergence = PendingRetest & { pivotIndex: number };

export function calculateV8Indicators(candles: ClosedAnalysisCandle[]): V8IndicatorSeries {
  const closes = candles.map((candle) => candle.close);
  const ema9 = emaSeries(closes, 9);
  const ema21 = emaSeries(closes, 21);
  const ema55 = emaSeries(closes, 55);
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macd = closes.map((_, index) => finite(ema12[index]) && finite(ema26[index]) ? ema12[index] - ema26[index] : MISSING);
  const macdSignal = emaValidSeries(macd, 9);
  const macdHistogram = macd.map((value, index) => finite(value) && finite(macdSignal[index]) ? value - macdSignal[index] : MISSING);
  const bollinger = bollingerSeries(closes, 20, 2);
  return {
    ema9,
    ema21,
    ema55,
    atr14: atrSeries(candles, 14),
    rsi14: rsiSeries(closes, 14),
    macd,
    macdSignal,
    macdHistogram,
    bollingerMiddle: bollinger.middle,
    bollingerUpper: bollinger.upper,
    bollingerLower: bollinger.lower,
    bollingerBandwidth: bollinger.bandwidth,
    volumeRatio: volumeRatioSeries(candles, 20),
  };
}

export function generateV8Entries(input: {
  candles: ClosedAnalysisCandle[];
  timeframe: V8Timeframe;
  analysisStart: Date;
  observedAt: Date;
}): Record<V8Family, V8Entry[]> {
  const { candles, timeframe } = input;
  const indicators = calculateV8Indicators(candles);
  const entries: Record<V8Family, V8Entry[]> = {
    BOS_RETEST_TREND: [],
    CHOCH_CONFIRMATION: [],
    BB_MACD_SQUEEZE: [],
    TRIPLE_EMA_PULLBACK: [],
    RSI_DIVERGENCE_STRUCTURE: [],
    ORDER_BLOCK_RETEST: [],
  };
  let previousHigh = -1;
  let lastHigh = -1;
  let previousLow = -1;
  let lastLow = -1;
  let pendingBos: PendingRetest | null = null;
  let pendingOrderBlock: PendingRetest | null = null;
  let pendingDivergence: PendingDivergence | null = null;

  for (let index = 100; index < candles.length; index += 1) {
    const candle = candles[index];
    const closeTime = Date.parse(candle.closeTime);
    if (!Number.isFinite(closeTime)) throw new Error(`Invalid closeTime at candle ${index}.`);
    if (!isV8CandleClosed(closeTime, input.observedAt)) continue;

    const confirmedPivot = index - 2;
    if (confirmedPivot >= 2 && isPivotHigh(candles, confirmedPivot, 2, 2)) {
      previousHigh = lastHigh;
      lastHigh = confirmedPivot;
      if (previousHigh >= 0 && finite(indicators.rsi14[lastHigh]) && finite(indicators.rsi14[previousHigh])) {
        const priceHigher = candles[lastHigh].high > candles[previousHigh].high;
        const rsiLower = indicators.rsi14[lastHigh] <= indicators.rsi14[previousHigh] - 3;
        if (priceHigher && rsiLower) {
          pendingDivergence = {
            direction: "SHORT",
            createdIndex: index,
            expiresIndex: index + 6,
            pivotIndex: lastHigh,
            level: minimumLow(candles, previousHigh, lastHigh),
            stopAnchor: candles[lastHigh].high,
          };
        }
      }
    }
    if (confirmedPivot >= 2 && isPivotLow(candles, confirmedPivot, 2, 2)) {
      previousLow = lastLow;
      lastLow = confirmedPivot;
      if (previousLow >= 0 && finite(indicators.rsi14[lastLow]) && finite(indicators.rsi14[previousLow])) {
        const priceLower = candles[lastLow].low < candles[previousLow].low;
        const rsiHigher = indicators.rsi14[lastLow] >= indicators.rsi14[previousLow] + 3;
        if (priceLower && rsiHigher) {
          pendingDivergence = {
            direction: "LONG",
            createdIndex: index,
            expiresIndex: index + 6,
            pivotIndex: lastLow,
            level: maximumHigh(candles, previousLow, lastLow),
            stopAnchor: candles[lastLow].low,
          };
        }
      }
    }

    if (Date.parse(candle.timestamp) < input.analysisStart.getTime()) continue;
    const atr = indicators.atr14[index];
    if (!finite(atr) || atr <= 0 || lastHigh < 0 || lastLow < 0) continue;

    pendingBos = processBosRetest(pendingBos, candles, indicators, timeframe, entries, index, atr);
    pendingOrderBlock = processOrderBlockRetest(pendingOrderBlock, candles, indicators, timeframe, entries, index, atr);
    pendingDivergence = processDivergence(pendingDivergence, candles, indicators, timeframe, entries, index, atr);

    const previousCandle = candles[index - 1];
    const trendUp = indicators.ema21[index] > indicators.ema55[index];
    const trendDown = indicators.ema21[index] < indicators.ema55[index];
    const breaksHigh = previousCandle.close <= candles[lastHigh].high && candle.close > candles[lastHigh].high;
    const breaksLow = previousCandle.close >= candles[lastLow].low && candle.close < candles[lastLow].low;

    if (breaksHigh && trendUp) {
      pendingBos = { direction: "LONG", createdIndex: index, expiresIndex: index + 3, level: candles[lastHigh].high, stopAnchor: candles[lastLow].low };
    } else if (breaksLow && trendDown) {
      pendingBos = { direction: "SHORT", createdIndex: index, expiresIndex: index + 3, level: candles[lastLow].low, stopAnchor: candles[lastHigh].high };
    }

    const structure = structureState(candles, previousHigh, lastHigh, previousLow, lastLow);
    if (structure === "UP" && breaksLow && indicators.macdHistogram[index] < 0) {
      pushEntry(entries.CHOCH_CONFIRMATION, makeEntry(candles, indicators, timeframe, "CHOCH_CONFIRMATION", "SHORT", index, candles[lastHigh].high, { structure }));
    } else if (structure === "DOWN" && breaksHigh && indicators.macdHistogram[index] > 0) {
      pushEntry(entries.CHOCH_CONFIRMATION, makeEntry(candles, indicators, timeframe, "CHOCH_CONFIRMATION", "LONG", index, candles[lastLow].low, { structure }));
    }

    detectBollingerMacd(candles, indicators, timeframe, entries, index);
    detectTripleEma(candles, indicators, timeframe, entries, index);

    const bodyAtr = Math.abs(candle.close - candle.open) / atr;
    const rangeAtr = (candle.high - candle.low) / atr;
    const volumeRatio = indicators.volumeRatio[index];
    if (bodyAtr >= 1.5 && rangeAtr >= 1.8 && volumeRatio >= 1.3) {
      if (breaksHigh && candle.close > candle.open) {
        const opposite = lastOppositeCandle(candles, index, "LONG", 5);
        if (opposite !== null) pendingOrderBlock = { direction: "LONG", createdIndex: index, expiresIndex: index + 6, level: candles[opposite].open, stopAnchor: candles[opposite].low };
      } else if (breaksLow && candle.close < candle.open) {
        const opposite = lastOppositeCandle(candles, index, "SHORT", 5);
        if (opposite !== null) pendingOrderBlock = { direction: "SHORT", createdIndex: index, expiresIndex: index + 6, level: candles[opposite].open, stopAnchor: candles[opposite].high };
      }
    }
  }
  return entries;
}

export function evaluateV8Entries(candles: ClosedAnalysisCandle[], entries: V8Entry[]): BacktestTrade[] {
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

function processBosRetest(
  pending: PendingRetest | null,
  candles: ClosedAnalysisCandle[],
  indicators: V8IndicatorSeries,
  timeframe: V8Timeframe,
  entries: Record<V8Family, V8Entry[]>,
  index: number,
  atr: number,
): PendingRetest | null {
  if (pending === null || index <= pending.createdIndex) return pending;
  if (index > pending.expiresIndex) return null;
  const candle = candles[index];
  const tolerance = atr * 0.15;
  const valid = pending.direction === "LONG"
    ? candle.low <= pending.level + tolerance && candle.close > pending.level && candle.close > candle.open
    : candle.high >= pending.level - tolerance && candle.close < pending.level && candle.close < candle.open;
  if (!valid) return pending;
  pushEntry(entries.BOS_RETEST_TREND, makeEntry(candles, indicators, timeframe, "BOS_RETEST_TREND", pending.direction, index, pending.stopAnchor, { breakLevel: pending.level }));
  return null;
}

function processOrderBlockRetest(
  pending: PendingRetest | null,
  candles: ClosedAnalysisCandle[],
  indicators: V8IndicatorSeries,
  timeframe: V8Timeframe,
  entries: Record<V8Family, V8Entry[]>,
  index: number,
  _atr: number,
): PendingRetest | null {
  if (pending === null || index <= pending.createdIndex) return pending;
  if (index > pending.expiresIndex) return null;
  const candle = candles[index];
  const valid = pending.direction === "LONG"
    ? candle.low <= pending.level && candle.close > pending.level && candle.close > candle.open
    : candle.high >= pending.level && candle.close < pending.level && candle.close < candle.open;
  if (!valid) return pending;
  pushEntry(entries.ORDER_BLOCK_RETEST, makeEntry(candles, indicators, timeframe, "ORDER_BLOCK_RETEST", pending.direction, index, pending.stopAnchor, { orderBlockLevel: pending.level }));
  return null;
}

function processDivergence(
  pending: PendingDivergence | null,
  candles: ClosedAnalysisCandle[],
  indicators: V8IndicatorSeries,
  timeframe: V8Timeframe,
  entries: Record<V8Family, V8Entry[]>,
  index: number,
  _atr: number,
): PendingDivergence | null {
  if (pending === null || index < pending.createdIndex) return pending;
  if (index > pending.expiresIndex) return null;
  const candle = candles[index];
  const previous = candles[Math.max(0, index - 1)];
  const breaks = pending.direction === "LONG"
    ? previous.close <= pending.level && candle.close > pending.level
    : previous.close >= pending.level && candle.close < pending.level;
  if (!breaks) return pending;
  pushEntry(entries.RSI_DIVERGENCE_STRUCTURE, makeEntry(candles, indicators, timeframe, "RSI_DIVERGENCE_STRUCTURE", pending.direction, index, pending.stopAnchor, { neckline: pending.level, pivotIndex: pending.pivotIndex }));
  return null;
}

function detectBollingerMacd(
  candles: ClosedAnalysisCandle[],
  indicators: V8IndicatorSeries,
  timeframe: V8Timeframe,
  entries: Record<V8Family, V8Entry[]>,
  index: number,
): void {
  const current = candles[index];
  const previous = candles[index - 1];
  const hist = indicators.macdHistogram[index];
  const previousHist = indicators.macdHistogram[index - 1];
  const volumeRatio = indicators.volumeRatio[index];
  const upper = indicators.bollingerUpper[index];
  const lower = indicators.bollingerLower[index];
  if (![hist, previousHist, volumeRatio, upper, lower].every(finite) || volumeRatio < 1.2) return;
  const history = indicators.bollingerBandwidth.slice(index - 100, index).filter(finite);
  const recent = indicators.bollingerBandwidth.slice(index - 20, index).filter(finite);
  const threshold = percentile(history, 0.2);
  if (threshold === null || recent.length === 0 || Math.min(...recent) > threshold) return;
  if (current.close > upper && previous.close <= indicators.bollingerUpper[index - 1] && hist > 0 && hist > previousHist) {
    pushEntry(entries.BB_MACD_SQUEEZE, makeEntry(candles, indicators, timeframe, "BB_MACD_SQUEEZE", "LONG", index, indicators.bollingerMiddle[index], { squeezeThreshold: threshold, volumeRatio }));
  } else if (current.close < lower && previous.close >= indicators.bollingerLower[index - 1] && hist < 0 && hist < previousHist) {
    pushEntry(entries.BB_MACD_SQUEEZE, makeEntry(candles, indicators, timeframe, "BB_MACD_SQUEEZE", "SHORT", index, indicators.bollingerMiddle[index], { squeezeThreshold: threshold, volumeRatio }));
  }
}

function detectTripleEma(
  candles: ClosedAnalysisCandle[],
  indicators: V8IndicatorSeries,
  timeframe: V8Timeframe,
  entries: Record<V8Family, V8Entry[]>,
  index: number,
): void {
  const candle = candles[index];
  const previous = candles[index - 1];
  const atr = indicators.atr14[index];
  const rsi = indicators.rsi14[index];
  const hist = indicators.macdHistogram[index];
  if (![atr, rsi, hist, indicators.ema9[index], indicators.ema21[index], indicators.ema55[index], indicators.ema21[index - 3], indicators.ema55[index - 3]].every(finite)) return;
  const longAligned = indicators.ema9[index] > indicators.ema21[index] && indicators.ema21[index] > indicators.ema55[index]
    && indicators.ema21[index] > indicators.ema21[index - 3] && indicators.ema55[index] > indicators.ema55[index - 3];
  const shortAligned = indicators.ema9[index] < indicators.ema21[index] && indicators.ema21[index] < indicators.ema55[index]
    && indicators.ema21[index] < indicators.ema21[index - 3] && indicators.ema55[index] < indicators.ema55[index - 3];
  const extension = Math.abs(candle.close - indicators.ema21[index]) / atr;
  if (extension > 1) return;
  if (longAligned && previous.low <= indicators.ema21[index - 1] + atr * 0.25 && candle.close > indicators.ema9[index] && candle.close > candle.open && rsi >= 52 && rsi <= 68 && hist > 0) {
    pushEntry(entries.TRIPLE_EMA_PULLBACK, makeEntry(candles, indicators, timeframe, "TRIPLE_EMA_PULLBACK", "LONG", index, minimumLow(candles, Math.max(0, index - 5), index), { rsi, extension }));
  } else if (shortAligned && previous.high >= indicators.ema21[index - 1] - atr * 0.25 && candle.close < indicators.ema9[index] && candle.close < candle.open && rsi >= 32 && rsi <= 48 && hist < 0) {
    pushEntry(entries.TRIPLE_EMA_PULLBACK, makeEntry(candles, indicators, timeframe, "TRIPLE_EMA_PULLBACK", "SHORT", index, maximumHigh(candles, Math.max(0, index - 5), index), { rsi, extension }));
  }
}

function makeEntry(
  candles: ClosedAnalysisCandle[],
  indicators: V8IndicatorSeries,
  timeframe: V8Timeframe,
  family: V8Family,
  direction: SignalDirection,
  index: number,
  stopAnchor: number,
  diagnostics: Record<string, number | string | boolean | null>,
): V8Entry | null {
  const candle = candles[index];
  const atr = indicators.atr14[index];
  if (!finite(atr) || atr <= 0 || !finite(stopAnchor)) return null;
  const rawRisk = direction === "LONG" ? candle.close - stopAnchor : stopAnchor - candle.close;
  const minimumRisk = atr * V8_PREREGISTRATION.commonRisk.minimumStopAtr;
  const risk = Math.max(rawRisk + atr * V8_PREREGISTRATION.commonRisk.structuralBufferAtr, minimumRisk);
  const stopAtr = risk / atr;
  if (!finite(risk) || risk <= 0 || stopAtr > V8_PREREGISTRATION.commonRisk.maximumStopAtr) return null;
  const stopLoss = direction === "LONG" ? candle.close - risk : candle.close + risk;
  const takeProfit = direction === "LONG"
    ? candle.close + risk * V8_PREREGISTRATION.commonRisk.rewardRisk
    : candle.close - risk * V8_PREREGISTRATION.commonRisk.rewardRisk;
  return {
    timeframe,
    direction,
    entryIndex: index,
    openedAt: candle.closeTime,
    entryPrice: candle.close,
    baselineStopLoss: stopLoss,
    baselineTakeProfit: takeProfit,
    baselineRiskReward: V8_PREREGISTRATION.commonRisk.rewardRisk,
    atrAtEntry: atr,
    atrPctAtEntry: atr / candle.close * 100,
    rsiAtEntry: finite(indicators.rsi14[index]) ? indicators.rsi14[index] : null,
    volumeRatioAtEntry: finite(indicators.volumeRatio[index]) ? indicators.volumeRatio[index] : null,
    v8: { family, detectedAt: candle.closeTime, stopAtr, diagnostics },
  };
}

function pushEntry(target: V8Entry[], entry: V8Entry | null): void {
  if (entry === null) return;
  if (target.at(-1)?.entryIndex === entry.entryIndex) return;
  target.push(entry);
}

function structureState(candles: ClosedAnalysisCandle[], previousHigh: number, lastHigh: number, previousLow: number, lastLow: number): "UP" | "DOWN" | "MIXED" {
  if ([previousHigh, lastHigh, previousLow, lastLow].some((value) => value < 0)) return "MIXED";
  if (candles[lastHigh].high > candles[previousHigh].high && candles[lastLow].low > candles[previousLow].low) return "UP";
  if (candles[lastHigh].high < candles[previousHigh].high && candles[lastLow].low < candles[previousLow].low) return "DOWN";
  return "MIXED";
}

function isPivotHigh(candles: ClosedAnalysisCandle[], index: number, left: number, right: number): boolean {
  const value = candles[index].high;
  for (let offset = -left; offset <= right; offset += 1) if (offset !== 0 && candles[index + offset].high >= value) return false;
  return true;
}

function isPivotLow(candles: ClosedAnalysisCandle[], index: number, left: number, right: number): boolean {
  const value = candles[index].low;
  for (let offset = -left; offset <= right; offset += 1) if (offset !== 0 && candles[index + offset].low <= value) return false;
  return true;
}

function lastOppositeCandle(candles: ClosedAnalysisCandle[], index: number, direction: SignalDirection, lookback: number): number | null {
  for (let candidate = index - 1; candidate >= Math.max(0, index - lookback); candidate -= 1) {
    const bearish = candles[candidate].close < candles[candidate].open;
    if ((direction === "LONG" && bearish) || (direction === "SHORT" && !bearish && candles[candidate].close > candles[candidate].open)) return candidate;
  }
  return null;
}

function minimumLow(candles: ClosedAnalysisCandle[], start: number, end: number): number {
  let value = Number.POSITIVE_INFINITY;
  for (let index = start; index <= end; index += 1) value = Math.min(value, candles[index].low);
  return value;
}

function maximumHigh(candles: ClosedAnalysisCandle[], start: number, end: number): number {
  let value = Number.NEGATIVE_INFINITY;
  for (let index = start; index <= end; index += 1) value = Math.max(value, candles[index].high);
  return value;
}

function emaSeries(values: number[], period: number): number[] {
  const result = Array(values.length).fill(MISSING) as number[];
  if (values.length < period) return result;
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = current;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    current = (values[index] - current) * multiplier + current;
    result[index] = current;
  }
  return result;
}

function emaValidSeries(values: number[], period: number): number[] {
  const result = Array(values.length).fill(MISSING) as number[];
  const first = values.findIndex(finite);
  if (first < 0 || first + period > values.length) return result;
  let current = values.slice(first, first + period).reduce((sum, value) => sum + value, 0) / period;
  result[first + period - 1] = current;
  const multiplier = 2 / (period + 1);
  for (let index = first + period; index < values.length; index += 1) {
    if (!finite(values[index])) continue;
    current = (values[index] - current) * multiplier + current;
    result[index] = current;
  }
  return result;
}

function atrSeries(candles: ClosedAnalysisCandle[], period: number): number[] {
  const result = Array(candles.length).fill(MISSING) as number[];
  if (candles.length <= period) return result;
  const tr = candles.map((candle, index) => index === 0 ? candle.high - candle.low : Math.max(candle.high - candle.low, Math.abs(candle.high - candles[index - 1].close), Math.abs(candle.low - candles[index - 1].close)));
  let current = tr.slice(1, period + 1).reduce((sum, value) => sum + value, 0) / period;
  result[period] = current;
  for (let index = period + 1; index < candles.length; index += 1) {
    current = (current * (period - 1) + tr[index]) / period;
    result[index] = current;
  }
  return result;
}

function rsiSeries(values: number[], period: number): number[] {
  const result = Array(values.length).fill(MISSING) as number[];
  if (values.length <= period) return result;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  gain /= period;
  loss /= period;
  result[period] = rsiValue(gain, loss);
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = rsiValue(gain, loss);
  }
  return result;
}

function rsiValue(gain: number, loss: number): number {
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

function bollingerSeries(values: number[], period: number, deviations: number): { middle: number[]; upper: number[]; lower: number[]; bandwidth: number[] } {
  const middle = Array(values.length).fill(MISSING) as number[];
  const upper = Array(values.length).fill(MISSING) as number[];
  const lower = Array(values.length).fill(MISSING) as number[];
  const bandwidth = Array(values.length).fill(MISSING) as number[];
  let sum = 0;
  let sumSquares = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    sumSquares += values[index] ** 2;
    if (index >= period) {
      sum -= values[index - period];
      sumSquares -= values[index - period] ** 2;
    }
    if (index < period - 1) continue;
    const mean = sum / period;
    const variance = Math.max(0, sumSquares / period - mean ** 2);
    const deviation = Math.sqrt(variance);
    middle[index] = mean;
    upper[index] = mean + deviations * deviation;
    lower[index] = mean - deviations * deviation;
    bandwidth[index] = mean === 0 ? MISSING : (upper[index] - lower[index]) / mean;
  }
  return { middle, upper, lower, bandwidth };
}

function volumeRatioSeries(candles: ClosedAnalysisCandle[], period: number): number[] {
  const result = Array(candles.length).fill(MISSING) as number[];
  let sum = 0;
  let missing = 0;
  for (let index = 0; index < candles.length; index += 1) {
    const volume = candles[index].volume;
    if (volume === null) missing += 1;
    else sum += volume;
    if (index >= period) {
      const removed = candles[index - period].volume;
      if (removed === null) missing -= 1;
      else sum -= removed;
    }
    const currentVolume = candles[index].volume;
    if (index >= period - 1 && missing === 0 && currentVolume !== null) {
      const average = sum / period;
      result[index] = average === 0 ? MISSING : currentVolume / average;
    }
  }
  return result;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}
