import { getBinance } from "../services/market";
import {
  assignPeriod,
  baselineConfiguration,
  evaluateEntries,
  generateBaselineEntries,
  netRealizedR,
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
import { calculateTechnicalAnalysis } from "../services/technical";
import {
  buildRobustGeometryGrid,
  buildRobustPercentageGrid,
  passesOfflineFilter,
  selectCandidateBeforeOos,
  type OfflineFilterName,
  type OfflineFilterThresholds,
} from "../services/signal-candidate-study";

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];
type ServerTime = { serverTime: number };
type TimeframeData = { candles: ClosedAnalysisCandle[]; incompleteExcluded: number };
type TradeMap = Record<HistoricalTimeframe, BacktestTrade[]>;
type EntryMap = Record<HistoricalTimeframe, BaselineEntry[]>;
type CommercialTimeframe = (typeof COMMERCIAL_SIGNAL_TIMEFRAMES)[number];
type TimeframeSummaries = { all: BacktestSummary } & Record<CommercialTimeframe, BacktestSummary>;
type PeriodSummaries = Record<BacktestPeriod, TimeframeSummaries>;
type FrictionScenarioName = "ideal" | "low" | "medium" | "conservative";
type FrictionScenario = {
  totalBps: number;
  feeBps: number;
  spreadBps: number;
  slippageBps: number;
  note: string;
};
type RobustFamily = "BASELINE" | "ATR" | "PERCENT" | "ATR_STRUCTURE_HYBRID";
type RobustCandidate = {
  id: string;
  family: RobustFamily;
  filter: OfflineFilterName;
  configuration: ExitConfiguration;
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
const ROBUST_FILTERS: OfflineFilterName[] = [
  "NONE",
  "VOLUME_1_10",
  "MTF_2",
  "NORMAL_VOLATILITY",
  "STRUCTURE_COMPATIBLE",
  "QUALITY_COMBINED",
];
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
    totalBps: 5,
    feeBps: 3,
    spreadBps: 1,
    slippageBps: 1,
    note: "Five basis points total round trip; sensitivity scenario, not an exchange fee promise.",
  },
  medium: {
    totalBps: 10,
    feeBps: 6,
    spreadBps: 2,
    slippageBps: 2,
    note: "Ten basis points total round trip; sensitivity scenario, not an exchange fee promise.",
  },
  conservative: {
    totalBps: 20,
    feeBps: 12,
    spreadBps: 3,
    slippageBps: 5,
    note: "Twenty basis points total round trip; conservative sensitivity scenario, not an exchange fee promise.",
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
if (options.longHorizon) {
  enrichEntriesWithClosedMtfContext(entries, fetched);
  const enrichedBaseline = evaluateAcrossTimeframes(entries, fetched, () => baselineConfiguration());
  const study = buildLongHorizonStudy(
    entries,
    enrichedBaseline,
    fetched,
    analysisStart,
    observedAt,
    options.days,
  );
  console.log(JSON.stringify(roundDeep(
    options.compact ? compactLongHorizonStudy(study, options.focus) : study,
  ), null, 2));
  process.exit(0);
}
if (options.robust) {
  enrichEntriesWithClosedMtfContext(entries, fetched);
  const robustStudy = buildRobustCandidateStudy(
    entries,
    fetched,
    baseline,
    analysisStart,
    observedAt,
    options.days,
  );
  const summarized = robustStudySummary(robustStudy);
  console.log(JSON.stringify(roundDeep(
    options.selection ? robustSelectionSummary(summarized, options.focus) : options.terse ? summarized : robustStudy,
  ), null, 2));
  process.exit(0);
}
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

type EntryQualityCandidate = {
  id: string;
  hypothesis: string;
  complexity: number;
  accepts: (trade: BacktestTrade) => boolean;
};

function priorResearchCutoff() {
  return new Date("2026-08-27T07:29:46.257Z");
}

function entryQualityCandidates(): EntryQualityCandidate[] {
  return [
  {
    id: "BASELINE",
    hypothesis: "Unfiltered live baseline control.",
    complexity: 0,
    accepts: () => true,
  },
  {
    id: "VOLUME_CONFIRMATION",
    hypothesis: "Entry-time relative volume >= 1.10 may remove low-participation setups.",
    complexity: 1,
    accepts: (trade) => (trade.volumeRatioAtEntry ?? Number.NEGATIVE_INFINITY) >= 1.1,
  },
  {
    id: "MTF_CONFIRMATION",
    hypothesis: "At least two causally closed timeframes aligned with the signal may improve directional quality.",
    complexity: 1,
    accepts: (trade) => (trade.alignedTimeframes ?? 0) >= 2,
  },
  {
    id: "REFERENCE_TREND_ALIGNED",
    hypothesis: "Signals aligned with the last closed 4h trend may avoid opposing-regime entries.",
    complexity: 1,
    accepts: (trade) => trade.trendRegimeAtEntry === "ALIGNED_TREND",
  },
  {
    id: "NOT_HIGH_VOLATILITY",
    hypothesis: "Avoiding the highest causal realized-volatility quartile may reduce noise-driven losses.",
    complexity: 1,
    accepts: (trade) => trade.volatilityRegimeAtEntry === "LOW" || trade.volatilityRegimeAtEntry === "NORMAL",
  },
  {
    id: "STRUCTURE_PATH_CLEAR",
    hypothesis: "The structural stop must fit inside live risk and the target must not sit beyond the nearest entry-time obstacle.",
    complexity: 1,
    accepts: (trade) => trade.structureStopAtr !== null
      && trade.structureStopAtr !== undefined
      && trade.favorableObstacleAtr !== null
      && trade.favorableObstacleAtr !== undefined
      && trade.structureStopAtr <= trade.stopAtr
      && trade.targetAtr <= trade.favorableObstacleAtr,
  },
  {
    id: "MTF_AND_NOT_HIGH_VOLATILITY",
    hypothesis: "Closed-candle MTF alignment plus non-extreme realized volatility may favor selective, stable entries.",
    complexity: 2,
    accepts: (trade) => (trade.alignedTimeframes ?? 0) >= 2
      && (trade.volatilityRegimeAtEntry === "LOW" || trade.volatilityRegimeAtEntry === "NORMAL"),
  },
  ];
}

function buildLongHorizonStudy(
  _entries: EntryMap,
  baselineTrades: TradeMap,
  data: Record<HistoricalTimeframe, TimeframeData>,
  start: Date,
  end: Date,
  days: number,
) {
  const priorCutoff = priorResearchCutoff();
  const allBaseline = COMMERCIAL_SIGNAL_TIMEFRAMES.flatMap((timeframe) => baselineTrades[timeframe]);
  return {
    metadata: {
      provider: "Binance public Spot klines",
      symbol: "BTCUSDT",
      analysisStart: start.toISOString(),
      analysisEnd: end.toISOString(),
      days,
      strategy: "Immutable live BASELINE; exits, thresholds, expiry and scheduler unchanged.",
      candlePolicy: "Live and research both accept a kline only when Binance closeTime <= the effective observation time.",
      regimePolicy: {
        trend: "The last causally closed 4h context at the entry time: bullish, bearish or sideways; alignment is evaluated against signal direction.",
        volatility: "Current 14-candle realized true-range percentage ranked against earlier rolling 14-candle values inside the 200 closed candles available at entry; <=p25 LOW, >=p75 HIGH, otherwise NORMAL.",
      },
      partitions: "Chronological anchored folds 0-40/40-55, 0-55/55-70, 0-70/70-85 and 0-85/85-100. No random split.",
      oosCaveat: "The latest 15% is sealed within this run but overlaps dates inspected in the prior one-year study. Only observations after the prior cutoff are genuinely new and are reported separately; they cannot yet establish commercial edge.",
      priorResearchCutoff: priorCutoff.toISOString(),
      frictionScenarios: FRICTION_SCENARIOS,
      candidatePolicy: "Seven predeclared baseline-exit entry-quality hypotheses. No exit grid and no parameter search.",
      liveStrategyChanged: false,
      databaseWrites: false,
      historyWrites: false,
      telegramCalls: false,
    },
    dataQuality: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, {
      ...validateCandleSeries(data[timeframe].candles, INTERVAL_MS[timeframe], end),
      incompleteExcluded: data[timeframe].incompleteExcluded,
    }])),
    baseline: {
      overall: longHorizonPerformance(allBaseline, days),
      byTimeframe: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
        timeframe,
        {
          performance: longHorizonPerformance(baselineTrades[timeframe], days),
          chronologicalYears: chronologicalYearSummaries(baselineTrades[timeframe], start, end),
        },
      ])),
      genuinelyNewAfterPriorCutoff: longHorizonPerformance(
        allBaseline.filter((trade) => Date.parse(trade.openedAt) > priorCutoff.getTime()),
        Math.max(1 / 24, (end.getTime() - priorCutoff.getTime()) / 86_400_000),
      ),
    },
    regimes: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, {
      referenceTrend: regimeGroups(
        baselineTrades[timeframe],
        (trade) => trade.referenceTrendAtEntry ?? "unavailable",
        days,
      ),
      trendAlignment: regimeGroups(
        baselineTrades[timeframe],
        (trade) => trade.trendRegimeAtEntry ?? "UNAVAILABLE",
        days,
      ),
      volatility: regimeGroups(
        baselineTrades[timeframe],
        (trade) => trade.volatilityRegimeAtEntry ?? "UNAVAILABLE",
        days,
      ),
      combined: regimeGroups(
        baselineTrades[timeframe],
        (trade) => `${trade.trendRegimeAtEntry ?? "UNAVAILABLE"}|${trade.volatilityRegimeAtEntry ?? "UNAVAILABLE"}`,
        days,
      ),
    }])),
    candidates: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
      timeframe,
      qualityCandidateStudy(baselineTrades[timeframe], start, end, days),
    ])),
  };
}

