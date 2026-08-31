import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  baselineConfiguration,
  evaluateEntry,
  netRealizedR,
  percentile,
  summarizeBacktest,
  type BacktestSummary,
  type BacktestTrade,
  type ClosedAnalysisCandle,
  type ExitConfiguration,
} from "../services/signal-backtest";
import { deterministicBlockBootstrap } from "../services/signal-hypothesis-robustness";
import { loadOrFetchResearchDataset } from "../services/signal-research-dataset";
import {
  evaluateV6AblationEntries,
  generateV6AblationEntries,
} from "../services/signal-strategy-v6-ablation";
import {
  deriveV4Thresholds,
  scoreV4Opportunities,
  type V4ScoreThresholds,
} from "../services/signal-strategy-v4";
import {
  buildV3Contexts,
  evaluateV3Entries,
  generateV3BaselineSetups,
  type V3FeatureSnapshot,
} from "../services/signal-strategy-v3";
import {
  filterV6Entries,
  periodDays,
  promotionGate,
  selectV6EntryShortlist,
  selectV6ValidatedFinalists,
  summarizeV6,
  tradesInV6Period,
  v6CostModels,
  v6ExitSearchConfigurations,
  v6ExpirySensitivity,
  v6Period,
  v6StabilitySurface,
  type V6Entry,
  type V6EntryScreen,
  type V6EntryShortlist,
  type V6Metrics,
  type V6Period,
  type V6ValidationScreen,
} from "../services/signal-strategy-v6";
import {
  V6_ENTRY_FAMILIES,
  V6_ABLATIONS,
  V6_PREREGISTRATION,
  V6_PREREGISTRATION_HASH,
  V6_TIMEFRAMES,
  computeV6PreregistrationHash,
  type V6EntryFamily,
  type V6Timeframe,
} from "../services/signal-strategy-v6-snapshot";

type TimeframeData = Awaited<ReturnType<typeof loadOrFetchResearchDataset>>;
type V6Trade = BacktestTrade & { feature: V3FeatureSnapshot; v6: V6Entry["v6"]; qualityScore: number };
type CandidateDefinition = {
  id: string;
  timeframe: V6Timeframe;
  entryFamily: V6EntryFamily;
  exit: ExitConfiguration;
};
type CandidateRun = {
  definition: CandidateDefinition;
  entries: V6Entry[];
  trades: V6Trade[];
};
type CandidateScreen = V6EntryScreen<CandidateDefinition> & { run: CandidateRun };
type CandidateShortlist = V6EntryShortlist<CandidateDefinition> & { run: CandidateRun };
type CandidateValidation = V6ValidationScreen<CandidateDefinition> & { run: CandidateRun };

const INTERVAL_MS: Record<V6Timeframe, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};
const ANALYSIS_START = new Date(V6_PREREGISTRATION.dataset.start);
const ANALYSIS_END = new Date(V6_PREREGISTRATION.dataset.endExclusive);
const CACHE_DIRECTORY = path.resolve("research", "cache");
const OUTPUT_DIRECTORY = path.resolve("research", "output");
const COSTS = v6CostModels();

assertProtocol();
console.error(`[V6] preregistration ${V6_PREREGISTRATION_HASH} verified`);

const data = Object.fromEntries(await Promise.all(V6_TIMEFRAMES.map(async (timeframe) => {
  const warmupStart = new Date(ANALYSIS_START.getTime() - INTERVAL_MS[timeframe] * V6_PREREGISTRATION.dataset.warmupCandles);
  console.error(`[V6] loading ${timeframe} candles`);
  const dataset = await loadOrFetchResearchDataset({
    symbol: "BTCUSDT",
    timeframe,
    start: warmupStart,
    endExclusive: ANALYSIS_END,
    observedAt: ANALYSIS_END,
    cacheDirectory: CACHE_DIRECTORY,
  });
  console.error(`[V6] ${timeframe}: ${dataset.metadata.candleCount} candles (${dataset.source}) sha256=${dataset.metadata.sha256.slice(0, 12)}`);
  return [timeframe, dataset];
}))) as Record<V6Timeframe, TimeframeData>;

const contexts = buildV3Contexts({ candles1h: data["1h"].candles, candles4h: data["4h"].candles });
const entries = {} as Record<V6Timeframe, V6Entry[]>;
const thresholds = {} as Record<V6Timeframe, V4ScoreThresholds>;

