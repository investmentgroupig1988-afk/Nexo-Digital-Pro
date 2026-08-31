import {
  baselineConfiguration,
  evaluateEntry,
  type BacktestTrade,
  type BaselineEntry,
  type ClosedAnalysisCandle,
} from "./signal-backtest";
import type { SignalDirection } from "./signal-engine";
import { calculateV8Indicators, isV8CandleClosed, type V8IndicatorSeries } from "./signal-strategy-v8";
import {
  V9_FAMILIES,
  V9_PREREGISTRATION,
  type V9Family,
  type V9Timeframe,
} from "./signal-strategy-v9-snapshot";

export type V9Entry = BaselineEntry & {
  v9: {
    family: V9Family;
    detectedAt: string;
    stopAtr: number;
    diagnostics: Record<string, number | string | boolean | null>;
  };
};

export type V9Pivot = {
  index: number;
  type: "HIGH" | "LOW";
  price: number;
};

type PendingPattern = {
  direction: SignalDirection;
  createdIndex: number;
  expiresIndex: number;
  stopAnchor: number;
  levelAt: (index: number) => number;
  diagnostics: Record<string, number | string | boolean | null>;
};

export function generateV9Entries(input: {
  candles: ClosedAnalysisCandle[];
  timeframe: V9Timeframe;
  analysisStart: Date;
  observedAt: Date;
}): Record<V9Family, V9Entry[]> {
  const indicators = calculateV8Indicators(input.candles);
  const entries: Record<V9Family, V9Entry[]> = {
    DOUBLE_TOP_BOTTOM_CONFIRMATION: [],
    HEAD_SHOULDERS_CONFIRMATION: [],
    ABCD_REVERSAL_CONFIRMATION: [],
    BB_RSI_RANGE_REVERSION: [],
  };
  const pivots: V9Pivot[] = [];
  let pendingDouble: PendingPattern | null = null;
  let pendingHeadShoulders: PendingPattern | null = null;
  let pendingAbcd: PendingPattern | null = null;

  for (let index = 100; index < input.candles.length; index += 1) {
    const candle = input.candles[index];
    if (!isV8CandleClosed(candle.closeTime, input.observedAt)) continue;
    const atr = indicators.atr14[index];
    if (!finite(atr) || atr <= 0) continue;

    const confirmedIndex = index - V9_PREREGISTRATION.pivots.rightBars;
    if (confirmedIndex >= V9_PREREGISTRATION.pivots.leftBars) {
      const confirmed = confirmedPivot(input.candles, confirmedIndex);
      if (confirmed !== null && appendCanonicalPivot(pivots, confirmed)) {
        pendingDouble = doublePattern(pivots, atr, index) ?? pendingDouble;
        pendingHeadShoulders = headShouldersPattern(pivots, atr, index) ?? pendingHeadShoulders;
        pendingAbcd = abcdPattern(pivots, input.candles, indicators, index) ?? pendingAbcd;
      }
    }

    if (Date.parse(candle.timestamp) < input.analysisStart.getTime()) continue;
    pendingDouble = confirmPending(pendingDouble, input.candles, indicators, input.timeframe, entries.DOUBLE_TOP_BOTTOM_CONFIRMATION, "DOUBLE_TOP_BOTTOM_CONFIRMATION", index);
    pendingHeadShoulders = confirmPending(pendingHeadShoulders, input.candles, indicators, input.timeframe, entries.HEAD_SHOULDERS_CONFIRMATION, "HEAD_SHOULDERS_CONFIRMATION", index);
    pendingAbcd = confirmPending(pendingAbcd, input.candles, indicators, input.timeframe, entries.ABCD_REVERSAL_CONFIRMATION, "ABCD_REVERSAL_CONFIRMATION", index);
    detectRangeReversion(input.candles, indicators, input.timeframe, entries.BB_RSI_RANGE_REVERSION, index);
  }

  return entries;
}

