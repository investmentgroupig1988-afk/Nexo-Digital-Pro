import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BacktestTrade } from "../services/signal-backtest";
import { deterministicBlockBootstrap } from "../services/signal-hypothesis-robustness";
import { loadOrFetchResearchDataset } from "../services/signal-research-dataset";
import { summarizeV6, v6CostModels } from "../services/signal-strategy-v6";
import { evaluateV8Entries, generateV8Entries } from "../services/signal-strategy-v8";
import { computeV8PreregistrationHash, V8_PREREGISTRATION_HASH } from "../services/signal-strategy-v8-snapshot";
import {
  computeV10PreregistrationHash,
  V10_ASSETS,
  V10_FAMILIES,
  V10_PREREGISTRATION,
  V10_PREREGISTRATION_HASH,
  type V10Asset,
  type V10Family,
} from "../services/signal-strategy-v10-snapshot";

const START = new Date(V10_PREREGISTRATION.dataset.start);
const END = new Date(V10_PREREGISTRATION.dataset.endExclusive);
const WARMUP_START = new Date(START.getTime() - 220 * 14_400_000);
const CACHE_DIRECTORY = path.resolve("research", "cache");
const OUTPUT_DIRECTORY = path.resolve("research", "output");
const COSTS = v6CostModels();

assertProtocol();
console.error(`[V10] preregistration ${V10_PREREGISTRATION_HASH} verified before external data`);

const data = {} as Record<V10Asset, Awaited<ReturnType<typeof loadOrFetchResearchDataset>>>;
for (const asset of V10_ASSETS) {
  data[asset] = await loadOrFetchResearchDataset({
    symbol: asset,
    timeframe: "4h",
    start: WARMUP_START,
    endExclusive: END,
    observedAt: END,
    cacheDirectory: CACHE_DIRECTORY,
  });
  console.error(`[V10] ${asset}: ${data[asset].metadata.candleCount} closed candles (${data[asset].source}) sha256=${data[asset].metadata.sha256.slice(0, 12)}`);
}

const candidates = {} as Record<V10Family, ReturnType<typeof evidenceFor>>;
for (const family of V10_FAMILIES) {
  const perAssetTrades = {} as Record<V10Asset, BacktestTrade[]>;
  for (const asset of V10_ASSETS) {
    const generated = generateV8Entries({ candles: data[asset].candles, timeframe: "4h", analysisStart: START, observedAt: END });
    perAssetTrades[asset] = evaluateV8Entries(data[asset].candles, generated[family]);
    console.error(`[V10] ${family}/${asset}: ${perAssetTrades[asset].length} trades`);
  }
  candidates[family] = evidenceFor(perAssetTrades);
}

const eligible = V10_FAMILIES.filter((family) => candidates[family].gate.passes);
const report = {
  metadata: {
    researchId: V10_PREREGISTRATION.id,
    preregistrationHash: V10_PREREGISTRATION_HASH,
    generatedAt: new Date().toISOString(),
    sourceV8Hash: V8_PREREGISTRATION_HASH,
    liveStrategyChanged: false,
    productionTouched: false,
    mainTouched: false,
    databaseWrites: false,
    telegramCalls: false,
  },
  protocol: V10_PREREGISTRATION,
  dataset: Object.fromEntries(V10_ASSETS.map((asset) => [asset, data[asset].metadata])),
  candidates,
  conclusion: {
    eligible,
    robustExternalGeneralization: eligible.length > 0 ? "EXPLORATORY_PASS_REQUIRES_TRUE_FORWARD" : "NO",
    recommendLiveChange: "NO",
    recommendCommercialUse: "NO",
  },
};

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const outputPath = path.join(OUTPUT_DIRECTORY, "signal-engine-v10-results.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ researchId: report.metadata.researchId, preregistrationHash: V10_PREREGISTRATION_HASH, eligible, outputPath }, null, 2));

function evidenceFor(perAssetTrades: Record<V10Asset, BacktestTrade[]>) {
  const aggregate = V10_ASSETS.flatMap((asset) => perAssetTrades[asset]).sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt));
  const firstHalf = inPeriod(aggregate, V10_PREREGISTRATION.temporalChecks.firstHalf);
  const secondHalf = inPeriod(aggregate, V10_PREREGISTRATION.temporalChecks.secondHalf);
  const perAsset = Object.fromEntries(V10_ASSETS.map((asset) => [asset, costs(perAssetTrades[asset], days(START, END))])) as Record<V10Asset, ReturnType<typeof costs>>;
  const perAssetHalves = Object.fromEntries(V10_ASSETS.map((asset) => [asset, {
    first: costs(inPeriod(perAssetTrades[asset], V10_PREREGISTRATION.temporalChecks.firstHalf), days(new Date(V10_PREREGISTRATION.temporalChecks.firstHalf.start), new Date(V10_PREREGISTRATION.temporalChecks.firstHalf.end))),
    second: costs(inPeriod(perAssetTrades[asset], V10_PREREGISTRATION.temporalChecks.secondHalf), days(new Date(V10_PREREGISTRATION.temporalChecks.secondHalf.start), new Date(V10_PREREGISTRATION.temporalChecks.secondHalf.end))),
  }])) as Record<V10Asset, { first: ReturnType<typeof costs>; second: ReturnType<typeof costs> }>;
  const bootstrap = aggregate.length >= 3 ? deterministicBlockBootstrap({
    trades: aggregate,
    frictionBps: 5,
    iterations: V10_PREREGISTRATION.selection.bootstrap.iterations,
    blockLength: Math.min(V10_PREREGISTRATION.selection.bootstrap.blockLength, aggregate.length),
    seed: V10_PREREGISTRATION.selection.bootstrap.seed,
  }) : null;
  const aggregateCosts = costs(aggregate, days(START, END));
  const halves = {
    first: costs(firstHalf, days(new Date(V10_PREREGISTRATION.temporalChecks.firstHalf.start), new Date(V10_PREREGISTRATION.temporalChecks.firstHalf.end))),
    second: costs(secondHalf, days(new Date(V10_PREREGISTRATION.temporalChecks.secondHalf.start), new Date(V10_PREREGISTRATION.temporalChecks.secondHalf.end))),
  };
  return {
    perAsset,
    perAssetHalves,
    aggregate: aggregateCosts,
    halves,
    yearly5Bps: yearlyEvidence(aggregate),
    bootstrap5Bps: bootstrap,
    gate: gate(perAsset, aggregateCosts, halves, bootstrap),
  };
}

