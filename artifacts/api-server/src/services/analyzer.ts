import type { MarketCandle } from "./market";

export type MarketAnalysis = {
  currentPrice: number;
  previousPrice: number;
  priceChangePercent: number;
  sma: number;
  rsi: number;
  sampleSize: number;
  interval: string;
};

export type MarketSignal = {
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  price: number;
  analysis: MarketAnalysis;
};

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function calculateSma(closes: number[]): number {
  return closes.reduce((total, close) => total + close, 0) / closes.length;
}

function calculateRsi(closes: number[], period = 14): number {
  if (closes.length <= period) {
    return 50;
  }

  const changes = closes.slice(1).map((close, index) => close - closes[index]);
  const recentChanges = changes.slice(-period);
  const gains = recentChanges.filter((change) => change > 0);
  const losses = recentChanges.filter((change) => change < 0).map(Math.abs);
  const averageGain = gains.reduce((total, gain) => total + gain, 0) / period;
  const averageLoss = losses.reduce((total, loss) => total + loss, 0) / period;

  if (averageLoss === 0) {
    return averageGain === 0 ? 50 : 100;
  }

  return 100 - 100 / (1 + averageGain / averageLoss);
}

export function analyzeMarket(
  data: { price: number; candles: MarketCandle[] },
  interval = "1m",
): MarketSignal {
  const closes = data.candles.map((candle) => candle.close);
  const previousPrice = closes.at(-2) ?? data.price;
  const currentPrice = data.price;
  const priceChangePercent =
    previousPrice === 0 ? 0 : ((currentPrice - previousPrice) / previousPrice) * 100;
  const sma = calculateSma(closes);
  const rsi = calculateRsi(closes);

  let signal: MarketSignal["signal"] = "HOLD";
  let confidence = 50;

  if (currentPrice > sma && priceChangePercent > 0 && rsi < 70) {
    signal = "BUY";
    confidence = Math.min(95, Math.round(60 + Math.abs(priceChangePercent) * 10));
  } else if (currentPrice < sma && priceChangePercent < 0 && rsi > 30) {
    signal = "SELL";
    confidence = Math.min(95, Math.round(60 + Math.abs(priceChangePercent) * 10));
  }

  return {
    signal,
    confidence,
    price: currentPrice,
    analysis: {
      currentPrice: round(currentPrice),
      previousPrice: round(previousPrice),
      priceChangePercent: round(priceChangePercent),
      sma: round(sma),
      rsi: round(rsi),
      sampleSize: closes.length,
      interval,
    },
  };
}