function longHorizonPerformance(trades: BacktestTrade[], exposureDays: number) {
  const baseline = summarizeBacktest(trades);
  const positive = trades.map((trade) => netRealizedR(trade, 0))
    .filter((value): value is number => value !== null && value > 0)
    .sort((left, right) => right - left);
  const positiveTotal = positive.reduce((sum, value) => sum + value, 0);
  return {
    signals: baseline.signals,
    wins: baseline.wins,
    losses: baseline.losses,
    expired: baseline.expired,
    winRateIncludingExpired: baseline.winRateIncludingExpired,
    expiredRate: baseline.expiredRate,
    consecutiveLosses: baseline.consecutiveLosses,
    signalsPerDay: exposureDays > 0 ? baseline.signals / exposureDays : null,
    signalsPerWeek: exposureDays > 0 ? baseline.signals / exposureDays * 7 : null,
    topFivePositiveContributionPct: positiveTotal > 0
      ? positive.slice(0, 5).reduce((sum, value) => sum + value, 0) / positiveTotal * 100
      : null,
    friction: Object.fromEntries(Object.entries(FRICTION_SCENARIOS).map(([name, scenario]) => {
      const summary = summarizeBacktest(trades, scenario.totalBps);
      return [name, {
        totalBps: scenario.totalBps,
        expectancyR: summary.expectancyR,
        profitFactor: summary.profitFactor,
        maximumDrawdownR: summary.maximumDrawdownR,
      }];
    })),
  };
}

