type PublicLandingProps = {
  onLogin: () => void;
  onRegister: () => void;
};

export function PublicLanding({ onLogin, onRegister }: PublicLandingProps) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070812] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 h-[38rem] bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.23),transparent_64%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between rounded-2xl border border-white/8 bg-[#0b0d1b]/85 px-4 py-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-md sm:px-6">
          <Brand />
          <div className="flex items-center gap-2">
            <button className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/6 hover:text-white" onClick={onLogin} type="button">Iniciar sesión</button>
            <button className="rounded-lg bg-violet-400 px-3.5 py-2 text-sm font-bold text-[#130c29] transition hover:bg-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200" onClick={onRegister} type="button">Registrarse</button>
          </div>
        </header>

        <section className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200">Información de mercado, sin promesas</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">Análisis técnico para decidir con más contexto.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Nexo Digital Pro reúne cotizaciones, indicadores, estructura de mercado y niveles técnicos con datos de proveedores reales. No ejecuta operaciones ni sustituye asesoramiento financiero.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="rounded-xl bg-violet-400 px-5 py-3 text-sm font-bold text-[#130c29] transition hover:bg-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200" onClick={onRegister} type="button">Crear cuenta</button>
              <button className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/6" onClick={onLogin} type="button">Ya tengo cuenta</button>
            </div>
          </div>
          <DemoCard />
        </section>

        <section className="grid gap-4 pb-12 md:grid-cols-3">
          <Feature title="Datos de mercado" description="BTCUSDT y XAUUSD consultados desde proveedores configurados en el servidor." />
          <Feature title="Lectura técnica" description="Indicadores, Fibonacci y estructura calculados por la API sobre datos históricos." />
          <Feature title="Acceso controlado" description="El panel privado se habilita únicamente cuando el servidor confirma tu acceso." />
        </section>

        <section className="mb-12 rounded-2xl border border-violet-300/20 bg-violet-400/8 p-6 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Plan de lanzamiento</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Founders Lifetime · USD 27</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Acceso vitalicio al producto adquirido. El cobro todavía no está habilitado: no se simula un checkout ni se procesa ningún pago en esta etapa.</p>
          </div>
          <span className="mt-4 inline-flex w-fit rounded-full border border-violet-200/25 bg-violet-200/10 px-3 py-1.5 text-sm font-semibold text-violet-100 sm:mt-0">Compra próximamente</span>
        </section>

        <footer className="border-t border-white/8 py-7 text-center text-xs leading-5 text-slate-500">Nexo Digital Pro proporciona análisis técnico e información de mercado. No constituye asesoramiento financiero ni ejecuta operaciones.</footer>
      </div>
    </main>
  );
}

export function Brand() {
  return <div className="flex min-w-0 items-center gap-3"><div aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-300/30 bg-violet-500/15 text-lg font-bold text-violet-100">N</div><p className="truncate text-sm font-bold tracking-[0.18em] text-white">NEXO DIGITAL PRO</p></div>;
}

function Feature({ title, description }: { title: string; description: string }) {
  return <article className="rounded-2xl border border-white/8 bg-slate-950/55 p-5"><h2 className="text-base font-semibold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{description}</p></article>;
}

function DemoCard() {
  return <aside className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#15112b] to-[#0a0c18] p-5 shadow-[0_25px_80px_rgba(0,0,0,0.35)] sm:p-6">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200">Vista de producto</p>
    <h2 className="mt-2 text-xl font-semibold text-white">Análisis técnico privado</h2>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <DemoMetric label="Mercados" value="BTCUSDT · XAUUSD" />
      <DemoMetric label="Cobertura" value="Indicadores y estructura" />
      <DemoMetric label="Acceso" value="Confirmado por servidor" />
      <DemoMetric label="Operaciones" value="No ejecuta trades" />
    </div>
    <p className="mt-5 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-5 text-slate-400">La imagen de producto es una demostración de interfaz. Los valores de mercado no se muestran aquí hasta que el acceso privado esté habilitado.</p>
  </aside>;
}

function DemoMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-black/20 p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1.5 text-sm font-semibold text-slate-200">{value}</p></div>;
}