function gate(
  perAsset: Record<V10Asset, ReturnType<typeof costs>>,
  aggregate: ReturnType<typeof costs>,
  halves: { first: ReturnType<typeof costs>; second: ReturnType<typeof costs> },
  bootstrap: ReturnType<typeof deterministicBlockBootstrap>,
) {
  const checks: Array<[boolean, string]> = [];
  for (const asset of V10_ASSETS) {
    checks.push([perAsset[asset].net5Bps.signals >= V10_PREREGISTRATION.selection.minimumSignalsPerAsset, `${asset} signals >= 30`]);
    checks.push([(perAsset[asset].net5Bps.expectancyR ?? -Infinity) > 0, `${asset} expectancy 5bps > 0`]);
    checks.push([(perAsset[asset].net5Bps.profitFactor ?? 0) > 1, `${asset} PF 5bps > 1`]);
  }
  checks.push([aggregate.net5Bps.signals >= V10_PREREGISTRATION.selection.minimumAggregateSignals, "aggregate signals >= 120"]);
  checks.push([(aggregate.net5Bps.profitFactor ?? 0) >= 1.15, "aggregate PF 5bps >= 1.15"]);
  checks.push([(aggregate.net10Bps.expectancyR ?? -Infinity) >= 0, "aggregate expectancy 10bps >= 0"]);
  for (const [name, half] of Object.entries(halves)) {
    checks.push([(half.net5Bps.expectancyR ?? -Infinity) > 0, `${name} expectancy 5bps > 0`]);
    checks.push([(half.net5Bps.profitFactor ?? 0) > 1, `${name} PF 5bps > 1`]);
  }
  checks.push([(bootstrap?.probabilityPositiveExpectancyPct ?? 0) >= 70, "bootstrap P(expectancy > 0) >= 70%"]);
  return { passes: checks.every(([passes]) => passes), failures: checks.filter(([passes]) => !passes).map(([, reason]) => reason) };
}

function costs(trades: BacktestTrade[], periodDays: number) {
  return {
    gross0Bps: compact(summarizeV6(trades, COSTS.IDEAL, periodDays)),
    net5Bps: compact(summarizeV6(trades, COSTS.REALISTIC, periodDays)),
    net10Bps: compact(summarizeV6(trades, COSTS.STRESS, periodDays)),
  };
}

function compact(summary: ReturnType<typeof summarizeV6>) {
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(6)) : value])) as ReturnType<typeof summarizeV6>;
}

function inPeriod(trades: BacktestTrade[], period: { start: string; end: string }): BacktestTrade[] {
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  return trades.filter((trade) => { const opened = Date.parse(trade.openedAt); return opened >= start && opened < end; });
}

function yearlyEvidence(trades: BacktestTrade[]) {
  const result = [];
  for (let year = 2020; year <= 2026; year += 1) {
    const start = Math.max(Date.parse(`${year}-01-01T00:00:00Z`), START.getTime());
    const end = Math.min(Date.parse(`${year + 1}-01-01T00:00:00Z`), END.getTime());
    if (end <= start) continue;
    const selected = trades.filter((trade) => { const opened = Date.parse(trade.openedAt); return opened >= start && opened < end; });
    const summary = summarizeV6(selected, COSTS.REALISTIC, days(new Date(start), new Date(end)));
    result.push({ year, signals: summary.signals, expectancyR: summary.expectancyR, profitFactor: summary.profitFactor, maximumDrawdownR: summary.maximumDrawdownR });
  }
  return result;
}

function days(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 86_400_000;
}

function assertProtocol(): void {
  if (computeV10PreregistrationHash() !== V10_PREREGISTRATION_HASH) throw new Error("V10 preregistration hash mismatch.");
  if (computeV8PreregistrationHash() !== V8_PREREGISTRATION_HASH) throw new Error("The frozen V8 detector hash changed.");
  if (process.argv.slice(2).length > 0) throw new Error("V10 accepts no runtime parameter overrides.");
}