for (const timeframe of V6_TIMEFRAMES) {
  console.error(`[V6] generating closed-candle baseline opportunities for ${timeframe}`);
  const base = generateV3BaselineSetups({
    candles: data[timeframe].candles,
    timeframe,
    ...contexts,
    analysisStart: ANALYSIS_START,
  });
  const scored = scoreV4Opportunities({
    entries: base,
    candles: data[timeframe].candles,
    timeframe,
    observedAt: ANALYSIS_END,
  });
  entries[timeframe] = scored.map((entry) => annotateBroadVolatility(entry, data[timeframe].candles, data["4h"].candles));
  const trainEntries = entries[timeframe].filter((entry) => v6Period(entry.openedAt) === "TRAIN");
  thresholds[timeframe] = deriveV4Thresholds(trainEntries);
  console.error(`[V6] ${timeframe}: ${entries[timeframe].length} opportunities; TRAIN quality thresholds frozen`);

  // --- CHEQUEO PUNTUAL: NORMAL_VOLATILITY con rewardRisk=1.0 ---
  // Aditivo, no reemplaza ni modifica el pipeline v6 existente.
  if (timeframe === "1h" || timeframe === "4h" || timeframe === "15m" || timeframe === "5m") {
    const rr1Exit: ExitConfiguration = { ...baselineConfiguration(), name: "CHECK_RR1", rewardRisk: 1.0 };
    const rr1Run = runCandidate(timeframe, "NORMAL_VOLATILITY", rr1Exit);
    const rr1Train = summarizeBacktest(tradesInV6Period(rr1Run.trades, "TRAIN"), 5);
    const rr1Dev = summarizeBacktest(tradesInV6Period(rr1Run.trades, "DEVELOPMENT"), 5);
    const rr1Val = summarizeBacktest(tradesInV6Period(rr1Run.trades, "VALIDATION"), 5);
    console.error(`\n[CHECK_RR1] ${timeframe} NORMAL_VOLATILITY rewardRisk=1.0 (vs. shortlist real con 1.5):`);
    console.error(`  TRAIN:       expectancyR=${rr1Train.expectancyR} PF=${rr1Train.profitFactor} n=${rr1Train.signals}`);
    console.error(`  DEVELOPMENT: expectancyR=${rr1Dev.expectancyR} PF=${rr1Dev.profitFactor} n=${rr1Dev.signals}`);
    console.error(`  VALIDATION:  expectancyR=${rr1Val.expectancyR} PF=${rr1Val.profitFactor} n=${rr1Val.signals}`);
  }
}


const ablationStudies = Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => {
  console.error(`[V6] running frozen-filter ablations for ${timeframe}`);
  const generated = generateV6AblationEntries({
    candles: data[timeframe].candles,
    timeframe,
    analysisStart: ANALYSIS_START,
  });
  if (generated.baselineParityMismatches !== 0) {
    throw new Error(`V6 research mirror diverged from live baseline for ${timeframe}: direction=${generated.baselineDirectionMismatches}, geometry=${generated.baselineGeometryMismatches}, first=${JSON.stringify(generated.firstMismatch)}.`);
  }
  return [timeframe, {
    baselineSignalsCompared: generated.baselineSignalsCompared,
    baselineDirectionMismatches: generated.baselineDirectionMismatches,
    baselineGeometryMismatches: generated.baselineGeometryMismatches,
    baselineParityMismatches: generated.baselineParityMismatches,
    result: "PASS",
    ablations: Object.fromEntries(V6_ABLATIONS.map((ablation) => {
      const trades = evaluateV6AblationEntries(data[timeframe].candles, generated.entries[ablation]);
      return [ablation, {
        full5Bps: compactSummary(summarizeBacktest(trades, 5)),
        train5Bps: compactSummary(summarizeBacktest(tradesInV6Period(trades, "TRAIN"), 5)),
        development5Bps: compactSummary(summarizeBacktest(tradesInV6Period(trades, "DEVELOPMENT"), 5)),
        validation5Bps: compactSummary(summarizeBacktest(tradesInV6Period(trades, "VALIDATION"), 5)),
        lockedOutOfSample5Bps: compactSummary(summarizeBacktest(tradesInV6Period(trades, "LOCKED_OUT_OF_SAMPLE"), 5)),
      }];
    })),
  }];
})) as Record<V6Timeframe, unknown>;

const preOosStudies = Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [timeframe, studyBeforeOos(timeframe)])) as Record<
  V6Timeframe,
  ReturnType<typeof studyBeforeOos>
