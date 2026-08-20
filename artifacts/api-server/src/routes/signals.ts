import { Router, type IRouter } from "express";
import { getHistoricalCandles, parseHistoricalTimeframe } from "../services/historical";
import { calculateTechnicalAnalysis } from "../services/technical";
import { buildSignalDashboard } from "../services/signals";

const router: IRouter = Router();

router.get("/signals/dashboard", async (req, res): Promise<void> => {
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol.trim().toUpperCase() : "BTCUSDT";
  if (symbol === "XAUUSD") {
    res.status(423).json({ error: "XAUUSD estará disponible próximamente." });
    return;
  }
  if (symbol !== "BTCUSDT") {
    res.status(400).json({ error: "El motor comercial V1 solo admite BTCUSDT." });
    return;
  }
  try {
    const timeframe = parseHistoricalTimeframe(typeof req.query.timeframe === "string" ? req.query.timeframe : undefined);
    const market = await getHistoricalCandles(symbol, timeframe, 200);
    if (market.status !== "OK") {
      res.status(503).json({ error: "Los datos de mercado no están disponibles temporalmente." });
      return;
    }
    const technical = calculateTechnicalAnalysis(market.candles, market.provider);
    res.json(await buildSignalDashboard({ symbol, timeframe, candles: market.candles, technical }));
  } catch (error) {
    req.log.error({ err: error, symbol }, "Unable to build signal dashboard");
    res.status(502).json({ error: "No se pudo actualizar el motor de señales." });
  }
});

export default router;
