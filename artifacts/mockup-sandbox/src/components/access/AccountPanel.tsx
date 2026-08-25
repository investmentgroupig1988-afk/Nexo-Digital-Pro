import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPaymentRequest,
  getMyPaymentRequests,
  type AccountResponse,
  type CreatePaymentRequestInput,
  type PaymentRequest,
  type PaymentRequestMethod,
} from "@workspace/api-client-react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Brand } from "./PublicLanding";
import { FOUNDERS_OFFER, PRODUCT_DISPLAY_NAME } from "@/config/product";

const USDT_WALLET = "TJmF8D7twrHckM1LfqPwh64WgYcSgURKRS";
const configured = (value: string | undefined) => value?.trim() || null;
const SUPPORT_WHATSAPP_NUMBER = configured(import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER);
const ARGENTINA_PAYMENTS_ENABLED = import.meta.env.VITE_ARGENTINA_PAYMENTS_ENABLED === "true";
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PROOF_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

type AccountPanelProps = {
  account: AccountResponse;
  onDashboard: () => void;
  onLogout: () => Promise<void> | void;
  onAdmin?: () => void;
};

export function AccountPanel({ account, onDashboard, onLogout, onAdmin }: AccountPanelProps) {
  const { user, access } = account;
  const requests = useQuery({
    queryKey: ["payment-requests", "me"],
    queryFn: ({ signal }) => getMyPaymentRequests(signal),
    enabled: !access.hasAccess,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const status = query.state.data?.requests[0]?.status;
      return status === "PENDING" || status === "NEEDS_REVIEW" ? 30_000 : false;
    },
  });
  const latestRequest = requests.data?.requests[0] ?? null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070812] text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#0b0d1b]/85 px-4 py-3.5">
          <Brand />
          <div className="flex flex-wrap items-center justify-end gap-2"><button className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/6 hover:text-white" onClick={onDashboard} type="button">Panel</button>{onAdmin ? <button className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-300/10" onClick={onAdmin} type="button">Administración</button> : null}<button className="min-h-11 rounded-lg border border-white/12 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/6" onClick={() => void onLogout()} type="button">Cerrar sesión</button></div>
        </header>
        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
          <article className="min-w-0 rounded-2xl border border-white/8 bg-slate-950/55 p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Tu cuenta</p>
            <h1 className="mt-2 break-words text-3xl font-semibold text-white">{user.username}</h1>
            <dl className="mt-7 grid gap-4 sm:grid-cols-2"><Data label="Email" value={user.email} /><Data label="Nombre de usuario" value={user.username} /><Data label="Fecha de registro" value={formatDate(user.createdAt)} /><Data label="Último acceso" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : "No disponible"} /></dl>
            <div className="mt-7 rounded-xl border border-white/8 bg-[#090c18]/80 p-4"><p className="font-semibold text-slate-200">Seguridad de la cuenta</p><p className="mt-1 text-sm leading-6 text-slate-400">Nunca envíes tu contraseña, cookies, tokens ni claves privadas por WhatsApp. La solicitud guardada en esta cuenta es la fuente de verdad.</p></div>
          </article>
          <article className="min-w-0 rounded-2xl border border-violet-300/18 bg-violet-400/7 p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Estado del acceso</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{access.hasAccess ? planLabel(access.plan) : requestStateTitle(latestRequest)}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{access.hasAccess ? "Tu acceso fue confirmado por el servidor." : requestStateDescription(latestRequest)}</p>
            {access.hasAccess ? <><dl className="mt-6 space-y-3"><Data label="Estado" value="Activo" /><Data label="Tipo de acceso" value={access.accessType ? accessTypeLabel(access.accessType) : "No disponible"} /><Data label="Fecha de acceso" value={access.grantedAt ? formatDate(access.grantedAt) : "No disponible"} /><Data label="Vencimiento" value={access.expiresAt ? formatDate(access.expiresAt) : "Sin vencimiento"} /></dl><button className="mt-7 min-h-12 w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-bold text-[#130c29] hover:bg-violet-300" onClick={onDashboard} type="button">Abrir panel privado</button></> : <RequestSummary request={latestRequest} />}
          </article>
        </section>
        {!access.hasAccess ? <PaymentAccessSection identity={{ email: user.email, username: user.username }} latestRequest={latestRequest} loading={requests.isPending} onRetry={() => void requests.refetch()} requestError={requests.isError} /> : null}
      </div>
    </main>
  );
}

