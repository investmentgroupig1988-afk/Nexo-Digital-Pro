import { useQuery } from "@tanstack/react-query";
import {
  getHistoricalCandles,
  getMarketData,
  getTechnicalIndicators,
  healthCheck,
} from "@workspace/api-client-react";
import "@/lib/api";
import { refreshIntervalFor, type MarketSymbol, type MarketTimeframe } from "@/lib/market";

export function useMarketDashboard(symbol: MarketSymbol, timeframe: MarketTimeframe) {
  const analysisRefreshInterval = refreshIntervalFor(timeframe);

  const health = useQuery({
    queryKey: ["healthz"],
    queryFn: ({ signal }) => healthCheck({ signal }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const market = useQuery({
    queryKey: ["market", symbol],
    queryFn: ({ signal }) => getMarketData({ symbol }, { signal }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const candles = useQuery({
    queryKey: ["candles", symbol, timeframe, 200],
    queryFn: ({ signal }) =>
      getHistoricalCandles({ symbol, timeframe, limit: 200 }, { signal }),
    staleTime: Math.min(analysisRefreshInterval, 30_000),
    refetchInterval: analysisRefreshInterval,
  });

  const indicators = useQuery({
    queryKey: ["indicators", symbol, timeframe],
    queryFn: ({ signal }) => getTechnicalIndicators({ symbol, timeframe }, { signal }),
    staleTime: Math.min(analysisRefreshInterval, 30_000),
    refetchInterval: analysisRefreshInterval,
  });

  return { health, market, candles, indicators };
}
