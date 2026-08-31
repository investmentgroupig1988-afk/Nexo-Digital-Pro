import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  baselineConfiguration,
  netRealizedR,
  summarizeBacktest,
  type BacktestSummary,
  type BacktestTrade,
  type ClosedAnalysisCandle,
} from "../services/signal-backtest";
import { deterministicBlockBootstrap } from "../services/signal-hypothesis-robustness";
import { loadOrFetchResearchDataset } from "../services/signal-research-dataset";
import { buildV2ContextSeries } from "../services/signal-strategy-v2";
import {
  buildV3Contexts,
  evaluateV3Entries,
  generateV3BaselineSetups,
} from "../services/signal-strategy-v3";
import { scoreV4Opportunities } from "../services/signal-strategy-v4";
import {
  periodDays,
  summarizeV6,
  tradesInV6Period,
  v6CostModels,
  v6Period,
  type V6Entry,
  type V6Metrics,
  type V6Period,
} from "../services/signal-strategy-v6";
import {
  acceptsV7StructuralCandidate,
  annotateV7Entry,
  buildV7LabeledPoints,
  decisionStumpAccepts,
  deriveManualScoreModel,
  featureAttribution,
  fitDecisionStump,
  fitV7LogisticModel,
  logisticQualityScore,
  manualStructuralScore,
  scoreThreshold,
  v7RegimeLabels,
  type V7DecisionStump,
  type V7Entry,
  type V7LabeledPoint,
  type V7LogisticModel,
  type V7ManualScoreModel,
  type V7Trade,
} from "../services/signal-strategy-v7";
import {
  V7_PREREGISTRATION,
  V7_PREREGISTRATION_HASH,
  V7_SELECTIVITY_FRACTIONS,
  V7_STRUCTURAL_CANDIDATES,
  V7_TIMEFRAMES,
  computeV7PreregistrationHash,
  type V7StructuralCandidate,
  type V7Timeframe,
} from "../services/signal-strategy-v7-snapshot";

type TimeframeData = Awaited<ReturnType<typeof loadOrFetchResearchDataset>>;
type CandidateKind = "STRUCTURAL" | "MANUAL_SCORE" | "LOGISTIC_SCORE" | "DECISION_STUMP";
type CandidateDefinition = {
  id: string;
  timeframe: V7Timeframe;
  kind: CandidateKind;
  structuralCandidate?: V7StructuralCandidate;
  acceptedFraction?: number;
  scoreThreshold?: number;
  stump?: V7DecisionStump;
};
type CandidateRun = { definition: CandidateDefinition; entries: V7Entry[]; trades: V7Trade[] };
type CandidateScreen = {
  run: CandidateRun;
  train5: BacktestSummary;
  train10: BacktestSummary;
  development5: BacktestSummary;
  development10: BacktestSummary;
  eligibleBeforeValidation: boolean;
};
type CandidateValidation = CandidateScreen & {
  validation5: BacktestSummary;
  validation10: BacktestSummary;
  eligibleBeforeOos: boolean;
};

const INTERVAL_MS: Record<V7Timeframe, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};
const ANALYSIS_START = new Date(V7_PREREGISTRATION.dataset.start);
const ANALYSIS_END = new Date(V7_PREREGISTRATION.dataset.endExclusive);
const CACHE_DIRECTORY = path.resolve("research", "cache");
const OUTPUT_DIRECTORY = path.resolve("research", "output");
const COSTS = v6CostModels();

assertProtocol();
console.error(`[V7] preregistration ${V7_PREREGISTRATION_HASH} verified before results`);

const data = Object.fromEntries(await Promise.all(V7_TIMEFRAMES.map(async (timeframe) => {
  const warmupStart = new Date(ANALYSIS_START.getTime() - INTERVAL_MS[timeframe] * V7_PREREGISTRATION.dataset.warmupCandles);
  console.error(`[V7] loading ${timeframe} closed candles`);
  const dataset = await loadOrFetchResearchDataset({
    symbol: "BTCUSDT",
    timeframe,
    start: warmupStart,
    endExclusive: ANALYSIS_END,
    observedAt: ANALYSIS_END,
    cacheDirectory: CACHE_DIRECTORY,
  });
  console.error(`[V7] ${timeframe}: ${dataset.metadata.candleCount} candles (${dataset.source}) sha256=${dataset.metadata.sha256.slice(0, 12)}`);
  return [timeframe, dataset];
}))) as Record<V7Timeframe, TimeframeData>;

