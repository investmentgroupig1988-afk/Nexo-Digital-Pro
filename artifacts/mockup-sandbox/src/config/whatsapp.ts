export function configuredSupportWhatsAppNumber(
  value: string | undefined = import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER,
): string | null {
  const normalized = value?.trim().replace(/^\+/, "") ?? "";
  return /^\d{8,15}$/.test(normalized) ? normalized : null;
}

export function buildOfficialWhatsAppUrl(
  message: string,
  supportNumber: string | null = configuredSupportWhatsAppNumber(),
): string | null {
  if (!supportNumber) return null;
  return `https://wa.me/${supportNumber}?text=${encodeURIComponent(message)}`;
}
