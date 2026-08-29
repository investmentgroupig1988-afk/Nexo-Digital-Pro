import { getBinance } from "../services/market";
import {
  baselineConfiguration,
  evaluateEntries,
  generateBaselineEntries,
  summarizeBacktest,
  validateCandleSeries,
  type BacktestSummary,
  type BacktestTrade,
  type ClosedAnalysisCandle,
  type ExitConfiguration,
} from "../services/signal-backtest";
import { COMMERCIAL_SIGNAL_TIMEFRAMES } from "../services/signal-engine";
import type { HistoricalTimeframe } from "../services/historical";
import {
  V3_ENTRY_CANDIDATES,
  V3_EXECUTION_TIMEFRAMES,
  V3_HYPOTHESES,
  V3_PERIODS,
  buildV3Contexts,
  entryGatePasses,
  evaluateV3Entries,
  filterV3Entries,
  generateV3BaselineSetups,
  isV3CandleUsable,
  selectV3BeforeSealed,
  v3Period,
  type V3EntryCandidateId,
  type V3ExecutionTimeframe,
  type V3FeatureSnapshot,
  type V3PreSealedCandidate,
  type V3SetupEntry,
} from "../services/signal-strategy-v3";

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];
type ServerTime = { serverTime: number };
type TimeframeData = { candles: ClosedAnalysisCandle[]; incompleteExcluded: number };
type V3Trade = BacktestTrade & { feature: V3FeatureSnapshot };
type Period = "DEVELOPMENT" | "VALIDATION" | "HOLDOUT" | "PSEUDO_FORWARD";
type SelectedDefinition = { entry: V3EntryCandidateId; exit: ExitConfiguration; entryGatePassed: boolean };

const INTERVAL_MS: Record<HistoricalTimeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};
const FIXED_END = new Date("2026-08-28T00:00:00.000Z");
const DEFAULT_DAYS = 1461;
const FRICTION = {
  ideal: { totalBps: 0, feeBps: 0, spreadBps: 0, slippageBps: 0 },
  decision: { totalBps: 5, feeBps: 3, spreadBps: 1, slippageBps: 1 },
  stress: { totalBps: 10, feeBps: 6, spreadBps: 2, slippageBps: 2 },
} as const;
const PUBLISHED_V2_BASELINE = { signals: 9409, wins: 1050, losses: 1504, expired: 6855 };

const options = parseOptions(process.argv.slice(2));
const serverTime = options.end === null ? await getBinance<ServerTime>("/time", {}) : null;
const observedAt = options.end ?? new Date(serverTime!.serverTime);
const analysisStart = new Date(observedAt.getTime() - options.days * 86_400_000);
const fetched = Object.fromEntries(await Promise.all(COMMERCIAL_SIGNAL_TIMEFRAMES.map(async (timeframe) => {
  const warmupStart = new Date(analysisStart.getTime() - INTERVAL_MS[timeframe] * 220);
  return [timeframe, await fetchClosedCandles(timeframe, warmupStart, observedAt, observedAt)];
}))) as Record<HistoricalTimeframe, TimeframeData>;

const contexts = buildV3Contexts({
  candles1h: fetched["1h"].candles,
  candles4h: fetched["4h"].candles,
});
const setups = Object.fromEntries(V3_EXECUTION_TIMEFRAMES.map((timeframe) => [timeframe, generateV3BaselineSetups({
  candles: fetched[timeframe].candles,
  timeframe,
  ...contexts,
  analysisStart,
})])) as Record<V3ExecutionTimeframe, V3SetupEntry[]>;

const v3BaselineTrades = Object.fromEntries(V3_EXECUTION_TIMEFRAMES.map((timeframe) => [timeframe, evaluateV3Entries(
  fetched[timeframe].candles,
  filterV3Entries(setups[timeframe], "BASELINE_ALL"),
  baselineConfiguration(),
)])) as Record<V3ExecutionTimeframe, V3Trade[]>;
const baseline4h = evaluateEntries(
  fetched["4h"].candles,
  generateBaselineEntries(fetched["4h"].candles, "4h", analysisStart),
  baselineConfiguration(),
);
const baselineTrades: Record<HistoricalTimeframe, BacktestTrade[]> = {
  "1m": [],
  "5m": v3BaselineTrades["5m"],
  "15m": v3BaselineTrades["15m"],
  "1h": v3BaselineTrades["1h"],
  "4h": baseline4h,
};
const allBaseline = COMMERCIAL_SIGNAL_TIMEFRAMES.flatMap((timeframe) => baselineTrades[timeframe]);
const baselineSummary = summarizeBacktest(allBaseline, 0);