const contexts = buildV3Contexts({ candles1h: data["1h"].candles, candles4h: data["4h"].candles });
const contexts15m = buildV2ContextSeries(data["15m"].candles);
const entries = {} as Record<V7Timeframe, V7Entry[]>;
const baselineTrades = {} as Record<V7Timeframe, V7Trade[]>;
const baselinePoints = {} as Record<V7Timeframe, V7LabeledPoint[]>;
const models = {} as Record<V7Timeframe, {
  manual: V7ManualScoreModel;
  logistic: V7LogisticModel;
  stump: V7DecisionStump | null;
  manualThresholds: Record<string, number>;
  logisticThresholds: Record<string, number>;
}>;
const candidateRuns = {} as Record<V7Timeframe, CandidateRun[]>;
const preValidation = {} as Record<V7Timeframe, CandidateScreen[]>;
const validationSelections = {} as Record<V7Timeframe, CandidateValidation | null>;

for (const timeframe of V7_TIMEFRAMES) {
  console.error(`[V7] generating frozen baseline opportunities for ${timeframe}`);
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
  entries[timeframe] = scored.map((entry) => annotateV7Entry({
    entry: {
      ...entry,
      v6: {
        evaluatedAt: data[timeframe].candles[entry.entryIndex].closeTime,
        fourHourVolatilityPercentile: null,
      },
    } as V6Entry,
    candles: data[timeframe].candles,
    contexts15m,
    timeframe,
  }));
  baselineTrades[timeframe] = evaluateV3Entries(data[timeframe].candles, entries[timeframe], baselineConfiguration()) as V7Trade[];
  baselinePoints[timeframe] = buildV7LabeledPoints(entries[timeframe], baselineTrades[timeframe]);
  const trainPoints = pointsInPeriod(baselinePoints[timeframe], "TRAIN");
  const developmentPoints = pointsInPeriod(baselinePoints[timeframe], "DEVELOPMENT");
  const manual = deriveManualScoreModel(trainPoints, developmentPoints);
  const logistic = fitV7LogisticModel(trainPoints);
  const stump = fitDecisionStump(trainPoints);
  const trainEntries = entries[timeframe].filter((entry) => v6Period(entry.openedAt) === "TRAIN");
  const manualTrainScores = trainEntries.map((entry) => manualStructuralScore(entry, manual)).filter(isNumber);
  const logisticTrainScores = trainEntries.map((entry) => logisticQualityScore(entry, logistic));
  const manualThresholds = Object.fromEntries(V7_SELECTIVITY_FRACTIONS.map((fraction) => [fractionId(fraction), scoreThreshold(manualTrainScores, fraction)]));
  const logisticThresholds = Object.fromEntries(V7_SELECTIVITY_FRACTIONS.map((fraction) => [fractionId(fraction), scoreThreshold(logisticTrainScores, fraction)]));
  models[timeframe] = { manual, logistic, stump, manualThresholds, logisticThresholds };

  const definitions = candidateDefinitions(timeframe, manual, logistic, stump, manualThresholds, logisticThresholds);
  candidateRuns[timeframe] = definitions.map((definition) => runCandidate(timeframe, definition));
  const screens = candidateRuns[timeframe]
    .filter((run) => run.definition.id !== `${timeframe}:STRUCTURAL:BASELINE_ALL`)
    .map((run) => screenCandidate(run));
  const eligible = screens.filter((screen) => screen.eligibleBeforeValidation).sort(comparePreValidation).slice(0, V7_PREREGISTRATION.candidates.maximumPreValidationPerTimeframe);
  const shortlist = eligible.length > 0 ? eligible : [...screens].sort(comparePreValidation).slice(0, 1).map((screen) => ({ ...screen, eligibleBeforeValidation: false }));
  preValidation[timeframe] = shortlist;
  const openedValidation = shortlist.map((screen) => {
    const validation5 = summarizeBacktest(tradesInV6Period(screen.run.trades, "VALIDATION"), 5);
    const validation10 = summarizeBacktest(tradesInV6Period(screen.run.trades, "VALIDATION"), 10);
    return {
      ...screen,
      validation5,
      validation10,
      eligibleBeforeOos: screen.eligibleBeforeValidation && passesValidationGate(timeframe, validation5, validation10),
    };
  });
  const passers = openedValidation.filter((screen) => screen.eligibleBeforeOos).sort(compareValidation);
  validationSelections[timeframe] = passers[0] ?? [...openedValidation].sort(compareValidation)[0] ?? null;
  console.error(`[V7] ${timeframe}: ${entries[timeframe].length} opportunities, ${baselineTrades[timeframe].length} baseline trades, ${eligible.length} pre-validation passer(s)`);
}