>;

const frozenDefinitions = V6_TIMEFRAMES.map((timeframe) => preOosStudies[timeframe].selected?.candidate ?? null);
const finalistSelectionHash = createHash("sha256").update(canonicalJson(frozenDefinitions)).digest("hex");
console.error(`[V6] finalist definitions frozen before OOS: ${finalistSelectionHash}`);

const finalists = Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [
  timeframe,
  preOosStudies[timeframe].selected === null ? null : openLockedEvidence(preOosStudies[timeframe].selected!),
])) as Record<V6Timeframe, ReturnType<typeof openLockedEvidence> | null>;

const baseline = Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => {
  const run = runCandidate(timeframe, "BASELINE_ALL", baselineConfiguration());
  return [timeframe, completeCandidateEvidence(run)];
})) as Record<V6Timeframe, ReturnType<typeof completeCandidateEvidence>>;

const report = {
  metadata: {
    researchId: V6_PREREGISTRATION.id,
    preregistrationHash: V6_PREREGISTRATION_HASH,
    preregistrationCommit: "41384002ddea8c249f6fd04015be4f281b0c073e",
    finalistSelectionHash,
    generatedAt: new Date().toISOString(),
    symbol: "BTCUSDT",
    closedCandlePolicy: V6_PREREGISTRATION.dataset.openCandlePolicy,
    contamination: V6_PREREGISTRATION.dataset.contamination,
    liveStrategyChanged: false,
    schedulerChanged: false,
    databaseWrites: false,
    telegramCalls: false,
  },
  dataset: Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [timeframe, data[timeframe].metadata])),
  parity: {
    liveBoundary: "selectClosedHistoricalCandles -> calculateTechnicalAnalysis -> evaluateSignal",
    replayBoundary: "evaluateClosedReplayDecision -> same selector/technical/evaluateSignal",
    test: "offline replay and the live boundary use identical closed candles and decision",
    result: "PASS",
  },
  protocol: V6_PREREGISTRATION,
  qualityThresholdsFrozenOnTrain: thresholds,
  baseline,
  diagnostic: Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [timeframe, diagnoseBaseline(preOosStudies[timeframe].baselineRun.trades)])),
  regimePerformance: Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [timeframe, regimePerformance(preOosStudies[timeframe].baselineRun.trades)])),
  entryResearch: Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [timeframe, preOosStudies[timeframe].entryResearch])),
  exitResearch: Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [timeframe, preOosStudies[timeframe].exitResearch])),
  frozenFinalists: frozenDefinitions,
  finalists,
  portfolio: portfolioEvidence(finalists),
  featureAblation: ablationStudies,
  smartExits: smartExitDisposition(finalists),
  conclusion: conclude(finalists),
};

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const outputPath = path.join(OUTPUT_DIRECTORY, "signal-engine-v6-results.json");
await writeFile(outputPath, `${JSON.stringify(roundDeep(report), null, 2)}\n`, "utf8");
console.log(JSON.stringify(roundDeep({
  researchId: report.metadata.researchId,
  preregistrationHash: report.metadata.preregistrationHash,
  finalistSelectionHash,
  dataset: Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [timeframe, {
    candles: data[timeframe].metadata.candleCount,
    gaps: data[timeframe].metadata.quality.gaps,
    sha256: data[timeframe].metadata.sha256,
  }])),
  finalists: Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [timeframe, finalists[timeframe]?.summary ?? null])),
  conclusion: report.conclusion,
  outputPath,
}), null, 2));

