import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getBinance } from "../services/market";
import {
  summarizeBacktest,
  validateCandleSeries,
  type BacktestSummary,
  type BacktestTrade,
  type ClosedAnalysisCandle,
} from "../services/signal-backtest";
import {
  FROZEN_1H_EXTERNAL_ASSETS,
  FROZEN_1H_FORWARD_CUTOFF,
  FROZEN_1H_HYPOTHESIS,
  FROZEN_1H_HYPOTHESIS_HASH,
  computeFrozen1hHypothesisHash,
  frozen1hExitConfiguration,
  mergeForwardResearchLedger,
  toForwardResearchLedgerRow,
  validateForwardResearchLedgerRow,
  type ForwardResearchLedgerRow,
  type FrozenExternalAsset,
} from "../services/signal-hypothesis-forward";
import {
  buildV3Contexts,
  evaluateV3Entries,
  filterV3Entries,
  generateV3BaselineSetups,
  isV3CandleUsable,
} from "../services/signal-strategy-v3";

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];
type ServerTime = { serverTime: number };
type ResearchSymbol = "BTCUSDT" | FrozenExternalAsset;
type ResearchTimeframe = "1h" | "4h";
type TimeframeData = { candles: ClosedAnalysisCandle[]; incompleteExcluded: number };

const INTERVAL_MS: Record<ResearchTimeframe, number> = {
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};
const EXTERNAL_START = new Date(FROZEN_1H_HYPOTHESIS.externalValidation.start);
const EXTERNAL_END = new Date(FROZEN_1H_HYPOTHESIS.externalValidation.end);
const LEDGER_DIRECTORY = fileURLToPath(new URL("../../research/ledgers/", import.meta.url));
const LEDGER_PATH = `${LEDGER_DIRECTORY}btc-1h-${FROZEN_1H_HYPOTHESIS_HASH.slice(0, 12)}.jsonl`;

const mode = parseMode(process.argv.slice(2));
assertFrozenSnapshot();
if (mode.forward) {
  await runForwardBtc(mode.writeLedger);
} else {
  await runExternalValidation();
}

async function runExternalValidation(): Promise<void> {
  const byAsset = [];
  const combined: BacktestTrade[] = [];
  for (const asset of FROZEN_1H_EXTERNAL_ASSETS) {
    const evaluation = await evaluateAsset(asset, EXTERNAL_START, EXTERNAL_END, EXTERNAL_END);
    combined.push(...evaluation.trades);
    byAsset.push({
      asset,
      dataQuality: evaluation.dataQuality,
      ...summaryRow(evaluation.trades, EXTERNAL_START, EXTERNAL_END),
    });
  }
  combined.sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt));
  const report = {
    metadata: {
      name: "TRENORO frozen 1h hypothesis external validation",
      hypothesisId: FROZEN_1H_HYPOTHESIS.id,
      configHash: FROZEN_1H_HYPOTHESIS_HASH,
      snapshotVerified: true,
      start: EXTERNAL_START.toISOString(),
      end: EXTERNAL_END.toISOString(),
      assets: FROZEN_1H_EXTERNAL_ASSETS,
      assetsPredefined: true,
      parametersRetuned: false,
      costsBps: [5, 10],
      candlePolicy: FROZEN_1H_HYPOTHESIS.candlePolicy,
      liveStrategyChanged: false,
      databaseWrites: false,
      telegramCalls: false,
    },
    byAsset,
    aggregate: summaryRow(combined, EXTERNAL_START, EXTERNAL_END),
  };
  console.log(JSON.stringify(roundDeep(report), null, 2));
}

async function runForwardBtc(writeLedger: boolean): Promise<void> {
  const serverTime = await getBinance<ServerTime>("/time", {});
  const observedAt = new Date(serverTime.serverTime);
  const forwardStart = new Date(FROZEN_1H_FORWARD_CUTOFF);
  if (observedAt <= forwardStart) {
    console.log(JSON.stringify({
      hypothesisId: FROZEN_1H_HYPOTHESIS.id,
      configHash: FROZEN_1H_HYPOTHESIS_HASH,
      forwardStart: forwardStart.toISOString(),
      observedAt: observedAt.toISOString(),
      observations: 0,
      ledgerWritten: false,
    }, null, 2));
    return;
  }
  const evaluation = await evaluateAsset("BTCUSDT", forwardStart, observedAt, observedAt);
  const incoming = evaluation.trades.map((trade) => {
    const entryCandle = evaluation.entryCandles[trade.entryIndex];
    if (entryCandle === undefined) throw new Error("Forward trade does not reference an available closed entry candle.");
    return toForwardResearchLedgerRow({ trade, evaluatedAt: entryCandle.closeTime });
  });
  let ledger = incoming;
  if (writeLedger) {
    await mkdir(LEDGER_DIRECTORY, { recursive: true });
    const existing = await readLedger(LEDGER_PATH);
    ledger = mergeForwardResearchLedger(existing, incoming);
    const body = ledger.map((row) => JSON.stringify(row)).join("\n");
    await writeFile(LEDGER_PATH, body.length ? `${body}\n` : "", "utf8");
  }
  console.log(JSON.stringify(roundDeep({
    hypothesisId: FROZEN_1H_HYPOTHESIS.id,
    configHash: FROZEN_1H_HYPOTHESIS_HASH,
    forwardStart: forwardStart.toISOString(),
    observedAt: observedAt.toISOString(),
    newObservations: incoming.length,
    totalLedgerRows: ledger.length,
    ledgerWritten: writeLedger,
    ledgerPath: writeLedger ? LEDGER_PATH : null,
    dataQuality: evaluation.dataQuality,
  }), null, 2));
}