const studies = Object.fromEntries(V3_EXECUTION_TIMEFRAMES.map((timeframe) => [timeframe, studyTimeframe(timeframe)])) as Record<
  V3ExecutionTimeframe,
  ReturnType<typeof studyTimeframe>
>;
const finalists = V3_EXECUTION_TIMEFRAMES.map((timeframe) => studies[timeframe].finalCandidate);

const report = {
  metadata: {
    name: "TRENORO Signal Strategy V3 offline entry-quality research",
    provider: "Binance public Spot BTCUSDT klines",
    analysisStart: analysisStart.toISOString(),
    analysisEnd: observedAt.toISOString(),
    days: options.days,
    partitions: "Chronological 45% DEVELOPMENT / 25% VALIDATION / 15% HOLDOUT / 15% PSEUDO_FORWARD.",
    contaminationCaveat: "All dates overlap research already inspected in V1/V2. HOLDOUT and PSEUDO_FORWARD are sealed inside V3 selection, but neither is genuinely unseen market data.",
    candlePolicy: "Only Binance candles with closeTime <= effective observation time are admitted; higher-timeframe context is causal at the execution candle close.",
    experimentOrder: [
      "Twenty-five entry hypotheses were frozen before the four-year result was inspected.",
      "Every entry candidate uses the frozen BASELINE exit first.",
      "Only an entry positive in DEVELOPMENT and VALIDATION at both 5 and 10 bps may enter the four-item exit study.",
      "HOLDOUT and PSEUDO_FORWARD never enter selectors or rankings.",
    ],
    promotionRule: {
      promising: "Entry gate passed; positive expectancy and PF > 1 at 5 bps in DEVELOPMENT, VALIDATION, HOLDOUT, and PSEUDO_FORWARD; full 10 bps expectancy >= 0; sufficient sample; at least three positive anchored years; drawdown below same-timeframe baseline.",
      robust: "PROMISING plus positive PSEUDO_FORWARD at 10 bps, all four anchored years positive at 5 bps, and top-five winning trades <= 50% of gross positive R.",
      failure: "A candidate that fails costs or either sealed partition is REJECT, regardless of relative rank.",
    },
    friction: FRICTION,
    entryHypotheses: V3_HYPOTHESES,
    totalEntryVariants: V3_ENTRY_CANDIDATES.length - 1,
    liveStrategyChanged: false,
    schedulerChanged: false,
    databaseWrites: false,
    telegramCalls: false,
  },
  dataQuality: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, {
    ...validateCandleSeries(fetched[timeframe].candles, INTERVAL_MS[timeframe], observedAt),
    incompleteExcluded: fetched[timeframe].incompleteExcluded,
  }])),
  baselineControl: {
    matchesPublishedV2: options.days === DEFAULT_DAYS && observedAt.getTime() === FIXED_END.getTime()
      ? baselineSummary.signals === PUBLISHED_V2_BASELINE.signals
        && baselineSummary.wins === PUBLISHED_V2_BASELINE.wins
        && baselineSummary.losses === PUBLISHED_V2_BASELINE.losses
        && baselineSummary.expired === PUBLISHED_V2_BASELINE.expired
      : null,
    aggregate: leaderboardRow("BASELINE", "all", allBaseline, "CONTROL"),
    byTimeframe: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
      timeframe,
      leaderboardRow("BASELINE", timeframe, baselineTrades[timeframe], "CONTROL"),
    ])),
    regimes: Object.fromEntries(V3_EXECUTION_TIMEFRAMES.map((timeframe) => [timeframe, regimeDiagnostics(v3BaselineTrades[timeframe])])),
    sessions: Object.fromEntries(V3_EXECUTION_TIMEFRAMES.map((timeframe) => [timeframe, sessionDiagnostics(v3BaselineTrades[timeframe])])),
    anchoredYears: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, anchoredYears(baselineTrades[timeframe] as V3Trade[])])),
  },
  studies,
  leaderboard: finalists.map((candidate) => candidate.leaderboard),
  conclusion: {
    superiorToBaseline: finalists.some((candidate) => candidate.status === "PROMISING" || candidate.status === "ROBUST"),
    survives5Bps: finalists.some((candidate) => candidate.status === "PROMISING" || candidate.status === "ROBUST"),
    survivesHoldout: finalists.some((candidate) => candidate.status === "PROMISING" || candidate.status === "ROBUST"),
    shadowModeRecommended: false,
    note: "Shadow mode requires separate user authorization even if a future candidate qualifies.",
  },
};

