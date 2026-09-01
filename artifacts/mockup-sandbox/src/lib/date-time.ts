export const COMMERCIAL_TIME_ZONE = "America/Argentina/Buenos_Aires";
export const COMMERCIAL_TIME_ZONE_LABEL = "ARG/BRA";

export function formatCommercialDateTime(value: string | Date | null | undefined, fallback = "No disponible"): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: COMMERCIAL_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month").replace(".", "")} ${part("year")} · ${part("hour")}:${part("minute")} · ${COMMERCIAL_TIME_ZONE_LABEL}`;
}
