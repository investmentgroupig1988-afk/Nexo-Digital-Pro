import { Router, type IRouter } from "express";
import { GetMarketSignalResponse } from "@workspace/api-zod";
import { getMarketSignal } from "../services/market-cache";
import { validateSymbol } from "../services/market";
import { getGoldMarketData, GoldMarketDataError } from "../services/gold";

const router: IRouter = Router();

router.get("/signal", async (req, res): Promise<void> => {
  const rawSymbol = typeof req.query.symbol === "string" ? req.query.symbol : "BTCUSDT";
  const symbol = rawSymbol.trim().toUpperCase();

  if (!validateSymbol(symbol)) {
    res.status(400).json({ error: "Invalid symbol. Use a Binance symbol such as BTCUSDT." });
    return;
  }

  try {
    if (symbol === "XAUUSD") {
      res.json(GetMarketSignalResponse.parse(await getGoldMarketData()));
      return;
    }

    const signal = await getMarketSignal(symbol);
    res.json(
      GetMarketSignalResponse.parse({
        symbol,
        ...signal,
      }),
    );
  } catch (error) {
    req.log.error({ err: error, symbol }, "Unable to get market signal");
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
