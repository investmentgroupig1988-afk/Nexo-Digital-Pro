import { getBinance } from "../services/market";
import {
  baselineConfiguration,
  summarizeBacktest,
  validateCandleSeries,
  type BacktestSummary,
  type BacktestTrade,
  type ClosedAnalysisCandle,
} from "../services/signal-backtest";
import { COMMERCIAL_SIGNAL_TIMEFRAMES } from "../services/signal-engine";
import type { HistoricalTimeframe } from "../services/historical";
import {
  buildV3Contexts,
  evaluateV3Entries,
  generateV3BaselineSetups,
  v3Period,
  type V3SetupEntry,
} from "../services/signal-strategy-v3";
import {
  V4_BUCKETS,
  V4_FACTOR_IDS,
  V4_FORWARD_HYPOTHESIS,
  V4_THRESHOLDS,
  deriveV4Thresholds,
  filterV4Threshold,
  monotonicBucketEvidence,
  scoreV4Opportunities,
  selectV4BeforeSealed,
  v4Bucket,
  v4EntryGatePasses,
  v4MfeMaeDistribution,
  type V4Bucket,
  type V4FactorId,
  type V4PreSealedCandidate,
  type V4ScoredEntry,
  type V4ThresholdId,
} from "../services/signal-strategy-v4";

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];
type TimeframeData = { candles: ClosedAnalysisCandle[]; incompleteExcluded: number };
type Period = "DEVELOPMENT" | "VALIDATION" | "HOLDOUT" | "PSEUDO_FORWARD";
type ScoredTrade = BacktestTrade & { qualityScore: number; qualityFactors: Record<V4FactorId, number> };

const INTERVAL_MS: Record<HistoricalTimeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};
const FIXED_END = new Date("2026-08-28T00:00:00.000Z");
const DEFAULT_DAYS = 1461;
const V4_TIMEFRAMES = ["5m", "15m", "1h", "4h"] as const;
const PUBLISHED_BASELINE = { signals: 9409, wins: 1050, losses: 1504, expired: 6855 };
const options = parseOptions(process.argv.slice(2));
const observedAt = options.end;
const analysisStart = new Date(observedAt.getTime() - options.days * 86_400_000);
const fetched = Object.fromEntries(await Promise.all(V4_TIMEFRAMES.map(async (timeframe) => {
  const warmupStart = new Date(analysisStart.getTime() - INTERVAL_MS[timeframe] * 220);
  return [timeframe, await fetchClosedCandles(timeframe, warmupStart, observedAt)];
}))) as Record<(typeof V4_TIMEFRAMES)[number], TimeframeData>;
const contexts = buildV3Contexts({ candles1h: fetched["1h"].candles, candles4h: fetched["4h"].candles });
const entries = Object.fromEntries(V4_TIMEFRAMES.map((timeframe) => [timeframe, generateV3BaselineSetups({
  candles: fetched[timeframe].candles,
  timeframe,
  ...contexts,
  analysisStart,
})])) as Record<(typeof V4_TIMEFRAMES)[number], V3SetupEntry[]>;
const scored = Object.fromEntries(V4_TIMEFRAMES.map((timeframe) => [timeframe, scoreV4Opportunities({
  entries: entries[timeframe],
  candles: fetched[timeframe].candles,
  timeframe,
  observedAt,
})])) as Record<(typeof V4_TIMEFRAMES)[number], V4ScoredEntry[]>;
const baseline = Object.fromEntries(V4_TIMEFRAMES.map((timeframe) => [timeframe, evaluateV3Entries(
  fetched[timeframe].candles,
  scored[timeframe],
  baselineConfiguration(),
) as ScoredTrade[]])) as Record<(typeof V4_TIMEFRAMES)[number], ScoredTrade[]>;
const allBaseline = V4_TIMEFRAMES.flatMap((timeframe) => baseline[timeframe]);
const baselineSummary = summarizeBacktest(allBaseline, 0);
const studies = Object.fromEntries(V4_TIMEFRAMES.map((timeframe) => [timeframe, studyTimeframe(timeframe)])) as Record<
  (typeof V4_TIMEFRAMES)[number],
  ReturnType<typeof studyTimeframe>
