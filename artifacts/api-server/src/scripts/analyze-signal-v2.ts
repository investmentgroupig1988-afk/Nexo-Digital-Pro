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
import { isCandleClosedAt, type HistoricalTimeframe } from "../services/historical";
import {
  V2_ENTRY_CANDIDATES,
  V2_EXECUTION_TIMEFRAMES,
  buildV2ContextSeries,
  buildV2ExitGrid,
  buildV2ExpiryGrid,
  evaluateV2Candidate,
  generateV2Entries,
  selectV2BeforeHoldout,
  v2Period,
  type V2Entry,
  type V2EntryCandidateId,
  type V2ExecutionTimeframe,
  type V2PreHoldoutCandidate,
} from "../services/signal-strategy-v2";

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];
type ServerTime = { serverTime: number };
type TimeframeData = { candles: ClosedAnalysisCandle[]; incompleteExcluded: number };
type CandidateKey = { entry: V2EntryCandidateId; exit: ExitConfiguration };
type PeriodName = "DEVELOPMENT" | "VALIDATION" | "FINAL_HOLDOUT";

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

const options = parseOptions(process.argv.slice(2));
const serverTime = options.end === null ? await getBinance<ServerTime>("/time", {}) : null;
const observedAt = options.end ?? new Date(serverTime!.serverTime);
const analysisStart = new Date(observedAt.getTime() - options.days * 86_400_000);

const fetched = Object.fromEntries(await Promise.all(COMMERCIAL_SIGNAL_TIMEFRAMES.map(async (timeframe) => {
  const warmupStart = new Date(analysisStart.getTime() - INTERVAL_MS[timeframe] * 220);
  return [timeframe, await fetchClosedCandles(timeframe, warmupStart, observedAt, observedAt)];
}))) as Record<HistoricalTimeframe, TimeframeData>;

const baselineTrades = Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => {
  const entries = generateBaselineEntries(fetched[timeframe].candles, timeframe, analysisStart);
  return [timeframe, evaluateEntries(fetched[timeframe].candles, entries, baselineConfiguration())];
})) as Record<HistoricalTimeframe, BacktestTrade[]>;
const allBaseline = COMMERCIAL_SIGNAL_TIMEFRAMES.flatMap((timeframe) => baselineTrades[timeframe]);

const contexts1h = buildV2ContextSeries(fetched["1h"].candles);
const contexts4h = buildV2ContextSeries(fetched["4h"].candles);
const v2 = Object.fromEntries(V2_EXECUTION_TIMEFRAMES.map((timeframe) => {
  const entries = generateV2Entries({
    candles: fetched[timeframe].candles,
    timeframe,
    contexts1h,
    contexts4h,
    analysisStart,
  });
  return [timeframe, studyTimeframe(timeframe, entries, fetched[timeframe].candles)];
})) as Record<V2ExecutionTimeframe, ReturnType<typeof studyTimeframe>>;

const finalists = V2_EXECUTION_TIMEFRAMES.flatMap((timeframe) => {
  const candidate = v2[timeframe].finalCandidate;
  return candidate === null ? [] : [{ timeframe, ...candidate }];
});

