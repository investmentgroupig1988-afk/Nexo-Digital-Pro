import { getBinance } from "../services/market";
import {
  baselineConfiguration,
  causalVolatilityRegime,
  summarizeBacktest,
  validateCandleSeries,
  type BacktestSummary,
  type BacktestTrade,
  type ClosedAnalysisCandle,
  type ExitConfiguration,
} from "../services/signal-backtest";
import { deterministicBlockBootstrap } from "../services/signal-hypothesis-robustness";
import { frozen1hExitConfiguration } from "../services/signal-hypothesis-forward";
import {
  buildV3Contexts,
  evaluateV3Entries,
  filterV3Entries,
  generateV3BaselineSetups,
  isV3CandleUsable,
  type V3FeatureSnapshot,
  type V3SetupEntry,
} from "../services/signal-strategy-v3";
import {
  filterV5Entries,
  selectV5ResearchShortlist,
  selectV5ValidatedFinalist,
  v5CandidateDefinitions,
  v5ExitConfiguration,
  v5Period,
  v5StabilityGrid,
  type V5CandidateDefinition,
  type V5Entry,
  type V5ResearchCandidate,
  type V5ValidatedCandidate,
} from "../services/signal-strategy-v5";
import {
  V5_PREREGISTRATION,
  V5_PREREGISTRATION_HASH,
  V5_TIMEFRAMES,
  computeV5PreregistrationHash,
  type V5Timeframe,
} from "../services/signal-strategy-v5-snapshot";

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];
type TimeframeData = { candles: ClosedAnalysisCandle[]; incompleteExcluded: number };
type V5Trade = BacktestTrade & { feature: V3FeatureSnapshot; v5: V5Entry["v5"] };
type CandidateEvaluation = {
  definition: V5CandidateDefinition;
  entries: V5Entry[];
  trades: V5Trade[];
  research5Bps: BacktestSummary;
  research10Bps: BacktestSummary;
};

const INTERVAL_MS: Record<V5Timeframe, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};
const EXTERNAL_START = new Date(V5_PREREGISTRATION.periods.externalPreSampleAudit.start);
const ANALYSIS_END = new Date(V5_PREREGISTRATION.periods.lockedOutOfSample.end);
const COSTS = [0, 5, 10] as const;

assertProtocol();
const fetched = Object.fromEntries(await Promise.all(V5_TIMEFRAMES.map(async (timeframe) => {
  const warmupStart = new Date(EXTERNAL_START.getTime() - INTERVAL_MS[timeframe] * 220);
  return [timeframe, await fetchClosedCandles(timeframe, warmupStart, ANALYSIS_END, ANALYSIS_END)];
}))) as Record<V5Timeframe, TimeframeData>;

const contexts = buildV3Contexts({
  candles1h: fetched["1h"].candles,
  candles4h: fetched["4h"].candles,
});
const entries = Object.fromEntries(V5_TIMEFRAMES.map((timeframe) => [
  timeframe,
  generateV3BaselineSetups({
    candles: fetched[timeframe].candles,
    timeframe,
    ...contexts,
    analysisStart: EXTERNAL_START,
  }).map((entry) => annotateV5Entry(entry, fetched[timeframe].candles, fetched["4h"].candles)),
])) as Record<V5Timeframe, V5Entry[]>;

const studies = Object.fromEntries(V5_TIMEFRAMES.map((timeframe) => [timeframe, studyTimeframe(timeframe)])) as Record<
  V5Timeframe,
  ReturnType<typeof studyTimeframe>
>;
const promoted = V5_TIMEFRAMES.filter((timeframe) => studies[timeframe].finalist?.promotion.action === "PROMOTE TO FORWARD");

const rejectedFrozen1hTrades = evaluateV3Entries(
  fetched["1h"].candles,
  filterV3Entries(entries["1h"], "QUALITY_PULLBACK_HTF"),
  frozen1hExitConfiguration(),
);

