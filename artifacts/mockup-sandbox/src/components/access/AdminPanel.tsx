import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminAudit,
  getAdminPaymentRequests,
  getAdminUsers,
  grantManualAccess,
  restoreAccess,
  reviewPaymentRequest,
  revokeAccess,
  setUserBlocked,
  type AccountResponse,
  type AdminPaymentRequest,
  type AdminUser,
  type PaymentRequestStatus,
} from "@workspace/api-client-react";
import { ExternalLink, ReceiptText, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Brand } from "./PublicLanding";

type UserAction = "revoke" | "restore" | "block" | "unblock";
type ManualPlan = "FOUNDERS_LIFETIME" | "PARTNER" | "TESTER" | "COMPLIMENTARY";

export function AdminPanel({ account, onAccount }: { account: AccountResponse; onAccount: () => void }) {
  const [search, setSearch] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["admin-users", search], queryFn: ({ signal }) => getAdminUsers(search, signal) });
  const payments = useQuery({ queryKey: ["admin-payment-requests"], queryFn: ({ signal }) => getAdminPaymentRequests(signal) });
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: ({ signal }) => getAdminAudit(signal) });

  const userMutation = useMutation({
    mutationFn: async ({ user, action }: { user: AdminUser; action: UserAction }) => {
      if (action === "revoke") return revokeAccess(user.id);
      if (action === "restore") return restoreAccess(user.id);
      return setUserBlocked(user.id, action === "block");
    },
    onSuccess: () => refreshAdmin(queryClient),
  });
  const reviewMutation = useMutation({
    mutationFn: ({ request, decision }: { request: AdminPaymentRequest; decision: Exclude<PaymentRequestStatus, "PENDING"> }) => reviewPaymentRequest(request.id, decision, reviewNotes[request.id]),
    onSuccess: () => refreshAdmin(queryClient),
  });
  const grantMutation = useMutation({
    mutationFn: ({ userId, plan, reason, expiresAt }: { userId: string; plan: ManualPlan; reason?: string; expiresAt?: string | null }) => grantManualAccess(userId, { plan, reason, expiresAt }),
    onSuccess: () => refreshAdmin(queryClient),
  });

  return <main className="min-h-screen overflow-x-hidden bg-[#070812] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#0b0d1b]/85 px-4 py-3.5"><Brand /><div className="flex gap-2"><span className="rounded-lg bg-violet-400/12 px-3 py-2 text-sm font-semibold text-violet-100">Administración</span><button className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/6" onClick={onAccount} type="button">Cuenta</button></div></header>
    <section className="mt-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Acceso restringido</p><h1 className="mt-2 text-3xl font-semibold text-white">Gestión comercial</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Sesión de {account.user.email}. Solo el rol administrador puede tomar decisiones y cada acción queda registrada.</p></section>

    <section className="mt-7 rounded-2xl border border-violet-300/15 bg-slate-950/55 p-5 sm:p-6" id="solicitudes-pago"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-200"><ReceiptText className="h-5 w-5" /></span><div><h2 className="text-xl font-semibold text-white">Solicitudes de pago</h2><p className="mt-1 text-sm leading-6 text-slate-400">La aprobación concede Founders dentro de la misma transacción. WhatsApp nunca reemplaza este registro.</p></div></div>
      {payments.isPending ? <p className="py-8 text-sm text-slate-400">Cargando solicitudes…</p> : null}
      {payments.isError ? <ErrorMessage> No se pudieron cargar las solicitudes.</ErrorMessage> : null}
      {payments.data?.requests.length === 0 ? <p className="mt-6 rounded-xl border border-white/8 p-4 text-sm text-slate-400">Todavía no hay solicitudes.</p> : null}
      {payments.data ? <div className="mt-6 grid gap-4 xl:grid-cols-2">{payments.data.requests.map((request) => <PaymentRequestCard key={request.id} notes={reviewNotes[request.id] ?? ""} onNotes={(notes) => setReviewNotes((current) => ({ ...current, [request.id]: notes }))} onReview={(decision) => reviewMutation.mutate({ request, decision })} pending={reviewMutation.isPending && reviewMutation.variables?.request.id === request.id} request={request} />)}</div> : null}
      {reviewMutation.isError ? <ErrorMessage>{readableError(reviewMutation.error)}</ErrorMessage> : null}
    </section>

    <section className="mt-6 rounded-2xl border border-white/8 bg-slate-950/55 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">Usuarios y accesos manuales</h2><p className="mt-1 text-sm text-slate-400">Partner, Tester y Cortesía siguen siendo cuentas con rol de usuario.</p></div><input aria-label="Buscar usuarios" className="min-h-11 w-full rounded-xl border border-white/10 bg-[#090c18] px-3 text-sm text-white outline-none focus:border-violet-300/70 sm:w-72" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar email o nombre de usuario" value={search} /></div>
      {users.isPending ? <p className="py-10 text-sm text-slate-400">Cargando usuarios…</p> : null}{users.isError ? <ErrorMessage>No se pudo cargar la lista de usuarios.</ErrorMessage> : null}
      {users.data ? <><ManualGrantForm onGrant={(input) => grantMutation.mutate(input)} pending={grantMutation.isPending} users={users.data.users} />
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-white/8 text-xs uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-3 py-3">Usuario</th><th className="px-3 py-3">Rol</th><th className="px-3 py-3">Acceso</th><th className="px-3 py-3">Último acceso</th><th className="px-3 py-3">Acciones</th></tr></thead><tbody>{users.data.users.map((user) => <UserRow key={user.id} onAction={(action) => userMutation.mutate({ user, action })} pending={userMutation.isPending} user={user} />)}</tbody></table></div></> : null}
      {userMutation.isError || grantMutation.isError ? <ErrorMessage>{readableError(userMutation.error ?? grantMutation.error)}</ErrorMessage> : null}
    </section>

    <section className="mt-6 rounded-2xl border border-white/8 bg-slate-950/55 p-5 sm:p-6"><h2 className="text-xl font-semibold text-white">Actividad reciente</h2><p className="mt-1 text-sm text-slate-400">Auditoría con nombre de usuario y email de quien actuó y de la cuenta afectada.</p>{audit.isPending ? <p className="py-6 text-sm text-slate-400">Cargando actividad…</p> : null}{audit.data ? <ol className="mt-5 divide-y divide-white/8">{audit.data.audit.slice(0, 30).map((entry) => <li className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm" key={entry.id}><div><p className="font-medium text-slate-200">{auditLabel(entry.action)}</p>{entry.actor ? <p className="mt-1 text-xs text-slate-400">Ejecutado por: {entry.actor.username} · {entry.actor.email}</p> : null}{entry.target ? <p className="mt-1 text-xs text-slate-400">Cuenta afectada: {entry.target.username} · {entry.target.email}</p> : null}</div><span className="text-xs text-slate-500">{formatDate(entry.createdAt)}</span></li>)}</ol> : null}</section>
  </div></main>;
}

function PaymentRequestCard({ request, notes, pending, onNotes, onReview }: { request: AdminPaymentRequest; notes: string; pending: boolean; onNotes: (value: string) => void; onReview: (decision: Exclude<PaymentRequestStatus, "PENDING">) => void }) {
  const reviewable = request.status === "PENDING" || request.status === "NEEDS_REVIEW";
  return <article className="min-w-0 rounded-2xl border border-white/8 bg-[#090b14] p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold text-white">{request.user?.username ?? "Usuario no disponible"}</p><p className="mt-1 break-all text-xs text-slate-400">{request.user?.email ?? request.userId}</p></div><StatusBadge status={request.status} /></div>
    <dl className="mt-5 grid gap-3 sm:grid-cols-2"><Data label="Método" value={methodLabel(request.method)} /><Data label="Importe" value={`${formatAmount(request.amount)} ${request.currency}`} /><Data label="Pago declarado" value={formatDate(request.declaredPaidAt)} /><Data label="Solicitud" value={formatDate(request.createdAt)} /><Data label="Referencia / TXID" value={request.referenceOrTxid} /><Data label="Pagador" value={request.payerName ?? "No corresponde"} /><Data label="Wallet remitente" value={request.senderWallet ?? "No informada"} /><Data label="ID de solicitud" value={request.id} /></dl>
    <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Evidencia</p>{request.proof ? <a className="mt-2 inline-flex min-h-11 max-w-full items-center gap-2 break-all text-sm font-semibold text-violet-200 hover:text-violet-100" href={request.proof.url} rel="noreferrer" target="_blank">{request.proof.fileName} · {formatBytes(request.proof.size)} <ExternalLink className="h-4 w-4 shrink-0" /></a> : <p className="mt-2 text-sm text-slate-400">Sin comprobante adjunto.</p>}</div>
    {request.notes ? <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-sm leading-6 text-amber-100"><strong>Notas:</strong> {request.notes}</div> : null}
    <dl className="mt-4 grid gap-3 sm:grid-cols-2"><Data label="Revisado" value={request.reviewedAt ? formatDate(request.reviewedAt) : "Pendiente"} /><Data label="Administrador" value={request.reviewer ? `${request.reviewer.username} · ${request.reviewer.email}` : "Pendiente"} /></dl>
    {reviewable ? <div className="mt-5 border-t border-white/8 pt-5"><label className="text-sm font-medium text-slate-300">Notas de revisión<textarea className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/10 bg-[#070912] p-3 text-sm text-white outline-none focus:border-violet-300/60" maxLength={2000} onChange={(event) => onNotes(event.target.value)} placeholder="Obligatorias al rechazar o pedir información" value={notes} /></label><div className="mt-3 grid gap-2 sm:grid-cols-3"><ReviewButton disabled={pending} onClick={() => onReview("APPROVED")} tone="approve">Aprobar y conceder acceso</ReviewButton><ReviewButton disabled={pending} onClick={() => onReview("REJECTED")} tone="reject">Rechazar</ReviewButton><ReviewButton disabled={pending} onClick={() => onReview("NEEDS_REVIEW")} tone="review">Solicitar más información</ReviewButton></div></div> : null}
  </article>;
}

function ManualGrantForm({ users, pending, onGrant }: { users: AdminUser[]; pending: boolean; onGrant: (input: { userId: string; plan: ManualPlan; reason?: string; expiresAt?: string | null }) => void }) {
  const [userId, setUserId] = useState("");
  const [plan, setPlan] = useState<ManualPlan>("FOUNDERS_LIFETIME");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const founders = plan === "FOUNDERS_LIFETIME";
  return <form className="mt-6 grid gap-3 rounded-xl border border-violet-300/12 bg-violet-400/[0.035] p-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_0.8fr_1.2fr_auto] xl:items-end" onSubmit={(event) => { event.preventDefault(); if (userId) onGrant({ userId, plan, reason: reason || undefined, expiresAt: founders || !expiresAt ? null : new Date(expiresAt).toISOString() }); }}><label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Usuario<select className={controlClass} onChange={(event) => setUserId(event.target.value)} required value={userId}><option value="">Seleccionar</option>{users.filter((user) => user.role !== "admin").map((user) => <option key={user.id} value={user.id}>{user.username} · {user.email}</option>)}</select></label><label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Tipo<select className={controlClass} onChange={(event) => { const value = event.target.value as ManualPlan; setPlan(value); if (value === "FOUNDERS_LIFETIME") setExpiresAt(""); }} value={plan}><option value="FOUNDERS_LIFETIME">Founders</option><option value="PARTNER">Partner</option><option value="TESTER">Tester</option><option value="COMPLIMENTARY">Cortesía</option></select></label><label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Vencimiento<input className={controlClass} disabled={founders} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setExpiresAt(event.target.value)} type="date" value={expiresAt} /></label><label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Motivo<input className={controlClass} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Motivo de la concesión" value={reason} /></label><button className="min-h-11 rounded-xl bg-violet-400 px-4 text-sm font-bold text-[#150c2d] disabled:opacity-50" disabled={pending || !userId} type="submit">Conceder</button><p className="text-xs leading-5 text-slate-500 sm:col-span-2 xl:col-span-5"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Sin fecha significa acceso permanente. La acción no modifica el rol de la cuenta.</p></form>;
}

function UserRow({ user, pending, onAction }: { user: AdminUser; pending: boolean; onAction: (action: UserAction) => void }) {
  const accessAction: UserAction = user.access.hasAccess ? "revoke" : user.access.status === "revoked" ? "restore" : "restore";
  return <tr className="border-b border-white/6 last:border-0"><td className="px-3 py-4"><p className="font-semibold text-slate-100">{user.username}</p><p className="mt-1 text-xs text-slate-500">{user.email}</p></td><td className="px-3 py-4 text-slate-300">{user.role === "admin" ? "Administrador" : "Usuario"}</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.access.hasAccess ? "bg-emerald-400/12 text-emerald-200" : "bg-slate-500/12 text-slate-300"}`}>{user.access.hasAccess ? planLabel(user.access.plan) : user.access.status === "revoked" ? "Revocado" : "Sin acceso"}</span></td><td className="px-3 py-4 text-slate-400">{user.lastLoginAt ? formatDate(user.lastLoginAt) : "—"}</td><td className="px-3 py-4"><div className="flex gap-2">{user.access.hasAccess || user.access.status === "revoked" ? <button className="min-h-9 rounded-lg border border-violet-300/25 px-2.5 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-300/10 disabled:opacity-50" disabled={pending} onClick={() => onAction(accessAction)} type="button">{accessAction === "revoke" ? "Revocar" : "Reactivar"}</button> : null}<button className="min-h-9 rounded-lg border border-white/12 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/6 disabled:opacity-50" disabled={pending} onClick={() => onAction(user.status === "blocked" ? "unblock" : "block")} type="button">{user.status === "blocked" ? "Desbloquear" : "Bloquear"}</button></div></td></tr>;
}

function ReviewButton({ children, disabled, onClick, tone }: { children: string; disabled: boolean; onClick: () => void; tone: "approve" | "reject" | "review" }) { const style = tone === "approve" ? "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100" : tone === "reject" ? "border-rose-300/25 bg-rose-300/[0.06] text-rose-100" : "border-amber-300/25 bg-amber-300/[0.06] text-amber-100"; return <button className={`min-h-12 rounded-xl border px-3 text-xs font-bold uppercase tracking-[0.05em] disabled:opacity-50 ${style}`} disabled={disabled} onClick={onClick} type="button">{children}</button>; }
function StatusBadge({ status }: { status: PaymentRequestStatus }) { const style = status === "APPROVED" ? "bg-emerald-300/10 text-emerald-200" : status === "REJECTED" ? "bg-rose-300/10 text-rose-200" : status === "NEEDS_REVIEW" ? "bg-amber-300/10 text-amber-200" : "bg-violet-300/10 text-violet-200"; return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{statusLabel(status)}</span>; }
function ErrorMessage({ children }: { children: React.ReactNode }) { return <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/8 p-3 text-sm text-rose-100" role="alert">{children}</p>; }
function Data({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</dt><dd className="mt-1 break-all text-xs font-medium leading-5 text-slate-300">{value}</dd></div>; }

const controlClass = "mt-2 min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#070912] px-3 text-sm normal-case tracking-normal text-white outline-none disabled:text-slate-600";
function refreshAdmin(queryClient: ReturnType<typeof useQueryClient>) { return Promise.all([queryClient.invalidateQueries({ queryKey: ["admin-users"] }), queryClient.invalidateQueries({ queryKey: ["admin-audit"] }), queryClient.invalidateQueries({ queryKey: ["admin-payment-requests"] })]); }
function readableError(error: unknown): string { if (!(error instanceof Error)) return "No se pudo completar la acción."; return error.message.replace(/^HTTP \d+ [^:]+:\s*/, ""); }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date); }
function formatAmount(value: string): string { return Number(value).toLocaleString("es-AR", { maximumFractionDigits: 8 }); }
function formatBytes(value: number): string { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
function methodLabel(method: AdminPaymentRequest["method"]): string { return method === "USDT_TRC20" ? "USDT TRC20" : "Mercado Pago / transferencia"; }
function statusLabel(status: PaymentRequestStatus): string { return status === "PENDING" ? "Pendiente" : status === "APPROVED" ? "Aprobada" : status === "REJECTED" ? "Rechazada" : "Más información"; }
function planLabel(plan: string | null): string { return plan === "FOUNDERS_LIFETIME" ? "Founders" : plan === "PARTNER" ? "Partner" : plan === "TESTER" ? "Tester" : plan === "COMPLIMENTARY" ? "Cortesía" : "Activo"; }
function auditLabel(action: string): string { const labels: Record<string, string> = { PAYMENT_REQUESTED: "Solicitud de pago creada", PAYMENT_APPROVED: "Pago aprobado", PAYMENT_REJECTED: "Pago rechazado", PAYMENT_NEEDS_REVIEW: "Se solicitó más información", ACCESS_GRANTED: "Acceso concedido", ACCESS_REVOKED: "Acceso revocado", ACCESS_RESTORED: "Acceso reactivado" }; return labels[action] ?? action; }
