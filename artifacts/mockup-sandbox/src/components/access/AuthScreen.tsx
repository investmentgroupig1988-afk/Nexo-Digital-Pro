import { useState, type FormEvent } from "react";
import { ApiError, login, register } from "@workspace/api-client-react";
import { Brand } from "./PublicLanding";

type AuthScreenProps = {
  mode: "login" | "register";
  onComplete: () => Promise<void> | void;
  onSwitchMode: () => void;
  onBack: () => void;
};

export function AuthScreen({ mode, onComplete, onSwitchMode, onBack }: AuthScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);

    try {
      const email = String(values.get("email") ?? "");
      const password = String(values.get("password") ?? "");
      if (mode === "register") {
        await register({
          email,
          password,
          username: String(values.get("username") ?? ""),
          name: String(values.get("name") ?? "").trim() || undefined,
        });
      } else {
        await login({ email, password });
      }
      await onComplete();
    } catch (caught) {
      setError(readError(caught, mode));
    } finally {
      setSubmitting(false);
    }
  }

  const isRegister = mode === "register";
  return (
    <main className="grid min-h-screen place-items-center overflow-x-hidden bg-[#070812] px-4 py-8 text-slate-100">
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.22),transparent_62%)]" />
      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0d1b]/90 p-6 shadow-[0_25px_90px_rgba(0,0,0,0.4)] backdrop-blur-md sm:p-8">
        <button className="mb-8 text-sm font-medium text-slate-400 transition hover:text-white" onClick={onBack} type="button">← Volver</button>
        <Brand />
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-violet-200">{isRegister ? "Tu cuenta" : "Acceso seguro"}</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">{isRegister ? "Crea tu cuenta" : "Iniciá sesión"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{isRegister ? "Elegí un nombre de usuario único. El acceso al panel privado se concede por separado." : "Usá el email y la contraseña de tu cuenta."}</p>

        <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}>
          {isRegister ? <Field label="Nombre de usuario" name="username" autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" helper="Entre 3 y 32 caracteres: letras, números o _." required /> : null}
          {isRegister ? <Field label="Nombre (opcional)" name="name" autoComplete="name" maxLength={120} /> : null}
          <Field label="Email" name="email" type="email" autoComplete="email" maxLength={320} required />
          <Field label="Contraseña" name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={isRegister ? 12 : 1} maxLength={128} helper={isRegister ? "Mínimo 12 caracteres." : undefined} required />
          {error ? <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/8 p-3 text-sm leading-5 text-rose-100">{error}</p> : null}
          <button className="w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-bold text-[#130c29] transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting} type="submit">{submitting ? "Procesando…" : isRegister ? "Crear cuenta" : "Iniciar sesión"}</button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">{isRegister ? "¿Ya tenés cuenta?" : "¿Todavía no tenés cuenta?"} <button className="font-semibold text-violet-200 hover:text-violet-100" onClick={onSwitchMode} type="button">{isRegister ? "Iniciá sesión" : "Registrate"}</button></p>
      </section>
    </main>
  );
}

function Field({ label, helper, ...input }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; helper?: string }) {
  const id = `auth-${input.name}`;
  return <label className="grid gap-2 text-sm font-medium text-slate-200" htmlFor={id}>{label}<input className="rounded-xl border border-white/10 bg-[#090c18] px-3 py-2.5 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/70 focus:ring-2 focus:ring-violet-400/25" id={id} {...input} />{helper ? <span className="text-xs font-normal leading-5 text-slate-500">{helper}</span> : null}</label>;
}

function readError(error: unknown, mode: "login" | "register"): string {
  if (error instanceof ApiError && error.data && typeof error.data === "object" && "error" in error.data && typeof error.data.error === "string") return error.data.error;
  if (error instanceof ApiError && error.status === 401) return "El email o la contraseña no son correctos.";
  if (error instanceof ApiError && error.status === 429) return "Demasiados intentos. Esperá unos minutos antes de reintentar.";
  return mode === "register" ? "No se pudo crear la cuenta. Revisá los datos e intentá nuevamente." : "No se pudo iniciar sesión. Intentá nuevamente.";
}
