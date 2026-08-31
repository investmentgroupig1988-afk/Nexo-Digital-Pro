import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { baselineConfiguration, summarizeBacktest, type BacktestTrade } from "../services/signal-backtest";
import { approximateBreakEvenBps, deterministicBlockBootstrap } from "../services/signal-hypothesis-robustness";
import { loadOrFetchResearchDataset } from "../services/signal-research-dataset";
import { buildV3Contexts, evaluateV3Entries, generateV3BaselineSetups } from "../services/signal-strategy-v3";
import { scoreV4Opportunities } from "../services/signal-strategy-v4";
import { periodDays, summarizeV6, tradesInV6Period, v6CostModels, type V6Period } from "../services/signal-strategy-v6";
import { evaluateV8Entries, generateV8Entries } from "../services/signal-strategy-v8";
import {
  computeV8PreregistrationHash,
  V8_FAMILIES,
  V8_PREREGISTRATION,
  V8_PREREGISTRATION_HASH,
  V8_TIMEFRAMES,
  type V8Family,
  type V8Timeframe,
} from "../services/signal-strategy-v8-snapshot";

type Dataset = Awaited<ReturnType<typeof loadOrFetchResearchDataset>>;
type PeriodEvidence = ReturnType<typeof summaries>;
type CompleteEvidence = { full: PeriodEvidence; train: PeriodEvidence; development: PeriodEvidence; validation: PeriodEvidence; lockedOutOfSample: PeriodEvidence };

const INTERVAL_MS: Record<V8Timeframe, number> = { "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 };
const ANALYSIS_START = new Date(V8_PREREGISTRATION.dataset.start);
const ANALYSIS_END = new Date(V8_PREREGISTRATION.dataset.endExclusive);
const CACHE_DIRECTORY = path.resolve("research", "cache");
const OUTPUT_DIRECTORY = path.resolve("research", "output");
const COSTS = v6CostModels();

assertProtocol();
console.error(`[V8] preregistration ${V8_PREREGISTRATION_HASH} verified before results`);

const data = Object.fromEntries(await Promise.all(V8_TIMEFRAMES.map(async (timeframe) => {
  const warmupStart = new Date(ANALYSIS_START.getTime() - INTERVAL_MS[timeframe] * 220);
  const dataset = await loadOrFetchResearchDataset({ symbol: "BTCUSDT", timeframe, start: warmupStart, endExclusive: ANALYSIS_END, observedAt: ANALYSIS_END, cacheDirectory: CACHE_DIRECTORY });
  console.error(`[V8] ${timeframe}: ${dataset.metadata.candleCount} closed candles (${dataset.source}) sha256=${dataset.metadata.sha256.slice(0, 12)}`);
  return [timeframe, dataset];
}))) as Record<V8Timeframe, Dataset>;

const contexts = buildV3Contexts({ candles1h: data["1h"].candles, candles4h: data["4h"].candles });
const baseline = {} as Record<V8Timeframe, CompleteEvidence>;
const candidates = {} as Record<V8Timeframe, Record<V8Family, ReturnType<typeof candidateEvidence>>>;

for (const timeframe of V8_TIMEFRAMES) {
  console.error(`[V8] generating baseline control and causal families for ${timeframe}`);
  const base = generateV3BaselineSetups({ candles: data[timeframe].candles, timeframe, ...contexts, analysisStart: ANALYSIS_START });
  const scored = scoreV4Opportunities({ entries: base, candles: data[timeframe].candles, timeframe, observedAt: ANALYSIS_END });
  baseline[timeframe] = completeEvidence(evaluateV3Entries(data[timeframe].candles, scored, baselineConfiguration()));
  const generated = generateV8Entries({ candles: data[timeframe].candles, timeframe, analysisStart: ANALYSIS_START, observedAt: ANALYSIS_END });
  candidates[timeframe] = Object.fromEntries(V8_FAMILIES.map((family) => {
    const trades = evaluateV8Entries(data[timeframe].candles, generated[family]);
    const evidence = candidateEvidence(timeframe, family, trades, generated[family].length);
    console.error(`[V8] ${timeframe}/${family}: ${evidence.full.net5Bps.signals} trades, OOS exp5=${format(evidence.lockedOutOfSample.net5Bps.expectancyR)}`);
    return [family, evidence];
  })) as Record<V8Family, ReturnType<typeof candidateEvidence>>;
}

const promotionEligible = V8_TIMEFRAMES.flatMap((timeframe) => V8_FAMILIES.map((family) => ({ timeframe, family, evidence: candidates[timeframe][family] })).filter((item) => item.evidence.gate.passes));
const report = {
  metadata: {
    researchId: V8_PREREGISTRATION.id,
    preregistrationHash: V8_PREREGISTRATION_HASH,
    generatedAt: new Date().toISOString(),
    liveStrategyChanged: false,
    productionTouched: false,
    mainTouched: false,
    databaseWrites: false,
    telegramCalls: false,
    contamination: V8_PREREGISTRATION.dataset.contamination,
  },
  protocol: V8_PREREGISTRATION,
  dataset: Object.fromEntries(V8_TIMEFRAMES.map((timeframe) => [timeframe, data[timeframe].metadata])),
  baseline,
  candidates,
  conclusion: {
    promotionEligible: promotionEligible.map(({ timeframe, family }) => `${timeframe}:${family}`),
    robustPositiveEdge: promotionEligible.length > 0 ? "EXPLORATORY_ONLY_NEEDS_FORWARD" : "NO",
    recommendLiveChange: "NO",
    recommendCommercialUse: "NO",
    liveStrategyChanged: false,
  },
};

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const outputPath = path.join(OUTPUT_DIRECTORY, "signal-engine-v8-results.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ researchId: report.metadata.researchId, preregistrationHash: V8_PREREGISTRATION_HASH, promotionEligible: report.conclusion.promotionEligible, outputPath }, null, 2));

function completeEvidence(trades: BacktestTrade[]): CompleteEvidence {
  return {
    full: summaries(trades, "TRAIN", true),
    train: summaries(tradesInV6Period(trades, "TRAIN"), "TRAIN"),
    development: summaries(tradesInV6Period(trades, "DEVELOPMENT"), "DEVELOPMENT"),
    validation: summaries(tradesInV6Period(trades, "VALIDATION"), "VALIDATION"),
    lockedOutOfSample: summaries(tradesInV6Period(trades, "LOCKED_OUT_OF_SAMPLE"), "LOCKED_OUT_OF_SAMPLE"),
  };
}

function candidateEvidence(timeframe: V8Timeframe, family: V8Family, trades: BacktestTrade[], rawSetups: number) {
  const evidence = completeEvidence(trades);
  const oosTrades = tradesInV6Period(trades, "LOCKED_OUT_OF_SAMPLE");
  return {
    family,
    rawSetups,
    ...evidence,
    yearly5Bps: yearlyEvidence(trades),
    gate: promotionGate(timeframe, evidence),
    postHocRobustness: {
      note: "Uncertainty diagnostic added after the fixed candidate run. It does not alter candidate rules or the preregistered gate.",
      fullSampleBreakEvenBps: numeric(approximateBreakEvenBps(trades)),
      oosBreakEvenBps: numeric(approximateBreakEvenBps(oosTrades)),
      oosBootstrap5Bps: oosTrades.length >= 3 ? deterministicBlockBootstrap({
        trades: oosTrades,
        frictionBps: 5,
        iterations: 10_000,
        blockLength: Math.min(5, oosTrades.length),
        seed: 0x58_38_20_26,
      }) : null,
    },
  };
}

function summaries(trades: BacktestTrade[], period: V6Period, full = false) {
  const days = full ? (ANALYSIS_END.getTime() - ANALYSIS_START.getTime()) / 86_400_000 : periodDays(period as Exclude<V6Period, "OUTSIDE">);
  return {
    gross0Bps: compact(summarizeV6(trades, COSTS.IDEAL, days)),
    net5Bps: compact(summarizeV6(trades, COSTS.REALISTIC, days)),
    net10Bps: compact(summarizeV6(trades, COSTS.STRESS, days)),
  };
}

function compact(summary: ReturnType<typeof summarizeV6>) {
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === "number" && Number.isFinite(value) ? round(value) : value])) as ReturnType<typeof summarizeV6>;
}