>;
const finalists = V4_TIMEFRAMES.map((timeframe) => studies[timeframe].finalCandidate);

const report = {
  metadata: {
    name: "TRENORO Strategy Research V4 — high-quality entry ranking",
    analysisStart: analysisStart.toISOString(),
    analysisEnd: observedAt.toISOString(),
    provider: "Binance public Spot BTCUSDT klines",
    partitions: "45% DEVELOPMENT / 25% VALIDATION / 15% HOLDOUT / 15% PSEUDO_FORWARD",
    contaminationCaveat: "The dataset was already observed in V1-V3. HOLDOUT and PSEUDO_FORWARD are protected from V4 selectors but are not genuinely unseen market data.",
    scoreConstruction: "Nine equally weighted, predeclared factors scaled to [0,1]. No learned weights and no result-driven threshold tuning.",
    factors: V4_FACTOR_IDS,
    thresholds: "TOP_10, TOP_20, and TOP_30 cutoffs are derived from DEVELOPMENT score quantiles per timeframe, then frozen.",
    costsBps: [0, 5, 10, 15],
    acceptance: "Positive expectancy and PF >= 1.10 at 5 bps in HOLDOUT and PSEUDO_FORWARD; positive DEVELOPMENT/VALIDATION at 5 bps; full 10 bps >= 0; sufficient partition samples; monotonic score evidence; >=3 positive anchored years; controlled DD and concentration.",
    frozenForwardHypothesis: {
      id: V4_FORWARD_HYPOTHESIS,
      label: "FORWARD_RESEARCH_ONLY",
      optimizedInV4: false,
      note: "The V3 1h pullback hypothesis is not a V4 candidate and requires genuinely future data.",
    },
    liveStrategyChanged: false,
    schedulerChanged: false,
    databaseWrites: false,
    telegramCalls: false,
    mlExperiment: "Eligible only if manual buckets are monotonic in DEVELOPMENT and VALIDATION and a manual threshold passes the pre-sealed gate.",
  },
  dataQuality: Object.fromEntries(V4_TIMEFRAMES.map((timeframe) => [timeframe, {
    ...validateCandleSeries(fetched[timeframe].candles, INTERVAL_MS[timeframe], observedAt),
    incompleteExcluded: fetched[timeframe].incompleteExcluded,
  }])),
  baseline: {
    matchesPublished: options.days === DEFAULT_DAYS && observedAt.getTime() === FIXED_END.getTime()
      ? baselineSummary.signals === PUBLISHED_BASELINE.signals
        && baselineSummary.wins === PUBLISHED_BASELINE.wins
        && baselineSummary.losses === PUBLISHED_BASELINE.losses
        && baselineSummary.expired === PUBLISHED_BASELINE.expired
      : null,
    aggregate: leaderboardRow("BASELINE", "all", allBaseline, "CONTROL"),
    byTimeframe: Object.fromEntries(V4_TIMEFRAMES.map((timeframe) => [timeframe, leaderboardRow("BASELINE", timeframe, baseline[timeframe], "CONTROL")])),
  },
  studies,
  leaderboard: finalists.map((candidate) => candidate.leaderboard),
  conclusion: {
    edgeFound: finalists.some((candidate) => candidate.status === "PROMISING" || candidate.status === "ROBUST"),
    shadowMode: false,
    modifyLive: false,
    mlEligibleTimeframes: V4_TIMEFRAMES.filter((timeframe) => studies[timeframe].finalCandidate.mlEligible),
    mlExecuted: false,
    note: "ML is deliberately not executed unless the manual score demonstrates pre-sealed predictive value. Shadow mode always requires later user authorization.",
  },
};

console.log(JSON.stringify(roundDeep(
  options.summary ? summaryReport(report) : options.terse ? terseReport(report) : report,
), null, 2));

