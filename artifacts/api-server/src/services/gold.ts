import {
  getGoldMarketData as getGoldMarketDataTD,
  getGoldHistoricalCandlesCached,
  TwelveDataError,
  type GoldMarketData as TwelveGoldMarketData,
} from "./twelveData";
import { HistoricalTimeframe } from "./historical";

export type GoldMarketData = TwelveGoldMarketData;

export class GoldMarketDataError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 429 | 502 | 503 = 502,
  ) {
    super(message);
    this.name = "GoldMarketDataError";
  }
}

export async function getGoldMarketData(): Promise<GoldMarketData> {
  try {
    return await getGoldMarketDataTD();
  } catch (error) {
    if (error instanceof TwelveDataError) {
      throw new GoldMarketDataError(error.message, error.statusCode);
    }
    throw error;
  }
}

export async function getGoldHistoricalCandles(
  timeframe: HistoricalTimeframe,
  limit = 200,
) {
  try {
    return await getGoldHistoricalCandlesCached(timeframe, limit);
  } catch (error) {
    if (error instanceof TwelveDataError) {
      return {
        status: "UNAVAILABLE" as const,
        symbol: "XAUUSD" as const,
        timeframe,
        provider: "twelvedata" as const,
        candles: [] as [],
        availableTimeframes: [] as [],
        message: error.message,
      };
    }
    throw error;
  }
}