function longHorizonSummary(trades: BacktestTrade[], frictionBps: number, exposureDays: number) {
  const summary = summarizeBacktest(trades, frictionBps);
  const positive = trades.map((trade) => netRealizedR(trade, frictionBps))
    .filter((value): value is number => value !== null && value > 0)
    .sort((left, right) => right - left);
  const positiveTotal = positive.reduce((sum, value) => sum + value, 0);
  return {
    signals: summary.signals,
    wins: summary.wins,
    losses: summary.losses,
    expired: summary.expired,
    winRateIncludingExpired: summary.winRateIncludingExpired,
    expiredRate: summary.expiredRate,
    expectancyR: summary.expectancyR,
    profitFactor: summary.profitFactor,
    maximumDrawdownR: summary.maximumDrawdownR,
    consecutiveLosses: summary.consecutiveLosses,
    signalsPerDay: exposureDays > 0 ? summary.signals / exposureDays : null,
    signalsPerWeek: exposureDays > 0 ? summary.signals / exposureDays * 7 : null,
    topFivePositiveContributionPct: positiveTotal > 0
      ? positive.slice(0, 5).reduce((sum, value) => sum + value, 0) / positiveTotal * 100
      : null,
  };
}

function regimeGroups(
  trades: BacktestTrade[],
  keyFor: (trade: BacktestTrade) => string,
  days: number,
) {
  const groups = new Map<string, BacktestTrade[]>();
  for (const trade of trades) {
    const key = keyFor(trade);
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => [key, longHorizonPerformance(values, days)]));
}

function chronologicalYearSummaries(trades: BacktestTrade[], start: Date, end: Date) {
  const windows: Array<{ start: Date; end: Date }> = [];
  let cursor = start;
  while (cursor < end) {
    const next = new Date(Math.min(end.getTime(), cursor.getTime() + 365 * 86_400_000));
    windows.push({ start: cursor, end: next });
    cursor = next;
  }
  return windows.map((window, index) => {
    const selected = trades.filter((trade) => {
      const openedAt = Date.parse(trade.openedAt);
      return openedAt >= window.start.getTime() && openedAt < window.end.getTime();
    });
    const windowDays = (window.end.getTime() - window.start.getTime()) / 86_400_000;
    return {
      name: `YEAR_${index + 1}`,
      start: window.start.toISOString(),
      end: window.end.toISOString(),
      performance: longHorizonPerformance(selected, windowDays),
    };
  });
}

function qualityCandidateStudy(trades: BacktestTrade[], start: Date, end: Date, days: number) {
  const evaluated = entryQualityCandidates().map((candidate) => ({
    candidate,
    trades: trades.filter(candidate.accepts),
  }));
  const full = Object.fromEntries(evaluated.map(({ candidate, trades: selected }) => [candidate.id, {
    hypothesis: candidate.hypothesis,
    complexity: candidate.complexity,
    performance: longHorizonPerformance(selected, days),
    finalHoldout: longHorizonPerformance(
      fractionTrades(selected, start, end, 0.85, 1),
      days * 0.15,
    ),
  }]));
  const folds = [
    { name: "WF1", trainEnd: 0.4, testEnd: 0.55 },
    { name: "WF2", trainEnd: 0.55, testEnd: 0.7 },
    { name: "WF3", trainEnd: 0.7, testEnd: 0.85 },
    { name: "FINAL_HOLDOUT", trainEnd: 0.85, testEnd: 1 },
  ].map((fold) => {
    const ranked = evaluated.map(({ candidate, trades: selected }) => ({
      candidate,
      training: summarizeBacktest(
        fractionTrades(selected, start, end, 0, fold.trainEnd),
        FRICTION_SCENARIOS.medium.totalBps,
      ),
    })).filter(({ training }) => training.signals >= 30 && training.expectancyR !== null)
      .sort(compareQualityCandidate);
    const selected = ranked[0];
    if (!selected) return { ...fold, selected: null, training: null, test: null };
    const selectedTrades = evaluated.find(({ candidate }) => candidate.id === selected.candidate.id)!.trades;
    const testTrades = fractionTrades(selectedTrades, start, end, fold.trainEnd, fold.testEnd);
    const testDays = days * (fold.testEnd - fold.trainEnd);
    return {
      ...fold,
      selected: { id: selected.candidate.id, hypothesis: selected.candidate.hypothesis },
      training: longHorizonSummary(
        fractionTrades(selectedTrades, start, end, 0, fold.trainEnd),
        FRICTION_SCENARIOS.medium.totalBps,
        days * fold.trainEnd,
      ),
      test: longHorizonSummary(testTrades, FRICTION_SCENARIOS.medium.totalBps, testDays),
    };
  });
  return { full, anchoredWalkForwardAt10Bps: folds };
}

function compareQualityCandidate(
  left: { candidate: EntryQualityCandidate; training: BacktestSummary },
  right: { candidate: EntryQualityCandidate; training: BacktestSummary },
) {
  const expectancy = (right.training.expectancyR ?? Number.NEGATIVE_INFINITY)
    - (left.training.expectancyR ?? Number.NEGATIVE_INFINITY);
  if (expectancy !== 0) return expectancy;
  const profitFactor = (right.training.profitFactor ?? 0) - (left.training.profitFactor ?? 0);
  if (profitFactor !== 0) return profitFactor;
  if (left.candidate.complexity !== right.candidate.complexity) {
    return left.candidate.complexity - right.candidate.complexity;
  }
  return (left.training.maximumDrawdownR ?? Number.POSITIVE_INFINITY)
    - (right.training.maximumDrawdownR ?? Number.POSITIVE_INFINITY);
}

function fractionTrades(
  trades: BacktestTrade[],
  start: Date,
  end: Date,
  from: number,
  to: number,
) {
  const duration = end.getTime() - start.getTime();
  return trades.filter((trade) => {
    const point = (Date.parse(trade.openedAt) - start.getTime()) / duration;
    return point >= from && point < to;
  });
}