console.log(JSON.stringify(roundDeep(
  options.terse ? terseReport(report) : options.compact ? compactReport(report) : report,
), null, 2));

function studyTimeframe(timeframe: V3ExecutionTimeframe) {
  const candleData = fetched[timeframe].candles;
  const rows = V3_ENTRY_CANDIDATES.filter((candidateId) => candidateId !== "BASELINE_ALL").map((candidateId) => {
    const trades = evaluateV3Entries(candleData, filterV3Entries(setups[timeframe], candidateId), baselineConfiguration()) as V3Trade[];
    return preSealedRow(candidateId, trades);
  });
  const rankedAtRequiredSample = selectV3BeforeSealed(rows, minimumSamples(timeframe));
  const sampleFloorMet = rankedAtRequiredSample.length > 0;
  const ranked = sampleFloorMet
    ? rankedAtRequiredSample
    : selectV3BeforeSealed(rows, { development: 0, validation: 0 });
  const entryGateCandidates = sampleFloorMet ? ranked.filter(entryGatePasses) : [];
  const selectedEntry = entryGateCandidates[0] ?? ranked[0] ?? null;
  if (selectedEntry === null) {
    throw new Error(`No V3 entry candidate met the minimum sample floor for ${timeframe}.`);
  }

  const initialDefinition: SelectedDefinition = {
    entry: selectedEntry.candidate,
    exit: baselineConfiguration(),
    entryGatePassed: entryGatePasses(selectedEntry),
  };
  const exitStudy = initialDefinition.entryGatePassed
    ? selectSmallExit(timeframe, initialDefinition.entry)
    : { selected: initialDefinition, evaluated: [] };
  const finalDefinition = exitStudy.selected;
  const finalTrades = evaluateV3Entries(
    candleData,
    filterV3Entries(setups[timeframe], finalDefinition.entry),
    finalDefinition.exit,
  ) as V3Trade[];
  const status = classifyCandidate(timeframe, finalDefinition, finalTrades);
  return {
    entryVariantsEvaluated: rows.length,
    sampleFloorMet,
    entryGatePasses: entryGateCandidates.map((candidate) => candidate.candidate),
    entryFamilyMetrics: rows.map((item) => leaderboardRow(
      item.candidate,
      timeframe,
      item.trades,
      entryGatePasses(item) ? "ENTRY_GATE_PASS" : "ENTRY_GATE_FAIL",
    )),
    entryLeaderboardPreSealed: ranked.map((item) => ({
      candidate: item.candidate,
      development5Bps: compactSummary(item.development5Bps),
      development10Bps: compactSummary(item.development10Bps),
      validation5Bps: compactSummary(item.validation5Bps),
      validation10Bps: compactSummary(item.validation10Bps),
    })),
    exitsEvaluated: exitStudy.evaluated,
    finalCandidate: {
      definition: finalDefinition,
      status,
      leaderboard: leaderboardRow(`${finalDefinition.entry}:${finalDefinition.exit.name}`, timeframe, finalTrades, status),
      periods: periodDiagnostics(finalTrades),
      anchoredYears: anchoredYears(finalTrades),
      regimes: regimeDiagnostics(finalTrades),
      sessions: sessionDiagnostics(finalTrades),
      topFivePositiveContributionPct: topFivePositiveContribution(finalTrades, 5),
    },
  };
}

