import { getBinance } from "../services/market";
import {
  assignPeriod,
  baselineConfiguration,
  evaluateEntries,
  generateBaselineEntries,
  percentile,
  summarizeBacktest,
  validateCandleSeries,
  type BacktestPeriod,
  type BacktestSummary,
  type BacktestTrade,
  type BaselineEntry,
  type ClosedAnalysisCandle,
  type ExitConfiguration,
} from "../services/signal-backtest";
import { COMMERCIAL_SIGNAL_TIMEFRAMES } from "../services/signal-engine";
import { isCandleClosedAt, type HistoricalTimeframe } from "../services/historical";

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];
type ServerTime = { serverTime: number };
type TimeframeData = { candles: ClosedAnalysisCandle[]; incompleteExcluded: number };
type TradeMap = Record<HistoricalTimeframe, BacktestTrade[]>;
type EntryMap = Record<HistoricalTimeframe, BaselineEntry[]>;
type CommercialTimeframe = (typeof COMMERCIAL_SIGNAL_TIMEFRAMES)[number];
type TimeframeSummaries = { all: BacktestSummary } & Record<CommercialTimeframe, BacktestSummary>;
type PeriodSummaries = Record<BacktestPeriod, TimeframeSummaries>;
type FrictionScenarioName = "ideal" | "low" | "conservative";
type FrictionScenario = {
  totalBps: number;
  feeBps: number;
  spreadBps: number;
  slippageBps: number;
  note: string;
};
type GeometrySelection = {
  selected: ExitConfiguration | null;
  insufficientSample: boolean;
  evaluatedConfigurations: number;
  eligibleConfigurations: number;
  selectionEvidence: null | {
    trainIdeal: BacktestSummary;
    developmentIdeal: BacktestSummary;
    trainConservative: BacktestSummary;
    developmentConservative: BacktestSummary;
  };
  overall: BacktestSummary | null;
  periods: Record<BacktestPeriod, BacktestSummary> | null;
  oosFriction: Record<FrictionScenarioName, BacktestSummary> | null;
  promotionChecks: Record<string, boolean> | null;
  promotionEligible: boolean;
};
type CandidateSelectionReport = {
  selected: ExitConfiguration | null;
  insufficientSample: boolean;
  trainFinalists: unknown[];
  overall: TimeframeSummaries | null;
  periods: PeriodSummaries | null;
};
type AnalysisReport = {
  metadata: Record<string, unknown>;
  dataQuality: Record<string, unknown>;
  baseline: {
    configuration: ExitConfiguration;
    overall: TimeframeSummaries;
    periods: PeriodSummaries;
    frequencyPerDay: Record<string, number>;
    distanceAndDuration: Record<string, unknown>;
    expiredDiagnostics: Record<string, unknown>;
    riskRewardBuckets: Record<string, BacktestSummary>;
  };
  candidates: {
    candidateA: CandidateSelectionReport;
    candidateB: CandidateSelectionReport;
    candidateC: {
      selectionRule: string;
      configurations: Record<CommercialTimeframe, ExitConfiguration | null>;
      overall: TimeframeSummaries;
      periods: PeriodSummaries;
    };
  };
  exitExpiryMatrix: Record<string, TimeframeSummaries | null>;
  geometryStudy: {
    grid: Record<string, unknown>;
    frictionScenarios: Record<FrictionScenarioName, FrictionScenario>;
    selectionRule: string;
    baselineOosFriction: Record<FrictionScenarioName, TimeframeSummaries>;
    byTimeframe: Record<CommercialTimeframe, GeometrySelection>;
    combinedCandidate: {
      configurations: Record<CommercialTimeframe, ExitConfiguration | null>;
      overall: TimeframeSummaries;
      periods: PeriodSummaries;
      oosFriction: Record<FrictionScenarioName, TimeframeSummaries>;
    };
    fiveMinuteDiagnostics: Record<string, unknown>;
  };
};

const INTERVAL_MS: Record<HistoricalTimeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};
const PERIODS: BacktestPeriod[] = ["TRAIN", "DEVELOPMENT", "VALIDATION", "OUT_OF_SAMPLE"];
const MINIMUM_SELECTION_SAMPLE = 8;
const GEOMETRY_TRAIN_MINIMUM = 30;
const GEOMETRY_DEVELOPMENT_MINIMUM = 12;
const GEOMETRY_OOS_MINIMUM = 20;
const GEOMETRY_STOP_ATR = [1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
const GEOMETRY_REWARD_RISK = [1.5, 1.75, 2] as const;
const FRICTION_SCENARIOS: Record<FrictionScenarioName, FrictionScenario> = {
  ideal: {
    totalBps: 0,
    feeBps: 0,
    spreadBps: 0,
    slippageBps: 0,
    note: "Analytical ceiling with no execution friction.",
  },
  low: {
    totalBps: 14,
    feeBps: 8,
    spreadBps: 2,
    slippageBps: 4,
    note: "Round-trip sensitivity scenario; not an exchange fee promise.",
  },
  conservative: {
    totalBps: 35,
    feeBps: 20,
    spreadBps: 5,
    slippageBps: 10,
    note: "Conservative round-trip sensitivity scenario; not an exchange fee promise.",
  },
};

const options = parseOptions(process.argv.slice(2));
const serverTime = await getBinance<ServerTime>("/time", {});
const observedAt = options.end ?? new Date(serverTime.serverTime);
const analysisStart = new Date(observedAt.getTime() - options.days * 24 * 60 * 60_000);

const fetched = Object.fromEntries(await Promise.all(COMMERCIAL_SIGNAL_TIMEFRAMES.map(async (timeframe) => {
  const warmupStart = new Date(analysisStart.getTime() - INTERVAL_MS[timeframe] * 220);
  return [timeframe, await fetchClosedCandles(timeframe, warmupStart, observedAt, observedAt)];
}))) as Record<HistoricalTimeframe, TimeframeData>;

const entries = Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
  timeframe,
  generateBaselineEntries(fetched[timeframe].candles, timeframe, analysisStart),
])) as EntryMap;