function compactLongHorizonStudy(
  report: ReturnType<typeof buildLongHorizonStudy>,
  focus: CommercialTimeframe | null,
) {
  const regimeRows: Array<Record<string, unknown>> = [];
  const candidateRows: Array<Record<string, unknown>> = [];
  const walkForward: Array<Record<string, unknown>> = [];
  const timeframes = focus === null ? COMMERCIAL_SIGNAL_TIMEFRAMES : [focus];
  for (const timeframe of timeframes) {
    for (const kind of ["referenceTrend", "volatility"] as const) {
      for (const [regime, performance] of Object.entries(report.regimes[timeframe][kind])) {
        regimeRows.push({ timeframe, kind, regime, ...compactLongPerformance(performance) });
      }
    }
    const candidateStudy = report.candidates[timeframe];
    const ranked = Object.entries(candidateStudy.full).map(([id, item]) => ({
      id,
      item,
      rank: item.performance.friction.medium.expectancyR ?? Number.NEGATIVE_INFINITY,
    })).sort((left, right) => right.rank - left.rank).slice(0, 3);
    for (const { id, item } of ranked) {
      candidateRows.push({
        timeframe,
        id,
        hypothesis: item.hypothesis,
        full: compactLongPerformance(item.performance),
        finalHoldout: compactLongPerformance(item.finalHoldout),
      });
    }
    for (const fold of candidateStudy.anchoredWalkForwardAt10Bps) {
      walkForward.push({
        timeframe,
        fold: fold.name,
        selected: fold.selected?.id ?? null,
        training: fold.training === null ? null : compactFoldSummary(fold.training),
        test: fold.test === null ? null : compactFoldSummary(fold.test),
      });
    }
  }
  return {
    metadata: report.metadata,
    dataQuality: report.dataQuality,
    baselineOverall: compactLongPerformance(report.baseline.overall),
    baselineByTimeframe: Object.fromEntries(timeframes.map((timeframe) => [
      timeframe,
      compactLongPerformance(report.baseline.byTimeframe[timeframe].performance),
    ])),
    chronologicalYears: Object.fromEntries(timeframes.map((timeframe) => [
      timeframe,
      report.baseline.byTimeframe[timeframe].chronologicalYears.map((window) => ({
        name: window.name,
        start: window.start,
        end: window.end,
        ...compactLongPerformance(window.performance),
      })),
    ])),
    regimes: regimeRows,
    topCandidates: candidateRows,
    walkForward,
    genuinelyNewAfterPriorCutoff: compactLongPerformance(report.baseline.genuinelyNewAfterPriorCutoff),
  };
}

function compactLongPerformance(performance: ReturnType<typeof longHorizonPerformance>) {
  return {
    signals: performance.signals,
    wins: performance.wins,
    losses: performance.losses,
    expired: performance.expired,
    winRateIncludingExpired: performance.winRateIncludingExpired,
    expiredRate: performance.expiredRate,
    signalsPerDay: performance.signalsPerDay,
    consecutiveLosses: performance.consecutiveLosses,
    topFivePositiveContributionPct: performance.topFivePositiveContributionPct,
    friction: performance.friction,
  };
}

function compactFoldSummary(summary: ReturnType<typeof longHorizonSummary>) {
  return {
    signals: summary.signals,
    wins: summary.wins,
    losses: summary.losses,
    expired: summary.expired,
    expectancyR: summary.expectancyR,
    profitFactor: summary.profitFactor,
    maximumDrawdownR: summary.maximumDrawdownR,
  };
}