// Definitions are frozen here. No OOS trade or OOS attribution was read during candidate ranking.
const frozenDefinitions = V7_TIMEFRAMES.map((timeframe) => validationSelections[timeframe] === null
  ? null
  : compactDefinition(validationSelections[timeframe]!.run.definition));
const finalistSelectionHash = createHash("sha256").update(canonicalJson(frozenDefinitions)).digest("hex");
console.error(`[V7] finalist definitions frozen before OOS: ${finalistSelectionHash}`);

const finalists = Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => {
  const selected = validationSelections[timeframe];
  return [timeframe, selected === null ? null : openOosEvidence(timeframe, selected)];
})) as Record<V7Timeframe, ReturnType<typeof openOosEvidence> | null>;

const baseline = Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, completeEvidence(baselineTrades[timeframe])])) as Record<
  V7Timeframe,
  ReturnType<typeof completeEvidence>
>;

const report = {
  metadata: {
    researchId: V7_PREREGISTRATION.id,
    preregistrationHash: V7_PREREGISTRATION_HASH,
    finalistSelectionHash,
    generatedAt: new Date().toISOString(),
    liveStrategyChanged: false,
    productionTouched: false,
    mainTouched: false,
    databaseWrites: false,
    telegramCalls: false,
    oosContamination: V7_PREREGISTRATION.dataset.contamination,
  },
  protocol: V7_PREREGISTRATION,
  dataset: Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, data[timeframe].metadata])),
  baseline,
  regimes: Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, groupedEvidence(
    baselineTrades[timeframe],
    (trade) => v7RegimeLabels(trade),
  )])),
  mtfConditioning: Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, groupedEvidence(
    baselineTrades[timeframe],
    (trade) => [`NEAREST_${trade.v7.nearestMtfState}`, `STACKED_${trade.v7.stackedMtfState}`],
  )])),
  sessions: Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, {
    named: groupedEvidence(baselineTrades[timeframe], (trade) => trade.v7.sessions.map((session) => `SESSION_${session}`)),
    utcHour: groupedEvidence(baselineTrades[timeframe], (trade) => [`UTC_HOUR_${new Date(trade.openedAt).getUTCHours().toString().padStart(2, "0")}`]),
  }])),
  featureAttribution: Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, Object.fromEntries([
    "TRAIN", "DEVELOPMENT", "VALIDATION", "LOCKED_OUT_OF_SAMPLE",
  ].map((period) => [period, featureAttribution(pointsInPeriod(baselinePoints[timeframe], period as V6Period))]))])),
  simpleModels: Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, {
    manualScore: {
      selectedFeatures: models[timeframe].manual.features.map(({ id, direction, trainRho, developmentRho }) => ({ id, direction, trainRho, developmentRho })),
      available: models[timeframe].manual.features.length > 0,
    },
    logistic: {
      target: V7_PREREGISTRATION.simpleModels.logistic.target,
      positiveRateTrain: models[timeframe].logistic.positiveRate,
      coefficients: models[timeframe].logistic.featureIds.map((id, index) => ({ id, coefficient: models[timeframe].logistic.weights[index] }))
        .sort((left, right) => Math.abs(right.coefficient) - Math.abs(left.coefficient)),
      hyperparameterTuning: false,
    },
    decisionStump: models[timeframe].stump,
    boostedModel: { evaluated: false, reason: V7_PREREGISTRATION.simpleModels.boostedModel },
  }])),
  selectivityCurves: Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, {
    manual: selectivityCurve(timeframe, "MANUAL_SCORE"),
    logistic: selectivityCurve(timeframe, "LOGISTIC_SCORE"),
  }])),
  candidateResearch: Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, {
    evaluated: candidateRuns[timeframe].map((run) => compactCandidateRun(run, false)),
    preValidationShortlist: preValidation[timeframe].map(compactCandidateScreen),
    frozenBeforeOos: validationSelections[timeframe] === null ? null : compactValidation(validationSelections[timeframe]!),
    oos: finalists[timeframe],
  }])),
  timeframePortfolio: timeframePortfolio(),
  temporalRobustness: Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, finalists[timeframe]?.walkForward ?? null])),
  conclusion: conclude(),
};

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const outputPath = path.join(OUTPUT_DIRECTORY, "signal-engine-v7-results.json");
await writeFile(outputPath, `${JSON.stringify(roundDeep(report), null, 2)}\n`, "utf8");
console.log(JSON.stringify(roundDeep({
  researchId: report.metadata.researchId,
  preregistrationHash: report.metadata.preregistrationHash,
  finalistSelectionHash,
  finalists: Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, finalists[timeframe]?.summary ?? null])),
  conclusion: report.conclusion,
  outputPath,
}), null, 2));