const report = {
  metadata: {
    name: "TRENORO Signal Engine V5 preregistered offline research",
    preregistrationId: V5_PREREGISTRATION.id,
    preregistrationHash: V5_PREREGISTRATION_HASH,
    snapshotVerified: true,
    symbol: "BTCUSDT",
    provider: V5_PREREGISTRATION.provider,
    periods: V5_PREREGISTRATION.periods,
    costs: V5_PREREGISTRATION.costs,
    experimentCount: V5_PREREGISTRATION.experimentCount,
    selection: V5_PREREGISTRATION.selection,
    promotionGate: V5_PREREGISTRATION.promotionGate,
    methodologyCaveat: "2018-2026 was previously inspected in V3/V4. LOCKED_OOS is sealed against V5 code-level selection but is not genuinely untouched market history. The 2017-10 to 2018-08 pre-sample was not used for V5 selection but is chronologically earlier, not forward.",
    liveStrategyChanged: false,
    schedulerChanged: false,
    databaseWrites: false,
    telegramCalls: false,
    commercialSymbolsChanged: false,
  },
  dataQuality: Object.fromEntries(V5_TIMEFRAMES.map((timeframe) => [timeframe, {
    ...validateCandleSeries(fetched[timeframe].candles, INTERVAL_MS[timeframe], ANALYSIS_END),
    incompleteExcluded: fetched[timeframe].incompleteExcluded,
  }])),
  rejectedControls: {
    liveBaselineByTimeframe: Object.fromEntries(V5_TIMEFRAMES.map((timeframe) => {
      const trades = evaluateV3Entries(fetched[timeframe].candles, entries[timeframe], baselineConfiguration());
      return [timeframe, periodControl(trades as V5Trade[])];
    })),
    frozenV3V4OneHour: {
      research: costsFor(periodTrades(rejectedFrozen1hTrades as V5Trade[], "RESEARCH")),
      validation: costsFor(periodTrades(rejectedFrozen1hTrades as V5Trade[], "VALIDATION")),
      lockedOos: costsFor(periodTrades(rejectedFrozen1hTrades as V5Trade[], "LOCKED_OOS")),
      externalPreSample: costsFor(periodTrades(rejectedFrozen1hTrades as V5Trade[], "EXTERNAL_PRE_SAMPLE")),
      status: "REJECTED_CONTROL",
    },
  },
  studies,
  conclusion: {
    result: promoted.length > 0 ? "PROMOTE TO FORWARD" : "REJECT",
    forwardCandidates: promoted,
    commercialPromotion: false,
    note: promoted.length > 0
      ? "A passing V5 candidate may only enter separate paper/forward observation after explicit authorization."
      : "No V5 candidate passed the preregistered research, validation, stability, locked-OOS, external and bootstrap gates.",
  },
};

// Keep stdout compact enough for CI/research logs while retaining every gate-relevant
// result. This changes presentation only; the preregistered protocol and selectors
// above remain the sole source of candidate selection.
console.log(JSON.stringify(roundDeep(compactReport(report)), null, 2));

