import { PRODUCT_DISPLAY_NAME } from "@workspace/product";
import { COMMERCIAL_SIGNAL_TIMEFRAMES } from "./signal-engine";

export type NotificationTimeframe = (typeof COMMERCIAL_SIGNAL_TIMEFRAMES)[number];

export type NotificationProvider = {
  readonly name: string;
  sendSignalActive(publicUrl: string, timeframe: NotificationTimeframe): Promise<void>;
};

export function signalActiveMessage(publicUrl: string, timeframe: NotificationTimeframe): string {
  const link = new URL(publicUrl);
  link.searchParams.set("timeframe", timeframe);
  const environment = link.hostname === "staging.trenoro.com" ? " — STAGING" : "";
  return `🔔 Nueva señal disponible en ${PRODUCT_DISPLAY_NAME}${environment}\nTemporalidad: ${timeframe}\nAbrir ${PRODUCT_DISPLAY_NAME}: ${link.toString()}`;
}