function studyTimeframe(timeframe: (typeof V4_TIMEFRAMES)[number]) {
  const developmentEntries = scored[timeframe].filter((entry) => period(entry.openedAt) === "DEVELOPMENT");
  const thresholds = deriveV4Thresholds(developmentEntries);
  const bucketTrades = Object.fromEntries(V4_BUCKETS.map((bucket) => [bucket, evaluateV3Entries(
    fetched[timeframe].candles,
    scored[timeframe].filter((entry) => v4Bucket(entry, thresholds) === bucket),
    baselineConfiguration(),
  ) as ScoredTrade[]])) as Record<V4Bucket, ScoredTrade[]>;
  const bucketDiagnostics = Object.fromEntries(V4_BUCKETS.map((bucket) => [bucket, {
    full: performance(bucketTrades[bucket]),
    periods: periodPerformance(bucketTrades[bucket]),
    excursion: v4MfeMaeDistribution(bucketTrades[bucket]),
  }]));
  const developmentMonotonic = monotonicEvidenceForPeriod(bucketTrades, "DEVELOPMENT");
  const validationMonotonic = monotonicEvidenceForPeriod(bucketTrades, "VALIDATION");
  const manualMonotonic = (developmentMonotonic.spearman ?? -1) >= 0.5
    && (validationMonotonic.spearman ?? -1) >= 0.5;

  const thresholdRows = V4_THRESHOLDS.map((thresholdId) => {
    const trades = evaluateV3Entries(
      fetched[timeframe].candles,
      filterV4Threshold(scored[timeframe], thresholdId, thresholds),
      baselineConfiguration(),
    ) as ScoredTrade[];
    return preSealedRow(thresholdId, trades);
  });
  const ranked = selectV4BeforeSealed(thresholdRows, minimumSamples(timeframe));
  const gatePasses = ranked.filter(v4EntryGatePasses);
  const selected = gatePasses[0] ?? ranked[0] ?? thresholdRows[0];
  const selectedTrades = selected.trades;
  const status = classifyCandidate(timeframe, selected, selectedTrades, manualMonotonic);
  const mlEligible = manualMonotonic && gatePasses.length > 0;
  return {
    thresholds,
    bucketDiagnostics,
    monotonicity: { development: developmentMonotonic, validation: validationMonotonic, passes: manualMonotonic },
    factorDiagnostics: factorDiagnostics(timeframe),
    thresholdCandidates: thresholdRows.map((item) => ({
      candidate: item.candidate,
      full: performance(item.trades),
      development: compactSummary(item.development5Bps),
      validation: compactSummary(item.validation5Bps),
      holdout: compactSummary(periodSummary(item.trades, "HOLDOUT", 5)),
      pseudoForward: compactSummary(periodSummary(item.trades, "PSEUDO_FORWARD", 5)),
      gatePass: v4EntryGatePasses(item),
    })),
    finalCandidate: {
      threshold: selected.candidate,
      status,
      mlEligible,
      leaderboard: leaderboardRow(`QUALITY_SCORE_${selected.candidate}`, timeframe, selectedTrades, status),
      periods: periodPerformance(selectedTrades),
      anchoredYears: anchoredYears(selectedTrades),
      topFivePositiveContributionPct: topFivePositiveContribution(selectedTrades, 5),
      excursion: v4MfeMaeDistribution(selectedTrades),
    },
  };
}

function preSealedRow(candidate: V4ThresholdId, trades: ScoredTrade[]): V4PreSealedCandidate<V4ThresholdId> & { trades: ScoredTrade[] } {
  return {
    candidate,
    trades,
    development5Bps: periodSummary(trades, "DEVELOPMENT", 5),
    development10Bps: periodSummary(trades, "DEVELOPMENT", 10),
    validation5Bps: periodSummary(trades, "VALIDATION", 5),
    validation10Bps: periodSummary(trades, "VALIDATION", 10),
  };
}