function studyTimeframe(timeframe: V5Timeframe) {
  const candidateEvaluations = v5CandidateDefinitions(timeframe).map((definition) => evaluateDefinition(definition));
  const byId = new Map(candidateEvaluations.map((item) => [candidateId(item.definition), item]));
  const shortlist = selectV5ResearchShortlist(candidateEvaluations.map((item) => researchSelectorInput(item)));
  const validated: V5ValidatedCandidate[] = shortlist.map((candidate) => {
    const evaluation = byId.get(candidateId(candidate.definition))!;
    return {
      ...candidate,
      validation5Bps: summarizeBacktest(periodTrades(evaluation.trades, "VALIDATION"), 5),
      validation10Bps: summarizeBacktest(periodTrades(evaluation.trades, "VALIDATION"), 10),
    };
  });
  const finalistDefinition = selectV5ValidatedFinalist(validated)?.definition ?? null;
  const finalistEvaluation = finalistDefinition === null ? null : byId.get(candidateId(finalistDefinition))!;
  const finalist = finalistEvaluation === null ? null : finalistReport(finalistEvaluation);
  return {
    baselineOpportunities: entries[timeframe].length,
    primaryCombinationsEvaluated: candidateEvaluations.length,
    research: candidateEvaluations.map((evaluation) => ({
      definition: evaluation.definition,
      entrySignals: filterV5Entries(entries[timeframe], evaluation.definition.entryFamily).length,
      zeroBps: compactSummary(summarizeBacktest(periodTrades(evaluation.trades, "RESEARCH"), 0)),
      fiveBps: compactSummary(evaluation.research5Bps),
      tenBps: compactSummary(evaluation.research10Bps),
      frequency: frequency(evaluation.research5Bps.signals, periodDays("RESEARCH")),
      researchGatePassed: shortlist.some((candidate) => candidateId(candidate.definition) === candidateId(evaluation.definition)),
    })),
    validation: validated.map((candidate) => ({
      definition: candidate.definition,
      fiveBps: compactSummary(candidate.validation5Bps),
      tenBps: compactSummary(candidate.validation10Bps),
      validationGatePassed: finalistDefinition !== null
        && candidateId(candidate.definition) === candidateId(finalistDefinition),
    })),
    finalist,
    timeframeRecommendation: finalist?.promotion.action === "PROMOTE TO FORWARD"
      ? "FORWARD_RESEARCH_ONLY"
      : "EXCLUDE_FROM_V5_FORWARD",
  };

  function evaluateDefinition(definition: V5CandidateDefinition): CandidateEvaluation {
    const acceptedEntries = filterV5Entries(entries[timeframe], definition.entryFamily);
    const trades = evaluateV3Entries(
      fetched[timeframe].candles,
      acceptedEntries,
      v5ExitConfiguration(definition.exitFamily, timeframe),
    ) as V5Trade[];
    return {
      definition,
      entries: acceptedEntries,
      trades,
      research5Bps: summarizeBacktest(periodTrades(trades, "RESEARCH"), 5),
      research10Bps: summarizeBacktest(periodTrades(trades, "RESEARCH"), 10),
    };
  }

  function finalistReport(evaluation: CandidateEvaluation) {
    const research = periodTrades(evaluation.trades, "RESEARCH");
    const validation = periodTrades(evaluation.trades, "VALIDATION");
    const locked = periodTrades(evaluation.trades, "LOCKED_OOS");
    const external = periodTrades(evaluation.trades, "EXTERNAL_PRE_SAMPLE");
    const stability = v5StabilityGrid(evaluation.definition).map((configuration) => {
      const trades = evaluateV3Entries(fetched[timeframe].candles, evaluation.entries, configuration) as V5Trade[];
      const selectionPeriod = trades.filter((trade) => {
        const period = v5Period(trade.v5.evaluatedAt);
        return period === "RESEARCH" || period === "VALIDATION";
      });
      return {
        configuration: compactConfiguration(configuration),
        fiveBps: compactSummary(summarizeBacktest(selectionPeriod, 5)),
        tenBps: compactSummary(summarizeBacktest(selectionPeriod, 10)),
      };
    });
    const positiveStabilityCells = stability.filter((item) => positiveEdge(item.fiveBps)).length;
    const locked5 = summarizeBacktest(locked, 5);
    const locked10 = summarizeBacktest(locked, 10);
    const external5 = summarizeBacktest(external, 5);
    const bootstrap = locked.length >= 3
      ? deterministicBlockBootstrap({ trades: locked, frictionBps: 5, blockLength: Math.min(5, locked.length) })
      : null;
    const minimumLocked = V5_PREREGISTRATION.promotionGate.minimumLockedSignals[timeframe];
    const lockedPass = locked5.signals >= minimumLocked
      && positiveSummary(locked5)
      && (locked10.expectancyR ?? Number.NEGATIVE_INFINITY) >= 0
      && (locked10.profitFactor ?? 0) >= 1;
    const externalPass = external5.signals >= 5 && positiveSummary(external5);
    const stabilityPass = positiveStabilityCells >= V5_PREREGISTRATION.stability.minimumPositiveResearchValidationCellsAt5Bps;
    const bootstrapPass = bootstrap !== null
      && bootstrap.expectancyR.p50 > 0
      && bootstrap.probabilityPositiveExpectancyPct >= 60;
    const promote = lockedPass && externalPass && stabilityPass && bootstrapPass;
    const commercialPeriod = evaluation.trades.filter((trade) => v5Period(trade.v5.evaluatedAt) !== "EXTERNAL_PRE_SAMPLE");
    return {
      definition: evaluation.definition,
      research: costsFor(research),
      validation: costsFor(validation),
      lockedOutOfSample: costsFor(locked),
      externalPreSample: costsFor(external),
      frequency2018To2026: frequency(summarizeBacktest(commercialPeriod, 5).signals, 8 * 365.25),
      stability: {
        cells: stability,
        positiveCellsAt5Bps: positiveStabilityCells,
        requiredPositiveCells: V5_PREREGISTRATION.stability.minimumPositiveResearchValidationCellsAt5Bps,
        pass: stabilityPass,
      },
      bootstrapLockedOos5Bps: bootstrap,
      promotion: {
        lockedOosPass: lockedPass,
        externalPreSamplePass: externalPass,
        stabilityPass,
        bootstrapPass,
        action: promote ? "PROMOTE TO FORWARD" : "REJECT",
      },
    };
  }
}