const baseline = evaluateAcrossTimeframes(entries, fetched, () => baselineConfiguration());
if (options.baselineOnly) {
  console.log(JSON.stringify(roundDeep({
    metadata: {
      provider: "Binance public Spot klines",
      symbol: "BTCUSDT",
      analysisStart: analysisStart.toISOString(),
      analysisEnd: observedAt.toISOString(),
      days: options.days,
      candlePolicy: "Only klines whose Binance closeTime is at or before the observation cutoff are eligible.",
      parametersChanged: false,
      databaseWrites: false,
      telegramCalls: false,
    },
    dataQuality: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, {
      ...validateCandleSeries(fetched[timeframe].candles, INTERVAL_MS[timeframe], observedAt),
      incompleteExcluded: fetched[timeframe].incompleteExcluded,
    }])),
    baseline: {
      configuration: baselineConfiguration(),
      overall: summariesByTimeframe(baseline),
      periods: periodSummaries(baseline, analysisStart, observedAt),
    },
  }), null, 2));
  process.exit(0);
}
const cappedGrid = [0.75, 1, 1.25, 1.5].map((atrMultiple) => ({
  name: `CANDIDATE_A_CAP_${atrMultiple}_ATR`,
  riskMode: "CAPPED_ATR" as const,
  atrMultiple,
  rewardRisk: 1.5,
  expiryCandles: 12,
}));
const atrGrid = [0.75, 1, 1.25, 1.5, 1.75, 2].map((atrMultiple) => ({
  name: `CANDIDATE_B_${atrMultiple}_ATR`,
  riskMode: "ATR" as const,
  atrMultiple,
  rewardRisk: 1.5,
  expiryCandles: 12,
}));
const candidateA = selectCandidate(cappedGrid, entries, fetched, analysisStart, observedAt);
const candidateB = selectCandidate(atrGrid, entries, fetched, analysisStart, observedAt);

const candidateCConfigurations = {} as Record<HistoricalTimeframe, ExitConfiguration | null>;
for (const timeframe of COMMERCIAL_SIGNAL_TIMEFRAMES) {
  const grid = [0.75, 1, 1.25, 1.5, 1.75, 2].flatMap((atrMultiple) =>
    [8, 12, 18, 24].map((expiryCandles) => ({
      name: `CANDIDATE_C_${timeframe}_${atrMultiple}_ATR_${expiryCandles}_CANDLES`,
      riskMode: "ATR" as const,
      atrMultiple,
      rewardRisk: 1.5,
      expiryCandles,
    })),
  );
  candidateCConfigurations[timeframe] = selectCandidateForTimeframe(
    grid,
    timeframe,
    entries[timeframe],
    fetched[timeframe],
    analysisStart,
    observedAt,
  ).selected;
}
const candidateC = evaluateAcrossTimeframes(entries, fetched, (timeframe) =>
  candidateCConfigurations[timeframe] ?? baselineConfiguration());

const geometryGrid = GEOMETRY_STOP_ATR.flatMap((atrMultiple) =>
  GEOMETRY_REWARD_RISK.map((rewardRisk) => ({
    name: `GEOMETRY_${atrMultiple}_ATR_${rewardRisk}_RR`,
    riskMode: "ATR" as const,
    atrMultiple,
    rewardRisk,
    expiryCandles: 12,
  })));
const geometrySelections = {} as Record<CommercialTimeframe, GeometrySelection & { trades: BacktestTrade[] | null }>;
for (const timeframe of COMMERCIAL_SIGNAL_TIMEFRAMES) {
  geometrySelections[timeframe] = selectGeometryCandidateForTimeframe(
    geometryGrid,
    timeframe,
    entries[timeframe],
    fetched[timeframe],
    analysisStart,
    observedAt,
  );
}
const geometryConfigurations = Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
  timeframe,
  geometrySelections[timeframe].selected,
])) as Record<CommercialTimeframe, ExitConfiguration | null>;
const geometryCombined = evaluateAcrossTimeframes(entries, fetched, (timeframe) =>
  geometryConfigurations[timeframe] ?? baselineConfiguration());

const baselineLongerExpiry18 = evaluateAcrossTimeframes(entries, fetched, () => ({
  ...baselineConfiguration(),
  name: "BASELINE_TP_SL_EXPIRY_18",
  expiryCandles: 18,
}));
const baselineLongerExpiry24 = evaluateAcrossTimeframes(entries, fetched, () => ({
  ...baselineConfiguration(),
  name: "BASELINE_TP_SL_EXPIRY_24",
  expiryCandles: 24,
}));