function promotionGate(timeframe: V8Timeframe, evidence: CompleteEvidence) {
  const minimum = V8_PREREGISTRATION.selection.minimumSignals[timeframe];
  const periods = [evidence.train, evidence.development, evidence.validation, evidence.lockedOutOfSample] as const;
  const names = ["TRAIN", "DEVELOPMENT", "VALIDATION", "OOS"] as const;
  const checks: Array<[boolean, string]> = [[evidence.lockedOutOfSample.net5Bps.signals >= minimum, `OOS signals >= ${minimum}`]];
  periods.forEach((period, index) => {
    checks.push([(period.net5Bps.expectancyR ?? -Infinity) > 0, `${names[index]} expectancy 5bps > 0`]);
    checks.push([(period.net5Bps.profitFactor ?? 0) > 1, `${names[index]} PF 5bps > 1`]);
  });
  checks.push([(evidence.lockedOutOfSample.net5Bps.profitFactor ?? 0) >= 1.1, "OOS PF 5bps >= 1.10"]);
  checks.push([(evidence.lockedOutOfSample.net10Bps.expectancyR ?? -Infinity) >= 0, "OOS expectancy 10bps >= 0"]);
  return { passes: checks.every(([passes]) => passes), failures: checks.filter(([passes]) => !passes).map(([, reason]) => reason) };
}

function yearlyEvidence(trades: BacktestTrade[]) {
  const result = [];
  for (let year = 2018; year <= 2026; year += 1) {
    const start = Date.parse(`${year}-01-01T00:00:00Z`);
    const end = Math.min(Date.parse(`${year + 1}-01-01T00:00:00Z`), ANALYSIS_END.getTime());
    if (end <= start) continue;
    const selected = trades.filter((trade) => { const opened = Date.parse(trade.openedAt); return opened >= start && opened < end; });
    const summary = summarizeBacktest(selected, 5);
    result.push({ year, signals: summary.signals, expectancyR: numeric(summary.expectancyR), profitFactor: numeric(summary.profitFactor), maximumDrawdownR: numeric(summary.maximumDrawdownR) });
  }
  return result;
}

function assertProtocol(): void {
  const actual = computeV8PreregistrationHash();
  if (actual !== V8_PREREGISTRATION_HASH) throw new Error(`V8 preregistration hash mismatch: expected=${V8_PREREGISTRATION_HASH} actual=${actual}`);
  const baseline = baselineConfiguration();
  if (baseline.rewardRisk !== V8_PREREGISTRATION.commonRisk.rewardRisk || baseline.expiryCandles !== V8_PREREGISTRATION.commonRisk.expiryCandles) throw new Error("V8 fixed exit policy diverges from the frozen baseline evaluator.");
  if (process.argv.slice(2).length > 0) throw new Error("V8 accepts no runtime parameter overrides.");
}

function round(value: number): number { return Number(value.toFixed(6)); }
function numeric(value: number | null): number | null { return value === null || !Number.isFinite(value) ? null : round(value); }
function format(value: number | null): string { return value === null || !Number.isFinite(value) ? "null" : value.toFixed(6); }