function candidateDefinitions(
  timeframe: V7Timeframe,
  manual: V7ManualScoreModel,
  _logistic: V7LogisticModel,
  stump: V7DecisionStump | null,
  manualThresholds: Record<string, number>,
  logisticThresholds: Record<string, number>,
): CandidateDefinition[] {
  const structural = V7_STRUCTURAL_CANDIDATES.map((structuralCandidate) => ({
    id: `${timeframe}:STRUCTURAL:${structuralCandidate}`,
    timeframe,
    kind: "STRUCTURAL" as const,
    structuralCandidate,
  }));
  const fractions = V7_SELECTIVITY_FRACTIONS.filter((fraction) => fraction < 1);
  const manualCandidates = manual.features.length === 0 ? [] : fractions.map((acceptedFraction) => ({
    id: `${timeframe}:MANUAL_SCORE:TOP_${Math.round(acceptedFraction * 100)}`,
    timeframe,
    kind: "MANUAL_SCORE" as const,
    acceptedFraction,
    scoreThreshold: manualThresholds[fractionId(acceptedFraction)],
  }));
  const logisticCandidates = fractions.map((acceptedFraction) => ({
    id: `${timeframe}:LOGISTIC_SCORE:TOP_${Math.round(acceptedFraction * 100)}`,
    timeframe,
    kind: "LOGISTIC_SCORE" as const,
    acceptedFraction,
    scoreThreshold: logisticThresholds[fractionId(acceptedFraction)],
  }));
  const stumpCandidates = stump === null ? [] : [{
    id: `${timeframe}:DECISION_STUMP:${stump.featureId}:${stump.operator}`,
    timeframe,
    kind: "DECISION_STUMP" as const,
    stump,
  }];
  return [...structural, ...manualCandidates, ...logisticCandidates, ...stumpCandidates];
}

function runCandidate(timeframe: V7Timeframe, definition: CandidateDefinition): CandidateRun {
  const model = models[timeframe];
  const selected = entries[timeframe].filter((entry) => {
    if (definition.kind === "STRUCTURAL") return acceptsV7StructuralCandidate(entry, definition.structuralCandidate!);
    if (definition.kind === "MANUAL_SCORE") return (manualStructuralScore(entry, model.manual) ?? -Infinity) >= definition.scoreThreshold!;
    if (definition.kind === "LOGISTIC_SCORE") return logisticQualityScore(entry, model.logistic) >= definition.scoreThreshold!;
    return decisionStumpAccepts(entry, definition.stump!);
  });
  return {
    definition,
    entries: selected,
    trades: evaluateV3Entries(data[timeframe].candles, selected, baselineConfiguration()) as V7Trade[],
  };
}

function screenCandidate(run: CandidateRun): CandidateScreen {
  const train5 = summarizeBacktest(tradesInV6Period(run.trades, "TRAIN"), 5);
  const train10 = summarizeBacktest(tradesInV6Period(run.trades, "TRAIN"), 10);
  const development5 = summarizeBacktest(tradesInV6Period(run.trades, "DEVELOPMENT"), 5);
  const development10 = summarizeBacktest(tradesInV6Period(run.trades, "DEVELOPMENT"), 10);
  return {
    run,
    train5,
    train10,
    development5,
    development10,
    eligibleBeforeValidation: passesPreValidationGate(run.definition.timeframe, train5, train10, development5, development10),
  };
}