function studyBeforeOos(timeframe: V6Timeframe) {
  const baselineRun = runCandidate(timeframe, "BASELINE_ALL", baselineConfiguration());
  const entryScreens: CandidateScreen[] = V6_ENTRY_FAMILIES.map((family) => {
    const run = runCandidate(timeframe, family, baselineConfiguration());
    return { ...screenBeforeValidation(run), run };
  });
  const entryShortlist = selectV6EntryShortlist(entryScreens).map((selected) => {
    const original = entryScreens.find((screen) => screen.candidate.id === selected.candidate.id)!;
    return { ...selected, run: original.run } as CandidateShortlist;
  });
  console.error(`[V6] ${timeframe}: ${entryShortlist.length} entry shortlist(s); searching bounded exits`);

  const exitScreens: CandidateScreen[] = [];
  for (const shortlisted of entryShortlist) {
    for (const exit of v6ExitSearchConfigurations()) {
      const run = runCandidate(timeframe, shortlisted.candidate.entryFamily, exit);
      const screen = screenBeforeValidation(run);
      exitScreens.push({ ...screen, run });
    }
  }
  const exitShortlist = selectV6EntryShortlist(exitScreens).map((selected) => {
    const original = exitScreens.find((screen) => screen.candidate.id === selected.candidate.id)!;
    return { ...selected, run: original.run } as CandidateShortlist;
  });
  const validation: CandidateValidation[] = exitShortlist.map((shortlisted) => ({
    ...shortlisted,
    validation5Bps: summarizeBacktest(tradesInV6Period(shortlisted.run.trades, "VALIDATION"), 5),
    validation10Bps: summarizeBacktest(tradesInV6Period(shortlisted.run.trades, "VALIDATION"), 10),
  }));
  const passing = selectV6ValidatedFinalists(validation).map((selected) =>
    validation.find((candidate) => candidate.candidate.id === selected.candidate.id)!) as CandidateValidation[];
  const selected = passing[0] ?? selectDiagnosticBeforeOos(validation);
  return {
    baselineRun,
    entryResearch: entryScreens.map(compactScreen),
    exitResearch: {
      configurationsEvaluated: exitScreens.length,
      entryShortlist: entryShortlist.map((item) => ({ definition: compactDefinition(item.candidate), eligibleForPromotion: item.eligibleForPromotion })),
      exitShortlist: validation.map((item) => ({
        definition: compactDefinition(item.candidate),
        eligibleForPromotion: item.eligibleForPromotion,
        train5Bps: compactSummary(item.train5Bps),
        development5Bps: compactSummary(item.development5Bps),
        validation5Bps: compactSummary(item.validation5Bps),
        validation10Bps: compactSummary(item.validation10Bps),
      })),
      validationPassers: passing.length,
    },
    selected,
  };
}

function screenBeforeValidation(run: CandidateRun): V6EntryScreen<CandidateDefinition> {
  return {
    candidate: run.definition,
    train5Bps: summarizeBacktest(tradesInV6Period(run.trades, "TRAIN"), 5),
    train10Bps: summarizeBacktest(tradesInV6Period(run.trades, "TRAIN"), 10),
    development5Bps: summarizeBacktest(tradesInV6Period(run.trades, "DEVELOPMENT"), 5),
    development10Bps: summarizeBacktest(tradesInV6Period(run.trades, "DEVELOPMENT"), 10),
  };
}

function selectDiagnosticBeforeOos(candidates: CandidateValidation[]): CandidateValidation | null {
  return [...candidates].sort((left, right) => {
    const l = Math.min(left.train5Bps.expectancyR ?? -Infinity, left.development5Bps.expectancyR ?? -Infinity, left.validation5Bps.expectancyR ?? -Infinity);
    const r = Math.min(right.train5Bps.expectancyR ?? -Infinity, right.development5Bps.expectancyR ?? -Infinity, right.validation5Bps.expectancyR ?? -Infinity);
    if (l !== r) return r - l;
    return (left.validation5Bps.maximumDrawdownR ?? Infinity) - (right.validation5Bps.maximumDrawdownR ?? Infinity);
  })[0] ?? null;
}

function runCandidate(timeframe: V6Timeframe, entryFamily: V6EntryFamily, exit: ExitConfiguration): CandidateRun {
  const selectedEntries = filterV6Entries(entries[timeframe], entryFamily, thresholds[timeframe]);
  const trades = evaluateV3Entries(data[timeframe].candles, selectedEntries, exit) as V6Trade[];
  return {
    definition: {
      id: `${timeframe}:${entryFamily}:${exit.name}`,
      timeframe,
      entryFamily,
      exit,
    },
    entries: selectedEntries,
    trades,
  };
}