function classifyCandidate(
  timeframe: (typeof V4_TIMEFRAMES)[number],
  candidate: V4PreSealedCandidate<V4ThresholdId>,
  trades: ScoredTrade[],
  manualMonotonic: boolean,
) {
  if (!v4EntryGatePasses(candidate) || !manualMonotonic) return "REJECT";
  const period5 = ["DEVELOPMENT", "VALIDATION", "HOLDOUT", "PSEUDO_FORWARD"].map((name) => periodSummary(trades, name as Period, 5));
  const minimum = finalMinimumSamples(timeframe);
  const enough = period5.every((summary, index) => summary.signals >= minimum[index]);
  const developmentAndValidation = period5.slice(0, 2).every(positiveEdge);
  const sealedStrong = period5.slice(2).every((summary) =>
    (summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0 && (summary.profitFactor ?? 0) >= 1.1);
  const full10 = summarizeBacktest(trades, 10);
  const positiveYears = anchoredYears(trades).filter((year) =>
    (year.summary5Bps.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
    && (year.summary5Bps.profitFactor ?? 0) > 1).length;
  const drawdown = summarizeBacktest(trades, 5).maximumDrawdownR ?? Number.POSITIVE_INFINITY;
  const baselineDrawdown = summarizeBacktest(baseline[timeframe], 5).maximumDrawdownR ?? 0;
  const concentration = topFivePositiveContribution(trades, 5) ?? 100;
  if (!(enough && developmentAndValidation && sealedStrong && (full10.expectancyR ?? -1) >= 0
    && positiveYears >= 3 && drawdown < baselineDrawdown && concentration <= 50)) return "REJECT";
  const pseudo10 = periodSummary(trades, "PSEUDO_FORWARD", 10);
  return (pseudo10.expectancyR ?? -1) > 0 && (pseudo10.profitFactor ?? 0) >= 1.1 && positiveYears === 4
    ? "ROBUST" : "PROMISING";
}

function factorDiagnostics(timeframe: (typeof V4_TIMEFRAMES)[number]) {
  return Object.fromEntries(V4_FACTOR_IDS.map((factor) => {
    const developmentValues = scored[timeframe].filter((entry) => period(entry.openedAt) === "DEVELOPMENT")
      .map((entry) => entry.qualityFactors[factor]);
    const low = quantile(developmentValues, 0.3);
    const high = quantile(developmentValues, 0.7);
    const lowerTrades = evaluateV3Entries(
      fetched[timeframe].candles,
      scored[timeframe].filter((entry) => entry.qualityFactors[factor] <= low),
      baselineConfiguration(),
    );
    const upperTrades = evaluateV3Entries(
      fetched[timeframe].candles,
      scored[timeframe].filter((entry) => entry.qualityFactors[factor] >= high),
      baselineConfiguration(),
    );
    return [factor, {
      developmentCutoffs: { p30: low, p70: high },
      bottom30: {
        full: compactSummary(summarizeBacktest(lowerTrades, 5)),
        validation: compactSummary(periodSummary(lowerTrades, "VALIDATION", 5)),
      },
      top30: {
        full: compactSummary(summarizeBacktest(upperTrades, 5)),
        validation: compactSummary(periodSummary(upperTrades, "VALIDATION", 5)),
      },
    }];
  }));
}

function monotonicEvidenceForPeriod(trades: Record<V4Bucket, ScoredTrade[]>, selectedPeriod: Period) {
  const order: V4Bucket[] = ["BOTTOM_30", "MIDDLE_40", "TOP_20_TO_30", "TOP_10_TO_20", "TOP_10"];
  return monotonicBucketEvidence(order.map((bucket) => periodSummary(trades[bucket], selectedPeriod, 5).expectancyR));
}

function performance(trades: BacktestTrade[]) {
  return {
    zero: compactSummary(summarizeBacktest(trades, 0)),
    five: compactSummary(summarizeBacktest(trades, 5)),
    ten: compactSummary(summarizeBacktest(trades, 10)),
    fifteen: compactSummary(summarizeBacktest(trades, 15)),
  };
}

function periodPerformance(trades: BacktestTrade[]) {
  return Object.fromEntries(["DEVELOPMENT", "VALIDATION", "HOLDOUT", "PSEUDO_FORWARD"].map((name) => [name, {
    five: compactSummary(periodSummary(trades, name as Period, 5)),
    ten: compactSummary(periodSummary(trades, name as Period, 10)),
  }]));
}

function leaderboardRow(candidate: string, timeframe: string, trades: BacktestTrade[], status: string) {
  const five = summarizeBacktest(trades, 5);
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
    expectancy0Bps: summarizeBacktest(trades, 0).expectancyR,
    expectancy5Bps: five.expectancyR,
    expectancy10Bps: summarizeBacktest(trades, 10).expectancyR,
    expectancy15Bps: summarizeBacktest(trades, 15).expectancyR,
    profitFactor5Bps: five.profitFactor,
    maximumDrawdown5Bps: five.maximumDrawdownR,
    longestLossStreak: five.consecutiveLosses,
    validationExpectancy5Bps: periodSummary(trades, "VALIDATION", 5).expectancyR,
    holdoutExpectancy5Bps: periodSummary(trades, "HOLDOUT", 5).expectancyR,
    pseudoForwardExpectancy5Bps: periodSummary(trades, "PSEUDO_FORWARD", 5).expectancyR,
    status,
  };
}

function periodSummary(trades: BacktestTrade[], selectedPeriod: Period, frictionBps: number) {
  return summarizeBacktest(trades.filter((trade) => period(trade.openedAt) === selectedPeriod), frictionBps);
}

function period(openedAt: string): Period {
  return v3Period(openedAt, analysisStart, observedAt);
}

function anchoredYears(trades: BacktestTrade[]) {
  return Array.from({ length: 4 }, (_, index) => {
    const from = new Date(analysisStart.getTime() + index * 365.25 * 86_400_000);
    const to = index === 3 ? observedAt : new Date(analysisStart.getTime() + (index + 1) * 365.25 * 86_400_000);
    const selected = trades.filter((trade) => Date.parse(trade.openedAt) >= from.getTime() && Date.parse(trade.openedAt) < to.getTime());
    return { from: from.toISOString(), to: to.toISOString(), summary5Bps: compactSummary(summarizeBacktest(selected, 5)) };
  });
}

function minimumSamples(timeframe: (typeof V4_TIMEFRAMES)[number]) {
  return timeframe === "5m" ? { development: 50, validation: 30 }
    : timeframe === "15m" ? { development: 35, validation: 20 }
      : timeframe === "1h" ? { development: 18, validation: 10 }
        : { development: 8, validation: 5 };
}

function finalMinimumSamples(timeframe: (typeof V4_TIMEFRAMES)[number]): [number, number, number, number] {
  return timeframe === "5m" ? [50, 30, 20, 20]
    : timeframe === "15m" ? [35, 20, 12, 12]
      : timeframe === "1h" ? [18, 10, 6, 6]
        : [8, 5, 3, 3];
}

function positiveEdge(summary: BacktestSummary) {
  return (summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0 && (summary.profitFactor ?? 0) > 1;
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

function topFivePositiveContribution(trades: BacktestTrade[], frictionBps: number) {
  const positive = trades.map((trade) => trade.realizedR === null || trade.riskPct <= 0
    ? null : trade.realizedR - (frictionBps / 100) / trade.riskPct)
    .filter((value): value is number => value !== null && value > 0).sort((left, right) => right - left);
  const total = positive.reduce((sum, value) => sum + value, 0);
  return total <= 0 ? null : positive.slice(0, 5).reduce((sum, value) => sum + value, 0) / total * 100;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

async function fetchClosedCandles(
  timeframe: (typeof V4_TIMEFRAMES)[number],
  start: Date,
  observedAt: Date,
): Promise<TimeframeData> {
  const intervalMs = INTERVAL_MS[timeframe];
  const byTimestamp = new Map<number, ClosedAnalysisCandle>();
  let cursor = start.getTime();
  let incompleteExcluded = 0;
  while (cursor <= observedAt.getTime()) {
    const page = await getBinance<BinanceKline[]>("/klines", {
      symbol: "BTCUSDT",
      interval: timeframe,
      startTime: cursor,
      endTime: observedAt.getTime(),
      limit: 1_000,
    });
    if (!page.length) break;
    for (const row of page) {
      if (row[6] > observedAt.getTime()) {
        incompleteExcluded += 1;
        continue;
      }
      byTimestamp.set(row[0], {
        timestamp: new Date(row[0]).toISOString(),
        closeTime: new Date(row[6]).toISOString(),
        open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
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
  const days = Number(args.find((value) => value.startsWith("--days="))?.split("=")[1] ?? DEFAULT_DAYS);
  if (!Number.isInteger(days) || days < 30 || days > 1_500) throw new Error("--days must be 30..1500.");
  const endValue = args.find((value) => value.startsWith("--end="))?.split("=")[1];
  const end = endValue === undefined ? FIXED_END : new Date(endValue);
  if (Number.isNaN(end.getTime())) throw new Error("--end must be ISO-8601.");
  return { days, end, terse: args.includes("--terse"), summary: args.includes("--summary") };
}

function summaryReport(reportValue: typeof report) {
  return {
    metadata: reportValue.metadata,
    dataQuality: reportValue.dataQuality,
    baseline: reportValue.baseline,
    studies: Object.fromEntries(V4_TIMEFRAMES.map((timeframe) => {
      const study = reportValue.studies[timeframe];
      return [timeframe, {
        thresholds: study.thresholds,
        monotonicity: study.monotonicity,
        buckets: Object.fromEntries(V4_BUCKETS.map((bucket) => [bucket, {
          full5Bps: study.bucketDiagnostics[bucket].full.five,
          development5Bps: study.bucketDiagnostics[bucket].periods.DEVELOPMENT.five,
          validation5Bps: study.bucketDiagnostics[bucket].periods.VALIDATION.five,
          holdout5Bps: study.bucketDiagnostics[bucket].periods.HOLDOUT.five,
          pseudoForward5Bps: study.bucketDiagnostics[bucket].periods.PSEUDO_FORWARD.five,
          excursion: study.bucketDiagnostics[bucket].excursion,
        }])),
        factorRanking: summarizeFactorRanking(study.factorDiagnostics),
        thresholdCandidates: study.thresholdCandidates,
        finalCandidate: study.finalCandidate,
      }];
    })),
    leaderboard: reportValue.leaderboard,
    conclusion: reportValue.conclusion,
  };
}

function summarizeFactorRanking(diagnostics: ReturnType<typeof factorDiagnostics>) {
  return Object.entries(diagnostics).map(([factor, value]) => ({
    factor,
    top30Signals: value.top30.full.signals,
    top30Expectancy5Bps: value.top30.full.expectancyR,
    top30ProfitFactor5Bps: value.top30.full.profitFactor,
    top30ValidationExpectancy5Bps: value.top30.validation.expectancyR,
    bottom30Expectancy5Bps: value.bottom30.full.expectancyR,
    validationLift: value.top30.validation.expectancyR === null || value.bottom30.validation.expectancyR === null
      ? null : value.top30.validation.expectancyR - value.bottom30.validation.expectancyR,
  })).sort((left, right) => (right.validationLift ?? Number.NEGATIVE_INFINITY)
    - (left.validationLift ?? Number.NEGATIVE_INFINITY));
}

function terseReport(reportValue: typeof report) {
  return {
    metadata: reportValue.metadata,
    dataQuality: reportValue.dataQuality,
    baseline: reportValue.baseline,
    studies: Object.fromEntries(V4_TIMEFRAMES.map((timeframe) => [timeframe, {
      thresholds: reportValue.studies[timeframe].thresholds,
      buckets: reportValue.studies[timeframe].bucketDiagnostics,
      monotonicity: reportValue.studies[timeframe].monotonicity,
      factors: reportValue.studies[timeframe].factorDiagnostics,
      thresholdCandidates: reportValue.studies[timeframe].thresholdCandidates,
      finalCandidate: reportValue.studies[timeframe].finalCandidate,
    }])),
    leaderboard: reportValue.leaderboard,
    conclusion: reportValue.conclusion,
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
