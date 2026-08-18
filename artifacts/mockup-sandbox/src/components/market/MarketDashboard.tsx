import { useState } from "react";
import type { HistoricalCandles, TechnicalIndicatorsResponse } from "@workspace/api-client-react";
import { CandlestickChart } from "@/components/market/CandlestickChart";
import { useMarketDashboard } from "@/hooks/use-market-dashboard";
import {
  MARKET_SYMBOLS,
  MARKET_TIMEFRAMES,
  asRecord,
  formatBoolean,
  formatDirection,
  formatNumber,
  formatPrice,
  formatStructure,
  formatTimestamp,
  formatTrend,
  isMarketSymbol,
  isMarketTimeframe,
  recordBoolean,
  recordNumber,
  recordString,
  type MarketSymbol,
  type MarketTimeframe,
} from "@/lib/market";

const INDICATOR_FIELDS = [
  ["EMA 20", "ema20"],
  ["EMA 50", "ema50"],
  ["EMA 200", "ema200"],
  ["SMA 20", "sma20"],
  ["RSI 14", "rsi14"],
  ["ATR 14", "atr14"],
  ["Volumen actual", "volume"],
  ["Volumen medio", "averageVolume"],
  ["Ratio de volumen", "volumeRatio"],
  ["Máximo del período", "periodHigh"],
  ["Mínimo del período", "periodLow"],
] as const;

const FIBONACCI_LEVELS = ["0.236", "0.382", "0.5", "0.618", "0.786"] as const;

function errorMessage(scope: "market" | "history" | "indicators"): string {
  const labels = {
    market: "No se pudo obtener la cotización actual.",
    history: "No se pudieron obtener las velas históricas.",
    indicators: "No se pudieron calcular los indicadores técnicos.",
  } as const;
  return `${labels[scope]} Verificá la conexión con la API y reintentá.`;
}

function statusClass(status: "ok" | "pending" | "error" | "warning"): string {
  return {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    pending: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    warning: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  }[status];
}

