import type { NextFunction, Request, Response } from "express";

type ProductRejection = {
  statusCode: 400 | 423;
  body: { error: string; symbol?: string; available?: false };
};

export function getCommercialProductRejection(query: Request["query"]): ProductRejection | null {
  const symbol = typeof query.symbol === "string" ? query.symbol.trim().toUpperCase() : "BTCUSDT";
  if (symbol === "XAUUSD") {
    return {
      statusCode: 423,
      body: {
        error: "XAUUSD estará disponible próximamente.",
        symbol,
        available: false,
      },
    };
  }

  const timeframe = typeof query.timeframe === "string" ? query.timeframe.trim() : undefined;
  if (timeframe === "1m") {
    return {
      statusCode: 400,
      body: { error: "La temporalidad 1m no forma parte del producto comercial. Usá 5m, 15m, 1h o 4h." },
    };
  }

  return null;
}

/** Keep future markets and internal-only timeframes closed at the API boundary. */
export function requireCommercialProductAvailability(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const rejection = getCommercialProductRejection(req.query);
  if (rejection) {
    res.status(rejection.statusCode).json(rejection.body);
    return;
  }
  next();
}