function passesPreValidationGate(
  timeframe: V7Timeframe,
  train5: BacktestSummary,
  train10: BacktestSummary,
  development5: BacktestSummary,
  development10: BacktestSummary,
): boolean {
  const minimum = V7_PREREGISTRATION.selection.minimumSignals;
  return train5.signals >= minimum.train[timeframe]
    && development5.signals >= minimum.development[timeframe]
    && positive(train5)
    && positive(development5)
    && (train10.expectancyR ?? -Infinity) >= 0
    && (development10.expectancyR ?? -Infinity) >= 0;
}

function passesValidationGate(timeframe: V7Timeframe, validation5: BacktestSummary, validation10: BacktestSummary): boolean {
  return validation5.signals >= V7_PREREGISTRATION.selection.minimumSignals.validation[timeframe]
    && (validation5.expectancyR ?? -Infinity) > 0
    && (validation5.profitFactor ?? 0) > 1.05
    && (validation10.expectancyR ?? -Infinity) >= 0;
}

function comparePreValidation(left: CandidateScreen, right: CandidateScreen): number {
  const leftWorst = Math.min(left.train5.expectancyR ?? -Infinity, left.development5.expectancyR ?? -Infinity);
  const rightWorst = Math.min(right.train5.expectancyR ?? -Infinity, right.development5.expectancyR ?? -Infinity);
  if (leftWorst !== rightWorst) return rightWorst - leftWorst;
  const leftPf = Math.min(left.train5.profitFactor ?? 0, left.development5.profitFactor ?? 0);
  const rightPf = Math.min(right.train5.profitFactor ?? 0, right.development5.profitFactor ?? 0);
  if (leftPf !== rightPf) return rightPf - leftPf;
  return ((left.train5.maximumDrawdownR ?? Infinity) + (left.development5.maximumDrawdownR ?? Infinity))
    - ((right.train5.maximumDrawdownR ?? Infinity) + (right.development5.maximumDrawdownR ?? Infinity));
}

function compareValidation(left: CandidateValidation, right: CandidateValidation): number {
  const leftWorst = Math.min(left.train5.expectancyR ?? -Infinity, left.development5.expectancyR ?? -Infinity, left.validation5.expectancyR ?? -Infinity);
  const rightWorst = Math.min(right.train5.expectancyR ?? -Infinity, right.development5.expectancyR ?? -Infinity, right.validation5.expectancyR ?? -Infinity);
  if (leftWorst !== rightWorst) return rightWorst - leftWorst;
  return (left.validation5.maximumDrawdownR ?? Infinity) - (right.validation5.maximumDrawdownR ?? Infinity);
}

function openOosEvidence(timeframe: V7Timeframe, selected: CandidateValidation) {
  const oosTrades = tradesInV6Period(selected.run.trades, "LOCKED_OUT_OF_SAMPLE");
  const oos5 = summarizeV6(oosTrades, COSTS.REALISTIC, periodDays("LOCKED_OUT_OF_SAMPLE"));
  const oos10 = summarizeV6(oosTrades, COSTS.STRESS, periodDays("LOCKED_OUT_OF_SAMPLE"));
  const baselineOos5 = summarizeV6(tradesInV6Period(baselineTrades[timeframe], "LOCKED_OUT_OF_SAMPLE"), COSTS.REALISTIC, periodDays("LOCKED_OUT_OF_SAMPLE"));
  const walkForward = walkForwardEvidence(selected.run.trades);
  const bootstrap = oosTrades.length >= 3 ? deterministicBlockBootstrap({
    trades: oosTrades,
    frictionBps: 5,
    iterations: V7_PREREGISTRATION.bootstrap.iterations,
    blockLength: Math.min(V7_PREREGISTRATION.bootstrap.blockLength, oosTrades.length),
    seed: V7_PREREGISTRATION.bootstrap.seed,
  }) : null;
  const reasons: string[] = [];
  const minimum = V7_PREREGISTRATION.selection.minimumSignals.lockedOutOfSample[timeframe];
  if (!selected.eligibleBeforeOos) reasons.push("TRAIN/DEVELOPMENT/VALIDATION gate failed before OOS");
  if (oos5.signals < minimum) reasons.push(`OOS sample < ${minimum}`);
  if ((oos5.expectancyR ?? -Infinity) <= 0) reasons.push("OOS expectancy 5bps <= 0");
  if ((oos5.profitFactor ?? 0) <= 1.1) reasons.push("OOS PF 5bps <= 1.10");
  if ((oos10.expectancyR ?? -Infinity) < 0) reasons.push("OOS expectancy 10bps < 0");
  if ((oos5.expectancyR ?? -Infinity) <= (baselineOos5.expectancyR ?? -Infinity)) reasons.push("No OOS expectancy improvement over BASELINE_V6");
  if (walkForward.positiveFraction < 0.6) reasons.push("Walk-forward positive-window fraction < 60%");
  if ((bootstrap?.probabilityPositiveExpectancyPct ?? 0) < 70) reasons.push("Bootstrap probability positive expectancy < 70%");
  const passes = reasons.length === 0;
  return {
    definition: compactDefinition(selected.run.definition),
    eligibleBeforeOos: selected.eligibleBeforeOos,
    train: costsFor(tradesInV6Period(selected.run.trades, "TRAIN"), periodDays("TRAIN")),
    development: costsFor(tradesInV6Period(selected.run.trades, "DEVELOPMENT"), periodDays("DEVELOPMENT")),
    validation: costsFor(tradesInV6Period(selected.run.trades, "VALIDATION"), periodDays("VALIDATION")),
    lockedOutOfSample: costsFor(oosTrades, periodDays("LOCKED_OUT_OF_SAMPLE")),
    walkForward,
    bootstrap,
    summary: {
      status: passes ? "V8_RESEARCH_ELIGIBLE" : "REJECT",
      signals: oos5.signals,
      expectancy5Bps: oos5.expectancyR,
      profitFactor5Bps: oos5.profitFactor,
      drawdown5Bps: oos5.maximumDrawdownR,
      expectancy10Bps: oos10.expectancyR,
      reasons,
    },
  };
}

