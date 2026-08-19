import type { AccountResponse } from "@workspace/api-client-react";
import { Brand } from "./PublicLanding";

type AccountPanelProps = {
  account: AccountResponse;
  onDashboard: () => void;
  onLogout: () => Promise<void> | void;
  onAdmin?: () => void;
};

export function AccountPanel({ account, onDashboard, onLogout, onAdmin }: AccountPanelProps) {
  const { user, access } = account;
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070812] text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#0b0d1b]/85 px-4 py-3.5">
          <Brand />
          <div className="flex items-center gap-2"><button className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/6 hover:text-white" onClick={onDashboard} type="button">Dashboard</button>{onAdmin ? <button className="rounded-lg px-3 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-300/10" onClick={onAdmin} type="button">Admin</button> : null}<button className="rounded-lg border border-white/12 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/6" onClick={() => void onLogout()} type="button">Cerrar sesión</button></div>
        </header>
        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
          <article className="rounded-2xl border border-white/8 bg-slate-950/55 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Tu cuenta</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{user.username}</h1>
            <dl className="mt-7 grid gap-4 sm:grid-cols-2"><Data label="Email" value={user.email} /><Data label="Username" value={user.username} /><Data label="Fecha de registro" value={formatDate(user.createdAt)} /><Data label="Último acceso" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : "No disponible"} /></dl>
            <div className="mt-7 rounded-xl border border-white/8 bg-[#090c18]/80 p-4"><p className="font-semibold text-slate-200">Contraseña</p><p className="mt-1 text-sm leading-6 text-slate-400">La recuperación y el cambio de contraseña están preparados para una futura configuración de correo seguro.</p></div>
          </article>
          <article className="rounded-2xl border border-violet-300/18 bg-violet-400/7 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Estado del plan</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{access.hasAccess ? planLabel(access.plan) : "Sin acceso privado"}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{access.hasAccess ? "Tu acceso fue confirmado por el servidor." : "Podés conocer el producto y ver una demostración. El acceso al panel privado se concede cuando corresponde."}</p>
            <dl className="mt-6 space-y-3"><Data label="Estado" value={access.status ?? "Sin acceso"} /><Data label="Tipo de acceso" value={access.accessType ? accessTypeLabel(access.accessType) : "No disponible"} /><Data label="Fecha de acceso" value={access.grantedAt ? formatDate(access.grantedAt) : "No disponible"} /><Data label="Vencimiento" value={access.expiresAt ? formatDate(access.expiresAt) : "Sin vencimiento"} /></dl>
            {access.hasAccess ? <button className="mt-7 w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-bold text-[#130c29] hover:bg-violet-300" onClick={onDashboard} type="button">Abrir panel privado</button> : <p className="mt-7 rounded-xl border border-white/10 bg-[#090c18]/60 p-3 text-center text-sm font-semibold text-violet-100">Founders Lifetime · USD 27<br /><span className="font-normal text-slate-400">Compra próximamente</span></p>}
          </article>
        </section>
      </div>
    </main>
  );
}

function Data({ label, value }: { label: string; value: string }) { return <div><dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-200">{value}</dd></div>; }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "No disponible" : new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function planLabel(plan: string | null): string { return plan === "FOUNDERS_LIFETIME" ? "Founders Lifetime" : plan === "MONTHLY_PRO" ? "Monthly Pro" : "Acceso privado"; }
function accessTypeLabel(type: string): string { return type === "ADMIN_MANUAL" ? "Concesión administrativa" : type === "PAYMENT" ? "Pago" : type === "PROMOTION" ? "Promoción" : type; }