const report: AnalysisReport = {
  metadata: {
    generatedAt: new Date().toISOString(),
    provider: "Binance public Spot klines",
    symbol: "BTCUSDT",
    analysisStart: analysisStart.toISOString(),
    analysisEnd: observedAt.toISOString(),
    days: options.days,
    liveStrategyChanged: false,
    databaseWrites: false,
    telegramCalls: false,
    methodology: {
      candlePolicy: "Only klines whose Binance closeTime is at or before the observation cutoff are eligible.",
      entryPolicy: "Baseline entry logic is evaluated chronologically with a 200-candle prefix and one active baseline signal per timeframe.",
      exitComparison: "All candidates reuse the exact baseline entry cohort; only exits and expiry differ.",
      sameCandlePolicy: "SL wins a same-candle TP/SL tie, matching the live engine.",
      expiredAccuracy: "EXPIRED is included in the denominator and is not counted as a win.",
      expiredExpectancy: "EXPIRED contributes signed mark-to-market R at expiry; WIN=+target R and LOSS=-1R.",
      postExpiryWindow: "Expired baseline signals are followed for three additional baseline expiry horizons.",
      partitions: "Chronological 50% TRAIN / 20% DEVELOPMENT / 15% VALIDATION / 15% OUT_OF_SAMPLE.",
      selection: "Top three TRAIN expectancy candidates advance; DEVELOPMENT chooses the finalist. VALIDATION and OUT_OF_SAMPLE never select parameters.",
      geometrySelection: "A bounded 7 stop-ATR x 3 R:R grid is ranked per timeframe using only TRAIN and DEVELOPMENT conservative-friction expectancy. VALIDATION and OUT_OF_SAMPLE do not select parameters.",
      friction: "Round-trip cost is converted to R per trade from its risk percentage. Scenarios are transparent sensitivities, not claims about a specific exchange or account.",
    },
  },
  dataQuality: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, {
    ...validateCandleSeries(fetched[timeframe].candles, INTERVAL_MS[timeframe], observedAt),
    incompleteExcluded: fetched[timeframe].incompleteExcluded,
  }])),
  baseline: {
    configuration: baselineConfiguration(),
    overall: summariesByTimeframe(baseline),
    periods: periodSummaries(baseline, analysisStart, observedAt),
    frequencyPerDay: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, round(entries[timeframe].length / options.days)])),
    distanceAndDuration: distanceAndDuration(baseline),
    expiredDiagnostics: expiredDiagnostics(baseline),
    riskRewardBuckets: riskRewardBuckets(baseline),
  },
  candidates: {
    candidateA: candidateReport(candidateA, entries, fetched, analysisStart, observedAt),
    candidateB: candidateReport(candidateB, entries, fetched, analysisStart, observedAt),
    candidateC: {
      selectionRule: "Per-timeframe TRAIN finalists, DEVELOPMENT selection; no OOS selection.",
      configurations: candidateCConfigurations,
      overall: summariesByTimeframe(candidateC),
      periods: periodSummaries(candidateC, analysisStart, observedAt),
    },
  },
  exitExpiryMatrix: {
    baselineCurrent: summariesByTimeframe(baseline),
    baselineExpiry18: summariesByTimeframe(baselineLongerExpiry18),
    baselineExpiry24: summariesByTimeframe(baselineLongerExpiry24),
    atrCurrentExpiry: candidateB.selected
      ? summariesByTimeframe(evaluateAcrossTimeframes(entries, fetched, () => candidateB.selected!))
      : null,
    atrPerTimeframeAdaptiveExpiry: summariesByTimeframe(candidateC),
  },
  geometryStudy: {
    grid: {
      stopAtr: GEOMETRY_STOP_ATR,
      rewardRisk: GEOMETRY_REWARD_RISK,
      expiryCandles: 12,
      configurationsPerTimeframe: geometryGrid.length,
      entriesAndFiltersChanged: false,
    },
    frictionScenarios: FRICTION_SCENARIOS,
    selectionRule: `Require at least ${GEOMETRY_TRAIN_MINIMUM} TRAIN and ${GEOMETRY_DEVELOPMENT_MINIMUM} DEVELOPMENT trades; maximize the worse of TRAIN/DEVELOPMENT conservative-friction expectancy, then average expectancy, PF and drawdown. OOS is sealed until selection.`,
    baselineOosFriction: frictionOosByTimeframe(baseline, analysisStart, observedAt),
    byTimeframe: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => {
      const { trades: _trades, ...selection } = geometrySelections[timeframe];
      return [timeframe, selection];
    })) as Record<CommercialTimeframe, GeometrySelection>,
    combinedCandidate: {
      configurations: geometryConfigurations,
      overall: summariesByTimeframe(geometryCombined),
      periods: periodSummaries(geometryCombined, analysisStart, observedAt),
      oosFriction: frictionOosByTimeframe(geometryCombined, analysisStart, observedAt),
    },
    fiveMinuteDiagnostics: fiveMinuteDiagnostics(baseline["5m"], geometrySelections["5m"].trades),
  },
};

const printableReport = options.selection
  ? selectionReport(report)
  : options.geometry
  ? geometryReport(report)
  : options.terse
    ? terseReport(report)
    : options.compact
      ? compactReport(report)
      : report;
console.log(JSON.stringify(roundDeep(printableReport), null, 2));

function evaluateAcrossTimeframes(
  cohort: EntryMap,
  data: Record<HistoricalTimeframe, TimeframeData>,
  configuration: (timeframe: CommercialTimeframe) => ExitConfiguration,
): TradeMap {
  return Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
    timeframe,
    evaluateEntries(data[timeframe].candles, cohort[timeframe], configuration(timeframe)),
  ])) as TradeMap;
}

