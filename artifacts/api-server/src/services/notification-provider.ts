export type NotificationProvider = {
  readonly name: string;
  sendSignalActive(publicUrl: string): Promise<void>;
};

export function signalActiveMessage(publicUrl: string): string {
  return `🔔 SEÑAL ACTIVA\n\nEntrá a Nexo Digital Pro:\n${publicUrl}`;
}
