import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminAudit, getAdminUsers, grantLifetimeAccess, restoreAccess, revokeAccess, setUserBlocked, type AccountResponse, type AdminUser } from "@workspace/api-client-react";
import { useState } from "react";
import { Brand } from "./PublicLanding";

export function AdminPanel({ account, onAccount }: { account: AccountResponse; onAccount: () => void }) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["admin-users", search], queryFn: ({ signal }) => getAdminUsers(search, signal) });
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: ({ signal }) => getAdminAudit(signal) });
  const mutation = useMutation({
    mutationFn: async ({ user, action }: { user: AdminUser; action: "grant" | "revoke" | "restore" | "block" | "unblock" }) => {
      if (action === "grant") return grantLifetimeAccess(user.id);
      if (action === "revoke") return revokeAccess(user.id);
      if (action === "restore") return restoreAccess(user.id);
      return setUserBlocked(user.id, action === "block");
    },
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["admin-users"] }), queryClient.invalidateQueries({ queryKey: ["admin-audit"] })]); },
  });

  return <main className="min-h-screen overflow-x-hidden bg-[#070812] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8"><header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#0b0d1b]/85 px-4 py-3.5"><Brand /><div className="flex gap-2"><span className="rounded-lg bg-violet-400/12 px-3 py-2 text-sm font-semibold text-violet-100">Administración</span><button className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/6" onClick={onAccount} type="button">Cuenta</button></div></header>
    <section className="mt-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Acceso restringido</p><h1 className="mt-2 text-3xl font-semibold text-white">Gestión comercial</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Sesión de {account.user.email}. Las acciones se verifican en el servidor y quedan registradas en la auditoría.</p></section>
    <section className="mt-7 rounded-2xl border border-white/8 bg-slate-950/55 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">Usuarios</h2><p className="mt-1 text-sm text-slate-400">Concedé o revocá acceso sin crear pagos ficticios.</p></div><input aria-label="Buscar usuarios" className="w-full rounded-xl border border-white/10 bg-[#090c18] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-300/70 sm:w-72" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar email o username" value={search} /></div>
      {users.isPending ? <p className="py-10 text-sm text-slate-400">Cargando usuarios…</p> : null}{users.isError ? <p role="alert" className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/8 p-3 text-sm text-rose-100">No se pudo cargar la lista de usuarios.</p> : null}
      {users.data ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-white/8 text-xs uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-3 py-3">Usuario</th><th className="px-3 py-3">Rol</th><th className="px-3 py-3">Acceso</th><th className="px-3 py-3">Último acceso</th><th className="px-3 py-3">Acciones</th></tr></thead><tbody>{users.data.users.map((user) => <UserRow key={user.id} onAction={(action) => mutation.mutate({ user, action })} pending={mutation.isPending} user={user} />)}</tbody></table></div> : null}
      {mutation.isError ? <p role="alert" className="mt-4 text-sm text-rose-200">No se pudo completar la acción. La autorización y el estado actual fueron comprobados por el servidor.</p> : null}
    </section>
    <section className="mt-6 rounded-2xl border border-white/8 bg-slate-950/55 p-5 sm:p-6"><h2 className="text-xl font-semibold text-white">Actividad reciente</h2><p className="mt-1 text-sm text-slate-400">Registro de acciones administrativas y de cuenta, sin secretos ni credenciales.</p>{audit.isPending ? <p className="py-6 text-sm text-slate-400">Cargando actividad…</p> : null}{audit.data ? <ol className="mt-5 divide-y divide-white/8">{audit.data.audit.slice(0, 20).map((entry) => <li className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm" key={entry.id}><div><p className="font-medium text-slate-200">{entry.action}</p>{entry.actor ? <p className="mt-1 text-xs text-slate-400">Ejecutado por: {entry.actor.username} · {entry.actor.email}</p> : null}{entry.target ? <p className="mt-1 text-xs text-slate-400">Usuario afectado: {entry.target.username} · {entry.target.email}</p> : null}</div><span className="text-slate-500">{formatDate(entry.createdAt)}</span></li>)}</ol> : null}</section>
  </div></main>;
}

function UserRow({ user, pending, onAction }: { user: AdminUser; pending: boolean; onAction: (action: "grant" | "revoke" | "restore" | "block" | "unblock") => void }) {
  const accessAction = user.access.hasAccess ? "revoke" : user.access.status === "REVOKED" ? "restore" : "grant";
  return <tr className="border-b border-white/6 last:border-0"><td className="px-3 py-4"><p className="font-semibold text-slate-100">{user.username}</p><p className="mt-1 text-xs text-slate-500">{user.email}</p></td><td className="px-3 py-4 text-slate-300">{user.role}</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.access.hasAccess ? "bg-emerald-400/12 text-emerald-200" : "bg-slate-500/12 text-slate-300"}`}>{user.access.hasAccess ? user.access.plan ?? "Activo" : user.access.status ?? "Sin acceso"}</span></td><td className="px-3 py-4 text-slate-400">{user.lastLoginAt ? formatDate(user.lastLoginAt) : "—"}</td><td className="px-3 py-4"><div className="flex gap-2"><button className="rounded-lg border border-violet-300/25 px-2.5 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-300/10 disabled:opacity-50" disabled={pending} onClick={() => onAction(accessAction)} type="button">{accessAction === "grant" ? "Conceder" : accessAction === "revoke" ? "Revocar" : "Reactivar"}</button><button className="rounded-lg border border-white/12 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/6 disabled:opacity-50" disabled={pending} onClick={() => onAction(user.status === "blocked" ? "unblock" : "block")} type="button">{user.status === "blocked" ? "Desbloquear" : "Bloquear"}</button></div></td></tr>;
}

function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date); }
