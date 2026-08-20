import { useState } from "react";
import type { CommercialSignal, SignalDashboardResponse } from "@workspace/api-client-react";
import { PRODUCT_DISPLAY_NAME_UPPER } from "@/config/product";
import { useMarketDashboard } from "@/hooks/use-market-dashboard";
import { MARKET_TIMEFRAMES, formatNumber, formatTimestamp, type MarketTimeframe } from "@/lib/market";

type Props = { onAccount?: () => void; onAdmin?: () => void; onLogout?: () => void };
type HistoryScope = MarketTimeframe | "all";

export function MarketDashboard({ onAccount, onAdmin, onLogout }: Props) {
  const [timeframe, setTimeframe] = useState<MarketTimeframe>("15m");
  const [historyTimeframe, setHistoryTimeframe] = useState<HistoryScope>("15m");
  const [historyLimit, setHistoryLimit] = useState(5);
  const { health, dashboard } = useMarketDashboard(timeframe, historyTimeframe);
  const data = dashboard.data;
  const chooseTimeframe = (value: MarketTimeframe) => { setTimeframe(value); setHistoryTimeframe(value); setHistoryLimit(5); };

  return <main className="min-h-screen overflow-x-hidden bg-[#070812] text-slate-100">
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-[#0b0d1b] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-bold tracking-[0.16em]">{PRODUCT_DISPLAY_NAME_UPPER}</p><p className="mt-1 text-xs text-slate-500">Señales de mercado</p></div>
        <nav className="flex flex-wrap gap-2" aria-label="Navegación principal"><span className="min-h-11 rounded-lg bg-violet-400/15 px-3 py-3 text-sm font-semibold text-violet-100">Señales</span>{onAccount ? <button className="min-h-11 rounded-lg px-3 text-sm text-slate-300" onClick={onAccount}>Cuenta</button> : null}{onAdmin ? <button className="min-h-11 rounded-lg px-3 text-sm text-violet-200" onClick={onAdmin}>Admin</button> : null}{onLogout ? <button className="min-h-11 rounded-lg border border-white/10 px-3 text-sm" onClick={onLogout}>Cerrar sesión</button> : null}</nav>
      </header>

      <section className="mt-6 rounded-2xl border border-white/8 bg-slate-950/55 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200">Señales de mercado</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="text-3xl font-semibold">BTCUSDT · Disponible</h1><p className="mt-2 text-sm text-slate-400">XAUUSD · 🔒 Próximamente</p></div>
          <fieldset><legend className="mb-2 text-xs font-semibold text-slate-400">Temporalidad principal de análisis</legend><div className="flex flex-wrap gap-2">{MARKET_TIMEFRAMES.map((value) => <Chip active={timeframe === value} key={value} onClick={() => chooseTimeframe(value)}>{value}</Chip>)}</div></fieldset>
        </div>
      </section>

      {dashboard.isPending ? <StateCard title="Actualizando señales" detail="Estamos evaluando la configuración técnica disponible." /> : null}
      {dashboard.isError ? <StateCard error title="No se pudo actualizar" detail="Reintentá en unos instantes. No se mostrará una señal sin datos válidos." action={() => void dashboard.refetch()} /> : null}
      {data ? <>
        <CurrentSignal signal={data.activeSignal} multiTimeframe={data.multiTimeframe} />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Rendimiento · {historyTimeframe === "all" ? "Todas" : historyTimeframe}</h2><div className="flex flex-wrap gap-1.5">{(["all", ...MARKET_TIMEFRAMES] as const).map((value) => <Chip active={historyTimeframe === value} key={value} onClick={() => { setHistoryTimeframe(value); setHistoryLimit(5); }}>{value === "all" ? "Todas" : value}</Chip>)}</div></div>
        <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Resumen de rendimiento"><Metric label="Señales cerradas" value={String(data.metrics.total)} empty={!data.metrics.total} /><Metric label="Ganadas" value={String(data.metrics.wins)} empty={!data.metrics.total} /><Metric label="Perdidas" value={String(data.metrics.losses)} empty={!data.metrics.total} /><Metric label="Tasa de aciertos" value={data.metrics.winRate === null ? "—" : `${formatNumber(data.metrics.winRate)}%`} empty={data.metrics.winRate === null} /><Metric label="Retorno acumulado" value={data.metrics.accumulatedReturnPct === null ? "—" : `${signed(data.metrics.accumulatedReturnPct)}%`} empty={data.metrics.accumulatedReturnPct === null} /></section>
        <section className="mt-6 grid gap-6 lg:grid-cols-[0.65fr_1.35fr]"><article className="rounded-2xl border border-white/8 bg-slate-950/55 p-5"><p className="text-xs font-bold uppercase tracking-[0.15em] text-violet-200">Contexto simplificado</p><dl className="mt-5 space-y-4"><Context label="Tendencia" value={trend(data.context.trend)} /><Context label="Condición" value={condition(data.context.condition)} /><Context label="Fuerza" value={strength(data.context.strength)} /></dl></article><History data={data.history} limit={historyLimit} onMore={() => setHistoryLimit((value) => value + 5)} /></section>
      </> : null}
      <footer className="mt-8 border-t border-white/8 py-6 text-center text-xs text-slate-500">Las señales informan movimiento técnico porcentual. No representan ganancias personales ni constituyen asesoramiento financiero. Sistema {health.isSuccess ? "conectado" : "en verificación"}.</footer>
    </div>
  </main>;
}

function CurrentSignal({ signal, multiTimeframe }: { signal: CommercialSignal | null; multiTimeframe: SignalDashboardResponse["multiTimeframe"] }) {
  if (!signal) return <section className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-[#0a0c18] p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Señal actual</p><h2 className="mt-4 text-3xl font-semibold">SIN SEÑAL ACTIVA</h2><p className="mt-3 text-slate-400">El sistema está esperando una configuración técnica válida.</p><MultiTimeframe value={multiTimeframe} /></section>;
  const long = signal.direction === "LONG";
  return <section className={`mt-6 rounded-3xl border p-6 sm:p-8 ${long ? "border-emerald-300/25 bg-emerald-400/[0.06]" : "border-rose-300/25 bg-rose-400/[0.06]"}`}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Señal actual</p><h2 className={`mt-3 text-4xl font-bold ${long ? "text-emerald-300" : "text-rose-300"}`}>{signal.direction}</h2><p className="mt-2 text-lg font-semibold">{signal.symbol} · {signal.timeframe}</p></div><span className="rounded-full border border-white/12 px-3 py-1.5 text-xs font-bold">{statusLabel(signal.status)}</span></div><dl className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Context label="Entrada" value={price(signal.entryPrice)} /><Context label="Stop loss" value={price(signal.stopLoss)} /><Context label="Take profit" value={price(signal.takeProfit)} /><Context label="R:R" value={`1:${formatNumber(Number(signal.riskRewardRatio), { maximumFractionDigits: 2 })}`} /></dl><p className="mt-5 text-xs text-slate-500">Abierta: {formatTimestamp(signal.openedAt)}</p><MultiTimeframe value={multiTimeframe} /></section>;
}

function MultiTimeframe({ value }: { value: SignalDashboardResponse["multiTimeframe"] }) { return <div className="mt-5 border-t border-white/8 pt-4"><div className="flex flex-wrap gap-2">{MARKET_TIMEFRAMES.map((timeframe) => { const valueForTimeframe = value.trends[timeframe]; const symbol = valueForTimeframe === "bullish" ? "↑" : valueForTimeframe === "bearish" ? "↓" : "→"; const label = trend(valueForTimeframe ?? "sideways"); const tone = valueForTimeframe === "bullish" ? "text-emerald-300" : valueForTimeframe === "bearish" ? "text-rose-300" : "text-amber-200"; return <span aria-label={`${timeframe} ${label}`} className={`rounded-lg border border-white/8 bg-black/15 px-2.5 py-1.5 text-xs font-bold ${tone}`} key={timeframe}>{timeframe} {symbol}</span>; })}</div><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>↑ Alcista · ↓ Bajista · → Lateral</span>{value.total ? <span>{value.alignedCount} de {value.total} temporalidades alineadas</span> : null}</div></div>; }
function History({ data, limit, onMore }: { data: CommercialSignal[]; limit: number; onMore: () => void }) { return <article className="min-w-0 rounded-2xl border border-white/8 bg-slate-950/55 p-5"><p className="text-xs font-bold uppercase tracking-[0.15em] text-violet-200">Historial</p><h2 className="mt-1 text-xl font-semibold">Historial de señales</h2>{data.length ? <div className="mt-5 space-y-3">{data.slice(0, limit).map((signal) => <HistoryRow key={signal.id} signal={signal} />)}{limit < data.length ? <button className="min-h-11 w-full rounded-xl border border-white/10 text-sm font-semibold" onClick={onMore}>Ver más historial</button> : null}</div> : <p className="mt-5 rounded-xl border border-white/8 p-4 text-sm text-slate-400">Aún no hay historial real de señales cerradas.</p>}</article>; }
function HistoryRow({ signal }: { signal: CommercialSignal }) { const positive = Number(signal.returnPct) >= 0; return <div className="grid min-w-0 gap-2 rounded-xl border border-white/8 bg-[#090c18] p-4 sm:grid-cols-[1.2fr_0.7fr_0.9fr_0.7fr] sm:items-center"><div><p className="font-semibold">{signal.symbol} · {signal.timeframe}</p><p className="mt-1 text-xs text-slate-500">{formatTimestamp(signal.openedAt)}</p></div><div><p className={signal.direction === "LONG" ? "text-emerald-300" : "text-rose-300"}>{signal.direction}</p><p className="mt-1 text-xs text-slate-500">Entrada {price(signal.entryPrice)}</p></div><p className="text-sm">{statusLabel(signal.status)}</p><p className={`text-sm font-semibold ${positive ? "text-emerald-300" : "text-rose-300"}`}>{signal.returnPct === null ? "—" : `${signed(Number(signal.returnPct))}%`}</p></div>; }
function Chip({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) { return <button aria-pressed={active} className={`min-h-11 min-w-12 rounded-xl border px-3 text-xs font-bold ${active ? "border-violet-300/40 bg-violet-400/15 text-violet-100" : "border-white/10 bg-[#090c18] text-slate-400"}`} onClick={onClick} type="button">{children}</button>; }
function Metric({ label, value, empty }: { label: string; value: string; empty: boolean }) { return <article className="rounded-2xl border border-white/8 bg-slate-950/55 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p>{empty ? <p className="mt-2 text-xs leading-5 text-slate-500">Aún no hay suficiente historial para calcular esta métrica.</p> : null}</article>; }
function Context({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/8 bg-[#090c18] p-3"><dt className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function StateCard({ title, detail, error, action }: { title: string; detail: string; error?: boolean; action?: () => void }) { return <section className={`mt-6 rounded-2xl border p-6 ${error ? "border-rose-300/20 bg-rose-400/[0.05]" : "border-white/8 bg-slate-950/55"}`}><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-400">{detail}</p>{action ? <button className="mt-4 min-h-11 rounded-xl border border-white/12 px-4" onClick={action}>Reintentar</button> : null}</section>; }
function trend(value: string | null) { return value === "bullish" ? "Alcista" : value === "bearish" ? "Bajista" : value === "sideways" ? "Lateral" : "No disponible"; }
function condition(value: string) { return value === "trending" ? "Mercado en tendencia" : value === "mixed" ? "Mercado mixto" : "Datos insuficientes"; }
function strength(value: string) { return value === "high" ? "Alta" : value === "medium" ? "Media" : "Baja"; }
function statusLabel(value: string) { return value === "OPEN" ? "ABIERTA" : value === "WIN" ? "GANADA" : value === "LOSS" ? "PERDIDA" : value === "EXPIRED" ? "EXPIRADA" : "CANCELADA"; }
function price(value: string) { return formatNumber(Number(value), { style: "currency", currency: "USD", maximumFractionDigits: 2 }); }
function signed(value: number) { return `${value > 0 ? "+" : ""}${formatNumber(value, { maximumFractionDigits: 4 })}`; }