function PaymentAccessSection({ identity, latestRequest, loading, onRetry, requestError }: { identity: { email: string; username: string }; latestRequest: PaymentRequest | null; loading: boolean; onRetry: () => void; requestError: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<{ request: PaymentRequest; whatsappUrl: string | null } | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createPaymentRequest,
    onSuccess: async (result) => {
      setCreated(result);
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["payment-requests", "me"] });
    },
  });
  const underReview = latestRequest?.status === "PENDING" || latestRequest?.status === "NEEDS_REVIEW" || Boolean(created);
  const savedRequest = created?.request ?? (underReview ? latestRequest : null);
  const whatsappUrl = created?.whatsappUrl ?? (savedRequest ? buildWhatsAppUrl(savedRequest, identity) : null);

  return <section aria-labelledby="payment-title" className="mt-6 rounded-2xl border border-white/8 bg-[#090a14] p-5 sm:p-7">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Acceso Founders</p><h2 className="mt-2 text-2xl font-semibold text-white" id="payment-title">Pago único · USD 27</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Cargá los datos de tu pago y enviá la solicitud. WhatsApp queda disponible después como canal opcional de soporte y verificación.</p></div>{!underReview && !loading && !requestError ? <button className="min-h-12 shrink-0 rounded-xl bg-violet-400 px-5 text-sm font-bold text-[#150c2d] hover:bg-violet-300" onClick={() => setShowForm((value) => !value)} type="button">{showForm ? "Cerrar formulario" : "Obtener acceso"}</button> : null}</div>
    {requestError ? <div className="mt-6 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-sm leading-6 text-rose-100" role="alert"><p>No pudimos consultar el estado de tus solicitudes. Reintentá antes de iniciar una nueva.</p><button className="mt-3 min-h-11 rounded-xl border border-rose-200/25 px-4 font-semibold hover:bg-rose-200/10" onClick={onRetry} type="button">Reintentar</button></div> : null}
    {created ? <WhatsAppConfirmation request={created.request} /> : null}
    {!created && underReview ? <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100"><strong>Solicitud en revisión.</strong> El equipo usará el registro de la plataforma para validar el pago. {latestRequest?.status === "NEEDS_REVIEW" ? "Revisá las notas del administrador y contactá soporte si te solicitaron información adicional." : "No hace falta crear otra solicitud."}</div> : null}
    {underReview ? <SubmittedActions whatsappUrl={whatsappUrl} /> : null}
    {latestRequest?.status === "REJECTED" && !showForm ? <div className="mt-6 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-sm leading-6 text-rose-100">La solicitud anterior fue rechazada{latestRequest.notes ? `: ${latestRequest.notes}` : "."} Podés iniciar una nueva con la referencia y evidencia correctas.</div> : null}
    {showForm && !underReview ? <PaymentForm error={mutation.isError ? readableError(mutation.error) : null} pending={mutation.isPending} onSubmit={(input) => mutation.mutate(input)} /> : null}
  </section>;
}