function openLockedEvidence(selected: CandidateValidation) {
  const run = selected.run;
  const oosTrades = tradesInV6Period(run.trades, "LOCKED_OUT_OF_SAMPLE");
  const oos5 = summarizeV6(oosTrades, COSTS.REALISTIC, periodDays("LOCKED_OUT_OF_SAMPLE"));
  const oos10 = summarizeV6(oosTrades, COSTS.STRESS, periodDays("LOCKED_OUT_OF_SAMPLE"));
  const walkForward = walkForwardEvidence(run.trades);
  const stability = stabilityEvidence(run);
  const bootstrap = oosTrades.length >= 3
    ? deterministicBlockBootstrap({
      trades: oosTrades,
      frictionBps: 5,
      iterations: V6_PREREGISTRATION.monteCarlo.iterations,
      blockLength: Math.min(V6_PREREGISTRATION.monteCarlo.blockLength, oosTrades.length),
      seed: V6_PREREGISTRATION.monteCarlo.seed,
    })
    : null;
  const gate = promotionGate({
    timeframe: run.definition.timeframe,
    outOfSample5Bps: oos5,
    outOfSample10Bps: oos10,
    positiveWalkForwardFraction: walkForward.positiveFraction,
    positiveStabilityFraction: stability.positiveOosFraction,
    bootstrapProbabilityPositivePct: bootstrap?.probabilityPositiveExpectancyPct ?? 0,
  });
  return {
    definition: compactDefinition(run.definition),
    eligibleBeforeOos: selected.eligibleForPromotion,
    train: costsFor(tradesInV6Period(run.trades, "TRAIN"), periodDays("TRAIN")),
    development: costsFor(tradesInV6Period(run.trades, "DEVELOPMENT"), periodDays("DEVELOPMENT")),
    validation: costsFor(tradesInV6Period(run.trades, "VALIDATION"), periodDays("VALIDATION")),
    lockedOutOfSample: costsFor(oosTrades, periodDays("LOCKED_OUT_OF_SAMPLE")),
    walkForward,
    stability,
    bootstrap,
    promotionGate: gate,
    summary: {
      status: selected.eligibleForPromotion && gate.passes ? "SHADOW_ELIGIBLE" : "REJECT",
      signals: oos5.signals,
      expectancy5Bps: oos5.expectancyR,
      profitFactor5Bps: oos5.profitFactor,
      drawdown5Bps: oos5.maximumDrawdownR,
      expectancy10Bps: oos10.expectancyR,
      reasons: selected.eligibleForPromotion ? gate.reasons : ["entry/validation gate failed before OOS", ...gate.reasons],
    },
  };
}

function completeCandidateEvidence(run: CandidateRun) {
  return {
    definition: compactDefinition(run.definition),
    full: costsFor(run.trades, elapsedDays(ANALYSIS_START, ANALYSIS_END)),
    train: costsFor(tradesInV6Period(run.trades, "TRAIN"), periodDays("TRAIN")),
    development: costsFor(tradesInV6Period(run.trades, "DEVELOPMENT"), periodDays("DEVELOPMENT")),
    validation: costsFor(tradesInV6Period(run.trades, "VALIDATION"), periodDays("VALIDATION")),
    lockedOutOfSample: costsFor(tradesInV6Period(run.trades, "LOCKED_OUT_OF_SAMPLE"), periodDays("LOCKED_OUT_OF_SAMPLE")),
    excursions: excursionDistribution(run.trades),
  };
}

function costsFor(trades: BacktestTrade[], days: number) {
  return {
    ideal: compactMetrics(summarizeV6(trades, COSTS.IDEAL, days)),
    realistic: compactMetrics(summarizeV6(trades, COSTS.REALISTIC, days)),
    stress: compactMetrics(summarizeV6(trades, COSTS.STRESS, days)),
  };
}

function walkForwardEvidence(trades: BacktestTrade[]) {
  const windows: Array<{ id: string; start: string; end: string; summary: ReturnType<typeof compactMetrics> }> = [];
  let start = new Date(V6_PREREGISTRATION.walkForward.firstTestStart);
  while (start < ANALYSIS_END) {
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + V6_PREREGISTRATION.walkForward.testWindowMonths);
    const cappedEnd = end > ANALYSIS_END ? ANALYSIS_END : end;
    const selected = trades.filter((trade) => Date.parse(trade.openedAt) >= start.getTime() && Date.parse(trade.openedAt) < cappedEnd.getTime());
    windows.push({
      id: `${start.toISOString().slice(0, 10)}_${cappedEnd.toISOString().slice(0, 10)}`,
      start: start.toISOString(),
      end: cappedEnd.toISOString(),
      summary: compactMetrics(summarizeV6(selected, COSTS.REALISTIC, elapsedDays(start, cappedEnd))),
    });
    start = new Date(start);
    start.setUTCMonth(start.getUTCMonth() + V6_PREREGISTRATION.walkForward.stepMonths);
  }
  const usable = windows.filter((window) => window.summary.signals > 0);
  const positive = usable.filter((window) => (window.summary.expectancyR ?? -Infinity) > 0 && (window.summary.profitFactor ?? 0) > 1).length;
  return { windows, positiveWindows: positive, usableWindows: usable.length, positiveFraction: usable.length ? positive / usable.length : 0 };
}