function buildRobustCandidateStudy(
  cohort: EntryMap,
  data: Record<HistoricalTimeframe, TimeframeData>,
  baselineTrades: TradeMap,
  start: Date,
  end: Date,
  days: number,
) {
  const selectedTrades = {} as Record<CommercialTimeframe, BacktestTrade[]>;
  const byTimeframe = Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => {
    const thresholds = trainingThresholds(cohort[timeframe], start, end);
    const candidates = robustCandidates(timeframe, thresholds);
    const evaluated = candidates.map((candidate) => {
      const trades = filteredCandidateTrades(data[timeframe].candles, cohort[timeframe], candidate, thresholds);
      return {
        candidate,
        trades,
        train: summaryForTradePeriod(trades, "TRAIN", start, end, FRICTION_SCENARIOS.conservative.totalBps),
        development: summaryForTradePeriod(trades, "DEVELOPMENT", start, end, FRICTION_SCENARIOS.conservative.totalBps),
        validation: summaryForTradePeriod(trades, "VALIDATION", start, end, FRICTION_SCENARIOS.conservative.totalBps),
      };
    });
    const benchmarkWinner = selectCandidateBeforeOos(evaluated);
    const selected = selectCandidateBeforeOos(evaluated.filter(({ candidate }) => candidate.family !== "BASELINE"));
    const baselineOos = frictionForPeriod(baselineTrades[timeframe], "OUT_OF_SAMPLE", start, end);
    if (!selected) {
      selectedTrades[timeframe] = [];
      return [timeframe, {
        trainThresholds: thresholds,
        candidateCount: candidates.length,
        selected: null,
        benchmarkWinner: benchmarkWinner?.candidate ?? null,
        reason: "Insufficient TRAIN/DEVELOPMENT/VALIDATION sample for pre-OOS selection.",
        baseline: {
          overall: summarizeBacktest(baselineTrades[timeframe]),
          oosFriction: baselineOos,
        },
      }];
    }

    const candidate = selected.candidate;
    const trades = filteredCandidateTrades(data[timeframe].candles, cohort[timeframe], candidate, thresholds);
    selectedTrades[timeframe] = trades;
    const periodsIdeal = Object.fromEntries(PERIODS.map((period) => [
      period,
      summaryForTradePeriod(trades, period, start, end),
    ])) as Record<BacktestPeriod, BacktestSummary>;
    const oosFriction = frictionForPeriod(trades, "OUT_OF_SAMPLE", start, end);
    const baselineOosConservative = baselineOos.conservative;
    const candidateOosConservative = oosFriction.conservative;
    const preOosSummaries = [selected.train, selected.development, selected.validation];
    const promotionChecks = {
      positiveAndProfitableAcrossPreOosAfterConservativeFriction: preOosSummaries.every((summary) =>
        (summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0 && (summary.profitFactor ?? 0) > 1),
      positiveOosAfterConservativeFriction:
        (candidateOosConservative.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
        && (candidateOosConservative.profitFactor ?? 0) > 1,
      sufficientOosSample: candidateOosConservative.signals >= GEOMETRY_OOS_MINIMUM,
      drawdownControlled:
        candidateOosConservative.maximumDrawdownR !== null
        && baselineOosConservative.maximumDrawdownR !== null
        && candidateOosConservative.maximumDrawdownR <= baselineOosConservative.maximumDrawdownR * 1.25,
      expiredRateMateriallyLower:
        candidateOosConservative.expiredRate !== null
        && baselineOosConservative.expiredRate !== null
        && candidateOosConservative.expiredRate <= baselineOosConservative.expiredRate - 10,
      lossRateNotWorse:
        candidateOosConservative.lossRate !== null
        && baselineOosConservative.lossRate !== null
        && candidateOosConservative.lossRate <= baselineOosConservative.lossRate + 2,
      frequencyNotIncreased: trades.length <= baselineTrades[timeframe].length,
    };
    return [timeframe, {
      trainThresholds: thresholds,
      candidateCount: candidates.length,
      selected: candidate,
      benchmarkWinner: benchmarkWinner?.candidate ?? null,
      selectionEvidenceConservative: {
        train: selected.train,
        development: selected.development,
        validation: selected.validation,
      },
      baseline: {
        overall: summarizeBacktest(baselineTrades[timeframe]),
        frequency: signalFrequency(summarizeBacktest(baselineTrades[timeframe]), days),
        periods: Object.fromEntries(PERIODS.map((period) => [
          period,
          summaryForTradePeriod(baselineTrades[timeframe], period, start, end),
        ])),
        oosFriction: baselineOos,
      },
      candidate: {
        overall: summarizeBacktest(trades),
        frequency: signalFrequency(summarizeBacktest(trades), days),
        periods: periodsIdeal,
        oosFriction,
        walkForward: anchoredWalkForward(evaluated, start, end),
      },
      promotionChecks,
      shadowEligible: Object.values(promotionChecks).every(Boolean),
    }];
  })) as Record<CommercialTimeframe, Record<string, unknown>>;

  const allBaseline = COMMERCIAL_SIGNAL_TIMEFRAMES.flatMap((timeframe) => baselineTrades[timeframe]);
  const allSelected = COMMERCIAL_SIGNAL_TIMEFRAMES.flatMap((timeframe) => selectedTrades[timeframe]);
  return {
    metadata: {
      provider: "Binance public Spot klines",
      symbol: "BTCUSDT",
      analysisStart: start.toISOString(),
      analysisEnd: end.toISOString(),
      days,
      liveStrategyChanged: false,
      databaseWrites: false,
      historyWrites: false,
      telegramCalls: false,
      fixedEntryCohort: "All candidates reuse baseline entries; filters can remove but never add entries.",
      candlePolicy: "Every feature uses only candles whose provider closeTime is at or before the decision time.",
      partitions: "Chronological 50% TRAIN / 20% DEVELOPMENT / 15% VALIDATION / 15% sealed OUT_OF_SAMPLE.",
      selection: "Worst-period conservative-friction expectancy across TRAIN/DEVELOPMENT/VALIDATION, then average expectancy, PF and drawdown. OOS is evaluated only after selection.",
      geometry: {
        stopAtr: [0.75, 1, 1.25, 1.5, 2],
        stopPercent: [0.25, 0.3, 0.4, 0.5],
        rewardRiskStudied: [1.25, 1.5, 1.75, 2],
        liveBaselineMinimumRewardRisk: 1.5,
        offlineResearchMinimumRewardRisk: 1.25,
        atrPairs: buildRobustGeometryGrid().length,
        percentagePairs: buildRobustPercentageGrid().length,
        expiryCandlesChanged: false,
      },
      families: {
        ATR: "Stop/target scale with ATR at entry.",
        PERCENT: "Explicit 0.25%, 0.30%, 0.40%, and 0.50% stops are frozen before DEV/VALIDATION/OOS.",
        ATR_STRUCTURE_HYBRID: "The live structural/ATR stop is capped by the candidate ATR distance; optional filters require stop and target compatibility with entry-time support/resistance.",
      },
      filters: {
        VOLUME_1_10: "Entry-time volume ratio >= 1.10.",
        MTF_2: "At least two closed-candle timeframes agree with direction.",
        NORMAL_VOLATILITY: "Entry ATR percentage lies within TRAIN p20-p80 for that timeframe.",
        STRUCTURE_COMPATIBLE: "Stop reaches supporting structure and target does not sit beyond the nearest entry-time obstacle.",
        QUALITY_COMBINED: "All four entry-time filters pass.",
      },
      scoreAudit: "No numeric score exists in the live strategy; entries are Boolean confluence gates. This study does not invent one.",
      frictionScenarios: FRICTION_SCENARIOS,
    },
    dataQuality: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, {
      ...validateCandleSeries(data[timeframe].candles, INTERVAL_MS[timeframe], end),
      incompleteExcluded: data[timeframe].incompleteExcluded,
    }])),
    baseline: {
      overall: summarizeBacktest(allBaseline),
      frequency: signalFrequency(summarizeBacktest(allBaseline), days),
      oosFriction: frictionForPeriod(allBaseline, "OUT_OF_SAMPLE", start, end),
      distributions: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
        timeframe,
        timeframeDiagnostics(baselineTrades[timeframe]),
      ])),
    },
    selectedCombined: {
      overall: summarizeBacktest(allSelected),
      frequency: signalFrequency(summarizeBacktest(allSelected), days),
      oosFriction: frictionForPeriod(allSelected, "OUT_OF_SAMPLE", start, end),
    },
    byTimeframe,
  };
}

