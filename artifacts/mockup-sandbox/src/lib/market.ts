export const MARKET_SYMBOLS = ["BTCUSDT", "XAUUSD"] as const;
export type MarketSymbol = (typeof MARKET_SYMBOLS)[number];

export const MARKET_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h"] as const;
export type MarketTimeframe = (typeof MARKET_TIMEFRAMES)[number];

export function isMarketSymbol(value: string): value is MarketSymbol {
  return (MARKET_SYMBOLS as readonly string[]).includes(value);
}

export function isMarketTimeframe(value: string): value is MarketTimeframe {
  return (MARKET_TIMEFRAMES as readonly string[]).includes(value);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function recordNumber(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function recordString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function recordBoolean(record: Record<string, unknown> | null, key: string): boolean | null {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

export function formatNumber(value: number | null | undefined, options?: Intl.NumberFormatOptions): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "No disponible";
  }

  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 4,
    ...options,
  }).format(value);
}

export function formatPrice(value: number | null | undefined, symbol: MarketSymbol): string {
  return formatNumber(value, {
    style: "currency",
    currency: symbol === "BTCUSDT" ? "USD" : "USD",
    maximumFractionDigits: symbol === "BTCUSDT" ? 2 : 2,
  });
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "No disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export function formatBoolean(value: boolean | null): string {
  if (value === null) return "No disponible";
  return value ? "Sí" : "No";
}

const trendLabels: Record<string, string> = {
  bullish: "Alcista",
  bearish: "Bajista",
  sideways: "Lateral",
};

const structureLabels: Record<string, string> = {
  higher_high_and_higher_low: "HH + HL",
  lower_high_and_lower_low: "LH + LL",
  mixed: "Mixta",
};

const directionLabels: Record<string, string> = {
  uptrend: "Alcista",
  downtrend: "Bajista",
};

export function formatTrend(value: string | null): string {
  return value ? (trendLabels[value] ?? value) : "No disponible";
}

export function formatStructure(value: string | null): string {
  return value ? (structureLabels[value] ?? value) : "No disponible";
}

export function formatDirection(value: string | null): string {
  return value ? (directionLabels[value] ?? value) : "No disponible";
}

export function refreshIntervalFor(timeframe: MarketTimeframe): number {
  const intervals: Record<MarketTimeframe, number> = {
    "1m": 30_000,
    "5m": 60_000,
    "15m": 120_000,
    "1h": 300_000,
    "4h": 600_000,
  };
  return intervals[timeframe];
}
