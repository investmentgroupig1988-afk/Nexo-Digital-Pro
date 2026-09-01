import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBinance } from "./market";
import { isCandleClosedAt, type HistoricalTimeframe } from "./historical";
import { validateCandleSeries, type CandleQuality, type ClosedAnalysisCandle } from "./signal-backtest";

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];
type CompactCandle = [number, number, number, number, number, number, number];

export type ResearchDatasetMetadata = {
  schemaVersion: 1;
  symbol: string;
  timeframe: HistoricalTimeframe;
  start: string;
  endExclusive: string;
  observedAt: string;
  candleCount: number;
  firstOpenTime: string | null;
  lastCloseTime: string | null;
  incompleteExcluded: number;
  invalidOhlc: number;
  negativeVolume: number;
  quality: CandleQuality;
  sha256: string;
};

export type ResearchDataset = {
  candles: ClosedAnalysisCandle[];
  metadata: ResearchDatasetMetadata;
  source: "CACHE" | "BINANCE";
};

const INTERVAL_MS: Record<HistoricalTimeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};

export async function loadOrFetchResearchDataset(input: {
  symbol: string;
  timeframe: HistoricalTimeframe;
  start: Date;
  endExclusive: Date;
  observedAt: Date;
  cacheDirectory: string;
}): Promise<ResearchDataset> {
  const cacheKey = [
    input.symbol,
    input.timeframe,
    input.start.toISOString().slice(0, 10),
    input.endExclusive.toISOString().slice(0, 10),
  ].join("-");
  const dataPath = path.join(input.cacheDirectory, `${cacheKey}.json.gz`);
  const metadataPath = path.join(input.cacheDirectory, `${cacheKey}.metadata.json`);
  const cached = await readCache(dataPath, metadataPath);
  if (cached !== null) return cached;

  const fetched = await fetchClosedDataset(input);
  await mkdir(input.cacheDirectory, { recursive: true });
  const compact = fetched.candles.map(toCompact);
  const compressed = gzipSync(Buffer.from(JSON.stringify(compact)), { level: 9 });
  const temporaryData = `${dataPath}.${process.pid}.tmp`;
  const temporaryMetadata = `${metadataPath}.${process.pid}.tmp`;
  await writeFile(temporaryData, compressed);
  await writeFile(temporaryMetadata, `${JSON.stringify(fetched.metadata, null, 2)}\n`, "utf8");
  await rename(temporaryData, dataPath);
  await rename(temporaryMetadata, metadataPath);
  return { ...fetched, source: "BINANCE" };
}

export function inspectResearchDataset(input: {
  symbol: string;
  timeframe: HistoricalTimeframe;
  candles: ClosedAnalysisCandle[];
  start: Date;
  endExclusive: Date;
  observedAt: Date;
  incompleteExcluded?: number;
}): ResearchDatasetMetadata {
  const intervalMs = INTERVAL_MS[input.timeframe];
  const invalidOhlc = input.candles.filter((candle) => !validOhlc(candle)).length;
  const negativeVolume = input.candles.filter((candle) => candle.volume !== null && candle.volume < 0).length;
  return {
    schemaVersion: 1,
    symbol: input.symbol,
    timeframe: input.timeframe,
    start: input.start.toISOString(),
    endExclusive: input.endExclusive.toISOString(),
    observedAt: input.observedAt.toISOString(),
    candleCount: input.candles.length,
    firstOpenTime: input.candles.at(0)?.timestamp ?? null,
    lastCloseTime: input.candles.at(-1)?.closeTime ?? null,
    incompleteExcluded: input.incompleteExcluded ?? 0,
    invalidOhlc,
    negativeVolume,
    quality: validateCandleSeries(input.candles, intervalMs, input.observedAt),
    sha256: researchDatasetChecksum(input.candles),
  };
}

export function researchDatasetChecksum(candles: ClosedAnalysisCandle[]): string {
  const hash = createHash("sha256");
  for (const candle of candles) hash.update(`${JSON.stringify(toCompact(candle))}\n`);
  return hash.digest("hex");
}

async function readCache(dataPath: string, metadataPath: string): Promise<ResearchDataset | null> {
  try {
    const [compressed, metadataSource] = await Promise.all([readFile(dataPath), readFile(metadataPath, "utf8")]);
    const metadata = JSON.parse(metadataSource) as ResearchDatasetMetadata;
    const compact = JSON.parse(gunzipSync(compressed).toString("utf8")) as CompactCandle[];
    const candles = compact.map(fromCompact);
    if (metadata.schemaVersion !== 1 || metadata.candleCount !== candles.length) {
      throw new Error("Research dataset cache metadata does not match its candle payload.");
    }
    if (researchDatasetChecksum(candles) !== metadata.sha256) {
      throw new Error("Research dataset cache checksum mismatch.");
    }
    return { candles, metadata, source: "CACHE" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function fetchClosedDataset(input: {
  symbol: string;
  timeframe: HistoricalTimeframe;
  start: Date;
  endExclusive: Date;
  observedAt: Date;
}): Promise<Omit<ResearchDataset, "source">> {
  const intervalMs = INTERVAL_MS[input.timeframe];
  const byOpenTime = new Map<number, ClosedAnalysisCandle>();
  let cursor = input.start.getTime();
  let incompleteExcluded = 0;
  while (cursor < input.endExclusive.getTime()) {
    const page = await getBinance<BinanceKline[]>("/klines", {
      symbol: input.symbol,
      interval: input.timeframe,
      startTime: cursor,
      endTime: input.endExclusive.getTime() - 1,
      limit: 1_000,
    });
    if (page.length === 0) break;
    for (const row of page) {
      if (row[0] < input.start.getTime() || row[0] >= input.endExclusive.getTime()) continue;
      if (!isCandleClosedAt(row[6], input.observedAt)) {
        incompleteExcluded += 1;
        continue;
      }
      byOpenTime.set(row[0], fromCompact([
        row[0], row[6], Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4]), Number(row[5]),
      ]));
    }
    const next = page.at(-1)![0] + intervalMs;
    if (next <= cursor) throw new Error(`Binance pagination did not advance for ${input.symbol} ${input.timeframe}.`);
    cursor = next;
    if (page.length < 1_000) break;
  }
  const candles = [...byOpenTime.values()].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const metadata = inspectResearchDataset({ ...input, candles, incompleteExcluded });
  if (metadata.invalidOhlc > 0 || metadata.negativeVolume > 0 || metadata.quality.duplicateTimestamps > 0 || metadata.quality.outOfOrder > 0 || metadata.quality.incompleteCandles > 0) {
    throw new Error(`Research dataset integrity failed for ${input.symbol} ${input.timeframe}.`);
  }
  return { candles, metadata };
}

function validOhlc(candle: ClosedAnalysisCandle): boolean {
  const prices = [candle.open, candle.high, candle.low, candle.close];
  return prices.every((value) => Number.isFinite(value) && value > 0)
    && candle.high >= Math.max(candle.open, candle.close, candle.low)
    && candle.low <= Math.min(candle.open, candle.close, candle.high);
}

function toCompact(candle: ClosedAnalysisCandle): CompactCandle {
  return [
    Date.parse(candle.timestamp), Date.parse(candle.closeTime), candle.open, candle.high,
    candle.low, candle.close, candle.volume ?? 0,
  ];
}

function fromCompact(value: CompactCandle): ClosedAnalysisCandle {
  return {
    timestamp: new Date(value[0]).toISOString(),
    closeTime: new Date(value[1]).toISOString(),
    open: value[2],
    high: value[3],
    low: value[4],
    close: value[5],
    volume: value[6],
  };
}
