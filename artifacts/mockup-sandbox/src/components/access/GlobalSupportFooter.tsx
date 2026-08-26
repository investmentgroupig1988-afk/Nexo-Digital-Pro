import { ExternalLink } from "lucide-react";
import { GLOBAL_SUPPORT_WHATSAPP_MESSAGE } from "@/config/product";
import { buildOfficialWhatsAppUrl } from "@/config/whatsapp";

export function GlobalSupportFooter({ reserveConsumerActions = false }: { reserveConsumerActions?: boolean }) {
  const whatsappUrl = buildOfficialWhatsAppUrl(GLOBAL_SUPPORT_WHATSAPP_MESSAGE);

  return (
    <footer
      aria-label="Soporte de TRENORO"
      className="overflow-x-hidden border-t border-white/[0.07] bg-[#05060b] text-slate-100"
      data-testid="global-support-footer"
    >
      <div className={`mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-3 px-4 pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 lg:px-12 ${reserveConsumerActions ? "pb-36 sm:pb-24" : "pb-7"}`}>
        <p className="min-w-0 text-sm leading-6 text-slate-400">¿Necesitás ayuda? Contactá a soporte.</p>
        {whatsappUrl ? (
          <a
            className="inline-flex min-h-11 w-full max-w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-violet-300/15 bg-violet-400/[0.045] px-4 py-2 text-center text-xs font-bold text-violet-100 transition hover:border-violet-300/30 hover:bg-violet-400/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 sm:w-auto"
            href={whatsappUrl}
            rel="noreferrer"
            target="_blank"
          >
            <span>CONTACTAR POR WHATSAPP</span>
            <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
          </a>
        ) : null}
      </div>
    </footer>
  );
}