function robustCandidates(_timeframe: CommercialTimeframe, _thresholds: OfflineFilterThresholds): RobustCandidate[] {
  const candidates: RobustCandidate[] = [];
  for (const filter of ROBUST_FILTERS) {
    candidates.push({
      id: `BASELINE_${filter}`,
      family: "BASELINE",
      filter,
      configuration: { ...baselineConfiguration(), name: `BASELINE_${filter}` },
    });
  }
  for (const geometry of buildRobustGeometryGrid()) {
    for (const filter of ROBUST_FILTERS) {
      const suffix = `S${geometry.stopAtr}_T${geometry.targetAtr}_${filter}`;
      candidates.push({
        id: `ATR_${suffix}`,
        family: "ATR",
        filter,
        configuration: {
          name: `ATR_${suffix}`,
          riskMode: "ATR",
          atrMultiple: geometry.stopAtr,
          rewardRisk: geometry.rewardRisk,
          expiryCandles: 12,
        },
      });
      candidates.push({
        id: `HYBRID_${suffix}`,
        family: "ATR_STRUCTURE_HYBRID",
        filter,
        configuration: {
          name: `HYBRID_${suffix}`,
          riskMode: "CAPPED_ATR",
          atrMultiple: geometry.stopAtr,
          rewardRisk: geometry.rewardRisk,
          expiryCandles: 12,
        },
      });
    }
  }
  for (const geometry of buildRobustPercentageGrid()) {
    for (const filter of ROBUST_FILTERS) {
      const suffix = `S${geometry.stopPercent}P_T${geometry.targetPercent}P_${filter}`;
      candidates.push({
        id: `PERCENT_${suffix}`,
        family: "PERCENT",
        filter,
        configuration: {
          name: `PERCENT_${suffix}`,
          riskMode: "PERCENT",
          riskPercent: geometry.stopPercent,
          rewardRisk: geometry.rewardRisk,
          expiryCandles: 12,
        },
      });
    }
  }
  return candidates;
}

function trainingThresholds(entries: BaselineEntry[], start: Date, end: Date): OfflineFilterThresholds {
  const values = entries
    .filter((entry) => assignPeriod(entry.openedAt, start, end) === "TRAIN")
    .map((entry) => entry.atrPctAtEntry)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  return {
    atrPctLow: percentile(values, 0.2),
    atrPctMedian: percentile(values, 0.5),
    atrPctHigh: percentile(values, 0.8),
  };
}

function filteredCandidateTrades(
  candles: ClosedAnalysisCandle[],
  entries: BaselineEntry[],
  candidate: RobustCandidate,
  thresholds: OfflineFilterThresholds,
): BacktestTrade[] {
  return evaluateEntries(candles, entries, candidate.configuration)
    .filter((trade) => passesOfflineFilter(trade, candidate.filter, thresholds));
}

function frictionForPeriod(
  trades: BacktestTrade[],
  period: BacktestPeriod,
  start: Date,
  end: Date,
): Record<FrictionScenarioName, BacktestSummary> {
  return Object.fromEntries(Object.entries(FRICTION_SCENARIOS).map(([name, scenario]) => [
    name,
    summaryForTradePeriod(trades, period, start, end, scenario.totalBps),
  ])) as Record<FrictionScenarioName, BacktestSummary>;
}

function signalFrequency(summary: BacktestSummary, days: number) {
  return {
    signalsPerDay: days > 0 ? summary.signals / days : null,
    signalsPerWeek: days > 0 ? summary.signals / days * 7 : null,
  };
}