async function evaluateAsset(
  symbol: ResearchSymbol,
  analysisStart: Date,
  end: Date,
  observedAt: Date,
): Promise<{
  trades: BacktestTrade[];
  entryCandles: ClosedAnalysisCandle[];
  dataQuality: Record<ResearchTimeframe, ReturnType<typeof validateCandleSeries> & { incompleteExcluded: number }>;
}> {
  const fetched = Object.fromEntries(await Promise.all((["1h", "4h"] as const).map(async (timeframe) => {
    const warmupStart = new Date(analysisStart.getTime() - INTERVAL_MS[timeframe] * 220);
    return [timeframe, await fetchClosedCandles(symbol, timeframe, warmupStart, end, observedAt)];
  }))) as Record<ResearchTimeframe, TimeframeData>;
  const contexts = buildV3Contexts({
    candles1h: fetched["1h"].candles,
    candles4h: fetched["4h"].candles,
  });
  // evaluateSignal's symbol currently affects only its discarded fingerprint. The
  // actual frozen equations consume these asset-specific candles and indicators.
  const setups = generateV3BaselineSetups({
    candles: fetched["1h"].candles,
    timeframe: "1h",
    ...contexts,
    analysisStart,
  });
  const trades = evaluateV3Entries(
    fetched["1h"].candles,
    filterV3Entries(setups, "QUALITY_PULLBACK_HTF"),
    frozen1hExitConfiguration(),
  );
  return {
    trades,
    entryCandles: fetched["1h"].candles,
    dataQuality: {
      "1h": {
        ...validateCandleSeries(fetched["1h"].candles, INTERVAL_MS["1h"], observedAt),
        incompleteExcluded: fetched["1h"].incompleteExcluded,
      },
      "4h": {
        ...validateCandleSeries(fetched["4h"].candles, INTERVAL_MS["4h"], observedAt),
        incompleteExcluded: fetched["4h"].incompleteExcluded,
      },
    },
  };
}

async function fetchClosedCandles(
  symbol: ResearchSymbol,
  timeframe: ResearchTimeframe,
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
      symbol,
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
    if (next <= cursor) throw new Error(`Binance pagination did not advance for ${symbol} ${timeframe}.`);
    cursor = next;
    if (page.length < 1_000) break;
  }
  return {
    candles: [...byTimestamp.values()].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)),
    incompleteExcluded,
  };
}

function summaryRow(trades: BacktestTrade[], start: Date, end: Date) {
  const five = summarizeBacktest(trades, 5);
  const ten = summarizeBacktest(trades, 10);
  const years = (end.getTime() - start.getTime()) / (365.25 * 86_400_000);
  return {
    signals: five.signals,
    wins: five.wins,
    losses: five.losses,
    expired: five.expired,
    tradesPerYear: years > 0 ? five.signals / years : null,
    expectancy5Bps: five.expectancyR,
    profitFactor5Bps: five.profitFactor,
    maximumDrawdown5Bps: five.maximumDrawdownR,
    expectancy10Bps: ten.expectancyR,
    profitFactor10Bps: ten.profitFactor,
    maximumDrawdown10Bps: ten.maximumDrawdownR,
  };
}

async function readLedger(path: string): Promise<ForwardResearchLedgerRow[]> {
  let body: string;
  try {
    body = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return body.split(/\r?\n/).filter(Boolean).map((line) => {
    const row = JSON.parse(line) as ForwardResearchLedgerRow;
    validateForwardResearchLedgerRow(row);
    return row;
  });
}

function parseMode(args: string[]): { forward: boolean; writeLedger: boolean } {
  const allowed = new Set(["--forward-btc", "--write-ledger"]);
  const unknown = args.filter((argument) => !allowed.has(argument));
  if (unknown.length) throw new Error(`Unsupported options: ${unknown.join(", ")}. The frozen protocol is not configurable.`);
  const forward = args.includes("--forward-btc");
  const writeLedger = args.includes("--write-ledger");
  if (writeLedger && !forward) throw new Error("--write-ledger is valid only with --forward-btc.");
  return { forward, writeLedger };
}

function assertFrozenSnapshot(): void {
  const actual = computeFrozen1hHypothesisHash();
  if (actual !== FROZEN_1H_HYPOTHESIS_HASH) {
    throw new Error(`Frozen hypothesis hash mismatch: expected ${FROZEN_1H_HYPOTHESIS_HASH}, got ${actual}.`);
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