function currentCandles(data: HistoricalCandles | undefined) {
  return data?.status === "OK" ? data.candles : [];
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20 ${className}`}>
      {children}
    </section>
  );
}

function Metric({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div aria-live="polite" className="flex min-h-40 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 text-sm text-slate-400">
      Cargando {label}…
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 text-center">
      <p className="max-w-md text-sm text-rose-100">{message}</p>
      <button className="rounded-lg border border-rose-300/40 px-3 py-1.5 text-sm font-medium text-rose-100 hover:bg-rose-500/15" onClick={onRetry} type="button">
        Reintentar
      </button>
    </div>
  );
}

export function MarketDashboard() {
  const [symbol, setSymbol] = useState<MarketSymbol>("BTCUSDT");
  const [timeframe, setTimeframe] = useState<MarketTimeframe>("15m");
  const { health, market, candles, indicators } = useMarketDashboard(symbol, timeframe);
  const technical = indicators.data;

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="mb-6 flex flex-col gap-5 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Nexo Digital Pro</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Panel de análisis de mercado</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Datos de mercado y análisis técnico informativo. No genera recomendaciones operativas ni ejecuta órdenes.
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-sm font-medium ${health.isSuccess ? statusClass("ok") : health.isError ? statusClass("error") : statusClass("pending")}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            {health.isSuccess ? "API conectada" : health.isError ? "API sin conexión" : "Conectando con la API"}
          </div>
        </header>

        <Card className="mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-300" htmlFor="market-symbol">
                Activo
                <select
                  className="min-w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-base text-white outline-none ring-cyan-400 transition focus:ring-2"
                  id="market-symbol"
                  onChange={(event) => {
                    if (isMarketSymbol(event.target.value)) setSymbol(event.target.value);
                  }}
                  value={symbol}
                >
                  {MARKET_SYMBOLS.map((marketSymbol) => <option key={marketSymbol} value={marketSymbol}>{marketSymbol}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-300" htmlFor="market-timeframe">
                Timeframe
                <select
                  className="min-w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-base text-white outline-none ring-cyan-400 transition focus:ring-2"
                  id="market-timeframe"
                  onChange={(event) => {
                    if (isMarketTimeframe(event.target.value)) setTimeframe(event.target.value);
                  }}
                  value={timeframe}
                >
                  {MARKET_TIMEFRAMES.map((marketTimeframe) => <option key={marketTimeframe} value={marketTimeframe}>{marketTimeframe}</option>)}
                </select>
              </label>
            </div>
            <p className="text-sm text-slate-400">
              Vista actual: <span className="font-semibold text-slate-100">{symbol} · {timeframe}</span>
            </p>
          </div>
        </Card>

        <section aria-label="Cotización actual" className="mb-6">
          {market.isPending ? <LoadingBlock label={`la cotización de ${symbol}`} /> : null}
          {market.isError ? <ErrorBlock message={errorMessage("market")} onRetry={() => void market.refetch()} /> : null}
          {market.data ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label={`Precio actual · ${market.data.symbol}`} value={formatPrice(market.data.price, symbol)} />
              <Metric label="Proveedor" value={market.data.provider} />
              <Metric label="Actualizado" value={formatTimestamp(market.data.updatedAt)} />
              <Metric label="Moneda" value={market.data.currency} />
              <Metric label="Unidad" value={market.data.unit === "troy_ounce" ? "Onza troy" : "Activo base"} />
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(310px,0.8fr)]">
          <Card>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Velas OHLCV reales</h2>
                <p className="mt-1 text-sm text-slate-400">{symbol} · {timeframe} · hasta 200 velas</p>
              </div>
              {candles.data?.status === "OK" ? <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass("ok")}`}>Proveedor: {candles.data.provider}</span> : null}
            </div>
            {candles.isPending ? <LoadingBlock label={`las velas de ${symbol} en ${timeframe}`} /> : null}
            {candles.isError ? <ErrorBlock message={errorMessage("history")} onRetry={() => void candles.refetch()} /> : null}
            {candles.data?.status === "UNAVAILABLE" ? (
              <div role="status" className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5">
                <p className="font-semibold text-orange-100">Velas no disponibles</p>
                <p className="mt-1 text-sm text-orange-100/80">{candles.data.message}</p>
              </div>
            ) : null}
            {candles.data?.status === "OK" ? <CandlestickChart candles={currentCandles(candles.data)} symbol={symbol} timeframe={timeframe} /> : null}
          </Card>

          <div className="space-y-6">
            <IndicatorsCard data={technical} isError={indicators.isError} isPending={indicators.isPending} onRetry={() => void indicators.refetch()} />
            <DataQualityCard data={technical} />
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <FibonacciCard data={technical} />
          <StructureCard data={technical} />
        </section>
      </div>
    </main>
  );
}

function IndicatorsCard({ data, isPending, isError, onRetry }: {
  data: TechnicalIndicatorsResponse | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const values = asRecord(data?.indicators);
  return (
    <Card>
      <h2 className="text-lg font-semibold text-white">Indicadores técnicos</h2>
      <p className="mt-1 text-sm text-slate-400">Calculados por la API para el activo y timeframe actuales.</p>
      {isPending ? <div className="mt-4"><LoadingBlock label="los indicadores" /></div> : null}
      {isError ? <div className="mt-4"><ErrorBlock message={errorMessage("indicators")} onRetry={onRetry} /></div> : null}
      {data?.status === "UNAVAILABLE" ? <UnavailableMessage message={data.message} /> : null}
      {data?.status === "INSUFFICIENT_DATA" ? <InsufficientMessage message={data.message} /> : null}
      {data ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INDICATOR_FIELDS.map(([label, key]) => <Metric key={key} label={label} value={formatNumber(recordNumber(values, key))} />)}
        </div>
      ) : null}
    </Card>
  );
}

