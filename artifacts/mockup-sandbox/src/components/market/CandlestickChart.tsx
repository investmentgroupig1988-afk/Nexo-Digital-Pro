import { useMemo, useState } from "react";
import type { HistoricalCandle } from "@workspace/api-client-react";
import { formatNumber, formatTimestamp, type MarketSymbol, type MarketTimeframe } from "@/lib/market";

type CandlestickChartProps = {
  candles: HistoricalCandle[];
  symbol: MarketSymbol;
  timeframe: MarketTimeframe;
};

const WIDTH = 960;
const HEIGHT = 420;
const MARGIN = { top: 24, right: 86, bottom: 40, left: 12 };

function validCandle(candle: HistoricalCandle): boolean {
  return [candle.open, candle.high, candle.low, candle.close].every(
    (value) => Number.isFinite(value),
  );
}

function formatAxisPrice(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function CandlestickChart({ candles, symbol, timeframe }: CandlestickChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const safeCandles = useMemo(() => candles.filter(validCandle), [candles]);

  if (safeCandles.length === 0) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
        No hay velas reales disponibles para {symbol} en {timeframe}.
      </div>
    );
  }

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const highest = Math.max(...safeCandles.map((candle) => candle.high));
  const lowest = Math.min(...safeCandles.map((candle) => candle.low));
  const padding = Math.max((highest - lowest) * 0.04, Number.EPSILON);
  const minPrice = lowest - padding;
  const maxPrice = highest + padding;
  const range = maxPrice - minPrice;
  const y = (price: number) => MARGIN.top + ((maxPrice - price) / range) * plotHeight;
  const step = plotWidth / safeCandles.length;
  const bodyWidth = Math.max(1.5, Math.min(10, step * 0.64));
  const selected = activeIndex === null ? safeCandles.at(-1)! : safeCandles[activeIndex];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 p-2 shadow-inner">
        <svg
          aria-label={`Gráfico de velas reales de ${symbol} en ${timeframe}`}
          className="min-w-[640px]"
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
        >
          <title>Velas reales de {symbol} — {timeframe}</title>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const price = maxPrice - range * ratio;
            const yPosition = MARGIN.top + plotHeight * ratio;
            return (
              <g key={ratio}>
                <line
                  stroke="#1e293b"
                  strokeDasharray="3 5"
                  x1={MARGIN.left}
                  x2={WIDTH - MARGIN.right}
                  y1={yPosition}
                  y2={yPosition}
                />
                <text
                  fill="#94a3b8"
                  fontSize="11"
                  textAnchor="start"
                  x={WIDTH - MARGIN.right + 10}
                  y={yPosition + 4}
                >
                  {formatAxisPrice(price)}
                </text>
              </g>
            );
          })}
          {safeCandles.map((candle, index) => {
            const x = MARGIN.left + step * index + step / 2;
            const upward = candle.close >= candle.open;
            const color = upward ? "#34d399" : "#fb7185";
            const bodyTop = y(Math.max(candle.open, candle.close));
            const bodyHeight = Math.max(1, Math.abs(y(candle.open) - y(candle.close)));
            const isActive = activeIndex === index;
            return (
              <g
                key={`${candle.timestamp}-${index}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <line
                  stroke={color}
                  strokeWidth={isActive ? 2 : 1}
                  x1={x}
                  x2={x}
                  y1={y(candle.high)}
                  y2={y(candle.low)}
                />
                <rect
                  fill={color}
                  opacity={isActive ? 1 : 0.82}
                  rx="0.5"
                  x={x - bodyWidth / 2}
                  y={bodyTop}
                  width={bodyWidth}
                  height={bodyHeight}
                />
              </g>
            );
          })}
          <line
            stroke="#334155"
            x1={MARGIN.left}
            x2={WIDTH - MARGIN.right}
            y1={HEIGHT - MARGIN.bottom}
            y2={HEIGHT - MARGIN.bottom}
          />
          <text fill="#94a3b8" fontSize="11" x={MARGIN.left} y={HEIGHT - 14}>
            {formatTimestamp(safeCandles[0].timestamp)}
          </text>
          <text fill="#94a3b8" fontSize="11" textAnchor="end" x={WIDTH - MARGIN.right} y={HEIGHT - 14}>
            {formatTimestamp(safeCandles.at(-1)!.timestamp)}
          </text>
        </svg>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <CandleValue label="Apertura" value={selected.open} />
        <CandleValue label="Máximo" value={selected.high} />
        <CandleValue label="Mínimo" value={selected.low} />
        <CandleValue label="Cierre" value={selected.close} />
        <CandleValue label="Volumen" value={selected.volume} />
        <div>
          <dt className="text-slate-500">Vela</dt>
          <dd className="mt-0.5 font-medium text-slate-200">{formatTimestamp(selected.timestamp)}</dd>
        </div>
      </dl>
    </div>
  );
}

function CandleValue({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-200">{formatNumber(value)}</dd>
    </div>
  );
}