function PaymentForm({ pending, error, onSubmit }: { pending: boolean; error: string | null; onSubmit: (input: CreatePaymentRequestInput) => void }) {
  const [method, setMethod] = useState<PaymentRequestMethod>(ARGENTINA_PAYMENTS_ENABLED ? "MERCADO_PAGO_TRANSFER" : "USDT_TRC20");
  const [declaredPaidAt, setDeclaredPaidAt] = useState(toLocalDateTimeInput(new Date()));
  const [reference, setReference] = useState("");
  const [payerName, setPayerName] = useState("");
  const [senderWallet, setSenderWallet] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const isUsdt = method === "USDT_TRC20";
  const fieldId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    try {
      if (!isUsdt && !proof) throw new Error("Adjuntá el comprobante de la transferencia Argentina.");
      const encodedProof = proof ? await fileToProof(proof) : undefined;
      onSubmit({
        method,
        amount: isUsdt ? String(FOUNDERS_OFFER.usdtPrice) : String(FOUNDERS_OFFER.argentina.price),
        declaredPaidAt: new Date(declaredPaidAt).toISOString(),
        referenceOrTxid: reference,
        payerName: isUsdt ? undefined : payerName,
        senderWallet: isUsdt ? senderWallet.trim() || null : undefined,
        proof: encodedProof,
      });
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : "No se pudo preparar el comprobante.");
    }
  };

  return <form className="mt-7 border-t border-white/8 pt-7" onSubmit={(event) => void submit(event)}>
    <fieldset><legend className="text-sm font-semibold text-white">Elegí el método</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><MethodButton active={!isUsdt} detail={ARGENTINA_PAYMENTS_ENABLED ? "Argentina · importe fijo en ARS" : "Próximamente · deshabilitado"} disabled={!ARGENTINA_PAYMENTS_ENABLED} label="Transferencia Argentina" onClick={() => setMethod("MERCADO_PAGO_TRANSFER")} /><MethodButton active={isUsdt} detail="Internacional · red TRC20" label="USDT TRC20" onClick={() => setMethod("USDT_TRC20")} /></div></fieldset>
    {isUsdt ? <div className="mt-5 rounded-xl border border-violet-300/15 bg-violet-400/[0.055] p-4"><CopyPaymentValue label="Wallet destino · solo TRC20" value={USDT_WALLET} /><p className="mt-3 text-xs leading-5 text-slate-400">Importe Founders: {FOUNDERS_OFFER.usdtPrice} USDT. Verificá la red antes de enviar.</p></div> : <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Datos de transferencia</p><p className="mt-3 text-2xl font-bold text-white">{FOUNDERS_OFFER.argentina.displayPrice}</p><p className="mt-1 text-xs leading-5 text-slate-400">Referencia comercial fija: {FOUNDERS_OFFER.argentina.displayReference}. No es una cotización oficial ni dinámica.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><CopyPaymentValue label="Alias" value={FOUNDERS_OFFER.argentina.alias} /><CopyPaymentValue label="CVU" value={FOUNDERS_OFFER.argentina.cvu} /><CopyPaymentValue label="Titular" value={FOUNDERS_OFFER.argentina.holder} /></div><p className="mt-3 text-xs leading-5 text-slate-500">Verificá que los datos coincidan antes de transferir y adjuntá el comprobante para revisión.</p></div>}
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {!isUsdt ? <Field id={`${fieldId}-amount`} label="Importe"><input className={inputClass} disabled id={`${fieldId}-amount`} value={FOUNDERS_OFFER.argentina.displayPrice} /></Field> : <Field id={`${fieldId}-amount`} label="Importe"><input className={inputClass} disabled id={`${fieldId}-amount`} value={`${FOUNDERS_OFFER.usdtPrice} USDT`} /></Field>}
      <Field id={`${fieldId}-date`} label="Fecha y hora del pago"><input className={inputClass} id={`${fieldId}-date`} max={toLocalDateTimeInput(new Date())} onChange={(event) => setDeclaredPaidAt(event.target.value)} required type="datetime-local" value={declaredPaidAt} /></Field>
      <Field id={`${fieldId}-reference`} label={isUsdt ? "TXID" : "Referencia u operación"}><input className={inputClass} id={`${fieldId}-reference`} maxLength={255} minLength={isUsdt ? 64 : 3} onChange={(event) => setReference(event.target.value)} placeholder={isUsdt ? "64 caracteres hexadecimales" : "Número de operación"} required value={reference} /></Field>
      {isUsdt ? <Field id={`${fieldId}-wallet`} label="Wallet remitente (opcional)"><input className={inputClass} id={`${fieldId}-wallet`} maxLength={128} onChange={(event) => setSenderWallet(event.target.value)} placeholder="Comienza con T" value={senderWallet} /></Field> : <Field id={`${fieldId}-payer`} label="Nombre del pagador"><input className={inputClass} id={`${fieldId}-payer`} maxLength={160} onChange={(event) => setPayerName(event.target.value)} required value={payerName} /></Field>}
    </div>
    <Field id={`${fieldId}-proof`} label={`Comprobante ${isUsdt ? "(opcional)" : ""}`}><input accept="application/pdf,image/png,image/jpeg,image/webp" className="mt-2 block min-h-12 w-full rounded-xl border border-dashed border-white/15 bg-[#070912] px-3 py-3 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-400/12 file:px-3 file:py-2 file:font-semibold file:text-violet-100" id={`${fieldId}-proof`} onChange={(event) => setProof(event.target.files?.[0] ?? null)} required={!isUsdt} type="file" /><span className="mt-2 block text-xs leading-5 text-slate-500">PDF, PNG, JPG o WEBP · máximo 5 MB.</span></Field>
    {localError || error ? <p className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3 text-sm text-rose-100" role="alert">{localError ?? error}</p> : null}
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <button className="min-h-12 w-full rounded-xl bg-violet-400 px-4 text-sm font-bold text-[#150c2d] hover:bg-violet-300 disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">{pending ? "ENVIANDO SOLICITUD…" : "SOLICITAR ACCESO"}</button>
      <button aria-describedby={`${fieldId}-whatsapp-help`} className="min-h-12 w-full cursor-not-allowed rounded-xl border border-white/12 bg-white/[0.025] px-4 text-sm font-bold text-slate-500" disabled type="button">CONTACTAR POR WHATSAPP</button>
    </div>
    <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-500" id={`${fieldId}-whatsapp-help`}>Solicitá el acceso para poder contactar por WhatsApp.</p>
    <p className="mt-4 text-xs leading-6 text-slate-400">Comprás acceso Founders Lifetime por {isUsdt ? `${FOUNDERS_OFFER.usdtPrice} USDT mediante TRC20` : FOUNDERS_OFFER.argentina.displayPrice}, sin renovación automática. El acceso dura mientras esta modalidad y el servicio continúen operativos; no es una garantía de existencia perpetua. {PRODUCT_DISPLAY_NAME} no garantiza resultados. Consultá la <a className="font-semibold text-violet-200 underline" href="/reembolsos" target="_blank">política de reembolsos y arrepentimiento</a> antes de pagar.</p>
  </form>;
}

