import { useEffect, useState, type FormEvent } from "react";
import { requestPasswordReset, resetPassword, verifyEmail } from "@workspace/api-client-react";
import { Brand } from "./PublicLanding";

export function AuthRecovery({ mode }: { mode: "request" | "reset" | "verify" }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  useEffect(() => {
    if (mode !== "verify" || !token) return;
    setPending(true);
    void verifyEmail(token)
      .then(() => setMessage("Tu email fue verificado correctamente."))
      .catch(() => setError("El enlace no es válido o ya venció."))
      .finally(() => setPending(false));
  }, [mode, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true); setError(null); setMessage(null);
    try {
      if (mode === "request") {
        await requestPasswordReset(String(values.get("email") ?? ""));
        setMessage("Si existe una cuenta para ese email, vas a recibir instrucciones para continuar.");
      } else {
        const password = String(values.get("password") ?? "");
        const confirmation = String(values.get("confirmation") ?? "");
        if (!token) throw new Error("missing-token");
        if (password !== confirmation) throw new Error("password-mismatch");
        await resetPassword(token, password);
        setMessage("La contraseña fue actualizada. Ya podés iniciar sesión nuevamente.");
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "password-mismatch" ? "Las contraseñas no coinciden." : "No se pudo completar la solicitud. Revisá el enlace o intentá más tarde.");
    } finally { setPending(false); }
  }

  const title = mode === "request" ? "Recuperar contraseña" : mode === "reset" ? "Crear una nueva contraseña" : "Verificar email";
  return <main className="grid min-h-screen place-items-center overflow-x-hidden bg-[#070812] px-4 py-8 text-slate-100"><section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0d1b] p-6 sm:p-8"><a className="mb-8 inline-flex min-h-11 items-center text-sm text-slate-400 hover:text-white" href="/">← Volver</a><Brand /><h1 className="mt-8 text-2xl font-semibold text-white">{title}</h1>
    {mode === "verify" ? <p className="mt-4 text-sm leading-6 text-slate-300">{pending ? "Verificando…" : token ? "Comprobación finalizada." : "Falta el token de verificación."}</p> : <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>{mode === "request" ? <Field label="Email" name="email" type="email" autoComplete="email" required /> : <><Field label="Nueva contraseña" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /><Field label="Repetir contraseña" name="confirmation" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></>}<button className="min-h-12 w-full rounded-xl bg-violet-400 px-4 text-sm font-bold text-[#130c29] disabled:opacity-60" disabled={pending} type="submit">{pending ? "Procesando…" : "Continuar"}</button></form>}
    {message ? <p className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3 text-sm leading-6 text-emerald-100">{message}</p> : null}{error || (mode === "verify" && !token) ? <p className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3 text-sm leading-6 text-rose-100" role="alert">{error ?? "El enlace no contiene un token válido."}</p> : null}<a className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-violet-200" href="/?acceso=login">Ir al inicio de sesión</a></section></main>;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="grid gap-2 text-sm font-medium text-slate-200">{label}<input className="min-h-12 rounded-xl border border-white/10 bg-[#090c18] px-3 text-base text-white outline-none focus:border-violet-300/70" {...props} /></label>; }