function selectCandidate(
  grid: ExitConfiguration[],
  cohort: EntryMap,
  data: Record<HistoricalTimeframe, TimeframeData>,
  start: Date,
  end: Date,
) {
  const evaluated = grid.map((configuration) => ({
    configuration,
    trades: evaluateAcrossTimeframes(cohort, data, () => configuration),
  }));
  const rankedOnTrain = evaluated
    .map((candidate) => ({ ...candidate, summary: summaryForPeriod(candidate.trades, "TRAIN", start, end) }))
    .filter((candidate) => candidate.summary.signals >= MINIMUM_SELECTION_SAMPLE && candidate.summary.expectancyR !== null)
    .sort(compareCandidateSummary)
    .slice(0, 3);
  const selected = rankedOnTrain
    .map((candidate) => ({ ...candidate, development: summaryForPeriod(candidate.trades, "DEVELOPMENT", start, end) }))
    .filter((candidate) => candidate.development.signals >= MINIMUM_SELECTION_SAMPLE && candidate.development.expectancyR !== null)
    .sort((left, right) => compareCandidateSummary({ summary: left.development }, { summary: right.development }))[0];
  return {
    selected: selected?.configuration ?? null,
    insufficientSample: !selected,
    trainFinalists: rankedOnTrain.map((candidate) => ({ configuration: candidate.configuration, summary: candidate.summary })),
  };
}

function selectCandidateForTimeframe(
  grid: ExitConfiguration[],
  timeframe: HistoricalTimeframe,
  cohort: BaselineEntry[],
  data: TimeframeData,
  start: Date,
  end: Date,
) {
  const asMap = (trades: BacktestTrade[]) => ({
    "5m": timeframe === "5m" ? trades : [],
    "15m": timeframe === "15m" ? trades : [],
    "1h": timeframe === "1h" ? trades : [],
    "4h": timeframe === "4h" ? trades : [],
    "1m": [],
  }) as TradeMap;
  const evaluated = grid.map((configuration) => {
    const trades = evaluateEntries(data.candles, cohort, configuration);
    return { configuration, trades, summary: summaryForPeriod(asMap(trades), "TRAIN", start, end) };
  });
  const finalists = evaluated
    .filter((candidate) => candidate.summary.signals >= MINIMUM_SELECTION_SAMPLE && candidate.summary.expectancyR !== null)
    .sort(compareCandidateSummary)
    .slice(0, 3);
  const selected = finalists.map((candidate) => ({
    ...candidate,
    development: summaryForPeriod(asMap(candidate.trades), "DEVELOPMENT", start, end),
  })).filter((candidate) => candidate.development.signals >= MINIMUM_SELECTION_SAMPLE && candidate.development.expectancyR !== null)
    .sort((left, right) => compareCandidateSummary({ summary: left.development }, { summary: right.development }))[0];
  return { selected: selected?.configuration ?? null, insufficientSample: !selected };
}