function WhatsAppConfirmation({ request }: { request: PaymentRequest }) {
  return <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.055] p-4 sm:p-5"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><div className="min-w-0"><p className="font-semibold text-white">Solicitud enviada / En revisión</p><p className="mt-1 break-all text-xs text-slate-400">ID: {request.id}</p><p className="mt-3 text-sm leading-6 text-slate-300">La solicitud quedó guardada correctamente. Podés esperar la revisión o contactar por WhatsApp de forma opcional.</p></div></div></div>;
}

function SubmittedActions({ whatsappUrl }: { whatsappUrl: string | null }) {
  return <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-400/70 px-4 text-sm font-bold text-[#150c2d]" role="status"><span aria-hidden="true">✓ </span>SOLICITUD ENVIADA</div><button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-violet-300/25 bg-violet-400/10 px-4 text-sm font-bold text-violet-100 hover:bg-violet-400/15 disabled:cursor-not-allowed disabled:opacity-50" disabled={!whatsappUrl} onClick={() => whatsappUrl && openWhatsApp(whatsappUrl)} type="button">CONTACTAR POR WHATSAPP <ExternalLink className="h-4 w-4" /></button></div>;
}

function CopyPaymentValue({ label, value }: { label: string; value: string }) {
  const [feedback, setFeedback] = useState<"copied" | "error" | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const copy = async () => {
    try {
      await copyExactValue(value);
      setFeedback("copied");
    } catch {
      setFeedback("error");
    }
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 2_000);
  };

  return <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-200">{label}</p><div className="mt-2 flex min-w-0 flex-col gap-2 min-[390px]:flex-row min-[390px]:items-center"><code className="min-w-0 flex-1 break-all rounded-lg bg-black/20 px-3 py-2.5 text-sm leading-6 text-slate-200">{value}</code><button aria-label={`Copiar ${label}`} className="min-h-11 w-full shrink-0 rounded-lg border border-violet-300/25 bg-violet-400/10 px-3 text-sm font-bold text-violet-100 hover:bg-violet-400/15 min-[390px]:w-auto min-[390px]:min-w-24" onClick={() => void copy()} type="button">{feedback === "copied" ? "Copiado ✓" : feedback === "error" ? "No se pudo copiar" : "Copiar"}</button></div><span aria-live="polite" className="sr-only">{feedback === "copied" ? `${label} copiado` : feedback === "error" ? `No se pudo copiar ${label}` : ""}</span></div>;
}

function RequestSummary({ request }: { request: PaymentRequest | null }) {
  if (!request) return <div className="mt-6 rounded-xl border border-white/10 bg-[#090c18]/60 p-3 text-center text-sm font-semibold text-violet-100">Founders · USD 27<br /><span className="font-normal text-slate-400">Pago único</span></div>;
  return <dl className="mt-6 space-y-3"><Data label="Estado" value={paymentStatusLabel(request.status)} /><Data label="Método" value={methodLabel(request.method)} /><Data label="Solicitud" value={request.id} /><Data label="Fecha" value={formatDate(request.createdAt)} />{request.notes ? <Data label="Notas" value={request.notes} /> : null}</dl>;
}