const report = {
  metadata: {
    name: "TRENORO Signal Strategy V2 offline research",
    provider: "Binance public Spot klines",
    symbol: "BTCUSDT",
    analysisStart: analysisStart.toISOString(),
    analysisEnd: observedAt.toISOString(),
    days: options.days,
    candlePolicy: "Every input candle and higher-timeframe context must have closeTime <= its effective observation time.",
    partitions: "Chronological 50% DEVELOPMENT / 30% VALIDATION / 20% FINAL_HOLDOUT. FINAL_HOLDOUT is never passed to a selector.",
    selectionOrder: [
      "Entry families ranked on DEVELOPMENT with baseline-like exits.",
      "Only the top two entry families per timeframe enter the bounded ATR exit grid.",
      "One exit is selected from DEVELOPMENT and VALIDATION at 5 bps, with 10 bps and drawdown as secondary criteria.",
      "Expiry is varied only after entry and exit are fixed; FINAL_HOLDOUT is opened after the last selection.",
    ],
    holdoutCaveat: "The final 20% is sealed inside this run, but its dates were visible in prior baseline research. It is methodologically held out here, not a never-before-observed market sample.",
    friction: FRICTION,
    entryCandidates: V2_ENTRY_CANDIDATES,
    liveStrategyChanged: false,
    schedulerChanged: false,
    databaseWrites: false,
    telegramCalls: false,
  },
  dataQuality: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [timeframe, {
    ...validateCandleSeries(fetched[timeframe].candles, INTERVAL_MS[timeframe], observedAt),
    incompleteExcluded: fetched[timeframe].incompleteExcluded,
  }])),
  baseline: leaderboardRow("BASELINE", "all", allBaseline, options.days, analysisStart, observedAt),
  baselineByTimeframe: Object.fromEntries(COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => [
    timeframe,
    leaderboardRow("BASELINE", timeframe, baselineTrades[timeframe], options.days, analysisStart, observedAt),
  ])),
  v2,
  candidateLeaderboard: finalists.map((candidate) => candidate.leaderboard),
  bestCandidate: bestFinalist(finalists),
  conclusion: {
    superiorToBaseline: finalists.some((candidate) => candidate.status === "PROMISING" || candidate.status === "ROBUST"),
    shadowModeRecommended: finalists.some((candidate) => candidate.status === "PROMISING" || candidate.status === "ROBUST"),
    promotionRule: "PROMISING or ROBUST is required; no candidate is promoted by relative rank alone.",
  },
};

console.log(JSON.stringify(roundDeep(options.compact ? compactReport(report) : report), null, 2));

