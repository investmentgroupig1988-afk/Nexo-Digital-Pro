import { getBinance } from "../services/market";
import {
  causalVolatilityRegime,
  summarizeBacktest,
  validateCandleSeries,
  type BacktestSummary,
  type BacktestTrade,
  type ClosedAnalysisCandle,
  type VolatilityRegime,
} from "../services/signal-backtest";
import {
  BTC_DISCOVERY_ERA_START,
  BTC_ROBUSTNESS_COSTS_BPS,
  BTC_ROBUSTNESS_END,
  BTC_ROBUSTNESS_START,
  approximateBreakEvenBps,
  deterministicBlockBootstrap,
  frozenSensitivityGrid,
  independentTwoYearWindows,
  rollingTwoYearWindows,
  type FixedTimeWindow,
} from "../services/signal-hypothesis-robustness";
import {
  FROZEN_1H_HYPOTHESIS,
  FROZEN_1H_HYPOTHESIS_HASH,
  computeFrozen1hHypothesisHash,
  frozen1hExitConfiguration,
} from "../services/signal-hypothesis-forward";
import {
  buildV3Contexts,
  evaluateV3Entries,
  filterV3Entries,
  generateV3BaselineSetups,
  isV3CandleUsable,
  type V3FeatureSnapshot,
  type V3SetupEntry,
} from "../services/signal-strategy-v3";

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];
type Timeframe = "1h" | "4h";
type TimeframeData = { candles: ClosedAnalysisCandle[]; incompleteExcluded: number };
type MarketTrendRegime = "BULLISH" | "BEARISH" | "SIDEWAYS" | "UNAVAILABLE";
type MarketVolatilityRegime = "HIGH" | "NORMAL_OR_LOW" | "UNAVAILABLE";
type RobustnessMarker = {
  evaluatedAt: string;
  marketTrendRegime: MarketTrendRegime;
  marketVolatilityRegime: MarketVolatilityRegime;
};
type RobustnessEntry = V3SetupEntry & { robustness: RobustnessMarker };
type RobustnessTrade = BacktestTrade & { feature: V3FeatureSnapshot; robustness: RobustnessMarker };

const INTERVAL_MS: Record<Timeframe, number> = {
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};
const ANALYSIS_START = new Date(BTC_ROBUSTNESS_START);
const DISCOVERY_START = new Date(BTC_DISCOVERY_ERA_START);
const ANALYSIS_END = new Date(BTC_ROBUSTNESS_END);

assertProtocol();
const fetched = Object.fromEntries(await Promise.all((["1h", "4h"] as const).map(async (timeframe) => {
  const warmupStart = new Date(ANALYSIS_START.getTime() - INTERVAL_MS[timeframe] * 220);
  return [timeframe, await fetchClosedCandles(timeframe, warmupStart, ANALYSIS_END, ANALYSIS_END)];
}))) as Record<Timeframe, TimeframeData>;

const contexts = buildV3Contexts({
  candles1h: fetched["1h"].candles,
  candles4h: fetched["4h"].candles,
});
const baselineSetups = generateV3BaselineSetups({
  candles: fetched["1h"].candles,
  timeframe: "1h",
  ...contexts,
  analysisStart: ANALYSIS_START,
});
const frozenEntries = filterV3Entries(baselineSetups, "QUALITY_PULLBACK_HTF")
  .map((entry) => annotateEntry(entry, fetched["1h"].candles, fetched["4h"].candles));
const officialTrades = evaluateV3Entries(
  fetched["1h"].candles,
  frozenEntries,
  frozen1hExitConfiguration(),
) as RobustnessTrade[];

const preDiscovery = officialTrades.filter((trade) => within(trade, {
  id: "PRE_DISCOVERY_EXTERNAL_TEMPORAL",
  start: BTC_ROBUSTNESS_START,
  end: BTC_DISCOVERY_ERA_START,
}));
const discoveryEra = officialTrades.filter((trade) => within(trade, {
  id: "DISCOVERY_ERA_CONTAMINATED",
  start: BTC_DISCOVERY_ERA_START,
  end: BTC_ROBUSTNESS_END,
}));

