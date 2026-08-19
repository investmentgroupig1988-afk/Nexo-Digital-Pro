import { useState, type ReactNode } from "react";
import type { TechnicalIndicatorsResponse } from "@workspace/api-client-react";
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

type StatusTone = "ok" | "pending" | "error" | "warning";

function errorMessage(scope: "market" | "indicators"): string {
  const labels = {
    market: "No se pudo obtener la cotización actual.",
    indicators: "No se pudo obtener el análisis técnico.",
  } as const;
  return `${labels[scope]} Verificá la conexión con la API y reintentá.`;
}

function statusClass(status: StatusTone): string {
  return {
    ok: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    pending: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    error: "border-rose-400/25 bg-rose-400/10 text-rose-100",
    warning: "border-orange-300/25 bg-orange-300/10 text-orange-100",
  }[status];
}

function providerLabel(provider: string | null | undefined): string {
  const labels: Record<string, string> = {
    binance: "Binance",
    twelvedata: "Twelve Data",
  };
  return provider ? (labels[provider.toLowerCase()] ?? provider) : "No disponible";
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/8 bg-slate-950/55 p-5 shadow-[0_16px_50px_rgba(0,0,0,0.22)] backdrop-blur-sm sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

function Metric({ label, value, description, emphasis = false }: {
  label: string;
  value: string;
  description?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/7 bg-[#090c18]/80 px-3.5 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1.5 break-words font-semibold text-slate-100 ${emphasis ? "text-2xl tracking-tight" : "text-sm"}`}>{value}</p>
      {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div aria-live="polite" className="flex min-h-40 items-center justify-center rounded-xl border border-white/8 bg-[#090c18]/70 text-sm text-slate-400">
      <span className="mr-3 h-2 w-2 animate-pulse rounded-full bg-violet-300" />
      Cargando {label}…
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-rose-400/25 bg-rose-400/5 p-5 text-center">
      <p className="max-w-md text-sm text-rose-100">{message}</p>
      <button className="rounded-lg border border-rose-200/35 px-3 py-1.5 text-sm font-medium text-rose-100 transition hover:bg-rose-400/15 focus:outline-none focus:ring-2 focus:ring-rose-300" onClick={onRetry} type="button">
        Reintentar
      </button>
    </div>
  );
}

type MarketDashboardProps = {
  onAccount?: () => void;
  onAdmin?: () => void;
  onLogout?: () => void;
};

export function MarketDashboard({ onAccount, onAdmin, onLogout }: MarketDashboardProps) {
  const [symbol, setSymbol] = useState<MarketSymbol>("BTCUSDT");
  const [timeframe, setTimeframe] = useState<MarketTimeframe>("15m");
  const { health, market, indicators } = useMarketDashboard(symbol, timeframe);
  const technical = indicators.data;

  const connectionTone: StatusTone = health.isSuccess ? "ok" : health.isError ? "error" : "pending";
  const connectionLabel = health.isSuccess ? "Sistema activo · API conectada" : health.isError ? "API sin conexión" : "Verificando sistema";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070812] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.2),transparent_62%)]" />
      <div className="relative mx-auto max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <header className="mb-6 rounded-2xl border border-white/8 bg-[#0b0d1b]/85 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-md sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-300/30 bg-violet-500/15 text-lg font-bold text-violet-100 shadow-[0_0_28px_rgba(139,92,246,0.26)]">N</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-[0.18em] text-white">NEXO DIGITAL PRO</p>
                <p className="mt-0.5 text-xs text-slate-500">Inteligencia de mercado</p>
              </div>
            </div>

            <nav aria-label="Navegación principal" className="order-3 flex gap-1 overflow-x-auto pb-1 lg:order-none lg:pb-0">
              <span aria-current="page" className="shrink-0 rounded-lg bg-violet-400/15 px-3 py-2 text-sm font-semibold text-violet-100">Dashboard</span>
              <span aria-disabled="true" className="shrink-0 cursor-not-allowed rounded-lg px-3 py-2 text-sm text-slate-600" title="Disponible en una fase futura">Historial</span>
              {onAccount ? <button className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/6 hover:text-white" onClick={onAccount} type="button">Cuenta</button> : <span aria-disabled="true" className="shrink-0 cursor-not-allowed rounded-lg px-3 py-2 text-sm text-slate-600">Cuenta</span>}
              {onAdmin ? <button className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-violet-200 transition hover:bg-violet-300/10" onClick={onAdmin} type="button">Admin</button> : null}
            </nav>

            <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClass(connectionTone)}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {connectionLabel}
            </div>
            {onLogout ? <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/6" onClick={onLogout} type="button">Cerrar sesión</button> : null}
          </div>
        </header>

        <section className="mb-6 overflow-hidden rounded-2xl border border-violet-300/15 bg-gradient-to-br from-violet-500/15 via-[#101326] to-[#0b0d1b] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">Visión de mercado</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Análisis de mercado</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Una lectura clara de los datos técnicos disponibles para el activo y período seleccionados.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-300" htmlFor="market-symbol">
                Mercado
                <select
                  className="min-w-44 rounded-xl border border-white/10 bg-[#090c18]/90 px-3 py-2.5 text-base text-white outline-none transition focus:border-violet-300/70 focus:ring-2 focus:ring-violet-400/30"
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
                Período
                <select
                  className="min-w-36 rounded-xl border border-white/10 bg-[#090c18]/90 px-3 py-2.5 text-base text-white outline-none transition focus:border-violet-300/70 focus:ring-2 focus:ring-violet-400/30"
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
          </div>
        </section>

        <section aria-label="Resumen de mercado" className="mb-6">
          {market.isPending ? <LoadingBlock label={`el resumen de ${symbol}`} /> : null}
          {market.isError ? <ErrorBlock message={errorMessage("market")} onRetry={() => void market.refetch()} /> : null}
          {market.data ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric emphasis label="Precio actual" value={formatPrice(market.data.price, symbol)} description={market.data.symbol} />
              <Metric label="Activo" value={market.data.symbol} description={market.data.assetClass === "gold" ? "Oro" : "Criptoactivo"} />
              <Metric label="Timeframe" value={timeframe} description="Período de análisis" />
              <Metric label="Fuente de mercado" value={providerLabel(market.data.provider)} description={formatTimestamp(market.data.updatedAt)} />
              <Metric label="Estado de datos" value="Disponible" description={market.data.unit === "troy_ounce" ? "Por onza troy" : "Cotización de mercado"} />
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
          <IndicatorsCard data={technical} isError={indicators.isError} isPending={indicators.isPending} onRetry={() => void indicators.refetch()} />
          <div className="space-y-6">
            <StructureCard data={technical} />
            <AnalysisStatusCard data={technical} />
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
          <FibonacciCard data={technical} />
          <DataDetailsCard data={technical} marketProvider={market.data?.provider} />
        </section>

        <footer className="mt-8 border-t border-white/8 py-6 text-center text-xs leading-5 text-slate-500">
          Nexo Digital Pro proporciona análisis técnico e información de mercado. No constituye asesoramiento financiero ni ejecuta operaciones.
        </footer>
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">Lectura técnica</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Indicadores clave</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">Calculados por la API a partir de datos históricos reales.</p>
        </div>
        {data ? <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(data.status === "OK" ? "ok" : data.status === "UNAVAILABLE" ? "error" : "warning")}`}>{data.status === "OK" ? "Análisis disponible" : "Requiere atención"}</span> : null}
      </div>
      {isPending ? <div className="mt-5"><LoadingBlock label="los indicadores" /></div> : null}
      {isError ? <div className="mt-5"><ErrorBlock message={errorMessage("indicators")} onRetry={onRetry} /></div> : null}
      {data?.status === "UNAVAILABLE" ? <UnavailableMessage message={data.message} /> : null}
      {data?.status === "INSUFFICIENT_DATA" ? <InsufficientMessage message={data.message} /> : null}
      {data ? (
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {INDICATOR_FIELDS.map(([label, key]) => <Metric key={key} label={label} value={formatNumber(recordNumber(values, key))} />)}
        </div>
      ) : null}
    </Card>
  );
}

function AnalysisStatusCard({ data }: { data: TechnicalIndicatorsResponse | undefined }) {
  const quality = asRecord(data?.dataQuality);
  const sufficient = recordBoolean(quality, "sufficient");
  const tone: StatusTone = sufficient === true ? "ok" : data?.status === "UNAVAILABLE" ? "error" : "warning";
  const label = data?.status === "UNAVAILABLE" ? "Datos no disponibles temporalmente" : data?.status === "INSUFFICIENT_DATA" ? "Datos históricos insuficientes" : sufficient === true ? "Datos suficientes para el análisis" : "Esperando datos de análisis";

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Estado del análisis</p>
      <div className={`mt-3 rounded-xl border p-4 ${statusClass(tone)}`}>
        <p className="font-semibold">{label}</p>
        <p className="mt-1 text-sm opacity-85">{data?.message ?? (sufficient === true ? "Los indicadores están disponibles para la selección actual." : "La API aún no informó una cobertura suficiente.")}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Metric label="Velas analizadas" value={formatNumber(data?.candlesUsed, { maximumFractionDigits: 0 })} />
        <Metric label="Actualización" value={formatTimestamp(data?.timestamp)} />
      </div>
    </Card>
  );
}

function FibonacciCard({ data }: { data: TechnicalIndicatorsResponse | undefined }) {
  const fibonacci = asRecord(data?.fibonacci);
  const levels = asRecord(fibonacci?.levels);
  return (
    <Card>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">Niveles técnicos</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Fibonacci</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">Niveles calculados por el backend sobre el tramo disponible.</p>
      </div>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
        <Metric label="Máximo del swing" value={formatNumber(recordNumber(fibonacci, "swingHigh"))} />
        <Metric label="Mínimo del swing" value={formatNumber(recordNumber(fibonacci, "swingLow"))} />
        <Metric label="Dirección" value={formatDirection(recordString(fibonacci, "direction"))} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {FIBONACCI_LEVELS.map((level) => <Metric key={level} label={`Nivel ${level}`} value={formatNumber(recordNumber(levels, level))} />)}
      </div>
    </Card>
  );
}

function StructureCard({ data }: { data: TechnicalIndicatorsResponse | undefined }) {
  const structure = asRecord(data?.marketStructure);
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">Contexto técnico</p>
      <h2 className="mt-1 text-xl font-semibold text-white">Estructura de mercado</h2>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        <Metric label="Tendencia" value={formatTrend(recordString(structure, "trend"))} />
        <Metric label="Estructura" value={formatStructure(recordString(structure, "structure"))} />
        <Metric label="Máximo creciente" value={formatBoolean(recordBoolean(structure, "higherHigh"))} />
        <Metric label="Mínimo creciente" value={formatBoolean(recordBoolean(structure, "higherLow"))} />
        <Metric label="Máximo decreciente" value={formatBoolean(recordBoolean(structure, "lowerHigh"))} />
        <Metric label="Mínimo decreciente" value={formatBoolean(recordBoolean(structure, "lowerLow"))} />
        <Metric label="Soporte" value={formatNumber(recordNumber(structure, "support"))} />
        <Metric label="Resistencia" value={formatNumber(recordNumber(structure, "resistance"))} />
      </div>
    </Card>
  );
}

function DataDetailsCard({ data, marketProvider }: { data: TechnicalIndicatorsResponse | undefined; marketProvider: string | undefined }) {
  const quality = asRecord(data?.dataQuality);
  const structure = asRecord(data?.marketStructure);
  const fibonacci = asRecord(data?.fibonacci);
  const reason = recordString(quality, "reason") ?? data?.message ?? "No disponible";
  return (
    <Card className="self-start">
      <details>
        <summary className="cursor-pointer list-none rounded-lg text-sm font-semibold text-slate-200 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-violet-300 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-3">
            Detalles de datos
            <span aria-hidden="true" className="text-violet-200">+</span>
          </span>
        </summary>
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-6 text-slate-400">Cobertura, procedencia y referencia informadas por la API. Esta información complementa el análisis principal.</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Metric label="Proveedor" value={providerLabel(recordString(quality, "provider") ?? marketProvider)} />
            <Metric label="Velas disponibles" value={formatNumber(recordNumber(quality, "candleCount"), { maximumFractionDigits: 0 })} />
            <Metric label="Cobertura suficiente" value={formatBoolean(recordBoolean(quality, "sufficient"))} />
            <Metric label="Volumen disponible" value={formatBoolean(recordBoolean(quality, "volumeAvailable"))} />
          </div>
          <div className="rounded-xl border border-white/7 bg-[#090c18]/80 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Motivo informado</p>
            <p className="mt-1.5 text-sm leading-6 text-slate-300">{reason}</p>
          </div>
          <div className="rounded-xl border border-white/7 bg-[#090c18]/80 p-3.5 text-xs leading-5 text-slate-500">
            Referencia de la fuente: tendencia {recordString(structure, "trend") ?? "No disponible"} · estructura {recordString(structure, "structure") ?? "No disponible"} · dirección {recordString(fibonacci, "direction") ?? "No disponible"} · estado {data?.status ?? "No disponible"}
          </div>
        </div>
      </details>
    </Card>
  );
}

function InsufficientMessage({ message }: { message: string | null }) {
  return (
    <div role="status" className="mt-5 rounded-xl border border-orange-300/25 bg-orange-300/8 p-3.5 text-sm text-orange-100">
      <span className="font-semibold">Datos históricos insuficientes. </span>
      {message ?? "La API no informó un motivo adicional."}
    </div>
  );
}

function UnavailableMessage({ message }: { message: string | null }) {
  return (
    <div role="status" className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/8 p-3.5 text-sm text-rose-100">
      <span className="font-semibold">Datos no disponibles temporalmente. </span>
      {message ?? "La API no informó un motivo adicional."}
    </div>
  );
}