function annotateV5Entry(
  entry: V3SetupEntry,
  timeframeCandles: ClosedAnalysisCandle[],
  candles4h: ClosedAnalysisCandle[],
): V5Entry {
  const entryCandle = timeframeCandles[entry.entryIndex];
  if (entryCandle === undefined) throw new Error("V5 entry references a missing execution candle.");
  const evaluatedAt = entryCandle.closeTime;
  const contextIndex = latestClosedIndex(candles4h, Date.parse(evaluatedAt));
  const percentile = contextIndex < 0 ? null : causalVolatilityRegime(
    candles4h.slice(Math.max(0, contextIndex - 199), contextIndex + 1),
  ).volatilityPercentileAtEntry;
  return { ...entry, v5: { evaluatedAt, fourHourVolatilityPercentile: percentile } };
}

function latestClosedIndex(candles: ClosedAnalysisCandle[], observedAtMs: number): number {
  let low = 0;
  let high = candles.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(candles[middle].closeTime) <= observedAtMs) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
}

function researchSelectorInput(evaluation: CandidateEvaluation): V5ResearchCandidate {
  return {
    definition: evaluation.definition,
    research5Bps: evaluation.research5Bps,
    research10Bps: evaluation.research10Bps,
  };
}

function periodTrades<T extends V5Trade>(trades: T[], period: ReturnType<typeof v5Period>): T[] {
  return trades.filter((trade) => v5Period(trade.v5.evaluatedAt) === period);
}

function periodControl(trades: V5Trade[]) {
  return {
    research: costsFor(periodTrades(trades, "RESEARCH")),
    validation: costsFor(periodTrades(trades, "VALIDATION")),
    lockedOos: costsFor(periodTrades(trades, "LOCKED_OOS")),
  };
}

function costsFor(trades: BacktestTrade[]) {
  return Object.fromEntries(COSTS.map((cost) => [`${cost}bps`, compactSummary(summarizeBacktest(trades, cost))]));
}

function compactSummary(summary: BacktestSummary) {
  return {
    signals: summary.signals,
    wins: summary.wins,
    losses: summary.losses,
    expired: summary.expired,
    expectancyR: summary.expectancyR,
    profitFactor: summary.profitFactor,
    maximumDrawdownR: summary.maximumDrawdownR,
    consecutiveLosses: summary.consecutiveLosses,
  };
}

function compactConfiguration(configuration: ExitConfiguration) {
  return {
    riskMode: configuration.riskMode,
    atrMultiple: configuration.atrMultiple ?? null,
    riskPercent: configuration.riskPercent ?? null,
    rewardRisk: configuration.rewardRisk,
    expiryCandles: configuration.expiryCandles,
  };
}

function positiveSummary(summary: BacktestSummary): boolean {
  return (summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0 && (summary.profitFactor ?? 0) > 1;
}

function positiveEdge(summary: ReturnType<typeof compactSummary>): boolean {
  return (summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0 && (summary.profitFactor ?? 0) > 1;
}

function frequency(signals: number, days: number) {
  return {
    perDay: days > 0 ? signals / days : null,
    perWeek: days > 0 ? signals / days * 7 : null,
    perMonth: days > 0 ? signals / days * 30.4375 : null,
  };
}

function periodDays(period: "RESEARCH" | "VALIDATION" | "LOCKED_OOS" | "EXTERNAL_PRE_SAMPLE"): number {
  const source = period === "RESEARCH" ? V5_PREREGISTRATION.periods.research
    : period === "VALIDATION" ? V5_PREREGISTRATION.periods.validation
      : period === "LOCKED_OOS" ? V5_PREREGISTRATION.periods.lockedOutOfSample
        : V5_PREREGISTRATION.periods.externalPreSampleAudit;
  return (Date.parse(source.end) - Date.parse(source.start)) / 86_400_000;
}

function candidateId(definition: V5CandidateDefinition): string {
  return `${definition.timeframe}:${definition.entryFamily}:${definition.exitFamily}`;
}

async function fetchClosedCandles(
  timeframe: V5Timeframe,
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
    if (next <= cursor) throw new Error(`Binance pagination did not advance for BTCUSDT ${timeframe}.`);
    cursor = next;
    if (page.length < 1_000) break;
  }
  return {
    candles: [...byTimestamp.values()].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)),
    incompleteExcluded,
  };
}