function selectGeometryCandidateForTimeframe(
  grid: ExitConfiguration[],
  timeframe: CommercialTimeframe,
  cohort: BaselineEntry[],
  data: TimeframeData,
  start: Date,
  end: Date,
): GeometrySelection & { trades: BacktestTrade[] | null } {
  const evaluated = grid.map((configuration) => {
    const trades = evaluateEntries(data.candles, cohort, configuration);
    return {
      configuration,
      trades,
      trainIdeal: summaryForTradePeriod(trades, "TRAIN", start, end),
      developmentIdeal: summaryForTradePeriod(trades, "DEVELOPMENT", start, end),
      trainConservative: summaryForTradePeriod(trades, "TRAIN", start, end, FRICTION_SCENARIOS.conservative.totalBps),
      developmentConservative: summaryForTradePeriod(trades, "DEVELOPMENT", start, end, FRICTION_SCENARIOS.conservative.totalBps),
    };
  });
  const eligible = evaluated.filter((candidate) =>
    candidate.trainIdeal.signals >= GEOMETRY_TRAIN_MINIMUM
    && candidate.developmentIdeal.signals >= GEOMETRY_DEVELOPMENT_MINIMUM
    && candidate.trainConservative.expectancyR !== null
    && candidate.developmentConservative.expectancyR !== null);
  const selected = eligible.sort(compareGeometryCandidates)[0];
  if (!selected) {
    return {
      selected: null,
      insufficientSample: true,
      evaluatedConfigurations: evaluated.length,
      eligibleConfigurations: eligible.length,
      selectionEvidence: null,
      overall: null,
      periods: null,
      oosFriction: null,
      promotionChecks: null,
      promotionEligible: false,
      trades: null,
    };
  }

  const periods = Object.fromEntries(PERIODS.map((period) => [
    period,
    summaryForTradePeriod(selected.trades, period, start, end),
  ])) as Record<BacktestPeriod, BacktestSummary>;
  const oosFriction = Object.fromEntries(Object.entries(FRICTION_SCENARIOS).map(([name, scenario]) => [
    name,
    summaryForTradePeriod(selected.trades, "OUT_OF_SAMPLE", start, end, scenario.totalBps),
  ])) as Record<FrictionScenarioName, BacktestSummary>;
  const baselineTrades = evaluateEntries(data.candles, cohort, baselineConfiguration());
  const baselineOos = summaryForTradePeriod(baselineTrades, "OUT_OF_SAMPLE", start, end);
  const baselineOosConservative = summaryForTradePeriod(
    baselineTrades,
    "OUT_OF_SAMPLE",
    start,
    end,
    FRICTION_SCENARIOS.conservative.totalBps,
  );
  const validationConservative = summaryForTradePeriod(
    selected.trades,
    "VALIDATION",
    start,
    end,
    FRICTION_SCENARIOS.conservative.totalBps,
  );
  const oosConservative = oosFriction.conservative;
  const expiredReduction = baselineOos.expired - oosConservative.expired;
  const addedLosses = oosConservative.losses - baselineOos.losses;
  const baselineDrawdown = baselineOosConservative.maximumDrawdownR;
  const candidateDrawdown = oosConservative.maximumDrawdownR;
  const promotionChecks = {
    trainAndDevelopmentPositiveAfterConservativeFriction:
      (selected.trainConservative.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
      && (selected.developmentConservative.expectancyR ?? Number.NEGATIVE_INFINITY) > 0,
    validationPositiveAfterConservativeFriction:
      (validationConservative.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
      && (validationConservative.profitFactor ?? 0) > 1,
    oosPositiveAfterConservativeFriction:
      (oosConservative.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
      && (oosConservative.profitFactor ?? 0) > 1,
    drawdownNotDisproportionate:
      candidateDrawdown !== null
      && baselineDrawdown !== null
      && candidateDrawdown <= baselineDrawdown * 1.25,
    expirationsReducedWithoutMoreLossesThanResolvedExpirations:
      expiredReduction > 0 && addedLosses <= expiredReduction,
    sufficientOosSample: oosConservative.signals >= GEOMETRY_OOS_MINIMUM,
  };

  return {
    selected: selected.configuration,
    insufficientSample: false,
    evaluatedConfigurations: evaluated.length,
    eligibleConfigurations: eligible.length,
    selectionEvidence: {
      trainIdeal: selected.trainIdeal,
      developmentIdeal: selected.developmentIdeal,
      trainConservative: selected.trainConservative,
      developmentConservative: selected.developmentConservative,
    },
    overall: summarizeBacktest(selected.trades),
    periods,
    oosFriction,
    promotionChecks,
    promotionEligible: Object.values(promotionChecks).every(Boolean),
    trades: selected.trades,
  };
}

function compareGeometryCandidates(
  left: {
    trainConservative: BacktestSummary;
    developmentConservative: BacktestSummary;
  },
  right: {
    trainConservative: BacktestSummary;
    developmentConservative: BacktestSummary;
  },
) {
  const values = (candidate: typeof left) => {
    const train = candidate.trainConservative.expectancyR ?? Number.NEGATIVE_INFINITY;
    const development = candidate.developmentConservative.expectancyR ?? Number.NEGATIVE_INFINITY;
    return {
      worstExpectancy: Math.min(train, development),
      averageExpectancy: (train + development) / 2,
      worstProfitFactor: Math.min(
        candidate.trainConservative.profitFactor ?? 0,
        candidate.developmentConservative.profitFactor ?? 0,
      ),
      worstDrawdown: Math.max(
        candidate.trainConservative.maximumDrawdownR ?? Number.POSITIVE_INFINITY,
        candidate.developmentConservative.maximumDrawdownR ?? Number.POSITIVE_INFINITY,
      ),
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

function candidateReport(
  selection: ReturnType<typeof selectCandidate>,
  cohort: EntryMap,
  data: Record<HistoricalTimeframe, TimeframeData>,
  start: Date,
  end: Date,
) {
  if (!selection.selected) return { ...selection, overall: null, periods: null };
  const trades = evaluateAcrossTimeframes(cohort, data, () => selection.selected!);
  return { ...selection, overall: summariesByTimeframe(trades), periods: periodSummaries(trades, start, end) };
}

function summariesByTimeframe(trades: TradeMap): TimeframeSummaries {
  return {
    all: summarizeBacktest(COMMERCIAL_SIGNAL_TIMEFRAMES.flatMap((timeframe) => trades[timeframe])),
    ...Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, summarizeBacktest(trades[timeframe])])),
  } as TimeframeSummaries;
}

function periodSummaries(trades: TradeMap, start: Date, end: Date): PeriodSummaries {
  return Object.fromEntries(PERIODS.map((period) => [period, {
    all: summaryForPeriod(trades, period, start, end),
    ...Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
      timeframe,
      summarizeBacktest(trades[timeframe].filter((trade) => assignPeriod(trade.openedAt, start, end) === period)),
    ])),
  }])) as PeriodSummaries;
}

function summaryForPeriod(trades: TradeMap, period: BacktestPeriod, start: Date, end: Date) {
  return summarizeBacktest(COMMERCIAL_SIGNAL_TIMEFRAMES.flatMap((timeframe) =>
    trades[timeframe].filter((trade) => assignPeriod(trade.openedAt, start, end) === period)));
}

function summaryForTradePeriod(
  trades: BacktestTrade[],
  period: BacktestPeriod,
  start: Date,
  end: Date,
  frictionBps = 0,
) {
  return summarizeBacktest(
    trades.filter((trade) => assignPeriod(trade.openedAt, start, end) === period),
    frictionBps,
  );
}

function frictionOosByTimeframe(trades: TradeMap, start: Date, end: Date) {
  return Object.fromEntries(Object.entries(FRICTION_SCENARIOS).map(([name, scenario]) => {
    const completed = Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
      timeframe,
      trades[timeframe].filter((trade) => assignPeriod(trade.openedAt, start, end) === "OUT_OF_SAMPLE"),
    ])) as TradeMap;
    return [name, {
      all: summarizeBacktest(
        COMMERCIAL_SIGNAL_TIMEFRAMES.flatMap((timeframe) => completed[timeframe]),
        scenario.totalBps,
      ),
      ...Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
        timeframe,
        summarizeBacktest(completed[timeframe], scenario.totalBps),
      ])),
    } as TimeframeSummaries];
  })) as Record<FrictionScenarioName, TimeframeSummaries>;
}

