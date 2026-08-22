import { signalActiveMessage, type NotificationProvider } from "./notification-provider";

export class TelegramProvider implements NotificationProvider {
  readonly name = "telegram" as const;
  constructor(private readonly token: string, private readonly chatId: string, private readonly request: typeof fetch = fetch) {}

  async sendSignalActive(publicUrl: string): Promise<void> {
    const response = await this.request(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: this.chatId, text: signalActiveMessage(publicUrl), disable_web_page_preview: false }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Telegram sendMessage failed with HTTP ${response.status}.`);
    const body = await response.json() as { ok?: boolean };
    if (body.ok !== true) throw new Error("Telegram sendMessage returned an unsuccessful response.");
  }
}