function preSealedRow(
  candidate: V3EntryCandidateId,
  trades: V3Trade[],
): V3PreSealedCandidate<V3EntryCandidateId> & { trades: V3Trade[] } {
  return {
    candidate,
    trades,
    development5Bps: periodSummary(trades, "DEVELOPMENT", 5),
    development10Bps: periodSummary(trades, "DEVELOPMENT", 10),
    validation5Bps: periodSummary(trades, "VALIDATION", 5),
    validation10Bps: periodSummary(trades, "VALIDATION", 10),
  };
}

function selectSmallExit(timeframe: V3ExecutionTimeframe, entry: V3EntryCandidateId) {
  const exits: ExitConfiguration[] = [
    baselineConfiguration(),
    { name: "V3_CAPPED_ATR_1_5_RR1_5_E12", riskMode: "CAPPED_ATR", atrMultiple: 1.5, rewardRisk: 1.5, expiryCandles: 12 },
    { name: "V3_ATR_1_5_RR1_5_E12", riskMode: "ATR", atrMultiple: 1.5, rewardRisk: 1.5, expiryCandles: 12 },
    { name: "V3_ATR_2_RR1_5_E12", riskMode: "ATR", atrMultiple: 2, rewardRisk: 1.5, expiryCandles: 12 },
  ];
  const rows = exits.map((exit) => {
    const trades = evaluateV3Entries(fetched[timeframe].candles, filterV3Entries(setups[timeframe], entry), exit) as V3Trade[];
    return {
      candidate: exit,
      trades,
      development5Bps: periodSummary(trades, "DEVELOPMENT", 5),
      development10Bps: periodSummary(trades, "DEVELOPMENT", 10),
      validation5Bps: periodSummary(trades, "VALIDATION", 5),
      validation10Bps: periodSummary(trades, "VALIDATION", 10),
    };
  });
  const ranked = selectV3BeforeSealed(rows, minimumSamples(timeframe));
  const passing = ranked.find(entryGatePasses);
  return {
    selected: {
      entry,
      exit: passing?.candidate ?? baselineConfiguration(),
      entryGatePassed: true,
    },
    evaluated: ranked.map((item) => ({
      exit: item.candidate,
      development5Bps: compactSummary(item.development5Bps),
      development10Bps: compactSummary(item.development10Bps),
      validation5Bps: compactSummary(item.validation5Bps),
      validation10Bps: compactSummary(item.validation10Bps),
    })),
  };
}