function compareCandidateSummary(
  left: { summary: BacktestSummary },
  right: { summary: BacktestSummary },
) {
  const expectancy = (right.summary.expectancyR ?? Number.NEGATIVE_INFINITY) - (left.summary.expectancyR ?? Number.NEGATIVE_INFINITY);
  if (expectancy !== 0) return expectancy;
  const drawdown = (left.summary.maximumDrawdownR ?? Number.POSITIVE_INFINITY) - (right.summary.maximumDrawdownR ?? Number.POSITIVE_INFINITY);
  if (drawdown !== 0) return drawdown;
  return (right.summary.profitFactor ?? 0) - (left.summary.profitFactor ?? 0);
}

function distanceAndDuration(trades: TradeMap) {
  return Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => {
    const completed = trades[timeframe].filter((trade) => trade.outcome !== "CENSORED");
    return [timeframe, {
      medianStopUsd: percentile(completed.map((trade) => trade.riskUsd), 0.5),
      medianTargetUsd: percentile(completed.map((trade) => trade.targetUsd), 0.5),
      medianStopPct: percentile(completed.map((trade) => trade.riskPct), 0.5),
      medianTargetPct: percentile(completed.map((trade) => trade.targetPct), 0.5),
      medianStopAtr: percentile(completed.map((trade) => trade.stopAtr), 0.5),
      medianTargetAtr: percentile(completed.map((trade) => trade.targetAtr), 0.5),
      medianMfeR: percentile(completed.map((trade) => trade.mfeR).filter(isNumber), 0.5),
      medianMaeR: percentile(completed.map((trade) => trade.maeR).filter(isNumber), 0.5),
      medianMfeAtr: percentile(completed.map((trade) => trade.mfeAtr).filter(isNumber), 0.5),
      medianMaeAtr: percentile(completed.map((trade) => trade.maeAtr).filter(isNumber), 0.5),
      medianDurationCandles: percentile(completed.map((trade) => trade.durationCandles).filter(isNumber), 0.5),
      medianDurationMinutes: percentile(completed.map((trade) => trade.durationMs).filter(isNumber).map((value) => value / 60_000), 0.5),
    }];
  }));
}

function fiveMinuteDiagnostics(baselineTrades: BacktestTrade[], candidateTrades: BacktestTrade[] | null) {
  const outcomeBreakdown = (trades: BacktestTrade[]) => Object.fromEntries(
    (["WIN", "LOSS", "EXPIRED"] as const).map((outcome) => {
      const cohort = trades.filter((trade) => trade.outcome === outcome);
      return [outcome, excursionDistribution(cohort)];
    }),
  );
  return {
    baseline: {
      all: excursionDistribution(baselineTrades.filter((trade) => trade.outcome !== "CENSORED")),
      byOutcome: outcomeBreakdown(baselineTrades),
      timeToTargetCandles: distribution(
        baselineTrades.filter((trade) => trade.outcome === "WIN").map((trade) => trade.durationCandles).filter(isNumber),
      ),
      timeToStopCandles: distribution(
        baselineTrades.filter((trade) => trade.outcome === "LOSS").map((trade) => trade.durationCandles).filter(isNumber),
      ),
    },
    selectedCandidate: candidateTrades === null ? null : {
      all: excursionDistribution(candidateTrades.filter((trade) => trade.outcome !== "CENSORED")),
      byOutcome: outcomeBreakdown(candidateTrades),
      timeToTargetCandles: distribution(
        candidateTrades.filter((trade) => trade.outcome === "WIN").map((trade) => trade.durationCandles).filter(isNumber),
      ),
      timeToStopCandles: distribution(
        candidateTrades.filter((trade) => trade.outcome === "LOSS").map((trade) => trade.durationCandles).filter(isNumber),
      ),
    },
  };
}

function excursionDistribution(trades: BacktestTrade[]) {
  return {
    signals: trades.length,
    stopAtr: distribution(trades.map((trade) => trade.stopAtr).filter(isNumber)),
    targetAtr: distribution(trades.map((trade) => trade.targetAtr).filter(isNumber)),
    stopPct: distribution(trades.map((trade) => trade.riskPct).filter(isNumber)),
    targetPct: distribution(trades.map((trade) => trade.targetPct).filter(isNumber)),
    mfeAtr: distribution(trades.map((trade) => trade.mfeAtr).filter(isNumber)),
    maeAtr: distribution(trades.map((trade) => trade.maeAtr).filter(isNumber)),
    mfeR: distribution(trades.map((trade) => trade.mfeR).filter(isNumber)),
    maeR: distribution(trades.map((trade) => trade.maeR).filter(isNumber)),
    durationCandles: distribution(trades.map((trade) => trade.durationCandles).filter(isNumber)),
  };
}

function distribution(values: number[]) {
  return {
    p10: percentile(values, 0.1),
    p25: percentile(values, 0.25),
    p50: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
  };
}