function completeEvidence(trades: V7Trade[]) {
  return {
    full: costsFor(trades, elapsedDays(ANALYSIS_START, ANALYSIS_END)),
    train: costsFor(tradesInV6Period(trades, "TRAIN"), periodDays("TRAIN")),
    development: costsFor(tradesInV6Period(trades, "DEVELOPMENT"), periodDays("DEVELOPMENT")),
    validation: costsFor(tradesInV6Period(trades, "VALIDATION"), periodDays("VALIDATION")),
    lockedOutOfSample: costsFor(tradesInV6Period(trades, "LOCKED_OUT_OF_SAMPLE"), periodDays("LOCKED_OUT_OF_SAMPLE")),
  };
}

function groupedEvidence(trades: V7Trade[], labels: (trade: V7Trade) => string[]) {
  const groups = new Map<string, V7Trade[]>();
  for (const trade of trades) {
    for (const label of labels(trade)) groups.set(label, [...(groups.get(label) ?? []), trade]);
  }
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([label, selected]) => [label, completeEvidence(selected)]));
}

function selectivityCurve(timeframe: V7Timeframe, kind: "MANUAL_SCORE" | "LOGISTIC_SCORE") {
  const model = models[timeframe];
  if (kind === "MANUAL_SCORE" && model.manual.features.length === 0) return { available: false, rows: [] };
  const thresholds = kind === "MANUAL_SCORE" ? model.manualThresholds : model.logisticThresholds;
  const rows = V7_SELECTIVITY_FRACTIONS.map((acceptedFraction) => {
    const threshold = thresholds[fractionId(acceptedFraction)];
    const selected = entries[timeframe].filter((entry) => {
      const score = kind === "MANUAL_SCORE" ? manualStructuralScore(entry, model.manual) : logisticQualityScore(entry, model.logistic);
      return (score ?? -Infinity) >= threshold;
    });
    const trades = evaluateV3Entries(data[timeframe].candles, selected, baselineConfiguration()) as V7Trade[];
    return { acceptedFraction, threshold, ...completeEvidence(trades) };
  });
  return { available: true, rows };
}

