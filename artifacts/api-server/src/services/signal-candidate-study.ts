import type { BacktestSummary, BacktestTrade } from "./signal-backtest";

export const ROBUST_STOP_ATR = [0.75, 1, 1.25, 1.5, 2] as const;
export const ROBUST_TARGET_ATR = [1.25, 1.5, 1.75, 2, 2.5, 3] as const;

export type OfflineFilterName =
  | "NONE"
  | "VOLUME_1_10"
  | "MTF_2"
  | "NORMAL_VOLATILITY"
  | "STRUCTURE_COMPATIBLE"
  | "QUALITY_COMBINED";

export type OfflineFilterThresholds = {
  atrPctLow: number | null;
  atrPctMedian: number | null;
  atrPctHigh: number | null;
};

export type RobustGeometry = {
  stopAtr: number;
  targetAtr: number;
  rewardRisk: number;
};

export type PreOosCandidate<T> = {
  candidate: T;
  train: BacktestSummary;
  development: BacktestSummary;
  validation: BacktestSummary;
};

export function buildRobustGeometryGrid(): RobustGeometry[] {
  return ROBUST_STOP_ATR.flatMap((stopAtr) => ROBUST_TARGET_ATR
    .filter((targetAtr) => targetAtr / stopAtr >= 1.5)
    .map((targetAtr) => ({ stopAtr, targetAtr, rewardRisk: targetAtr / stopAtr })));
}

export function passesOfflineFilter(
  trade: BacktestTrade,
  filter: OfflineFilterName,
  thresholds: OfflineFilterThresholds,
): boolean {
  const volumePass = trade.volumeRatioAtEntry !== null
    && trade.volumeRatioAtEntry !== undefined
    && trade.volumeRatioAtEntry >= 1.1;
  const mtfPass = trade.alignedTimeframes !== null
    && trade.alignedTimeframes !== undefined
    && trade.alignedTimeframes >= 2;
  const volatilityPass = trade.atrPctAtEntry !== undefined
    && thresholds.atrPctLow !== null
    && thresholds.atrPctHigh !== null
    && trade.atrPctAtEntry >= thresholds.atrPctLow
    && trade.atrPctAtEntry <= thresholds.atrPctHigh;
  const structurePass = trade.structureStopAtr !== null
    && trade.structureStopAtr !== undefined
    && trade.favorableObstacleAtr !== null
    && trade.favorableObstacleAtr !== undefined
    && trade.structureStopAtr <= trade.stopAtr
    && trade.targetAtr <= trade.favorableObstacleAtr;

  switch (filter) {
    case "NONE": return true;
    case "VOLUME_1_10": return volumePass;
    case "MTF_2": return mtfPass;
    case "NORMAL_VOLATILITY": return volatilityPass;
    case "STRUCTURE_COMPATIBLE": return structurePass;
    case "QUALITY_COMBINED": return volumePass && mtfPass && volatilityPass && structurePass;
  }
}

export function selectCandidateBeforeOos<T>(
  candidates: Array<PreOosCandidate<T>>,
  minimums = { train: 30, development: 12, validation: 10 },
): PreOosCandidate<T> | null {
  const eligible = candidates.filter(({ train, development, validation }) =>
    train.signals >= minimums.train
    && development.signals >= minimums.development
    && validation.signals >= minimums.validation
    && train.expectancyR !== null
    && development.expectancyR !== null
    && validation.expectancyR !== null);
  return eligible.sort(comparePreOosCandidate)[0] ?? null;
}

function comparePreOosCandidate<T>(left: PreOosCandidate<T>, right: PreOosCandidate<T>): number {
  const values = (item: PreOosCandidate<T>) => {
    const summaries = [item.train, item.development, item.validation];
    const expectancies = summaries.map((summary) => summary.expectancyR ?? Number.NEGATIVE_INFINITY);
    const profitFactors = summaries.map((summary) => summary.profitFactor ?? 0);
    const drawdowns = summaries.map((summary) => summary.maximumDrawdownR ?? Number.POSITIVE_INFINITY);
    return {
      worstExpectancy: Math.min(...expectancies),
      averageExpectancy: expectancies.reduce((sum, value) => sum + value, 0) / expectancies.length,
      worstProfitFactor: Math.min(...profitFactors),
      worstDrawdown: Math.max(...drawdowns),
    };
  };
  const leftValues = values(left);
  const rightValues = values(right);
  if (rightValues.worstExpectancy !== leftValues.worstExpectancy) {
    return rightValues.worstExpectancy - leftValues.worstExpectancy;
  }
  if (rightValues.averageExpectancy !== leftValues.averageExpectancy) {
    return rightValues.averageExpectancy - leftValues.averageExpectancy;
  }
  if (rightValues.worstProfitFactor !== leftValues.worstProfitFactor) {
    return rightValues.worstProfitFactor - leftValues.worstProfitFactor;
  }
  return leftValues.worstDrawdown - rightValues.worstDrawdown;
}