function studyTimeframe(
  timeframe: V2ExecutionTimeframe,
  entries: Record<V2EntryCandidateId, V2Entry[]>,
  candles: ClosedAnalysisCandle[],
) {
  const fixedEntryExit: ExitConfiguration = {
    name: "V2_ENTRY_CONTROL_BASELINE_LIKE",
    riskMode: "BASELINE",
    rewardRisk: 1.5,
    expiryCandles: 12,
  };
  const entryStage = V2_ENTRY_CANDIDATES.map((candidateId) => {
    const trades = evaluateV2Candidate(candles, entries[candidateId], fixedEntryExit);
    return {
      candidateId,
      rawEntries: entries[candidateId].length,
      trades,
      development5Bps: periodSummary(trades, "DEVELOPMENT", 5),
      development10Bps: periodSummary(trades, "DEVELOPMENT", 10),
      validation5Bps: periodSummary(trades, "VALIDATION", 5),
      validation10Bps: periodSummary(trades, "VALIDATION", 10),
    };
  });
  const entryMinimum = minimumSamples(timeframe).development;
  const entryFinalists = entryStage.filter((candidate) => candidate.development5Bps.signals >= entryMinimum)
    .sort(compareDevelopmentOnly)
    .slice(0, 2);

  const exitStage: Array<V2PreHoldoutCandidate<CandidateKey> & { trades: BacktestTrade[] }> = [];
  for (const entryCandidate of entryFinalists) {
    for (const exit of buildV2ExitGrid(12)) {
      const trades = evaluateV2Candidate(candles, entries[entryCandidate.candidateId], exit);
      exitStage.push({
        candidate: { entry: entryCandidate.candidateId, exit },
        trades,
        development5Bps: periodSummary(trades, "DEVELOPMENT", 5),
        development10Bps: periodSummary(trades, "DEVELOPMENT", 10),
        validation5Bps: periodSummary(trades, "VALIDATION", 5),
        validation10Bps: periodSummary(trades, "VALIDATION", 10),
      });
    }
  }
  const selectedExit = selectV2BeforeHoldout(exitStage, minimumSamples(timeframe));
  if (selectedExit === null) {
    return {
      entryStage: summarizeEntryStage(entryStage),
      entryFinalists: entryFinalists.map((item) => item.candidateId),
      exitConfigurationsEvaluated: exitStage.length,
      finalCandidate: null,
      reason: "No entry/exit candidate met the pre-holdout sample floor.",
    };
  }

  const expiryStage: Array<V2PreHoldoutCandidate<CandidateKey> & { trades: BacktestTrade[] }> = [];
  for (const exit of buildV2ExpiryGrid(selectedExit.candidate.exit)) {
    const trades = evaluateV2Candidate(candles, entries[selectedExit.candidate.entry], exit);
    expiryStage.push({
      candidate: { entry: selectedExit.candidate.entry, exit },
      trades,
      development5Bps: periodSummary(trades, "DEVELOPMENT", 5),
      development10Bps: periodSummary(trades, "DEVELOPMENT", 10),
      validation5Bps: periodSummary(trades, "VALIDATION", 5),
      validation10Bps: periodSummary(trades, "VALIDATION", 10),
    });
  }
  const selectedExpiry = selectV2BeforeHoldout(expiryStage, minimumSamples(timeframe));
  if (selectedExpiry === null) {
    return {
      entryStage: summarizeEntryStage(entryStage),
      entryFinalists: entryFinalists.map((item) => item.candidateId),
      exitConfigurationsEvaluated: exitStage.length,
      finalCandidate: null,
      reason: "No expiry candidate met the pre-holdout sample floor.",
    };
  }

  const finalTrades = expiryStage.find((item) =>
    item.candidate.entry === selectedExpiry.candidate.entry
    && item.candidate.exit.name === selectedExpiry.candidate.exit.name)!.trades;
  const status = classifyCandidate(timeframe, finalTrades);
  const leaderboard = leaderboardRow(
    `${selectedExpiry.candidate.entry}:${selectedExpiry.candidate.exit.name}`,
    timeframe,
    finalTrades,
    options.days,
    analysisStart,
    observedAt,
    status,
  );
  return {
    entryStage: summarizeEntryStage(entryStage),
    entryFinalists: entryFinalists.map((item) => item.candidateId),
    exitConfigurationsEvaluated: exitStage.length,
    expiryConfigurationsEvaluated: expiryStage.length,
    finalCandidate: {
      entry: selectedExpiry.candidate.entry,
      exit: selectedExpiry.candidate.exit,
      preHoldout: {
        development5Bps: compactSummary(selectedExpiry.development5Bps),
        development10Bps: compactSummary(selectedExpiry.development10Bps),
        validation5Bps: compactSummary(selectedExpiry.validation5Bps),
        validation10Bps: compactSummary(selectedExpiry.validation10Bps),
      },
      finalHoldout: {
        ideal: compactSummary(periodSummary(finalTrades, "FINAL_HOLDOUT", 0)),
        decision: compactSummary(periodSummary(finalTrades, "FINAL_HOLDOUT", 5)),
        stress: compactSummary(periodSummary(finalTrades, "FINAL_HOLDOUT", 10)),
      },
      chronologicalSlices5Bps: chronologicalSlices(finalTrades, 5),
      status,
      leaderboard,
    },
  };
}

