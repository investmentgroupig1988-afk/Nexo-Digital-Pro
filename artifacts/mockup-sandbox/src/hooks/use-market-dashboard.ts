import { useQuery } from "@tanstack/react-query";
import { getSignalDashboard, healthCheck } from "@workspace/api-client-react";
import "@/lib/api";
import { refreshIntervalFor, type MarketTimeframe } from "@/lib/market";

export function useMarketDashboard(timeframe: MarketTimeframe, historyTimeframe: MarketTimeframe | "all") {
  const refreshInterval = refreshIntervalFor(timeframe);
  const health = useQuery({ queryKey: ["healthz"], queryFn: ({ signal }) => healthCheck({ signal }), staleTime: 30_000, refetchInterval: 60_000 });
  const dashboard = useQuery({
    queryKey: ["signal-dashboard", "BTCUSDT", timeframe, historyTimeframe],
    queryFn: ({ signal }) => getSignalDashboard(timeframe, historyTimeframe, signal),
    staleTime: Math.min(refreshInterval, 30_000),
    refetchInterval: refreshInterval,
  });
  return { health, dashboard };
}