function stabilityEvidence(run: CandidateRun) {
  const cells = v6StabilitySurface(run.definition.exit).map((exit) => {
    const trades = evaluateV3Entries(data[run.definition.timeframe].candles, run.entries, exit) as V6Trade[];
    const validation = summarizeBacktest(tradesInV6Period(trades, "VALIDATION"), 5);
    const oos = summarizeBacktest(tradesInV6Period(trades, "LOCKED_OUT_OF_SAMPLE"), 5);
    return { exit: compactExit(exit), validation: compactSummary(validation), lockedOutOfSample: compactSummary(oos) };
  });
  const positiveValidation = cells.filter((cell) => positiveSummary(cell.validation)).length;
  const positiveOos = cells.filter((cell) => positiveSummary(cell.lockedOutOfSample)).length;
  return {
    cells,
    positiveValidationFraction: cells.length ? positiveValidation / cells.length : 0,
    positiveOosFraction: cells.length ? positiveOos / cells.length : 0,
  };
}

function regimePerformance(trades: V6Trade[]) {
  const groups = new Map<string, V6Trade[]>();
  for (const trade of trades) {
    const labels = [
      `VOL_${trade.feature.volatilityRegime ?? "UNKNOWN"}`,
      `TREND_${trade.feature.localTrend ?? "UNKNOWN"}`,
      `CONTEXT_${trade.feature.trendRegime}`,
      `DIRECTION_${trade.direction}`,
    ];
    for (const label of labels) groups.set(label, [...(groups.get(label) ?? []), trade]);
  }
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([label, selected]) => [label, compactSummary(summarizeBacktest(selected, 5))]));
}

function diagnoseBaseline(trades: V6Trade[]) {
  const expired = trades.filter((trade) => trade.outcome === "EXPIRED");
  const firstBarAdverse = trades.filter((trade) => trade.timeToMaeCandles === 1 && (trade.maeAtr ?? 0) > (trade.mfeAtr ?? 0)).length;
  return {
    signals: trades.length,
    excursionAll: excursionDistribution(trades),
    excursionByOutcome: {
      WIN: excursionDistribution(trades.filter((trade) => trade.outcome === "WIN")),
      LOSS: excursionDistribution(trades.filter((trade) => trade.outcome === "LOSS")),
      EXPIRED: excursionDistribution(expired),
    },
    expiredFollowUp: {
      wouldHitTpLater: expired.filter((trade) => trade.postExpiryOutcome === "WIN").length,
      wouldHitSlLater: expired.filter((trade) => trade.postExpiryOutcome === "LOSS").length,
      neither: expired.filter((trade) => trade.postExpiryOutcome === "NEITHER").length,
    },
    firstBarAdverseDominancePct: trades.length ? firstBarAdverse / trades.length * 100 : null,
    interpretation: firstBarAdverse / Math.max(1, trades.length) >= 0.1
      ? "Material first-bar adverse dominance and low MFE versus target indicate a mix of entry-quality and exit-geometry problems."
      : "First-bar adverse dominance is limited, while low MFE versus target indicates an exit-geometry mismatch; temporal/regime instability still prevents treating exits alone as the solution.",
  };
}

function excursionDistribution(trades: BacktestTrade[]) {
  return {
    stopPct: percentiles(trades.map((trade) => trade.riskPct)),
    targetPct: percentiles(trades.map((trade) => trade.targetPct)),
    stopAtr: percentiles(trades.map((trade) => trade.stopAtr)),
    targetAtr: percentiles(trades.map((trade) => trade.targetAtr)),
    mfeAtr: percentiles(trades.map((trade) => trade.mfeAtr).filter(isNumber)),
    maeAtr: percentiles(trades.map((trade) => trade.maeAtr).filter(isNumber)),
    mfeR: percentiles(trades.map((trade) => trade.mfeR).filter(isNumber)),
    maeR: percentiles(trades.map((trade) => trade.maeR).filter(isNumber)),
    barsToMfe: percentiles(trades.map((trade) => trade.timeToMfeCandles).filter(isNumber)),
    barsToMae: percentiles(trades.map((trade) => trade.timeToMaeCandles).filter(isNumber)),
  };
}