function timeframePortfolio() {
  const combinations: V7Timeframe[][] = [
    ["5m"], ["15m"], ["1h"], ["4h"], ["5m", "15m"], ["15m", "1h"], ["1h", "4h"], ["5m", "15m", "1h"], ["5m", "15m", "1h", "4h"],
  ];
  const oosByTimeframe = Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, tradesInV6Period(baselineTrades[timeframe], "LOCKED_OUT_OF_SAMPLE")])) as Record<
    V7Timeframe,
    V7Trade[]
  >;
  return {
    combinations: combinations.map((timeframes) => {
      const trades = timeframes.flatMap((timeframe) => oosByTimeframe[timeframe]).sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt));
      return { timeframes, oos5Bps: compactMetrics(summarizeV6(trades, COSTS.REALISTIC, periodDays("LOCKED_OUT_OF_SAMPLE"))), maximumConcurrent: maximumConcurrent(trades) };
    }),
    dailyNetRCorrelation5Bps: dailyCorrelation(oosByTimeframe),
    caveat: "Portfolio R assumes independent one-R allocations while every signal is BTC exposure. Correlation and concurrency are reported; this is not a sizing recommendation.",
  };
}

function costsFor(trades: BacktestTrade[], days: number) {
  return {
    gross0Bps: compactMetrics(summarizeV6(trades, COSTS.IDEAL, days)),
    net5Bps: compactMetrics(summarizeV6(trades, COSTS.REALISTIC, days)),
    net10Bps: compactMetrics(summarizeV6(trades, COSTS.STRESS, days)),
  };
}

function walkForwardEvidence(trades: BacktestTrade[]) {
  const windows: Array<{ start: string; end: string; metrics5Bps: ReturnType<typeof compactMetrics> }> = [];
  let start = new Date(V7_PREREGISTRATION.walkForward.firstTestStart);
  while (start < ANALYSIS_END) {
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + V7_PREREGISTRATION.walkForward.testWindowMonths);
    const cappedEnd = end > ANALYSIS_END ? ANALYSIS_END : end;
    const selected = trades.filter((trade) => Date.parse(trade.openedAt) >= start.getTime() && Date.parse(trade.openedAt) < cappedEnd.getTime());
    windows.push({ start: start.toISOString(), end: cappedEnd.toISOString(), metrics5Bps: compactMetrics(summarizeV6(selected, COSTS.REALISTIC, elapsedDays(start, cappedEnd))) });
    start = new Date(start);
    start.setUTCMonth(start.getUTCMonth() + V7_PREREGISTRATION.walkForward.stepMonths);
  }
  const usable = windows.filter((window) => window.metrics5Bps.signals > 0);
  const positive = usable.filter((window) => (window.metrics5Bps.expectancyR ?? -Infinity) > 0 && (window.metrics5Bps.profitFactor ?? 0) > 1).length;
  return { windows, positiveWindows: positive, usableWindows: usable.length, positiveFraction: usable.length ? positive / usable.length : 0 };
}

function pointsInPeriod(points: V7LabeledPoint[], period: V6Period): V7LabeledPoint[] {
  return points.filter((point) => v6Period(point.trade.openedAt) === period);
}

function compactCandidateRun(run: CandidateRun, includeOos: boolean) {
  return {
    definition: compactDefinition(run.definition),
    train5Bps: compactSummary(summarizeBacktest(tradesInV6Period(run.trades, "TRAIN"), 5)),
    train10Bps: compactSummary(summarizeBacktest(tradesInV6Period(run.trades, "TRAIN"), 10)),
    development5Bps: compactSummary(summarizeBacktest(tradesInV6Period(run.trades, "DEVELOPMENT"), 5)),
    development10Bps: compactSummary(summarizeBacktest(tradesInV6Period(run.trades, "DEVELOPMENT"), 10)),
    ...(includeOos ? { lockedOutOfSample5Bps: compactSummary(summarizeBacktest(tradesInV6Period(run.trades, "LOCKED_OUT_OF_SAMPLE"), 5)) } : {}),
  };
}

function compactCandidateScreen(screen: CandidateScreen) {
  return {
    definition: compactDefinition(screen.run.definition),
    eligibleBeforeValidation: screen.eligibleBeforeValidation,
    train5Bps: compactSummary(screen.train5),
    train10Bps: compactSummary(screen.train10),
    development5Bps: compactSummary(screen.development5),
    development10Bps: compactSummary(screen.development10),
  };
}

function compactValidation(screen: CandidateValidation) {
  return {
    ...compactCandidateScreen(screen),
    eligibleBeforeOos: screen.eligibleBeforeOos,
    validation5Bps: compactSummary(screen.validation5),
    validation10Bps: compactSummary(screen.validation10),
  };
}

