import { PRODUCT_DISPLAY_NAME } from "@workspace/product";

export type NotificationProvider = {
  readonly name: string;
  sendSignalActive(publicUrl: string): Promise<void>;
};

export function signalActiveMessage(publicUrl: string): string {
  return `🔔 SEÑAL ACTIVA\n\nEntrá a ${PRODUCT_DISPLAY_NAME}:\n${publicUrl}`;
}