function MethodButton({ active, label, detail, disabled = false, onClick }: { active: boolean; label: string; detail: string; disabled?: boolean; onClick: () => void }) { return <button aria-pressed={active} className={`min-h-20 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${active ? "border-violet-300/35 bg-violet-400/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`} disabled={disabled} onClick={onClick} type="button"><span className="block text-sm font-semibold text-white">{label}</span><span className="mt-1 block text-xs text-slate-400">{detail}</span></button>; }
function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) { return <label className="mt-4 block text-sm font-medium text-slate-300" htmlFor={id}>{label}{children}</label>; }
function Data({ label, value }: { label: string; value: string }) { return <div><dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-200">{value}</dd></div>; }

const inputClass = "mt-2 min-h-12 w-full min-w-0 rounded-xl border border-white/10 bg-[#070912] px-3.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-300/60 disabled:text-slate-400";
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "No disponible" : new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function toLocalDateTimeInput(date: Date): string { const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function planLabel(plan: string | null): string { if (plan === "FOUNDERS_LIFETIME") return "Acceso Founders"; if (plan === "PARTNER") return "Acceso Partner"; if (plan === "TESTER") return "Acceso Tester"; if (plan === "COMPLIMENTARY") return "Acceso de cortesía"; return "Acceso privado"; }
function accessTypeLabel(type: string): string { return type === "ADMIN_MANUAL" ? "Concesión administrativa" : type === "PAYMENT" ? "Pago verificado" : type === "PROMOTION" ? "Promoción" : type; }
function paymentStatusLabel(status: PaymentRequest["status"]): string { return status === "PENDING" ? "Pendiente" : status === "APPROVED" ? "Aprobada" : status === "REJECTED" ? "Rechazada" : "Requiere información"; }
function methodLabel(method: PaymentRequestMethod): string { return method === "USDT_TRC20" ? "USDT TRC20" : "Transferencia Argentina"; }
function requestStateTitle(request: PaymentRequest | null): string { if (!request) return "Sin acceso privado"; if (request.status === "PENDING") return "Solicitud en revisión"; if (request.status === "NEEDS_REVIEW") return "Necesitamos más información"; if (request.status === "APPROVED") return "Pago aprobado"; return "Sin acceso privado"; }
function requestStateDescription(request: PaymentRequest | null): string { if (!request) return "Podés solicitar el acceso Founders desde esta cuenta."; if (request.status === "PENDING") return "Tu pago quedó registrado y está pendiente de validación administrativa."; if (request.status === "NEEDS_REVIEW") return "El equipo dejó una observación antes de tomar una decisión."; if (request.status === "APPROVED") return "La aprobación fue registrada. Volvé a enfocar o recargá esta página para actualizar tu acceso."; return "La solicitud anterior no concedió acceso. Podés corregir los datos y crear otra."; }
function readableError(error: unknown): string { if (!(error instanceof Error)) return "No se pudo guardar la solicitud."; return error.message.replace(/^HTTP \d+ [^:]+:\s*/, ""); }

function openWhatsApp(url: string): void {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
}

function buildWhatsAppUrl(request: PaymentRequest, identity: { email: string; username: string }): string {
  const message = [
    `Hola, solicito la verificación de mi acceso Founders a ${PRODUCT_DISPLAY_NAME}.`,
    `ID de solicitud: ${request.id}`,
    `Usuario: ${identity.username}`,
    `Email: ${identity.email}`,
    `Método: ${methodLabel(request.method)}`,
    `Importe: ${formatAmount(request.amount)} ${request.currency}`,
    request.method === "USDT_TRC20" ? `Wallet destino: ${USDT_WALLET}` : null,
    `Referencia / TXID: ${request.referenceOrTxid}`,
    `Evidencia cargada en la plataforma: ${request.proof ? "Sí" : "No (opcional para USDT)"}.`,
  ].filter((line): line is string => Boolean(line)).join("\n");
  return SUPPORT_WHATSAPP_NUMBER ? `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}` : "";
}

function formatAmount(value: string): string {
  return Number(value).toLocaleString("es-AR", { maximumFractionDigits: 8 });
}

async function copyExactValue(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Continue with the DOM fallback when Clipboard API is unavailable or denied.
    }
  }

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (typeof document.execCommand !== "function" || !document.execCommand("copy")) {
      throw new Error("Clipboard unavailable");
    }
  } finally {
    textarea.remove();
    activeElement?.focus();
  }
}

async function fileToProof(file: File) {
  if (!ACCEPTED_PROOF_TYPES.has(file.type)) throw new Error("Elegí un archivo PDF, PNG, JPG o WEBP.");
  if (!file.size || file.size > MAX_PROOF_BYTES) throw new Error("El comprobante debe pesar hasta 5 MB.");
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el comprobante."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const encoded = result.split(",", 2)[1];
      if (!encoded) reject(new Error("No se pudo preparar el comprobante."));
      else resolve(encoded);
    };
    reader.readAsDataURL(file);
  });
  return { fileName: file.name, mimeType: file.type, dataBase64 };
}