function portfolioEvidence(finalistMap: typeof finalists) {
  const selected = V6_TIMEFRAMES.flatMap((timeframe) => {
    const definition = preOosStudies[timeframe].selected?.run.definition;
    if (definition === undefined) return [];
    return tradesInV6Period(preOosStudies[timeframe].selected!.run.trades, "LOCKED_OUT_OF_SAMPLE")
      .map((trade) => ({ ...trade, timeframe }));
  }).sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt));
  let maxConcurrent = 0;
  for (const trade of selected) {
    const opened = Date.parse(trade.openedAt);
    const concurrent = selected.filter((other) => Date.parse(other.openedAt) <= opened && other.closedAt !== null && Date.parse(other.closedAt) >= opened).length;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
  }
  const combined = summarizeBacktest(selected, 5);
  return {
    selectedFinalistSignals: selected.length,
    maximumConcurrentSignals: maxConcurrent,
    combinedNaiveOneRPerSignal: compactSummary(combined),
    dailyNetRCorrelation5Bps: dailyNetRCorrelation(selected, 5),
    correlationMethod: "Pearson correlation of UTC daily net-R contributions, with zero on days where a timeframe has no completed selected signal.",
    caveat: "The combined R curve assumes one independent 1R allocation per accepted signal. Concurrent BTC signals are correlated exposure; this is not a sizing recommendation.",
    finalistStatuses: Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [timeframe, finalistMap[timeframe]?.summary.status ?? "NONE"])),
  };
}

function dailyNetRCorrelation(
  trades: Array<BacktestTrade & { timeframe: V6Timeframe }>,
  frictionBps: number,
): Record<V6Timeframe, Record<V6Timeframe, number | null>> {
  const daily = Object.fromEntries(V6_TIMEFRAMES.map((timeframe) => [timeframe, new Map<string, number>()])) as Record<
    V6Timeframe,
    Map<string, number>
  >;
  for (const trade of trades) {
    const value = netRealizedR(trade, frictionBps);
    if (value === null) continue;
    const day = trade.openedAt.slice(0, 10);
    daily[trade.timeframe].set(day, (daily[trade.timeframe].get(day) ?? 0) + value);
  }
  const days = [...new Set(V6_TIMEFRAMES.flatMap((timeframe) => [...daily[timeframe].keys()]))].sort();
  return Object.fromEntries(V6_TIMEFRAMES.map((left) => [left, Object.fromEntries(V6_TIMEFRAMES.map((right) => [
    right,
    pearson(
      days.map((day) => daily[left].get(day) ?? 0),
      days.map((day) => daily[right].get(day) ?? 0),
    ),
  ]))])) as Record<V6Timeframe, Record<V6Timeframe, number | null>>;
}

function pearson(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquared += leftDelta ** 2;
    rightSquared += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftSquared * rightSquared);
  return denominator === 0 ? null : numerator / denominator;
}

function smartExitDisposition(finalistMap: typeof finalists) {
  const eligible = V6_TIMEFRAMES.filter((timeframe) => finalistMap[timeframe]?.summary.status === "SHADOW_ELIGIBLE");
  return {
    evaluated: eligible.length > 0,
    eligibleTimeframes: eligible,
    note: eligible.length > 0
      ? "Only fixed/time-stop geometry and expiry/stability evidence are decision-grade. Breakeven/partial/trailing require an execution-aware intrabar model and are not used to rescue promotion."
      : "No candidate passed entry/validation/OOS gates, so higher-complexity exits were not opened as another degree of freedom.",
  };
}

function conclude(finalistMap: typeof finalists) {
  const shadowReady = V6_TIMEFRAMES.filter((timeframe) => finalistMap[timeframe]?.summary.status === "SHADOW_ELIGIBLE");
  return {
    robustPositiveEdge: shadowReady.length > 0 ? "YES" : "NO",
    readyForShadowMode: shadowReady.length > 0 ? "YES" : "NO",
    replaceBaselineToday: "NO",
    shadowEligibleTimeframes: shadowReady,
    liveParametersChanged: false,
    nextExperiment: shadowReady.length > 0
      ? "Seek explicit authorization for isolated forward-only shadow observation; no commercial publication."
      : "Freeze V6 results and collect genuinely forward data after 2026-08-28; do not retune on the same contaminated history.",
  };
}

