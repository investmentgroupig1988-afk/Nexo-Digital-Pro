import type { HistoricalCandle } from "./historical";

const EMA_PERIODS = [20, 50, 200] as const;
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const VOLUME_PERIOD = 20;
const PIVOT_LOOKAROUND = 2;
const ROUNDING = 8;

type NullableIndicators = {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  sma20: number | null;
  rsi14: number | null;
  atr14: number | null;
  volume: number | null;
  averageVolume: number | null;
  volumeRatio: number | null;
  periodHigh: number | null;
  periodLow: number | null;
};

type NullableFibonacci = {
  swingHigh: number | null;
  swingLow: number | null;
  direction: "uptrend" | "downtrend" | null;
  levels: {
    "0.236": number | null;
    "0.382": number | null;
    "0.5": number | null;
    "0.618": number | null;
    "0.786": number | null;
  };
};

type NullableStructure = {
  trend: "bullish" | "bearish" | "sideways" | null;
  structure:
    | "higher_high_and_higher_low"
    | "lower_high_and_lower_low"
    | "mixed"
    | null;
  higherHigh: boolean | null;
  higherLow: boolean | null;
  lowerHigh: boolean | null;
  lowerLow: boolean | null;
  support: number | null;
  resistance: number | null;
};

export type TechnicalAnalysisResult = {
  status: "OK" | "INSUFFICIENT_DATA";
  message: string | null;
  indicators: NullableIndicators;
  fibonacci: NullableFibonacci;
  marketStructure: NullableStructure;
  dataQuality: {
    sufficient: boolean;
    candleCount: number;
    volumeAvailable: boolean;
    provider: "binance" | "twelvedata";
    reason: string | null;
  };
};

function round(value: number): number {
  const factor = 10 ** ROUNDING;
  return Math.round(value * factor) / factor;
}

function emptyIndicators(): NullableIndicators {
  return {
    ema20: null,
    ema50: null,
    ema200: null,
    sma20: null,
    rsi14: null,
    atr14: null,
    volume: null,
    averageVolume: null,
    volumeRatio: null,
    periodHigh: null,
    periodLow: null,
  };
}

function emptyFibonacci(): NullableFibonacci {
  return {
    swingHigh: null,
    swingLow: null,
    direction: null,
    levels: {
      "0.236": null,
      "0.382": null,
      "0.5": null,
      "0.618": null,
      "0.786": null,
    },
  };
}

function emptyStructure(): NullableStructure {
  return {
    trend: null,
    structure: null,
    higherHigh: null,
    higherLow: null,
    lowerHigh: null,
    lowerLow: null,
    support: null,
    resistance: null,
  };
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) {
    current = (value - current) * multiplier + current;
  }
  return round(current);
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }
  return round(values.slice(-period).reduce((sum, value) => sum + value, 0) / period);
}

function rsi(values: number[], period: number): number | null {
  if (values.length <= period) {
    return null;
  }

  const changes = values.slice(1).map((value, index) => value - values[index]);
  let gains = changes.slice(0, period).filter((change) => change > 0);
  let losses = changes.slice(0, period).filter((change) => change < 0).map(Math.abs);
  let averageGain = gains.reduce((sum, value) => sum + value, 0) / period;
  let averageLoss = losses.reduce((sum, value) => sum + value, 0) / period;

  for (const change of changes.slice(period)) {
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }

  if (averageLoss === 0) {
    return averageGain === 0 ? 50 : 100;
  }
  return round(100 - 100 / (1 + averageGain / averageLoss));
}

function atr(candles: HistoricalCandle[], period: number): number | null {
  if (candles.length <= period) {
    return null;
  }

  const trueRanges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  let current = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of trueRanges.slice(period)) {
    current = (current * (period - 1) + value) / period;
  }
  return round(current);
}

function volumeMetrics(candles: HistoricalCandle[]): Pick<
  NullableIndicators,
  "volume" | "averageVolume" | "volumeRatio"
> {
  const recent = candles.slice(-VOLUME_PERIOD);
  if (recent.length < VOLUME_PERIOD || recent.some((candle) => candle.volume === null)) {
    return { volume: null, averageVolume: null, volumeRatio: null };
  }

  const volumes = recent.map((candle) => candle.volume as number);
  const averageVolume = volumes.reduce((sum, value) => sum + value, 0) / volumes.length;
  return {
    volume: round(volumes.at(-1) as number),
    averageVolume: round(averageVolume),
    volumeRatio: averageVolume === 0 ? null : round((volumes.at(-1) as number) / averageVolume),
  };
}