function expiredDiagnostics(trades: TradeMap) {
  return Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => {
    const expired = trades[timeframe].filter((trade) => trade.outcome === "EXPIRED");
    return [timeframe, {
      expired: expired.length,
      laterWin: expired.filter((trade) => trade.postExpiryOutcome === "WIN").length,
      laterLoss: expired.filter((trade) => trade.postExpiryOutcome === "LOSS").length,
      laterNeither: expired.filter((trade) => trade.postExpiryOutcome === "NEITHER").length,
      medianAdditionalCandlesToBarrier: percentile(expired.map((trade) => trade.postExpiryAdditionalCandles).filter(isNumber), 0.5),
      medianMfeRBeforeExpiry: percentile(expired.map((trade) => trade.mfeR).filter(isNumber), 0.5),
      medianMaeRBeforeExpiry: percentile(expired.map((trade) => trade.maeR).filter(isNumber), 0.5),
      medianExpiryReturnR: percentile(expired.map((trade) => trade.realizedR).filter(isNumber), 0.5),
    }];
  }));
}

function riskRewardBuckets(trades: TradeMap) {
  const all = COMMERCIAL_SIGNAL_TIMEFRAMES.flatMap((timeframe) => trades[timeframe]);
  const buckets = [
    { name: "1.5-1.75", accepts: (value: number) => value >= 1.5 && value < 1.75 },
    { name: "1.75-2", accepts: (value: number) => value >= 1.75 && value <= 2 },
    { name: ">2", accepts: (value: number) => value > 2 },
  ];
  return Object.fromEntries(buckets.map((bucket) => [bucket.name, summarizeBacktest(all.filter((trade) => bucket.accepts(trade.targetUsd / trade.riskUsd)))]));
}

async function fetchClosedCandles(
  timeframe: HistoricalTimeframe,
  start: Date,
  end: Date,
  observedAt: Date,
): Promise<TimeframeData> {
  const intervalMs = INTERVAL_MS[timeframe];
  const byTimestamp = new Map<number, ClosedAnalysisCandle>();
  let cursor = start.getTime();
  let incompleteExcluded = 0;
  while (cursor <= end.getTime()) {
    const page = await getBinance<BinanceKline[]>("/klines", {
      symbol: "BTCUSDT",
      interval: timeframe,
      startTime: cursor,
      endTime: end.getTime(),
      limit: 1_000,
    });
    if (!page.length) break;
    for (const row of page) {
      if (!isCandleClosedAt(row[6], observedAt)) {
        incompleteExcluded += 1;
        continue;
      }
      byTimestamp.set(row[0], {
        timestamp: new Date(row[0]).toISOString(),
        closeTime: new Date(row[6]).toISOString(),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      });
    }
    const next = page.at(-1)![0] + intervalMs;
    if (next <= cursor) throw new Error(`Binance pagination did not advance for ${timeframe}.`);
    cursor = next;
    if (page.length < 1_000) break;
  }
  return { candles: [...byTimestamp.values()].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)), incompleteExcluded };
}

function parseOptions(args: string[]) {
  const daysValue = args.find((argument) => argument.startsWith("--days="))?.split("=")[1] ?? "365";
  const endValue = args.find((argument) => argument.startsWith("--end="))?.split("=")[1];
  const days = Number(daysValue);
  if (!Number.isInteger(days) || days < 30 || days > 1_500) throw new Error("--days must be an integer between 30 and 1500.");
  const end = endValue ? new Date(endValue) : null;
  if (end && Number.isNaN(end.getTime())) throw new Error("--end must be an ISO-8601 timestamp.");
  return {
    days,
    end,
    compact: args.includes("--compact"),
    terse: args.includes("--terse"),
    geometry: args.includes("--geometry"),
    selection: args.includes("--selection"),
    baselineOnly: args.includes("--baseline-only"),
  };
}

function selectionReport(report: AnalysisReport) {
  const terse = terseReport(report);
  return {
    metadata: {
      analysisStart: report.metadata.analysisStart,
      analysisEnd: report.metadata.analysisEnd,
      methodology: report.metadata.methodology,
    },
    grid: terse.geometryStudy.grid,
    frictionScenarios: terse.geometryStudy.frictionScenarios,
    baselineOosFriction: terse.geometryStudy.baselineOosFriction,
    byTimeframe: terse.geometryStudy.byTimeframe,
    combinedCandidate: terse.geometryStudy.combinedCandidate,
  };
}

function geometryReport(report: AnalysisReport) {
  const terse = terseReport(report);
  return {
    metadata: terse.metadata,
    dataQuality: terse.dataQuality,
    baseline: terse.baseline,
    geometryStudy: terse.geometryStudy,
  };
}