function anchoredWalkForward(
  evaluated: Array<{ candidate: RobustCandidate; trades: BacktestTrade[] }>,
  start: Date,
  end: Date,
) {
  const folds = [
    { name: "WF1", trainEnd: 0.35, testEnd: 0.5 },
    { name: "WF2", trainEnd: 0.5, testEnd: 0.65 },
    { name: "WF3", trainEnd: 0.65, testEnd: 0.75 },
    { name: "WF4", trainEnd: 0.75, testEnd: 0.85 },
  ];
  const results = folds.map((fold) => {
    const eligible = evaluated
      .filter(({ candidate }) => candidate.family !== "BASELINE")
      .map((item) => ({
        ...item,
        training: summaryForFraction(
          item.trades,
          start,
          end,
          0,
          fold.trainEnd,
          FRICTION_SCENARIOS.conservative.totalBps,
        ),
      }))
      .filter(({ training }) => training.signals >= GEOMETRY_TRAIN_MINIMUM && training.expectancyR !== null)
      .sort((left, right) => compareCandidateSummary({ summary: left.training }, { summary: right.training }));
    const selected = eligible[0];
    if (!selected) return { ...fold, selected: null, training: null, test: null };
    return {
      ...fold,
      selected: selected.candidate,
      training: selected.training,
      test: {
        ideal: summaryForFraction(selected.trades, start, end, fold.trainEnd, fold.testEnd, 0),
        conservative: summaryForFraction(
          selected.trades,
          start,
          end,
          fold.trainEnd,
          fold.testEnd,
          FRICTION_SCENARIOS.conservative.totalBps,
        ),
      },
    };
  });
  const completed = results.filter((fold) => fold.test !== null);
  return {
    method: "Anchored walk-forward inside the pre-OOS 85% only; each fold selects from earlier data and tests the next chronological window. The final 15% OOS remains sealed.",
    selectionFrictionBps: FRICTION_SCENARIOS.conservative.totalBps,
    folds: results,
    positiveTestFoldsAfterFriction: completed.filter((fold) =>
      (fold.test!.conservative.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
      && (fold.test!.conservative.profitFactor ?? 0) > 1).length,
    evaluatedFolds: completed.length,
  };
}

function summaryForFraction(
  trades: BacktestTrade[],
  start: Date,
  end: Date,
  from: number,
  to: number,
  frictionBps: number,
) {
  const duration = end.getTime() - start.getTime();
  return summarizeBacktest(trades.filter((trade) => {
    const point = (Date.parse(trade.openedAt) - start.getTime()) / duration;
    return point >= from && point < to;
  }), frictionBps);
}

function enrichEntriesWithClosedMtfContext(
  entries: EntryMap,
  data: Record<HistoricalTimeframe, TimeframeData>,
): void {
  const trendCache = new Map<string, "bullish" | "bearish" | "sideways" | null>();
  for (const timeframe of COMMERCIAL_SIGNAL_TIMEFRAMES) {
    for (const entry of entries[timeframe]) {
      const decisionTime = Date.parse(data[timeframe].candles[entry.entryIndex].closeTime);
      let aligned = 0;
      let referenceTrend: "bullish" | "bearish" | "sideways" | null = null;
      for (const contextTimeframe of COMMERCIAL_SIGNAL_TIMEFRAMES) {
        const index = lastClosedIndexAt(data[contextTimeframe].candles, decisionTime);
        if (index < 199) continue;
        const key = `${contextTimeframe}:${index}`;
        let trend = trendCache.get(key);
        if (trend === undefined) {
          trend = calculateTechnicalAnalysis(
            data[contextTimeframe].candles.slice(index - 199, index + 1),
            "binance",
          ).marketStructure.trend;
          trendCache.set(key, trend);
        }
        if (contextTimeframe === "4h") referenceTrend = trend;
        if ((entry.direction === "LONG" && trend === "bullish")
          || (entry.direction === "SHORT" && trend === "bearish")) aligned += 1;
      }
      entry.alignedTimeframes = aligned;
      entry.referenceTrendAtEntry = referenceTrend;
      entry.trendRegimeAtEntry = referenceTrend === null
        ? "UNAVAILABLE"
        : referenceTrend === "sideways"
          ? "SIDEWAYS"
          : (entry.direction === "LONG" && referenceTrend === "bullish")
              || (entry.direction === "SHORT" && referenceTrend === "bearish")
            ? "ALIGNED_TREND"
            : "OPPOSING_TREND";
    }
  }
}

function lastClosedIndexAt(candles: ClosedAnalysisCandle[], timestamp: number): number {
  let low = 0;
  let high = candles.length - 1;
  let answer = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(candles[middle].closeTime) <= timestamp) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return answer;
}

function robustStudySummary(report: ReturnType<typeof buildRobustCandidateStudy>) {
  const brief = (summary: BacktestSummary | null | undefined) => summary ? ({
    signals: summary.signals,
    wins: summary.wins,
    losses: summary.losses,
    expired: summary.expired,
    winRateIncludingExpired: summary.winRateIncludingExpired,
    expiredRate: summary.expiredRate,
    expectancyR: summary.expectancyR,
    profitFactor: summary.profitFactor,
    maximumDrawdownR: summary.maximumDrawdownR,
    consecutiveLosses: summary.consecutiveLosses,
    medianStopPct: summary.medianStopPct,
    medianTargetPct: summary.medianTargetPct,
  }) : null;
  const briefWalkForward = (study: ReturnType<typeof anchoredWalkForward>) => ({
    method: study.method,
    selectionFrictionBps: study.selectionFrictionBps,
    positiveTestFoldsAfterFriction: study.positiveTestFoldsAfterFriction,
    evaluatedFolds: study.evaluatedFolds,
    folds: study.folds.map((fold) => ({
      name: fold.name,
      trainEnd: fold.trainEnd,
      testEnd: fold.testEnd,
      selected: fold.selected,
      test: fold.test === null ? null : {
        ideal: brief(fold.test.ideal),
        conservative: brief(fold.test.conservative),
      },
    })),
  });
  return {
    metadata: report.metadata,
    dataQuality: report.dataQuality,
    baseline: {
      overall: brief(report.baseline.overall),
      frequency: report.baseline.frequency,
      oosFriction: Object.fromEntries(Object.entries(report.baseline.oosFriction)
        .map(([name, summary]) => [name, brief(summary)])),
      distributions: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => {
        const diagnostic = report.baseline.distributions[timeframe];
        return [timeframe, {
          all: diagnostic.all,
          timeToTargetCandles: diagnostic.timeToTargetCandles,
          timeToStopCandles: diagnostic.timeToStopCandles,
        }];
      })),
    },
    selectedCombined: {
      overall: brief(report.selectedCombined.overall),
      frequency: report.selectedCombined.frequency,
      oosFriction: Object.fromEntries(Object.entries(report.selectedCombined.oosFriction)
        .map(([name, summary]) => [name, brief(summary)])),
    },
    byTimeframe: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => {
      const item = report.byTimeframe[timeframe] as {
        trainThresholds: OfflineFilterThresholds;
        candidateCount: number;
        selected?: RobustCandidate | null;
        benchmarkWinner?: RobustCandidate | null;
        reason?: string;
        selectionEvidenceConservative?: Record<"train" | "development" | "validation", BacktestSummary>;
        baseline: { overall: BacktestSummary; frequency?: ReturnType<typeof signalFrequency>; oosFriction: Record<FrictionScenarioName, BacktestSummary> };
        candidate?: {
          overall: BacktestSummary;
          frequency: ReturnType<typeof signalFrequency>;
          periods: Record<BacktestPeriod, BacktestSummary>;
          oosFriction: Record<FrictionScenarioName, BacktestSummary>;
          walkForward: ReturnType<typeof anchoredWalkForward>;
        };
        promotionChecks?: Record<string, boolean>;
        shadowEligible?: boolean;
      };
      return [timeframe, {
        trainThresholds: item.trainThresholds,
        candidateCount: item.candidateCount,
        selected: item.selected ?? null,
        benchmarkWinner: item.benchmarkWinner ?? null,
        reason: item.reason,
        selectionEvidenceConservative: item.selectionEvidenceConservative
          ? Object.fromEntries(Object.entries(item.selectionEvidenceConservative).map(([period, summary]) => [period, brief(summary)]))
          : null,
        baseline: {
          overall: brief(item.baseline.overall),
          frequency: item.baseline.frequency ?? null,
          oosFriction: Object.fromEntries(Object.entries(item.baseline.oosFriction).map(([name, summary]) => [name, brief(summary)])),
        },
        candidate: item.candidate ? {
          overall: brief(item.candidate.overall),
          frequency: item.candidate.frequency,
          periods: Object.fromEntries(Object.entries(item.candidate.periods).map(([period, summary]) => [period, brief(summary)])),
          oosFriction: Object.fromEntries(Object.entries(item.candidate.oosFriction).map(([name, summary]) => [name, brief(summary)])),
          walkForward: briefWalkForward(item.candidate.walkForward),
        } : null,
        promotionChecks: item.promotionChecks ?? null,
        shadowEligible: item.shadowEligible ?? false,
      }];
    })),
  };
}