function classifyCandidate(
  timeframe: V3ExecutionTimeframe,
  definition: SelectedDefinition,
  trades: V3Trade[],
) {
  if (!definition.entryGatePassed) return "REJECT";
  const periods = V3_PERIODS.map((period) => periodSummary(trades, period, 5));
  const full10 = summarizeBacktest(trades, 10);
  const years = anchoredYears(trades);
  const sameTfBaseline = summarizeBacktest(baselineTrades[timeframe], 5);
  const minimum = finalMinimumSamples(timeframe);
  const enough = periods.every((summary, index) => summary.signals >= minimum[index]);
  const positiveAllPeriods = periods.every(positiveEdge);
  const positiveYears = years.filter((year) =>
    (year.summary5Bps.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
    && (year.summary5Bps.profitFactor ?? 0) > 1).length;
  const drawdownControlled = (summarizeBacktest(trades, 5).maximumDrawdownR ?? Number.POSITIVE_INFINITY)
    < (sameTfBaseline.maximumDrawdownR ?? 0);
  const promising = enough
    && positiveAllPeriods
    && (full10.expectancyR ?? Number.NEGATIVE_INFINITY) >= 0
    && positiveYears >= 3
    && drawdownControlled;
  if (!promising) return "REJECT";
  const pseudo10 = periodSummary(trades, "PSEUDO_FORWARD", 10);
  const concentration = topFivePositiveContribution(trades, 5);
  if (positiveEdge(pseudo10) && positiveYears === 4 && (concentration ?? 100) <= 50) return "ROBUST";
  return "PROMISING";
}

function leaderboardRow(
  candidate: string,
  timeframe: string,
  trades: BacktestTrade[],
  status: string,
) {
  const zero = summarizeBacktest(trades, 0);
  const five = summarizeBacktest(trades, 5);
  const ten = summarizeBacktest(trades, 10);
  const holdout = periodSummary(trades, "HOLDOUT", 5);
  const pseudo = periodSummary(trades, "PSEUDO_FORWARD", 5);
  return {
    candidate,
    timeframe,
    signals: five.signals,
    signalsPerDay: five.signals / options.days,
    signalsPerWeek: five.signals / options.days * 7,
    wins: five.wins,
    losses: five.losses,
    expired: five.expired,
    expiredPct: five.expiredRate,
    expectancy0Bps: zero.expectancyR,
    expectancy5Bps: five.expectancyR,
    expectancy10Bps: ten.expectancyR,
    profitFactor5Bps: five.profitFactor,
    maximumDrawdown5Bps: five.maximumDrawdownR,
    averageNetR5Bps: five.expectancyR,
    consecutiveLosses: five.consecutiveLosses,
    validationExpectancy5Bps: periodSummary(trades, "VALIDATION", 5).expectancyR,
    holdoutExpectancy5Bps: holdout.expectancyR,
    holdoutProfitFactor5Bps: holdout.profitFactor,
    pseudoForwardExpectancy5Bps: pseudo.expectancyR,
    pseudoForwardProfitFactor5Bps: pseudo.profitFactor,
    status,
  };
}

function periodDiagnostics(trades: V3Trade[]) {
  return Object.fromEntries(V3_PERIODS.map((period) => [period, {
    zero: compactSummary(periodSummary(trades, period, 0)),
    five: compactSummary(periodSummary(trades, period, 5)),
    ten: compactSummary(periodSummary(trades, period, 10)),
  }]));
}

function regimeDiagnostics(trades: V3Trade[]) {
  const volatility = ["LOW", "NORMAL", "HIGH", "UNAVAILABLE"].map((regime) => [regime, compactSummary(summarizeBacktest(
    trades.filter((trade) => (trade.feature.volatilityRegime ?? "UNAVAILABLE") === regime),
    5,
  ))]);
  const trend = ["ALIGNED_TREND", "OPPOSING_TREND", "SIDEWAYS", "UNAVAILABLE"].map((regime) => [regime, compactSummary(summarizeBacktest(
    trades.filter((trade) => trade.feature.trendRegime === regime),
    5,
  ))]);
  return { volatility: Object.fromEntries(volatility), trend: Object.fromEntries(trend) };
}

function sessionDiagnostics(trades: V3Trade[]) {
  const utc = Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), compactSummary(summarizeBacktest(
    trades.filter((trade) => trade.feature.utcHour === hour), 5,
  ))]);
  const argBra = Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), compactSummary(summarizeBacktest(
    trades.filter((trade) => trade.feature.argBraHour === hour), 5,
  ))]);
  return { utc: Object.fromEntries(utc), argBra: Object.fromEntries(argBra) };
}

function anchoredYears(trades: V3Trade[]) {
  return Array.from({ length: 4 }, (_, index) => {
    const from = new Date(analysisStart.getTime() + index * 365.25 * 86_400_000);
    const to = index === 3
      ? observedAt
      : new Date(analysisStart.getTime() + (index + 1) * 365.25 * 86_400_000);
    const selected = trades.filter((trade) => {
      const point = Date.parse(trade.openedAt);
      return point >= from.getTime() && point < to.getTime();
    });
    return { from: from.toISOString(), to: to.toISOString(), summary5Bps: compactSummary(summarizeBacktest(selected, 5)) };
  });
}

function periodSummary(trades: BacktestTrade[], period: Period, frictionBps: number) {
  return summarizeBacktest(trades.filter((trade) => v3Period(trade.openedAt, analysisStart, observedAt) === period), frictionBps);
}

function minimumSamples(timeframe: V3ExecutionTimeframe) {
  return timeframe === "5m"
    ? { development: 45, validation: 25 }
    : timeframe === "15m"
      ? { development: 35, validation: 20 }
      : { development: 18, validation: 10 };
}