function compactDefinition(definition: CandidateDefinition) {
  return {
    id: definition.id,
    timeframe: definition.timeframe,
    kind: definition.kind,
    structuralCandidate: definition.structuralCandidate ?? null,
    acceptedFraction: definition.acceptedFraction ?? null,
    scoreThreshold: definition.scoreThreshold ?? null,
    stump: definition.stump ?? null,
    exit: "BASELINE_V6_UNCHANGED",
  };
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
    expiredRate: summary.expiredRate,
    consecutiveLosses: summary.consecutiveLosses,
  };
}

function compactMetrics(summary: V6Metrics) {
  return {
    ...compactSummary(summary),
    winRateIncludingExpired: summary.winRateIncludingExpired,
    winRateExcludingExpired: summary.winRateExcludingExpired,
    profitableMonthsPct: summary.profitableMonthsPct,
    bestMonthR: summary.bestMonthR,
    worstMonthR: summary.worstMonthR,
    signalsPerDay: summary.signalsPerDay,
    signalsPerWeek: summary.signalsPerWeek,
    signalsPerMonth: summary.signalsPerMonth,
  };
}

function maximumConcurrent(trades: BacktestTrade[]): number {
  let maximum = 0;
  for (const trade of trades) {
    const opened = Date.parse(trade.openedAt);
    const concurrent = trades.filter((other) => Date.parse(other.openedAt) <= opened && other.closedAt !== null && Date.parse(other.closedAt) >= opened).length;
    maximum = Math.max(maximum, concurrent);
  }
  return maximum;
}

function dailyCorrelation(oos: Record<V7Timeframe, V7Trade[]>) {
  const daily = Object.fromEntries(V7_TIMEFRAMES.map((timeframe) => [timeframe, new Map<string, number>()])) as Record<V7Timeframe, Map<string, number>>;
  for (const timeframe of V7_TIMEFRAMES) {
    for (const trade of oos[timeframe]) {
      const value = netRealizedR(trade, 5);
      if (value === null) continue;
      const day = trade.openedAt.slice(0, 10);
      daily[timeframe].set(day, (daily[timeframe].get(day) ?? 0) + value);
    }
  }
  const days = [...new Set(V7_TIMEFRAMES.flatMap((timeframe) => [...daily[timeframe].keys()]))].sort();
  return Object.fromEntries(V7_TIMEFRAMES.map((left) => [left, Object.fromEntries(V7_TIMEFRAMES.map((right) => [
    right,
    pearson(days.map((day) => daily[left].get(day) ?? 0), days.map((day) => daily[right].get(day) ?? 0)),
  ]))]));
}

function pearson(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const lm = average(left);
  const rm = average(right);
  let numerator = 0;
  let ls = 0;
  let rs = 0;
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index] - lm;
    const r = right[index] - rm;
    numerator += l * r;
    ls += l ** 2;
    rs += r ** 2;
  }
  const denominator = Math.sqrt(ls * rs);
  return denominator === 0 ? null : numerator / denominator;
}

function conclude() {
  const eligible = V7_TIMEFRAMES.filter((timeframe) => finalists[timeframe]?.summary.status === "V8_RESEARCH_ELIGIBLE");
  return {
    robustPositiveEdge: eligible.length > 0 ? "YES" : "NO",
    recommendShadowMode: eligible.length > 0 ? "YES" : "NO",
    recommendLiveChange: "NO",
    v8ResearchEligibleTimeframes: eligible,
    result: eligible.length > 0 ? "STRUCTURAL CANDIDATE REQUIRES GENUINE FORWARD CONFIRMATION" : "NO ROBUST POSITIVE EDGE",
    liveStrategyChanged: false,
  };
}

function positive(summary: BacktestSummary): boolean {
  return (summary.expectancyR ?? -Infinity) > 0 && (summary.profitFactor ?? 0) > 1;
}

function fractionId(value: number): string {
  return Math.round(value * 100).toString();
}

function elapsedDays(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 86_400_000;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function assertProtocol(): void {
  if (process.argv.slice(2).length > 0) throw new Error("V7 accepts no runtime parameters.");
  const actual = computeV7PreregistrationHash();
  if (actual !== V7_PREREGISTRATION_HASH) throw new Error(`V7 preregistration hash mismatch: expected ${V7_PREREGISTRATION_HASH}, got ${actual}.`);
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
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, roundDeep(nested)]));
  return value;
}
