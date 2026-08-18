import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getHistoricalCandles: vi.fn(),
  getMarketData: vi.fn(),
  getTechnicalIndicators: vi.fn(),
  healthCheck: vi.fn(),
  setBaseUrl: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => api);

import { MarketDashboard } from "./MarketDashboard";
import { configureApiClient } from "@/lib/api";

function indicators(status: "OK" | "INSUFFICIENT_DATA" | "UNAVAILABLE" = "OK") {
  return {
    status,
    message: status === "INSUFFICIENT_DATA" ? "At least 200 real candles are required." : null,
    symbol: "BTCUSDT",
    timeframe: "15m",
    timestamp: "2026-01-01T00:00:00.000Z",
    price: 95_000,
    candlesUsed: status === "INSUFFICIENT_DATA" ? 10 : 200,
    indicators: {
      ema20: null,
      ema50: 94_000,
      ema200: null,
      sma20: 94_500,
      rsi14: null,
      atr14: 120,
      volume: null,
      averageVolume: 42,
      volumeRatio: null,
      periodHigh: 97_000,
      periodLow: 91_000,
    },
    fibonacci: {
      swingHigh: null,
      swingLow: null,
      direction: null,
      levels: { "0.236": null, "0.382": null, "0.5": null, "0.618": null, "0.786": null },
    },
    marketStructure: {
      trend: null,
      structure: null,
      higherHigh: null,
      higherLow: null,
      lowerHigh: null,
      lowerLow: null,
      support: null,
      resistance: null,
    },
    dataQuality: {
      sufficient: status === "OK",
      candleCount: status === "OK" ? 200 : 10,
      volumeAvailable: false,
      provider: "binance",
      reason: status === "INSUFFICIENT_DATA" ? "At least 200 real candles are required." : "Volume is not available.",
    },
  };
}

function candles(symbol = "BTCUSDT", timeframe = "15m") {
  return {
    status: "OK",
    symbol,
    timeframe,
    provider: symbol === "XAUUSD" ? "twelvedata" : "binance",
    candles: [
      { timestamp: "2026-01-01T00:00:00.000Z", open: 90_000, high: 92_000, low: 89_000, close: 91_000, volume: 22 },
      { timestamp: "2026-01-01T00:15:00.000Z", open: 91_000, high: 96_000, low: 90_000, close: 95_000, volume: 24 },
    ],
    availableTimeframes: ["1m", "5m", "15m", "1h", "4h"],
    message: null,
  };
}

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MarketDashboard />
    </QueryClientProvider>,
  );
}

function configureSuccessfulApi() {
  api.healthCheck.mockResolvedValue({ status: "ok" });
  api.getMarketData.mockImplementation(({ symbol }: { symbol: string }) => Promise.resolve({
    symbol,
    price: symbol === "XAUUSD" ? 2_900 : 95_000,
    currency: "USD",
    unit: symbol === "XAUUSD" ? "troy_ounce" : "base_asset",
    provider: symbol === "XAUUSD" ? "twelvedata" : "binance",
    assetClass: symbol === "XAUUSD" ? "gold" : "crypto",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
  api.getHistoricalCandles.mockImplementation(({ symbol, timeframe }: { symbol: string; timeframe: string }) => Promise.resolve(candles(symbol, timeframe)));
  api.getTechnicalIndicators.mockResolvedValue(indicators());
}

beforeEach(() => {
  vi.clearAllMocks();
  configureSuccessfulApi();
});

afterEach(() => cleanup());

describe("MarketDashboard", () => {
  it("renders a loading state while market requests are pending", () => {
    api.healthCheck.mockReturnValue(new Promise(() => undefined));
    api.getMarketData.mockReturnValue(new Promise(() => undefined));
    api.getHistoricalCandles.mockReturnValue(new Promise(() => undefined));
    api.getTechnicalIndicators.mockReturnValue(new Promise(() => undefined));

    renderDashboard();

    expect(screen.getByText("Cargando la cotización de BTCUSDT…")).toBeTruthy();
    expect(screen.getByText("Cargando las velas de BTCUSDT en 15m…")).toBeTruthy();
  });

  it("shows a safe error state when the API fails", async () => {
    api.getMarketData.mockRejectedValue(new Error("internal provider details"));

    renderDashboard();

    expect(await screen.findByText("No se pudo obtener la cotización actual. Verificá la conexión con la API y reintentá.")).toBeTruthy();
    expect(screen.queryByText("internal provider details")).toBeNull();
  });

  it("uses current symbol and timeframe in independent API requests", async () => {
    renderDashboard();
    await screen.findByText("Proveedor: binance");

    fireEvent.change(screen.getByLabelText("Activo"), { target: { value: "XAUUSD" } });
    await waitFor(() => expect(api.getMarketData).toHaveBeenLastCalledWith({ symbol: "XAUUSD" }, expect.anything()));
    await waitFor(() => expect(api.getHistoricalCandles).toHaveBeenLastCalledWith({ symbol: "XAUUSD", timeframe: "15m", limit: 200 }, expect.anything()));

    fireEvent.change(screen.getByLabelText("Timeframe"), { target: { value: "1h" } });
    await waitFor(() => expect(api.getHistoricalCandles).toHaveBeenLastCalledWith({ symbol: "XAUUSD", timeframe: "1h", limit: 200 }, expect.anything()));
    await waitFor(() => expect(api.getTechnicalIndicators).toHaveBeenLastCalledWith({ symbol: "XAUUSD", timeframe: "1h" }, expect.anything()));
  });

  it("exposes insufficient historical data and renders null metrics as unavailable", async () => {
    api.getTechnicalIndicators.mockResolvedValue(indicators("INSUFFICIENT_DATA"));

    renderDashboard();

    expect((await screen.findAllByText(/Datos históricos insuficientes/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("No disponible").length).toBeGreaterThan(1);
  });

  it("configures a separately hosted API only through the shared client", () => {
    configureApiClient("https://api.example.com/");
    expect(api.setBaseUrl).toHaveBeenLastCalledWith("https://api.example.com/");
  });
});