function finalMinimumSamples(timeframe: V3ExecutionTimeframe): [number, number, number, number] {
  return timeframe === "5m" ? [45, 25, 15, 15]
    : timeframe === "15m" ? [35, 20, 12, 12]
      : [18, 10, 6, 6];
}

function compactSummary(summary: BacktestSummary) {
  return {
    signals: summary.signals,
    wins: summary.wins,
    losses: summary.losses,
    expired: summary.expired,
    expiredPct: summary.expiredRate,
    expectancyR: summary.expectancyR,
    profitFactor: summary.profitFactor,
    maximumDrawdownR: summary.maximumDrawdownR,
    consecutiveLosses: summary.consecutiveLosses,
  };
}

function positiveEdge(summary: BacktestSummary) {
  return (summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
    && (summary.profitFactor ?? 0) > 1;
}

function topFivePositiveContribution(trades: BacktestTrade[], frictionBps: number) {
  const positive = trades.map((trade) => {
    if (trade.realizedR === null || trade.riskPct <= 0) return null;
    return trade.realizedR - (frictionBps / 100) / trade.riskPct;
  }).filter((value): value is number => value !== null && value > 0).sort((left, right) => right - left);
  const total = positive.reduce((sum, value) => sum + value, 0);
  return total <= 0 ? null : positive.slice(0, 5).reduce((sum, value) => sum + value, 0) / total * 100;
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
      if (!isV3CandleUsable(row[6], observedAt)) {
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
  return {
    candles: [...byTimestamp.values()].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)),
    incompleteExcluded,
  };
}

function parseOptions(args: string[]) {
  const days = Number(args.find((value) => value.startsWith("--days="))?.split("=")[1] ?? DEFAULT_DAYS);
  if (!Number.isInteger(days) || days < 30 || days > 1_500) throw new Error("--days must be 30..1500.");
  const endValue = args.find((value) => value.startsWith("--end="))?.split("=")[1];
  const end = endValue === undefined ? FIXED_END : new Date(endValue);
  if (Number.isNaN(end.getTime())) throw new Error("--end must be ISO-8601.");
  return { days, end, compact: args.includes("--compact"), terse: args.includes("--terse") };
}

function terseReport(reportValue: typeof report) {
  return {
    metadata: {
      analysisStart: reportValue.metadata.analysisStart,
      analysisEnd: reportValue.metadata.analysisEnd,
      partitions: reportValue.metadata.partitions,
      contaminationCaveat: reportValue.metadata.contaminationCaveat,
      candlePolicy: reportValue.metadata.candlePolicy,
      promotionRule: reportValue.metadata.promotionRule,
      friction: reportValue.metadata.friction,
      totalEntryVariants: reportValue.metadata.totalEntryVariants,
      liveStrategyChanged: false,
      schedulerChanged: false,
      databaseWrites: false,
      telegramCalls: false,
    },
    dataQuality: reportValue.dataQuality,
    baseline: {
      matchesPublishedV2: reportValue.baselineControl.matchesPublishedV2,
      aggregate: reportValue.baselineControl.aggregate,
      byTimeframe: reportValue.baselineControl.byTimeframe,
      regimes: reportValue.baselineControl.regimes,
      sessionHighlights: Object.fromEntries(V3_EXECUTION_TIMEFRAMES.map((timeframe) => [
        timeframe,
        sessionHighlights(v3BaselineTrades[timeframe]),
      ])),
    },
    studies: Object.fromEntries(V3_EXECUTION_TIMEFRAMES.map((timeframe) => [timeframe, {
      entryGatePasses: reportValue.studies[timeframe].entryGatePasses,
      families: reportValue.studies[timeframe].entryFamilyMetrics,
      exitsEvaluated: reportValue.studies[timeframe].exitsEvaluated.length,
      final: {
        definition: reportValue.studies[timeframe].finalCandidate.definition,
        leaderboard: reportValue.studies[timeframe].finalCandidate.leaderboard,
        periods5Bps: Object.fromEntries(V3_PERIODS.map((period) => [
          period,
          reportValue.studies[timeframe].finalCandidate.periods[period].five,
        ])),
        anchoredYears: reportValue.studies[timeframe].finalCandidate.anchoredYears,
        regimes: reportValue.studies[timeframe].finalCandidate.regimes,
        topFivePositiveContributionPct: reportValue.studies[timeframe].finalCandidate.topFivePositiveContributionPct,
      },
    }])),
    leaderboard: reportValue.leaderboard,
    conclusion: reportValue.conclusion,
  };
}