function terseReport(report: AnalysisReport) {
  const terseSummary = (summary: BacktestSummary | null) => summary === null ? null : ({
    signals: summary.signals,
    wins: summary.wins,
    losses: summary.losses,
    expired: summary.expired,
    censored: summary.censored,
    winRateIncludingExpired: summary.winRateIncludingExpired,
    winRateExcludingExpired: summary.winRateExcludingExpired,
    expiredRate: summary.expiredRate,
    expectancyR: summary.expectancyR,
    profitFactor: summary.profitFactor,
    maximumDrawdownR: summary.maximumDrawdownR,
    medianDurationCandles: summary.medianDurationCandles,
  });
  const terseTimeframes = (summaries: TimeframeSummaries | null) => summaries === null
    ? null
    : Object.fromEntries(["all", ...COMMERCIAL_SIGNAL_TIMEFRAMES].map((timeframe) => [timeframe, terseSummary(summaries[timeframe as keyof typeof summaries])]));
  const tersePeriods = (periods: PeriodSummaries | null) => periods === null
    ? null
    : Object.fromEntries(PERIODS.map((period) => [period, terseSummary(periods[period].all)]));
  const outOfSampleByTimeframe = (periods: PeriodSummaries | null) => periods === null
    ? null
    : Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, terseSummary(periods.OUT_OF_SAMPLE[timeframe])]));
  const terseGeometrySelection = (selection: GeometrySelection) => ({
    selected: selection.selected,
    insufficientSample: selection.insufficientSample,
    evaluatedConfigurations: selection.evaluatedConfigurations,
    eligibleConfigurations: selection.eligibleConfigurations,
    selectionEvidence: selection.selectionEvidence === null ? null : Object.fromEntries(
      Object.entries(selection.selectionEvidence).map(([name, summary]) => [name, terseSummary(summary)]),
    ),
    overall: terseSummary(selection.overall),
    periods: selection.periods === null ? null : Object.fromEntries(
      PERIODS.map((period) => [period, terseSummary(selection.periods![period])]),
    ),
    oosFriction: selection.oosFriction === null ? null : Object.fromEntries(
      Object.entries(selection.oosFriction).map(([name, summary]) => [name, terseSummary(summary)]),
    ),
    promotionChecks: selection.promotionChecks,
    promotionEligible: selection.promotionEligible,
  });
  return {
    metadata: report.metadata,
    dataQuality: report.dataQuality,
    baseline: {
      overall: terseTimeframes(report.baseline.overall),
      periods: tersePeriods(report.baseline.periods),
      outOfSampleByTimeframe: outOfSampleByTimeframe(report.baseline.periods),
      frequencyPerDay: report.baseline.frequencyPerDay,
      distanceAndDuration: report.baseline.distanceAndDuration,
      expiredDiagnostics: report.baseline.expiredDiagnostics,
    },
    candidates: {
      candidateA: {
        selected: report.candidates.candidateA.selected,
        insufficientSample: report.candidates.candidateA.insufficientSample,
        overall: terseTimeframes(report.candidates.candidateA.overall),
        periods: tersePeriods(report.candidates.candidateA.periods),
        outOfSampleByTimeframe: outOfSampleByTimeframe(report.candidates.candidateA.periods),
      },
      candidateB: {
        selected: report.candidates.candidateB.selected,
        insufficientSample: report.candidates.candidateB.insufficientSample,
        overall: terseTimeframes(report.candidates.candidateB.overall),
        periods: tersePeriods(report.candidates.candidateB.periods),
        outOfSampleByTimeframe: outOfSampleByTimeframe(report.candidates.candidateB.periods),
      },
      candidateC: {
        configurations: report.candidates.candidateC.configurations,
        overall: terseTimeframes(report.candidates.candidateC.overall),
        periods: tersePeriods(report.candidates.candidateC.periods),
        outOfSampleByTimeframe: outOfSampleByTimeframe(report.candidates.candidateC.periods),
      },
    },
    exitExpiryMatrix: Object.fromEntries(Object.entries(report.exitExpiryMatrix).map(([name, summaries]) => [name, terseTimeframes(summaries)])),
    geometryStudy: {
      grid: report.geometryStudy.grid,
      frictionScenarios: report.geometryStudy.frictionScenarios,
      selectionRule: report.geometryStudy.selectionRule,
      baselineOosFriction: Object.fromEntries(Object.entries(report.geometryStudy.baselineOosFriction).map(([name, summaries]) => [name, terseTimeframes(summaries)])),
      byTimeframe: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, terseGeometrySelection(report.geometryStudy.byTimeframe[timeframe])])),
      combinedCandidate: {
        configurations: report.geometryStudy.combinedCandidate.configurations,
        overall: terseTimeframes(report.geometryStudy.combinedCandidate.overall),
        periods: tersePeriods(report.geometryStudy.combinedCandidate.periods),
        oosFriction: Object.fromEntries(Object.entries(report.geometryStudy.combinedCandidate.oosFriction).map(([name, summaries]) => [name, terseTimeframes(summaries)])),
      },
      fiveMinuteDiagnostics: report.geometryStudy.fiveMinuteDiagnostics,
    },
  };
}

function compactReport(report: AnalysisReport) {
  const compactPeriods = (periods: PeriodSummaries | null) => periods === null
    ? null
    : Object.fromEntries(PERIODS.map((period) => [period, periods[period].all]));
  return {
    metadata: report.metadata,
    dataQuality: report.dataQuality,
    baseline: {
      overall: report.baseline.overall,
      periods: compactPeriods(report.baseline.periods),
      frequencyPerDay: report.baseline.frequencyPerDay,
      distanceAndDuration: report.baseline.distanceAndDuration,
      expiredDiagnostics: report.baseline.expiredDiagnostics,
      riskRewardBuckets: report.baseline.riskRewardBuckets,
    },
    candidates: {
      candidateA: {
        selected: report.candidates.candidateA.selected,
        insufficientSample: report.candidates.candidateA.insufficientSample,
        overall: report.candidates.candidateA.overall,
        periods: compactPeriods(report.candidates.candidateA.periods),
      },
      candidateB: {
        selected: report.candidates.candidateB.selected,
        insufficientSample: report.candidates.candidateB.insufficientSample,
        overall: report.candidates.candidateB.overall,
        periods: compactPeriods(report.candidates.candidateB.periods),
      },
      candidateC: {
        configurations: report.candidates.candidateC.configurations,
        overall: report.candidates.candidateC.overall,
        periods: compactPeriods(report.candidates.candidateC.periods),
      },
    },
    exitExpiryMatrix: report.exitExpiryMatrix,
    geometryStudy: report.geometryStudy,
  };
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function roundDeep(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? round(value) : "INF";
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundDeep(item)]));
  return value;
}