function robustSelectionSummary(
  report: ReturnType<typeof robustStudySummary>,
  focus: CommercialTimeframe | null,
) {
  const timeframes = focus === null ? COMMERCIAL_SIGNAL_TIMEFRAMES : [focus];
  return {
    metadata: {
      analysisStart: report.metadata.analysisStart,
      analysisEnd: report.metadata.analysisEnd,
      geometry: report.metadata.geometry,
      frictionScenarios: report.metadata.frictionScenarios,
      selection: report.metadata.selection,
    },
    baseline: {
      overall: report.baseline.overall,
      frequency: report.baseline.frequency,
      oosFriction: report.baseline.oosFriction,
    },
    selectedCombined: report.selectedCombined,
    byTimeframe: Object.fromEntries(timeframes.map((timeframe) => {
      const item = report.byTimeframe[timeframe];
      return [timeframe, {
        candidateCount: item.candidateCount,
        selected: item.selected,
        benchmarkWinner: item.benchmarkWinner,
        reason: item.reason,
        selectionEvidenceConservative: item.selectionEvidenceConservative,
        baseline: item.baseline,
        candidate: item.candidate === null ? null : {
          overall: item.candidate.overall,
          frequency: item.candidate.frequency,
          periods: item.candidate.periods,
          oosFriction: item.candidate.oosFriction,
          walkForward: {
            selectionFrictionBps: item.candidate.walkForward.selectionFrictionBps,
            positiveTestFoldsAfterFriction: item.candidate.walkForward.positiveTestFoldsAfterFriction,
            evaluatedFolds: item.candidate.walkForward.evaluatedFolds,
            folds: item.candidate.walkForward.folds.map((fold) => ({
              name: fold.name,
              selected: fold.selected,
              test: fold.test,
            })),
          },
        },
        promotionChecks: item.promotionChecks,
        shadowEligible: item.shadowEligible,
      }];
    })),
  };
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

function timeframeDiagnostics(trades: BacktestTrade[]) {
  const completed = trades.filter((trade) => trade.outcome !== "CENSORED");
  return {
    all: excursionDistribution(completed),
    byOutcome: Object.fromEntries(([
      "WIN",
      "LOSS",
      "EXPIRED",
    ] as const).map((outcome) => [outcome, excursionDistribution(
      completed.filter((trade) => trade.outcome === outcome),
    )])),
    timeToTargetCandles: distribution(
      completed.filter((trade) => trade.outcome === "WIN").map((trade) => trade.durationCandles).filter(isNumber),
    ),
    timeToStopCandles: distribution(
      completed.filter((trade) => trade.outcome === "LOSS").map((trade) => trade.durationCandles).filter(isNumber),
    ),
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
    mfePct: distribution(trades.map((trade) => trade.mfePct).filter(isNumber)),
    maePct: distribution(trades.map((trade) => trade.maePct).filter(isNumber)),
    mfeR: distribution(trades.map((trade) => trade.mfeR).filter(isNumber)),
    maeR: distribution(trades.map((trade) => trade.maeR).filter(isNumber)),
    timeToMfeCandles: distribution(trades.map((trade) => trade.timeToMfeCandles).filter(isNumber)),
    timeToMaeCandles: distribution(trades.map((trade) => trade.timeToMaeCandles).filter(isNumber)),
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
  const focusValue = args.find((argument) => argument.startsWith("--focus="))?.split("=")[1];
  const focus = focusValue === undefined
    ? null
    : COMMERCIAL_SIGNAL_TIMEFRAMES.find((timeframe) => timeframe === focusValue) ?? null;
  if (focusValue !== undefined && focus === null) {
    throw new Error(`--focus must be one of ${COMMERCIAL_SIGNAL_TIMEFRAMES.join(", ")}.`);
  }
  return {
    days,
    end,
    compact: args.includes("--compact"),
    terse: args.includes("--terse"),
    geometry: args.includes("--geometry"),
    selection: args.includes("--selection"),
    baselineOnly: args.includes("--baseline-only"),
    robust: args.includes("--robust"),
    longHorizon: args.includes("--long-horizon"),
    focus,
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