export function evaluateV9Entries(candles: ClosedAnalysisCandle[], entries: V9Entry[]): BacktestTrade[] {
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

export function matchV9DoublePattern(pivots: V9Pivot[], atr: number): { direction: SignalDirection; neckline: number; stopAnchor: number } | null {
  const [first, middle, second] = alternatingTail(pivots, 3);
  if (!first || !middle || !second || first.type !== second.type || middle.type === first.type) return null;
  const rule = V9_PREREGISTRATION.families.DOUBLE_TOP_BOTTOM_CONFIRMATION;
  const separation = second.index - first.index;
  if (separation < rule.separationBars[0] || separation > rule.separationBars[1]) return null;
  if (Math.abs(first.price - second.price) > atr * rule.peakToleranceAtr) return null;
  const depth = first.type === "HIGH"
    ? Math.min(first.price, second.price) - middle.price
    : middle.price - Math.max(first.price, second.price);
  if (depth < atr * rule.minimumDepthAtr) return null;
  return first.type === "HIGH"
    ? { direction: "SHORT", neckline: middle.price, stopAnchor: Math.max(first.price, second.price) }
    : { direction: "LONG", neckline: middle.price, stopAnchor: Math.min(first.price, second.price) };
}

export function matchV9HeadShoulders(pivots: V9Pivot[], atr: number): {
  direction: SignalDirection;
  stopAnchor: number;
  necklineA: V9Pivot;
  necklineB: V9Pivot;
} | null {
  const points = alternatingTail(pivots, 5);
  if (points.length !== 5) return null;
  const [left, neckA, head, neckB, right] = points;
  if (left.type !== head.type || head.type !== right.type || neckA.type === head.type || neckB.type === head.type) return null;
  const rule = V9_PREREGISTRATION.families.HEAD_SHOULDERS_CONFIRMATION;
  const span = right.index - left.index;
  if (span < rule.spanBars[0] || span > rule.spanBars[1]) return null;
  const leftSpan = head.index - left.index;
  const rightSpan = right.index - head.index;
  const symmetry = leftSpan / rightSpan;
  if (symmetry < rule.symmetryRatio[0] || symmetry > rule.symmetryRatio[1]) return null;
  if (Math.abs(left.price - right.price) > atr * rule.shoulderToleranceAtr) return null;
  const headHeight = head.type === "HIGH"
    ? head.price - Math.max(left.price, right.price)
    : Math.min(left.price, right.price) - head.price;
  if (headHeight < atr * rule.minimumHeadHeightAtr) return null;
  return head.type === "HIGH"
    ? { direction: "SHORT", stopAnchor: head.price, necklineA: neckA, necklineB: neckB }
    : { direction: "LONG", stopAnchor: head.price, necklineA: neckA, necklineB: neckB };
}

export function matchV9Abcd(pivots: V9Pivot[]): {
  direction: SignalDirection;
  stopAnchor: number;
  trigger: number;
  bcRatio: number;
  cdRatio: number;
  dIndex: number;
} | null {
  const points = alternatingTail(pivots, 4);
  if (points.length !== 4) return null;
  const [a, b, c, d] = points;
  const rule = V9_PREREGISTRATION.families.ABCD_REVERSAL_CONFIRMATION;
  const span = d.index - a.index;
  if (span < rule.spanBars[0] || span > rule.spanBars[1]) return null;
  const bearish = a.type === "LOW" && b.type === "HIGH" && c.type === "LOW" && d.type === "HIGH" && c.price > a.price && d.price > b.price;
  const bullish = a.type === "HIGH" && b.type === "LOW" && c.type === "HIGH" && d.type === "LOW" && c.price < a.price && d.price < b.price;
  if (!bearish && !bullish) return null;
  const ab = Math.abs(b.price - a.price);
  const bc = Math.abs(c.price - b.price);
  const cd = Math.abs(d.price - c.price);
  if (ab <= 0) return null;
  const bcRatio = bc / ab;
  const cdRatio = cd / ab;
  if (bcRatio < rule.bcRetracement[0] || bcRatio > rule.bcRetracement[1]) return null;
  if (cdRatio < rule.cdToAb[0] || cdRatio > rule.cdToAb[1]) return null;
  return {
    direction: bearish ? "SHORT" : "LONG",
    stopAnchor: d.price,
    trigger: Number.NaN,
    bcRatio,
    cdRatio,
    dIndex: d.index,
  };
}

function confirmedPivot(candles: ClosedAnalysisCandle[], index: number): V9Pivot | null {
  const left = V9_PREREGISTRATION.pivots.leftBars;
  const right = V9_PREREGISTRATION.pivots.rightBars;
  const high = candles[index].high;
  const low = candles[index].low;
  let pivotHigh = true;
  let pivotLow = true;
  for (let offset = -left; offset <= right; offset += 1) {
    if (offset === 0) continue;
    if (candles[index + offset].high >= high) pivotHigh = false;
    if (candles[index + offset].low <= low) pivotLow = false;
  }
  if (pivotHigh === pivotLow) return null;
  return pivotHigh ? { index, type: "HIGH", price: high } : { index, type: "LOW", price: low };
}

function appendCanonicalPivot(pivots: V9Pivot[], pivot: V9Pivot): boolean {
  const previous = pivots.at(-1);
  if (!previous || previous.type !== pivot.type) {
    pivots.push(pivot);
  } else {
    const moreExtreme = pivot.type === "HIGH" ? pivot.price > previous.price : pivot.price < previous.price;
    if (!moreExtreme) return false;
    pivots[pivots.length - 1] = pivot;
  }
  if (pivots.length > 20) pivots.splice(0, pivots.length - 20);
  return true;
}

function alternatingTail(pivots: V9Pivot[], size: number): V9Pivot[] {
  if (pivots.length < size) return [];
  return pivots.slice(-size);
}

function doublePattern(pivots: V9Pivot[], atr: number, confirmedAt: number): PendingPattern | null {
  const match = matchV9DoublePattern(pivots, atr);
  if (!match) return null;
  const rule = V9_PREREGISTRATION.families.DOUBLE_TOP_BOTTOM_CONFIRMATION;
  return {
    direction: match.direction,
    createdIndex: confirmedAt,
    expiresIndex: confirmedAt + rule.confirmationBars,
    stopAnchor: match.stopAnchor,
    levelAt: () => match.neckline,
    diagnostics: { neckline: match.neckline },
  };
}

function headShouldersPattern(pivots: V9Pivot[], atr: number, confirmedAt: number): PendingPattern | null {
  const match = matchV9HeadShoulders(pivots, atr);
  if (!match) return null;
  const rule = V9_PREREGISTRATION.families.HEAD_SHOULDERS_CONFIRMATION;
  return {
    direction: match.direction,
    createdIndex: confirmedAt,
    expiresIndex: confirmedAt + rule.confirmationBars,
    stopAnchor: match.stopAnchor,
    levelAt: (index) => lineAt(match.necklineA, match.necklineB, index),
    diagnostics: { necklineA: match.necklineA.price, necklineB: match.necklineB.price },
  };
}

function abcdPattern(pivots: V9Pivot[], candles: ClosedAnalysisCandle[], indicators: V8IndicatorSeries, confirmedAt: number): PendingPattern | null {
  const match = matchV9Abcd(pivots);
  if (!match) return null;
  const rsiAtD = indicators.rsi14[match.dIndex];
  const rule = V9_PREREGISTRATION.families.ABCD_REVERSAL_CONFIRMATION;
  if (!finite(rsiAtD)) return null;
  if (match.direction === "LONG" && rsiAtD > rule.rsiLongMaximum) return null;
  if (match.direction === "SHORT" && rsiAtD < rule.rsiShortMinimum) return null;
  return {
    direction: match.direction,
    createdIndex: confirmedAt,
    expiresIndex: confirmedAt + rule.confirmationBars,
    stopAnchor: match.stopAnchor,
    levelAt: () => match.direction === "LONG" ? candles[match.dIndex].high : candles[match.dIndex].low,
    diagnostics: { bcRatio: match.bcRatio, cdRatio: match.cdRatio, rsiAtD, dIndex: match.dIndex },
  };
}

function confirmPending(
  pending: PendingPattern | null,
  candles: ClosedAnalysisCandle[],
  indicators: V8IndicatorSeries,
  timeframe: V9Timeframe,
  target: V9Entry[],
  family: V9Family,
  index: number,
): PendingPattern | null {
  if (!pending || index < pending.createdIndex) return pending;
  if (index > pending.expiresIndex) return null;
  const current = candles[index];
  const previous = candles[Math.max(0, index - 1)];
  const level = pending.levelAt(index);
  const breaks = pending.direction === "LONG"
    ? previous.close <= level && current.close > level
    : previous.close >= level && current.close < level;
  if (!breaks) return pending;
  pushEntry(target, makeV9Entry(candles, indicators, timeframe, family, pending.direction, index, pending.stopAnchor, { ...pending.diagnostics, confirmationLevel: level }));
  return null;
}

function detectRangeReversion(
  candles: ClosedAnalysisCandle[],
  indicators: V8IndicatorSeries,
  timeframe: V9Timeframe,
  target: V9Entry[],
  index: number,
): void {
  const rule = V9_PREREGISTRATION.families.BB_RSI_RANGE_REVERSION;
  const atr = indicators.atr14[index];
  const current = candles[index];
  const previous = candles[index - 1];
  const emaSeparation = Math.abs(indicators.ema21[index] - indicators.ema55[index]) / atr;
  const emaSlope = Math.abs(indicators.ema55[index] - indicators.ema55[index - 10]) / atr;
  const rsi = indicators.rsi14[index];
  const volumeRatio = indicators.volumeRatio[index];
  if (![atr, emaSeparation, emaSlope, rsi, volumeRatio, indicators.bollingerLower[index], indicators.bollingerUpper[index]].every(finite)) return;
  if (emaSeparation > rule.emaSeparationAtrMaximum || emaSlope > rule.ema55Slope10AtrMaximum || volumeRatio > rule.volumeRatioMaximum) return;
  if (previous.close < indicators.bollingerLower[index - 1] && current.close > indicators.bollingerLower[index] && current.close > previous.close && rsi <= rule.rsiLongMaximum) {
    pushEntry(target, makeV9Entry(candles, indicators, timeframe, "BB_RSI_RANGE_REVERSION", "LONG", index, previous.low, { emaSeparation, emaSlope, rsi, volumeRatio }));
  } else if (previous.close > indicators.bollingerUpper[index - 1] && current.close < indicators.bollingerUpper[index] && current.close < previous.close && rsi >= rule.rsiShortMinimum) {
    pushEntry(target, makeV9Entry(candles, indicators, timeframe, "BB_RSI_RANGE_REVERSION", "SHORT", index, previous.high, { emaSeparation, emaSlope, rsi, volumeRatio }));
  }
}

function makeV9Entry(
  candles: ClosedAnalysisCandle[],
  indicators: V8IndicatorSeries,
  timeframe: V9Timeframe,
  family: V9Family,
  direction: SignalDirection,
  index: number,
  stopAnchor: number,
  diagnostics: Record<string, number | string | boolean | null>,
): V9Entry | null {
  const candle = candles[index];
  const atr = indicators.atr14[index];
  if (!finite(atr) || atr <= 0 || !finite(stopAnchor)) return null;
  const rawRisk = direction === "LONG" ? candle.close - stopAnchor : stopAnchor - candle.close;
  const minimumRisk = atr * V9_PREREGISTRATION.commonRisk.minimumStopAtr;
  const risk = Math.max(rawRisk + atr * V9_PREREGISTRATION.commonRisk.structuralBufferAtr, minimumRisk);
  const stopAtr = risk / atr;
  if (!finite(risk) || risk <= 0 || stopAtr > V9_PREREGISTRATION.commonRisk.maximumStopAtr) return null;
  const stopLoss = direction === "LONG" ? candle.close - risk : candle.close + risk;
  const takeProfit = direction === "LONG"
    ? candle.close + risk * V9_PREREGISTRATION.commonRisk.rewardRisk
    : candle.close - risk * V9_PREREGISTRATION.commonRisk.rewardRisk;
  return {
    timeframe,
    direction,
    entryIndex: index,
    openedAt: candle.closeTime,
    entryPrice: candle.close,
    baselineStopLoss: stopLoss,
    baselineTakeProfit: takeProfit,
    baselineRiskReward: V9_PREREGISTRATION.commonRisk.rewardRisk,
    atrAtEntry: atr,
    atrPctAtEntry: atr / candle.close * 100,
    rsiAtEntry: finite(indicators.rsi14[index]) ? indicators.rsi14[index] : null,
    volumeRatioAtEntry: finite(indicators.volumeRatio[index]) ? indicators.volumeRatio[index] : null,
    v9: { family, detectedAt: candle.closeTime, stopAtr, diagnostics },
  };
}

function pushEntry(target: V9Entry[], entry: V9Entry | null): void {
  if (!entry) return;
  if (target.at(-1)?.entryIndex === entry.entryIndex) return;
  target.push(entry);
}

function lineAt(left: V9Pivot, right: V9Pivot, index: number): number {
  if (right.index === left.index) return right.price;
  return left.price + (right.price - left.price) * ((index - left.index) / (right.index - left.index));
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}
