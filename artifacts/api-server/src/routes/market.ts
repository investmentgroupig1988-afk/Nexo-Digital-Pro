import { Router, type IRouter } from "express";
import { GetMarketDataResponse } from "@workspace/api-zod";
import { getGoldMarketData, GoldMarketDataError } from "../services/gold";
import { getCryptoMarketData, validateSymbol } from "../services/market";

const router: IRouter = Router();

router.get("/market", async (req, res): Promise<void> => {
  const rawSymbol = typeof req.query.symbol === "string" ? req.query.symbol : "BTCUSDT";
  const symbol = rawSymbol.trim().toUpperCase();

  if (!validateSymbol(symbol)) {
    res.status(400).json({ error: "Invalid market symbol." });
    return;
  }

  try {
    const marketData =
      symbol === "XAUUSD"
        ? await getGoldMarketData()
        : await getCryptoMarketData(symbol);

    res.json(GetMarketDataResponse.parse(marketData));
  } catch (error) {
    req.log.error({ err: error, symbol }, "Unable to get market data");
    const statusCode = error instanceof GoldMarketDataError ? error.statusCode : 502;
    res.status(statusCode).json({
      error: error instanceof GoldMarketDataError
        ? error.message
        : "Market data is currently unavailable.",
      symbol,
      provider: symbol === "XAUUSD" ? "twelvedata" : "binance",
      available: false,
    });
  }
});

export default router;