function compactReport(reportValue: typeof report) {
  return {
    metadata: reportValue.metadata,
    dataQuality: reportValue.dataQuality,
    baselineControl: {
      matchesPublishedV2: reportValue.baselineControl.matchesPublishedV2,
      aggregate: reportValue.baselineControl.aggregate,
      byTimeframe: reportValue.baselineControl.byTimeframe,
      regimes: reportValue.baselineControl.regimes,
      anchoredYears: reportValue.baselineControl.anchoredYears,
      sessionHighlights: Object.fromEntries(V3_EXECUTION_TIMEFRAMES.map((timeframe) => [
        timeframe,
        sessionHighlights(v3BaselineTrades[timeframe]),
      ])),
    },
    studies: Object.fromEntries(V3_EXECUTION_TIMEFRAMES.map((timeframe) => [timeframe, {
      entryVariantsEvaluated: reportValue.studies[timeframe].entryVariantsEvaluated,
      entryGatePasses: reportValue.studies[timeframe].entryGatePasses,
      entryLeaderboardPreSealed: reportValue.studies[timeframe].entryLeaderboardPreSealed.map((item) => ({
        candidate: item.candidate,
        development: {
          signals: item.development5Bps.signals,
          expectancy5Bps: item.development5Bps.expectancyR,
          profitFactor5Bps: item.development5Bps.profitFactor,
          expectancy10Bps: item.development10Bps.expectancyR,
        },
        validation: {
          signals: item.validation5Bps.signals,
          expectancy5Bps: item.validation5Bps.expectancyR,
          profitFactor5Bps: item.validation5Bps.profitFactor,
          expectancy10Bps: item.validation10Bps.expectancyR,
        },
      })),
      exitsEvaluated: reportValue.studies[timeframe].exitsEvaluated,
      finalCandidate: {
        definition: reportValue.studies[timeframe].finalCandidate.definition,
        status: reportValue.studies[timeframe].finalCandidate.status,
        leaderboard: reportValue.studies[timeframe].finalCandidate.leaderboard,
        periods: reportValue.studies[timeframe].finalCandidate.periods,
        anchoredYears: reportValue.studies[timeframe].finalCandidate.anchoredYears,
        regimes: reportValue.studies[timeframe].finalCandidate.regimes,
        topFivePositiveContributionPct: reportValue.studies[timeframe].finalCandidate.topFivePositiveContributionPct,
      },
    }])),
    leaderboard: reportValue.leaderboard,
    conclusion: reportValue.conclusion,
  };
}

function sessionHighlights(trades: V3Trade[]) {
  const minimumSignals = Math.max(10, Math.floor(trades.length * 0.02));
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    utcHour: hour,
    argBraHour: (hour + 21) % 24,
    summary: summarizeBacktest(trades.filter((trade) => trade.feature.utcHour === hour), 5),
  })).filter((item) => item.summary.signals >= minimumSignals)
    .sort((left, right) => (right.summary.expectancyR ?? Number.NEGATIVE_INFINITY)
      - (left.summary.expectancyR ?? Number.NEGATIVE_INFINITY));
  return {
    minimumSignals,
    strongest: hourly.slice(0, 3).map((item) => ({
      utcHour: item.utcHour,
      argBraHour: item.argBraHour,
      ...compactSummary(item.summary),
    })),
    weakest: hourly.slice(-3).reverse().map((item) => ({
      utcHour: item.utcHour,
      argBraHour: item.argBraHour,
      ...compactSummary(item.summary),
    })),
    note: "Diagnostic only; hours were not candidate filters or selection inputs.",
  };
}

function roundDeep(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : String(value);
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, roundDeep(nested)]));
  }
  return value;
}