function classifyCandidate(timeframe: V2ExecutionTimeframe, trades: BacktestTrade[]) {
  const development5 = periodSummary(trades, "DEVELOPMENT", 5);
  const validation5 = periodSummary(trades, "VALIDATION", 5);
  const holdout5 = periodSummary(trades, "FINAL_HOLDOUT", 5);
  const development10 = periodSummary(trades, "DEVELOPMENT", 10);
  const validation10 = periodSummary(trades, "VALIDATION", 10);
  const holdout10 = periodSummary(trades, "FINAL_HOLDOUT", 10);
  const minimum = minimumSamples(timeframe);
  const enough = development5.signals >= minimum.development
    && validation5.signals >= minimum.validation
    && holdout5.signals >= minimum.holdout;
  const positive5 = [development5, validation5, holdout5].every(positiveEdge);
  const positive10 = [development10, validation10, holdout10].every(positiveEdge);
  const slices = chronologicalSlices(trades, 5);
  const positiveSlices = slices.filter((slice) =>
    (slice.summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
    && (slice.summary.profitFactor ?? 0) > 1).length;
  const concentration = topFivePositiveContribution(trades, 5);
  if (enough && positive5 && positive10 && positiveSlices >= 3 && (concentration ?? 100) <= 20) return "ROBUST";
  if (enough && positive5 && holdout10.expectancyR !== null && holdout10.expectancyR >= 0 && positiveSlices >= 2) {
    return "PROMISING";
  }
  const full5 = summarizeBacktest(trades, 5);
  if (
    enough
    && (full5.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
    && (full5.profitFactor ?? 0) > 1
    && positiveEdge(holdout5)
  ) return "INVESTIGATE";
  return "REJECT";
}

function leaderboardRow(
  candidate: string,
  timeframe: string,
  trades: BacktestTrade[],
  days: number,
  start: Date,
  end: Date,
  status = "CONTROL",
) {
  const ideal = summarizeBacktest(trades, 0);
  const five = summarizeBacktest(trades, 5);
  const ten = summarizeBacktest(trades, 10);
  const holdout = summarizeBacktest(trades.filter((trade) => v2Period(trade.openedAt, start, end) === "FINAL_HOLDOUT"), 5);
  return {
    candidate,
    timeframe,
    signals: five.signals,
    signalsPerDay: five.signals / days,
    signalsPerWeek: five.signals / days * 7,
    winPct: five.winRateIncludingExpired,
    lossPct: five.lossRate,
    expiredPct: five.expiredRate,
    expectancy0Bps: ideal.expectancyR,
    expectancy5Bps: five.expectancyR,
    expectancy10Bps: ten.expectancyR,
    profitFactor5Bps: five.profitFactor,
    maximumDrawdown5Bps: five.maximumDrawdownR,
    holdoutExpectancy5Bps: holdout.expectancyR,
    holdoutProfitFactor5Bps: holdout.profitFactor,
    status,
  };
}

function periodSummary(trades: BacktestTrade[], period: PeriodName, frictionBps: number) {
  return summarizeBacktest(
    trades.filter((trade) => v2Period(trade.openedAt, analysisStart, observedAt) === period),
    frictionBps,
  );
}

function chronologicalSlices(trades: BacktestTrade[], frictionBps: number) {
  return Array.from({ length: 5 }, (_, index) => {
    const from = index / 5;
    const to = (index + 1) / 5;
    const selected = trades.filter((trade) => {
      const point = (Date.parse(trade.openedAt) - analysisStart.getTime()) / (observedAt.getTime() - analysisStart.getTime());
      return point >= from && point < to;
    });
    return { from, to, summary: compactSummary(summarizeBacktest(selected, frictionBps)) };
  });
}

function compareDevelopmentOnly(
  left: { development5Bps: BacktestSummary; development10Bps: BacktestSummary },
  right: { development5Bps: BacktestSummary; development10Bps: BacktestSummary },
) {
  const expectancy = (right.development5Bps.expectancyR ?? Number.NEGATIVE_INFINITY)
    - (left.development5Bps.expectancyR ?? Number.NEGATIVE_INFINITY);
  if (expectancy !== 0) return expectancy;
  const pf = (right.development5Bps.profitFactor ?? 0) - (left.development5Bps.profitFactor ?? 0);
  if (pf !== 0) return pf;
  const stress = (right.development10Bps.expectancyR ?? Number.NEGATIVE_INFINITY)
    - (left.development10Bps.expectancyR ?? Number.NEGATIVE_INFINITY);
  if (stress !== 0) return stress;
  return (left.development5Bps.maximumDrawdownR ?? Number.POSITIVE_INFINITY)
    - (right.development5Bps.maximumDrawdownR ?? Number.POSITIVE_INFINITY);
}

function minimumSamples(timeframe: V2ExecutionTimeframe) {
  return timeframe === "5m"
    ? { development: 60, validation: 36, holdout: 24 }
    : timeframe === "15m"
      ? { development: 40, validation: 24, holdout: 16 }
      : { development: 20, validation: 12, holdout: 8 };
}

function positiveEdge(summary: BacktestSummary) {
  return (summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0 && (summary.profitFactor ?? 0) > 1;
}

function summarizeEntryStage(items: Array<{
  candidateId: V2EntryCandidateId;
  rawEntries: number;
  development5Bps: BacktestSummary;
  development10Bps: BacktestSummary;
  validation5Bps: BacktestSummary;
  validation10Bps: BacktestSummary;
}>) {
  return items.map((item) => ({
    candidateId: item.candidateId,
    rawEntries: item.rawEntries,
    development5Bps: compactSummary(item.development5Bps),
    development10Bps: compactSummary(item.development10Bps),
    validation5Bps: compactSummary(item.validation5Bps),
    validation10Bps: compactSummary(item.validation10Bps),
  }));
}

function compactSummary(summary: BacktestSummary) {
  return {
    signals: summary.signals,
    wins: summary.wins,
    losses: summary.losses,
    expired: summary.expired,
    winPct: summary.winRateIncludingExpired,
    lossPct: summary.lossRate,
    expiredPct: summary.expiredRate,
    expectancyR: summary.expectancyR,
    profitFactor: summary.profitFactor,
    maximumDrawdownR: summary.maximumDrawdownR,
  };
}

function topFivePositiveContribution(trades: BacktestTrade[], frictionBps: number) {
  const values = trades.map((trade) => {
    if (trade.realizedR === null || trade.riskPct <= 0) return null;
    return trade.realizedR - (frictionBps / 100) / trade.riskPct;
  }).filter((value): value is number => value !== null && value > 0).sort((a, b) => b - a);
  const total = values.reduce((sum, value) => sum + value, 0);
  return total <= 0 ? null : values.slice(0, 5).reduce((sum, value) => sum + value, 0) / total * 100;
}

function bestFinalist(finalists: Array<{
  timeframe: V2ExecutionTimeframe;
  status: string;
  leaderboard: ReturnType<typeof leaderboardRow>;
}>) {
  const rank: Record<string, number> = { ROBUST: 4, PROMISING: 3, INVESTIGATE: 2, REJECT: 1 };
  return [...finalists].sort((left, right) => {
    const status = (rank[right.status] ?? 0) - (rank[left.status] ?? 0);
    if (status !== 0) return status;
    return (right.leaderboard.holdoutExpectancy5Bps ?? Number.NEGATIVE_INFINITY)
      - (left.leaderboard.holdoutExpectancy5Bps ?? Number.NEGATIVE_INFINITY);
  })[0] ?? null;
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
  return { days, end, compact: args.includes("--compact") };
}

function compactReport(reportValue: typeof report) {
  return {
    metadata: reportValue.metadata,
    dataQuality: reportValue.dataQuality,
    baseline: reportValue.baseline,
    baselineByTimeframe: reportValue.baselineByTimeframe,
    v2: Object.fromEntries(V2_EXECUTION_TIMEFRAMES.map((timeframe) => {
      const study = reportValue.v2[timeframe];
      return [timeframe, {
        entryStage: study.entryStage.map((entry) => ({
          candidateId: entry.candidateId,
          rawEntries: entry.rawEntries,
          development: {
            signals: entry.development5Bps.signals,
            expectancy5Bps: entry.development5Bps.expectancyR,
            profitFactor5Bps: entry.development5Bps.profitFactor,
            expectancy10Bps: entry.development10Bps.expectancyR,
          },
          validation: {
            signals: entry.validation5Bps.signals,
            expectancy5Bps: entry.validation5Bps.expectancyR,
            profitFactor5Bps: entry.validation5Bps.profitFactor,
            expectancy10Bps: entry.validation10Bps.expectancyR,
          },
        })),
        entryFinalists: study.entryFinalists,
        exitConfigurationsEvaluated: study.exitConfigurationsEvaluated,
        ...("expiryConfigurationsEvaluated" in study
          ? { expiryConfigurationsEvaluated: study.expiryConfigurationsEvaluated }
          : {}),
        finalCandidate: study.finalCandidate,
        ...("reason" in study ? { reason: study.reason } : {}),
      }];
    })),
    candidateLeaderboard: reportValue.candidateLeaderboard,
    bestCandidate: reportValue.bestCandidate,
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