function assertProtocol(): void {
  if (process.argv.slice(2).length > 0) throw new Error("V5 accepts no runtime parameters.");
  const actual = computeV5PreregistrationHash();
  if (actual !== V5_PREREGISTRATION_HASH) {
    throw new Error(`V5 preregistration hash mismatch: expected ${V5_PREREGISTRATION_HASH}, got ${actual}.`);
  }
}

function roundDeep(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : String(value);
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, roundDeep(nested)]));
  }
  return value;
}

function compactReport(source: typeof report) {
  return {
    metadata: {
      preregistrationId: source.metadata.preregistrationId,
      preregistrationHash: source.metadata.preregistrationHash,
      snapshotVerified: source.metadata.snapshotVerified,
      symbol: source.metadata.symbol,
      periods: source.metadata.periods,
      costs: source.metadata.costs,
      experimentCount: source.metadata.experimentCount,
      methodologyCaveat: source.metadata.methodologyCaveat,
      liveStrategyChanged: source.metadata.liveStrategyChanged,
      schedulerChanged: source.metadata.schedulerChanged,
      databaseWrites: source.metadata.databaseWrites,
      telegramCalls: source.metadata.telegramCalls,
    },
    dataQuality: source.dataQuality,
    rejectedControlsAt5Bps: {
      liveBaselineByTimeframe: Object.fromEntries(V5_TIMEFRAMES.map((timeframe) => [timeframe, {
        research: source.rejectedControls.liveBaselineByTimeframe[timeframe].research["5bps"],
        validation: source.rejectedControls.liveBaselineByTimeframe[timeframe].validation["5bps"],
        lockedOos: source.rejectedControls.liveBaselineByTimeframe[timeframe].lockedOos["5bps"],
      }])),
      frozenV3V4OneHour: {
        research: source.rejectedControls.frozenV3V4OneHour.research["5bps"],
        validation: source.rejectedControls.frozenV3V4OneHour.validation["5bps"],
        lockedOos: source.rejectedControls.frozenV3V4OneHour.lockedOos["5bps"],
        externalPreSample: source.rejectedControls.frozenV3V4OneHour.externalPreSample["5bps"],
        status: source.rejectedControls.frozenV3V4OneHour.status,
      },
    },
    studies: Object.fromEntries(V5_TIMEFRAMES.map((timeframe) => {
      const study = source.studies[timeframe];
      return [timeframe, {
        baselineOpportunities: study.baselineOpportunities,
        primaryCombinationsEvaluated: study.primaryCombinationsEvaluated,
        researchGatePassers: study.research.filter((candidate) => candidate.researchGatePassed).map((candidate) => ({
          definition: candidate.definition,
          entrySignals: candidate.entrySignals,
          fiveBps: candidate.fiveBps,
          tenBps: candidate.tenBps,
          frequency: candidate.frequency,
        })),
        validation: study.validation,
        finalist: study.finalist === null ? null : {
          definition: study.finalist.definition,
          research: study.finalist.research,
          validation: study.finalist.validation,
          lockedOutOfSample: study.finalist.lockedOutOfSample,
          externalPreSample: study.finalist.externalPreSample,
          frequency2018To2026: study.finalist.frequency2018To2026,
          stability: {
            positiveCellsAt5Bps: study.finalist.stability.positiveCellsAt5Bps,
            requiredPositiveCells: study.finalist.stability.requiredPositiveCells,
            pass: study.finalist.stability.pass,
            expectancy5BpsRange: numericRange(study.finalist.stability.cells.map((cell) => cell.fiveBps.expectancyR)),
            profitFactor5BpsRange: numericRange(study.finalist.stability.cells.map((cell) => cell.fiveBps.profitFactor)),
            maximumDrawdown5BpsRange: numericRange(study.finalist.stability.cells.map((cell) => cell.fiveBps.maximumDrawdownR)),
          },
          bootstrapLockedOos5Bps: study.finalist.bootstrapLockedOos5Bps,
          promotion: study.finalist.promotion,
        },
        timeframeRecommendation: study.timeframeRecommendation,
      }];
    })),
    conclusion: source.conclusion,
  };
}

function numericRange(values: Array<number | null>) {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length === 0 ? null : { minimum: Math.min(...finite), maximum: Math.max(...finite) };
}