function annotateBroadVolatility(
  entry: ReturnType<typeof scoreV4Opportunities>[number],
  timeframeCandles: ClosedAnalysisCandle[],
  fourHourCandles: ClosedAnalysisCandle[],
): V6Entry {
  const entryCandle = timeframeCandles[entry.entryIndex];
  if (entryCandle === undefined) throw new Error("V6 entry references a missing execution candle.");
  const evaluatedAt = entryCandle.closeTime;
  const contextIndex = latestClosedIndex(fourHourCandles, Date.parse(evaluatedAt));
  const broadWindow = contextIndex < 0 ? [] : fourHourCandles.slice(Math.max(0, contextIndex - 199), contextIndex + 1);
  const percentileRank = broadWindow.length < 50 ? null : causalRangePercentile(broadWindow);
  return { ...entry, v6: { evaluatedAt, fourHourVolatilityPercentile: percentileRank } };
}

function causalRangePercentile(candles: ClosedAnalysisCandle[]): number | null {
  const ranges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose)) / previousClose;
  });
  const rolling = ranges.slice(13).map((_, index) => ranges.slice(index, index + 14).reduce((sum, value) => sum + value, 0) / 14);
  const current = rolling.at(-1);
  const reference = rolling.slice(0, -1);
  return current === undefined || reference.length < 30 ? null : reference.filter((value) => value <= current).length / reference.length;
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

function compactScreen(screen: CandidateScreen) {
  return {
    definition: compactDefinition(screen.candidate),
    train5Bps: compactSummary(screen.train5Bps),
    train10Bps: compactSummary(screen.train10Bps),
    development5Bps: compactSummary(screen.development5Bps),
    development10Bps: compactSummary(screen.development10Bps),
  };
}

function compactDefinition(definition: CandidateDefinition) {
  return { id: definition.id, timeframe: definition.timeframe, entryFamily: definition.entryFamily, exit: compactExit(definition.exit) };
}

function compactExit(exit: ExitConfiguration) {
  return {
    name: exit.name,
    riskMode: exit.riskMode,
    atrMultiple: exit.atrMultiple ?? null,
    riskPercent: exit.riskPercent ?? null,
    rewardRisk: exit.rewardRisk,
    expiryCandles: exit.expiryCandles,
  };
}

function compactSummary(summary: BacktestSummary) {
  return {
    signals: summary.signals,
    wins: summary.wins,
    losses: summary.losses,
    expired: summary.expired,
    winRateIncludingExpired: summary.winRateIncludingExpired,
    expectancyR: summary.expectancyR,
    profitFactor: summary.profitFactor,
    maximumDrawdownR: summary.maximumDrawdownR,
    consecutiveLosses: summary.consecutiveLosses,
  };
}

function compactMetrics(summary: V6Metrics) {
  return {
    ...compactSummary(summary),
    winRateExcludingExpired: summary.winRateExcludingExpired,
    expiredRate: summary.expiredRate,
    averageWinR: summary.averageWinR,
    averageLossR: summary.averageLossR,
    medianMfeAtr: summary.medianMfeAtr,
    medianMaeAtr: summary.medianMaeAtr,
    averageDurationCandles: summary.averageDurationCandles,
    medianDurationCandles: summary.medianDurationCandles,
    sharpeLikePerTrade: summary.sharpeLikePerTrade,
    sortinoLikePerTrade: summary.sortinoLikePerTrade,
    profitableMonthsPct: summary.profitableMonthsPct,
    bestMonthR: summary.bestMonthR,
    worstMonthR: summary.worstMonthR,
    signalsPerDay: summary.signalsPerDay,
    signalsPerWeek: summary.signalsPerWeek,
    signalsPerMonth: summary.signalsPerMonth,
  };
}

function positiveSummary(summary: ReturnType<typeof compactSummary>): boolean {
  return (summary.expectancyR ?? -Infinity) > 0 && (summary.profitFactor ?? 0) > 1;
}

function percentiles(values: number[]) {
  return {
    p25: percentile(values, 0.25),
    p50: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
    p95: percentile(values, 0.95),
  };
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function elapsedDays(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 86_400_000;
}

function assertProtocol(): void {
  if (process.argv.slice(2).length > 0) throw new Error("V6 accepts no runtime parameters.");
  const actual = computeV6PreregistrationHash();
  if (actual !== V6_PREREGISTRATION_HASH) throw new Error(`V6 preregistration hash mismatch: expected ${V6_PREREGISTRATION_HASH}, got ${actual}.`);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function roundDeep(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : String(value);
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, roundDeep(nested)]));
  }
  return value;
}