function DataQualityCard({ data }: { data: TechnicalIndicatorsResponse | undefined }) {
  const quality = asRecord(data?.dataQuality);
  const sufficient = recordBoolean(quality, "sufficient");
  const reason = recordString(quality, "reason") ?? data?.message ?? "No disponible";
  const qualityStatus = sufficient === true ? "ok" : data?.status === "UNAVAILABLE" ? "error" : "warning";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Calidad de datos</h2>
          <p className="mt-1 text-sm text-slate-400">Estado informado por la API.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(qualityStatus)}`}>
          {sufficient === true ? "Suficiente" : "Requiere atención"}
        </span>
      </div>
      {data?.status === "INSUFFICIENT_DATA" ? <InsufficientMessage message={data.message} /> : null}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Metric label="sufficient" value={formatBoolean(sufficient)} />
        <Metric label="candleCount" value={formatNumber(recordNumber(quality, "candleCount"), { maximumFractionDigits: 0 })} />
        <Metric label="volumeAvailable" value={formatBoolean(recordBoolean(quality, "volumeAvailable"))} />
        <Metric label="provider" value={recordString(quality, "provider") ?? "No disponible"} />
      </dl>
      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">reason</p>
        <p className="mt-1 text-sm text-slate-300">{reason}</p>
      </div>
    </Card>
  );
}

function FibonacciCard({ data }: { data: TechnicalIndicatorsResponse | undefined }) {
  const fibonacci = asRecord(data?.fibonacci);
  const levels = asRecord(fibonacci?.levels);
  return (
    <Card>
      <h2 className="text-lg font-semibold text-white">Fibonacci</h2>
      <p className="mt-1 text-sm text-slate-400">Valores calculados por el backend sobre las velas recibidas.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="swingHigh" value={formatNumber(recordNumber(fibonacci, "swingHigh"))} />
        <Metric label="swingLow" value={formatNumber(recordNumber(fibonacci, "swingLow"))} />
        <Metric label="direction" value={formatDirection(recordString(fibonacci, "direction"))} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {FIBONACCI_LEVELS.map((level) => <Metric key={level} label={level} value={formatNumber(recordNumber(levels, level))} />)}
      </div>
    </Card>
  );
}

function StructureCard({ data }: { data: TechnicalIndicatorsResponse | undefined }) {
  const structure = asRecord(data?.marketStructure);
  return (
    <Card>
      <h2 className="text-lg font-semibold text-white">Estructura de mercado</h2>
      <p className="mt-1 text-sm text-slate-400">Presentación legible y valores originales entre paréntesis cuando existen.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Metric label="trend" value={formatTrend(recordString(structure, "trend"))} />
        <Metric label="structure" value={formatStructure(recordString(structure, "structure"))} />
        <Metric label="higherHigh" value={formatBoolean(recordBoolean(structure, "higherHigh"))} />
        <Metric label="higherLow" value={formatBoolean(recordBoolean(structure, "higherLow"))} />
        <Metric label="lowerHigh" value={formatBoolean(recordBoolean(structure, "lowerHigh"))} />
        <Metric label="lowerLow" value={formatBoolean(recordBoolean(structure, "lowerLow"))} />
        <Metric label="support" value={formatNumber(recordNumber(structure, "support"))} />
        <Metric label="resistance" value={formatNumber(recordNumber(structure, "resistance"))} />
      </div>
    </Card>
  );
}

function InsufficientMessage({ message }: { message: string | null }) {
  return (
    <div role="status" className="mt-4 rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 text-sm text-orange-100">
      <span className="font-semibold">Datos históricos insuficientes. </span>
      {message ?? "La API no informó un motivo adicional."}
    </div>
  );
}

function UnavailableMessage({ message }: { message: string | null }) {
  return (
    <div role="status" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-100">
      <span className="font-semibold">Datos no disponibles. </span>
      {message ?? "La API no informó un motivo adicional."}
    </div>
  );
}