const sensitivity = frozenSensitivityGrid().map((configuration) => {
  const trades = evaluateV3Entries(fetched["1h"].candles, frozenEntries, configuration) as RobustnessTrade[];
  const pre = trades.filter((trade) => Date.parse(trade.robustness.evaluatedAt) < DISCOVERY_START.getTime());
  const discovered = trades.filter((trade) => Date.parse(trade.robustness.evaluatedAt) >= DISCOVERY_START.getTime());
  return {
    slAtr: configuration.atrMultiple,
    tpAtr: (configuration.atrMultiple ?? 0) * configuration.rewardRisk,
    rewardRisk: configuration.rewardRisk,
    expiryCandles: configuration.expiryCandles,
    officialPoint: configuration.atrMultiple === 1.5 && configuration.expiryCandles === 12,
    full5Bps: compactSummary(summarizeBacktest(trades, 5)),
    full10Bps: compactSummary(summarizeBacktest(trades, 10)),
    preDiscovery5Bps: compactSummary(summarizeBacktest(pre, 5)),
    discoveryEra5Bps: compactSummary(summarizeBacktest(discovered, 5)),
  };
});

const report = {
  metadata: {
    name: "TRENORO frozen BTCUSDT 1h robustness audit",
    hypothesisId: FROZEN_1H_HYPOTHESIS.id,
    configHash: FROZEN_1H_HYPOTHESIS_HASH,
    snapshotVerified: true,
    start: ANALYSIS_START.toISOString(),
    discoveryEraStart: DISCOVERY_START.toISOString(),
    end: ANALYSIS_END.toISOString(),
    provider: "Binance public BTCUSDT Spot klines",
    candlePolicy: FROZEN_1H_HYPOTHESIS.candlePolicy,
    fixedOfficialParameters: FROZEN_1H_HYPOTHESIS.exit,
    parametersRetuned: false,
    sensitivityProtocol: "Exactly SL 1.4/1.5/1.6 ATR x expiry 10/12/14, fixed R:R 1.5. Diagnostic surface only; no alternative may be promoted.",
    temporalProtocol: "Four independent non-overlapping two-year windows plus seven diagnostic two-year rolling windows stepped annually. No fitting occurs in any window.",
    monteCarloProtocol: "10,000 deterministic circular moving-block resamples of chronological 5 bps net-R, block length five.",
    liveStrategyChanged: false,
    databaseWrites: false,
    telegramCalls: false,
    forwardLedgerChanged: false,
  },
  dataQuality: {
    "1h": {
      ...validateCandleSeries(fetched["1h"].candles, INTERVAL_MS["1h"], ANALYSIS_END),
      incompleteExcluded: fetched["1h"].incompleteExcluded,
    },
    "4h": {
      ...validateCandleSeries(fetched["4h"].candles, INTERVAL_MS["4h"], ANALYSIS_END),
      incompleteExcluded: fetched["4h"].incompleteExcluded,
    },
  },
  official: {
    full: costStress(officialTrades),
    preDiscoveryExternalTemporal: costStress(preDiscovery),
    discoveryEraContaminated: costStress(discoveryEra),
    approximateBreakEvenBps: {
      full: approximateBreakEvenBps(officialTrades),
      preDiscoveryExternalTemporal: approximateBreakEvenBps(preDiscovery),
      discoveryEraContaminated: approximateBreakEvenBps(discoveryEra),
    },
  },
  regimes: {
    trend4hConfirmedAtEntry: (["BULLISH", "BEARISH", "SIDEWAYS", "UNAVAILABLE"] as const).map((regime) => ({
      regime,
      ...dualCostSummary(officialTrades.filter((trade) => trade.robustness.marketTrendRegime === regime)),
    })),
    volatility4hCausalAtEntry: (["HIGH", "NORMAL_OR_LOW", "UNAVAILABLE"] as const).map((regime) => ({
      regime,
      ...dualCostSummary(officialTrades.filter((trade) => trade.robustness.marketVolatilityRegime === regime)),
    })),
    note: "Trend and volatility are separate overlapping segmentations. Trend is latest confirmed 4h context. Volatility is the causal percentile of confirmed 4h realized range; HIGH is >=75th percentile, NORMAL_OR_LOW is below it.",
  },
  chronology: {
    independentTwoYear: independentTwoYearWindows().map((window) => windowSummary(window, officialTrades)),
    rollingTwoYearAnnualStep: rollingTwoYearWindows().map((window) => windowSummary(window, officialTrades)),
    aggregate: dualCostSummary(officialTrades),
    interpretationCaveat: "This is a locked-window audit, not a parameter-refitting walk-forward. Rolling windows overlap and therefore are not independent observations.",
  },
  sensitivity: {
    grid: sensitivity,
    positiveFullAt5Bps: sensitivity.filter((row) => positive(row.full5Bps)).length,
    positivePreDiscoveryAt5Bps: sensitivity.filter((row) => positive(row.preDiscovery5Bps)).length,
    positiveBothAt5Bps: sensitivity.filter((row) => positive(row.full5Bps) && positive(row.preDiscovery5Bps)).length,
    alternativesPromoted: false,
  },
  sequenceRisk: {
    full5Bps: deterministicBlockBootstrap({ trades: officialTrades, frictionBps: 5 }),
    preDiscoveryExternalTemporal5Bps: deterministicBlockBootstrap({ trades: preDiscovery, frictionBps: 5 }),
    limitations: "Signals are sparse, bootstrap blocks cannot recreate unseen regime transitions, and the discovery-era sample is selection-contaminated. Results quantify sequence/sample uncertainty rather than prove independence or stationarity.",
  },
};

