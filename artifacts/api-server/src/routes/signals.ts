import { Router, type IRouter } from "express";
import { getHistoricalCandles, parseHistoricalTimeframe } from "../services/historical";
import { calculateTechnicalAnalysis } from "../services/technical";
import { buildSignalDashboard } from "../services/signals";
import { COMMERCIAL_SIGNAL_TIMEFRAMES } from "../services/signal-engine";

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
    if (!(COMMERCIAL_SIGNAL_TIMEFRAMES as readonly string[]).includes(timeframe)) {
      res.status(400).json({ error: "Elegí una temporalidad disponible: 5m, 15m, 1h o 4h." });
      return;
    }
    const historyScope = typeof req.query.historyTimeframe === "string" ? req.query.historyTimeframe : timeframe;
    if (historyScope !== "all" && !(COMMERCIAL_SIGNAL_TIMEFRAMES as readonly string[]).includes(historyScope)) {
      res.status(400).json({ error: "El filtro de historial no es válido." });
      return;
    }
    const market = await getHistoricalCandles(symbol, timeframe, 200);
    if (market.status !== "OK") {
      res.status(503).json({ error: "Los datos de mercado no están disponibles temporalmente." });
      return;
    }
    const technical = calculateTechnicalAnalysis(market.candles, market.provider);
    const contexts = await Promise.all(COMMERCIAL_SIGNAL_TIMEFRAMES.map(async (candidate) => {
      if (candidate === timeframe) return [candidate, technical.marketStructure.trend] as const;
      const data = await getHistoricalCandles(symbol, candidate, 200);
      return [candidate, data.status === "OK" ? calculateTechnicalAnalysis(data.candles, data.provider).marketStructure.trend : null] as const;
    }));
    const { _internal: _runtimeOnly, ...dashboard } = await buildSignalDashboard({ symbol, timeframe, candles: market.candles, technical, historyTimeframe: historyScope === "all" ? null : historyScope, multiTimeframe: Object.fromEntries(contexts) });
    res.json(dashboard);
  } catch (error) {
    req.log.error({ err: error, symbol }, "Unable to build signal dashboard");
    res.status(502).json({ error: "No se pudo actualizar el motor de señales." });
  }
});

export default router;