function fibonacci(candles: HistoricalCandle[]): NullableFibonacci {
  let highIndex = 0;
  let lowIndex = 0;
  candles.forEach((candle, index) => {
    if (candle.high > candles[highIndex].high) highIndex = index;
    if (candle.low < candles[lowIndex].low) lowIndex = index;
  });

  const swingHigh = candles[highIndex].high;
  const swingLow = candles[lowIndex].low;
  const range = swingHigh - swingLow;
  if (!Number.isFinite(range) || range <= 0) {
    return emptyFibonacci();
  }

  const direction = lowIndex < highIndex ? "uptrend" : "downtrend";
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const levels = Object.fromEntries(
    ratios.map((ratio) => [
      ratio.toString(),
      round(direction === "uptrend" ? swingHigh - range * ratio : swingLow + range * ratio),
    ]),
  ) as NullableFibonacci["levels"];

  return {
    swingHigh: round(swingHigh),
    swingLow: round(swingLow),
    direction,
    levels,
  };
}

function structure(
  candles: HistoricalCandle[],
  indicators: NullableIndicators,
): NullableStructure {
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  for (let index = PIVOT_LOOKAROUND; index < candles.length - PIVOT_LOOKAROUND; index += 1) {
    const candle = candles[index];
    const surrounding = candles.slice(index - PIVOT_LOOKAROUND, index + PIVOT_LOOKAROUND + 1);
    if (surrounding.every((other) => candle.high >= other.high)) pivotHighs.push(index);
    if (surrounding.every((other) => candle.low <= other.low)) pivotLows.push(index);
  }

  const previousHigh = pivotHighs.at(-2);
  const latestHigh = pivotHighs.at(-1);
  const previousLow = pivotLows.at(-2);
  const latestLow = pivotLows.at(-1);
  if (
    previousHigh === undefined ||
    latestHigh === undefined ||
    previousLow === undefined ||
    latestLow === undefined ||
    indicators.ema20 === null ||
    indicators.ema50 === null
  ) {
    return emptyStructure();
  }

  const higherHigh = candles[latestHigh].high > candles[previousHigh].high;
  const higherLow = candles[latestLow].low > candles[previousLow].low;
  const lowerHigh = candles[latestHigh].high < candles[previousHigh].high;
  const lowerLow = candles[latestLow].low < candles[previousLow].low;
  const trend =
    candles.at(-1)!.close > indicators.ema20 && indicators.ema20 > indicators.ema50
      ? "bullish"
      : candles.at(-1)!.close < indicators.ema20 && indicators.ema20 < indicators.ema50
        ? "bearish"
        : "sideways";
  const structure =
    higherHigh && higherLow
      ? "higher_high_and_higher_low"
      : lowerHigh && lowerLow
        ? "lower_high_and_lower_low"
        : "mixed";
  const recent = candles.slice(-VOLUME_PERIOD);

  return {
    trend,
    structure,
    higherHigh,
    higherLow,
    lowerHigh,
    lowerLow,
    support: round(Math.min(...recent.map((candle) => candle.low))),
    resistance: round(Math.max(...recent.map((candle) => candle.high))),
  };
}

export function calculateTechnicalAnalysis(
  candles: HistoricalCandle[],
  provider: "binance" | "twelvedata",
): TechnicalAnalysisResult {
  const enoughData = candles.length >= 200;
  const dataQuality = {
    sufficient: enoughData,
    candleCount: candles.length,
    volumeAvailable: candles.length > 0 && candles.every((candle) => candle.volume !== null),
    provider,
    reason: enoughData
      ? null
      : `At least 200 real candles are required for EMA 200; received ${candles.length}.`,
  };

  if (!enoughData) {
    return {
      status: "INSUFFICIENT_DATA",
      message: dataQuality.reason,
      indicators: emptyIndicators(),
      fibonacci: emptyFibonacci(),
      marketStructure: emptyStructure(),
      dataQuality,
    };
  }

  const closes = candles.map((candle) => candle.close);
  const indicators: NullableIndicators = {
    ema20: ema(closes, EMA_PERIODS[0]),
    ema50: ema(closes, EMA_PERIODS[1]),
    ema200: ema(closes, EMA_PERIODS[2]),
    sma20: sma(closes, 20),
    rsi14: rsi(closes, RSI_PERIOD),
    atr14: atr(candles, ATR_PERIOD),
    ...volumeMetrics(candles),
    periodHigh: round(Math.max(...candles.map((candle) => candle.high))),
    periodLow: round(Math.min(...candles.map((candle) => candle.low))),
  };

  return {
    status: "OK",
    message: null,
    indicators,
    fibonacci: fibonacci(candles),
    marketStructure: structure(candles, indicators),
    dataQuality: {
      ...dataQuality,
      reason: indicators.volume === null ? "Volume is not available for all requested candles." : null,
    },
  };
}