console.log(JSON.stringify(roundDeep(report), null, 2));

function annotateEntry(
  entry: V3SetupEntry,
  candles1h: ClosedAnalysisCandle[],
  candles4h: ClosedAnalysisCandle[],
): RobustnessEntry {
  const entryCandle = candles1h[entry.entryIndex];
  if (entryCandle === undefined) throw new Error("Frozen entry references a missing 1h candle.");
  const evaluatedAt = entryCandle.closeTime;
  const contextIndex = latestClosedIndex(candles4h, Date.parse(evaluatedAt));
  const volatility = contextIndex < 0
    ? null
    : causalVolatilityRegime(candles4h.slice(Math.max(0, contextIndex - 199), contextIndex + 1)).volatilityRegimeAtEntry;
  return {
    ...entry,
    robustness: {
      evaluatedAt,
      marketTrendRegime: trendRegime(entry.referenceTrendAtEntry),
      marketVolatilityRegime: volatilityRegime(volatility),
    },
  };
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
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function trendRegime(value: BacktestTrade["referenceTrendAtEntry"]): MarketTrendRegime {
  if (value === "bullish") return "BULLISH";
  if (value === "bearish") return "BEARISH";
  if (value === "sideways") return "SIDEWAYS";
  return "UNAVAILABLE";
}

function volatilityRegime(value: VolatilityRegime | null): MarketVolatilityRegime {
  if (value === "HIGH") return "HIGH";
  if (value === "NORMAL" || value === "LOW") return "NORMAL_OR_LOW";
  return "UNAVAILABLE";
}

function costStress(trades: BacktestTrade[]) {
  return Object.fromEntries(BTC_ROBUSTNESS_COSTS_BPS.map((frictionBps) => [
    `${frictionBps}bps`,
    compactSummary(summarizeBacktest(trades, frictionBps)),
  ]));
}

function dualCostSummary(trades: BacktestTrade[]) {
  const five = summarizeBacktest(trades, 5);
  const ten = summarizeBacktest(trades, 10);
  return {
    signals: five.signals,
    wins: five.wins,
    losses: five.losses,
    expired: five.expired,
    fiveBps: compactSummary(five),
    tenBps: compactSummary(ten),
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
    consecutiveLosses: summary.consecutiveLosses,
  };
}

function windowSummary(window: FixedTimeWindow, trades: RobustnessTrade[]) {
  return {
    ...window,
    ...dualCostSummary(trades.filter((trade) => within(trade, window))),
  };
}

function within(trade: RobustnessTrade, window: FixedTimeWindow): boolean {
  const evaluatedAt = Date.parse(trade.robustness.evaluatedAt);
  return evaluatedAt >= Date.parse(window.start) && evaluatedAt < Date.parse(window.end);
}

function positive(summary: ReturnType<typeof compactSummary>): boolean {
  return (summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0 && (summary.profitFactor ?? 0) > 1;
}

async function fetchClosedCandles(
  timeframe: Timeframe,
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
  const actualHash = computeFrozen1hHypothesisHash();
  if (actualHash !== FROZEN_1H_HYPOTHESIS_HASH) {
    throw new Error(`Frozen hypothesis hash mismatch: expected ${FROZEN_1H_HYPOTHESIS_HASH}, got ${actualHash}.`);
  }
  if (process.argv.slice(2).length > 0) {
    throw new Error("The BTC robustness protocol accepts no runtime parameters.");
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
