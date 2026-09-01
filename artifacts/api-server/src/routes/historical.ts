import { Router, type IRouter } from "express";
import {
  getHistoricalCandles,
  parseHistoricalLimit,
  parseHistoricalTimeframe,
  type HistoricalDataResult,
} from "../services/historical";
import {
  calculateTechnicalAnalysis,
  type TechnicalAnalysisResult,
} from "../services/technical";
import { HistoricalDataError } from "../services/historical";
import {
  GetHistoricalCandlesResponse,
  GetTechnicalIndicatorsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseSymbol(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "BTCUSDT";
}

function unavailableIndicators(
  data: Extract<HistoricalDataResult, { status: "UNAVAILABLE" }>,
): Record<string, unknown> {
  return {
    status: "UNAVAILABLE",
    message: data.message,
    symbol: data.symbol,
    timeframe: data.timeframe,
    timestamp: null,
    price: null,
    candlesUsed: 0,
    indicators: null,
    fibonacci: null,
    marketStructure: null,
    dataQuality: {
      sufficient: false,
      candleCount: 0,
      volumeAvailable: false,
      provider: data.provider,
      reason: data.message,
    },
  };
}

function indicatorResponse(
  symbol: string,
  timeframe: string,
  candles: Extract<HistoricalDataResult, { status: "OK" }>["candles"],
  technical: TechnicalAnalysisResult,
): Record<string, unknown> {
  const latest = candles.at(-1);
  return {
    symbol,
    timeframe,
    timestamp: latest?.timestamp ?? null,
    price: latest?.close ?? null,
    candlesUsed: candles.length,
    ...technical,
  };
}

router.get("/candles", async (req, res): Promise<void> => {
  const symbol = parseSymbol(req.query.symbol);

  try {
    const timeframe = parseHistoricalTimeframe(
      typeof req.query.timeframe === "string" ? req.query.timeframe : undefined,
    );
    const limit = parseHistoricalLimit(
      typeof req.query.limit === "string" ? req.query.limit : undefined,
    );
    const result = await getHistoricalCandles(symbol, timeframe, limit);
    res.json(GetHistoricalCandlesResponse.parse(result));
  } catch (error) {
    if (error instanceof HistoricalDataError) {
      res.status(error.statusCode).json({
        status: "ERROR",
        symbol,
        error: error.message,
      });
      return;
    }

    req.log.error({ err: error, symbol }, "Unable to get historical candles");
    res.status(502).json({
      status: "ERROR",
      symbol,
      error: "Historical market data is currently unavailable.",
    });
  }
});

router.get("/indicators", async (req, res): Promise<void> => {
  const symbol = parseSymbol(req.query.symbol);

  try {
    const timeframe = parseHistoricalTimeframe(
      typeof req.query.timeframe === "string" ? req.query.timeframe : undefined,
    );
    const result = await getHistoricalCandles(symbol, timeframe, 200);

    if (result.status === "UNAVAILABLE") {
      res.json(GetTechnicalIndicatorsResponse.parse(unavailableIndicators(result)));
      return;
    }

    const technical = calculateTechnicalAnalysis(result.candles, result.provider);
    res.json(
      GetTechnicalIndicatorsResponse.parse(
        indicatorResponse(symbol, timeframe, result.candles, technical),
      ),
    );
  } catch (error) {
    if (error instanceof HistoricalDataError) {
      res.status(error.statusCode).json({
        status: "ERROR",
        symbol,
        error: error.message,
      });
      return;
    }

    req.log.error({ err: error, symbol }, "Unable to calculate technical indicators");
    res.status(502).json({
      status: "ERROR",
      symbol,
      error: "Historical market data is currently unavailable.",
    });
  }
});

export default router;
