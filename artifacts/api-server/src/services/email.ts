import { PRODUCT_DISPLAY_NAME } from "@workspace/product";
import { config } from "../config";
import { logger } from "../lib/logger";

type AuthEmailKind = "password-reset" | "email-verification";
export type AuthEmailInput = { to: string; token: string; kind: AuthEmailKind };
type EmailRuntime = { apiKey?: string; from?: string; appPublicUrl?: string };

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(config.resendApiKey && config.authEmailFrom && config.appPublicUrl);
}

export async function sendAuthEmail(input: AuthEmailInput): Promise<void> {
  return sendAuthEmailUsing(input, { apiKey: config.resendApiKey, from: config.authEmailFrom, appPublicUrl: config.appPublicUrl }, fetch);
}

export async function sendAuthEmailUsing(input: AuthEmailInput, runtime: EmailRuntime, request: typeof fetch): Promise<void> {
  if (!runtime.apiKey || !runtime.from || !runtime.appPublicUrl) {
    throw new Error("Authentication email delivery is not configured.");
  }

  const path = input.kind === "password-reset" ? "/restablecer-contrasena" : "/verificar-email";
  const actionUrl = new URL(path, runtime.appPublicUrl);
  actionUrl.searchParams.set("token", input.token);
  const action = input.kind === "password-reset" ? "Restablecer contraseña" : "Verificar email";
  const subject = input.kind === "password-reset"
    ? `${PRODUCT_DISPLAY_NAME}: restablecé tu contraseña`
    : `${PRODUCT_DISPLAY_NAME}: verificá tu email`;

  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${runtime.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: runtime.from,
      to: [input.to],
      subject,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h1>${PRODUCT_DISPLAY_NAME}</h1><p>Usá el siguiente enlace para continuar. El enlace es personal, vence pronto y solo puede utilizarse una vez.</p><p><a href="${escapeHtml(actionUrl.toString())}" style="display:inline-block;padding:12px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px">${action}</a></p><p>Si no solicitaste esta acción, ignorá este mensaje.</p></div>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    logger.warn({ statusCode: response.status, provider: "resend" }, "Authentication email provider rejected delivery");
    throw new Error("Authentication email could not be delivered.");
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
