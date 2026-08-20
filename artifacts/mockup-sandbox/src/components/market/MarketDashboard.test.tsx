import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getSignalDashboard: vi.fn(), healthCheck: vi.fn(), setBaseUrl: vi.fn() }));
vi.mock("@workspace/api-client-react", () => api);
import { MarketDashboard } from "./MarketDashboard";

const empty = { activeSignal: null, evaluation: "NO_SIGNAL", message: "Esperando una configuración válida.", context: { trend: "sideways", condition: "mixed", strength: "low" }, multiTimeframe: { trends: { "5m": "bullish", "15m": "bullish", "1h": "sideways", "4h": "bearish" }, alignedCount: 2, total: 4 }, metrics: { total: 0, wins: 0, losses: 0, winRate: null, lossRate: null, accumulatedReturnPct: null }, history: [] };
const active = { ...empty, activeSignal: { id: "signal-1", symbol: "BTCUSDT", timeframe: "15m", direction: "LONG", entryPrice: "95000", stopLoss: "94000", takeProfit: "96500", riskRewardRatio: "1.5", status: "OPEN", openedAt: "2026-01-01T00:00:00.000Z", closedAt: null, returnPct: null, result: "OPEN", strategyVersion: "NEXO_CONFLUENCE_V1", createdAt: "2026-01-01T00:00:00.000Z" }, evaluation: "LONG" };

function renderDashboard() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return render(<QueryClientProvider client={client}><MarketDashboard /></QueryClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); api.healthCheck.mockResolvedValue({ status: "ok" }); api.getSignalDashboard.mockResolvedValue(empty); });
afterEach(() => cleanup());

describe("commercial signal dashboard", () => {
  it("treats NO_SIGNAL as a normal professional state and invents no metrics", async () => { renderDashboard(); expect(await screen.findByText("SIN SEÑAL ACTIVA")).toBeTruthy(); expect(screen.getByText("El sistema está esperando una configuración técnica válida.")).toBeTruthy(); expect(screen.getAllByText("Aún no hay suficiente historial para calcular esta métrica.").length).toBeGreaterThan(0); expect(screen.queryByText(/90%|rentabilidad garantizada|win rate de ejemplo/i)).toBeNull(); });
  it("shows entry, SL, TP and R:R for a real active signal", async () => { api.getSignalDashboard.mockResolvedValue(active); renderDashboard(); expect(await screen.findByText("LONG")).toBeTruthy(); expect(screen.getByText("Entrada")).toBeTruthy(); expect(screen.getByText("Stop loss")).toBeTruthy(); expect(screen.getByText("Take profit")).toBeTruthy(); expect(screen.getByText("1:1,5")).toBeTruthy(); });
  it("does not expose EMA, RSI, ATR or Fibonacci details in the commercial dashboard", async () => { renderDashboard(); await screen.findByText("SIN SEÑAL ACTIVA"); for (const detail of ["EMA 20", "EMA 50", "RSI 14", "ATR 14", "Fibonacci"]) expect(screen.queryByText(detail)).toBeNull(); });
  it("shows real multi-timeframe classifications without equating trend to a signal", async () => { renderDashboard(); expect(await screen.findByText("SIN SEÑAL ACTIVA")).toBeTruthy(); expect(screen.getByLabelText("5m Alcista")).toBeTruthy(); expect(screen.getByLabelText("1h Lateral")).toBeTruthy(); expect(screen.getByText("2 de 4 temporalidades alineadas")).toBeTruthy(); });
  it("keeps BTC production-only and the selected timeframe changes the real request", async () => { renderDashboard(); await screen.findByText(/XAUUSD.*Próximamente/); fireEvent.click(screen.getAllByRole("button", { name: "1h" })[0]); await waitFor(() => expect(api.getSignalDashboard).toHaveBeenLastCalledWith("1h", "1h", expect.anything())); expect(screen.queryByRole("button", { name: "XAUUSD" })).toBeNull(); });
  it("filters metrics and history independently", async () => { renderDashboard(); await screen.findByText("SIN SEÑAL ACTIVA"); fireEvent.click(screen.getByRole("button", { name: "Todas" })); await waitFor(() => expect(api.getSignalDashboard).toHaveBeenLastCalledWith("15m", "all", expect.anything())); });
  it("contains mobile overflow and keeps controls touch friendly", async () => { Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 }); renderDashboard(); await screen.findByText("SIN SEÑAL ACTIVA"); expect(document.querySelector("main")?.className).toContain("overflow-x-hidden"); expect(screen.getAllByRole("button", { name: "5m" }).every((button) => button.className.includes("min-h-11"))).toBe(true); });
});
