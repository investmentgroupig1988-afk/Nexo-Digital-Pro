import { useState, type ComponentType, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleGauge,
  Database,
  Layers3,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

type PublicLandingProps = {
  onLogin: () => void;
  onRegister: () => void;
};

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;
type LegalDocument = "terms" | "privacy" | "refunds" | "contact";

const capabilities: Array<{ title: string; description: string; icon: Icon }> = [
  {
    title: "Análisis técnico",
    description: "Indicadores, Fibonacci y estructura de mercado organizados en una sola lectura.",
    icon: BarChart3,
  },
  {
    title: "Datos reales",
    description: "Información obtenida desde proveedores reales y procesada por el sistema.",
    icon: Database,
  },
  {
    title: "Señal técnica y contexto",
    description: "Una lectura orientativa para BTC acompañada por indicadores y estructura, sin ejecutar operaciones.",
    icon: Activity,
  },
];

const steps = [
  ["Creá tu cuenta", "Registrate con email, contraseña y nombre de usuario."],
  ["Elegí tu forma de pago", "Seleccioná la alternativa disponible para tu ubicación."],
  ["Enviá tu solicitud", "Adjuntá la referencia, TXID o comprobante solicitado."],
  ["Validamos el pago", "El equipo verifica la operación y habilita el acceso correspondiente."],
  ["Entrá a Nexo Digital Pro", "Accedé al panel privado y a las herramientas habilitadas."],
] as const;

const faqs = [
  ["¿Qué incluye mi acceso?", "El acceso Founders contempla el panel privado y las herramientas habilitadas para analizar BTC con indicadores, niveles, Fibonacci y estructura de mercado."],
  ["¿El pago es realmente único?", "Sí. El acceso Founders se ofrece por USD 27 en un único pago, sin suscripción mensual para miembros Founders."],
  ["¿Nexo Digital Pro ejecuta operaciones?", "No. Nexo Digital Pro organiza información técnica; cada usuario decide si opera y ejecuta sus propias decisiones fuera de la plataforma."],
  ["¿Qué mercados están disponibles?", "BTC está disponible. XAUUSD permanece fuera de la oferta comercial y se mostrará como disponible únicamente cuando esté habilitado para lanzamiento."],
  ["¿Cómo se activa mi cuenta después del pago?", "Desde tu cuenta creás una solicitud y cargás la referencia, TXID o comprobante. El equipo revisa el registro y, al aprobarlo, el sistema habilita el acceso Founders."],
  ["¿Puedo usar Nexo Digital Pro desde el celular?", "Sí. La experiencia está diseñada primero para celular y se adapta también a tablet y escritorio."],
  ["¿Qué ocurre si tengo un problema con mi acceso?", "Podés contactar al canal oficial de soporte y verificación por WhatsApp. Nunca compartas contraseñas, tokens, cookies ni claves privadas."],
  ["¿Puedo perder el acceso?", "El acceso puede bloquearse o revocarse ante una incidencia de seguridad, fraude o incumplimiento que requiera revisión. Toda decisión queda registrada por el sistema."],
  ["¿Los análisis garantizan resultados?", "No. Todo análisis tiene riesgo y puede fallar. Los resultados históricos tampoco garantizan resultados futuros."],
] as const;

const legalDocuments: Record<LegalDocument, { title: string; body: string }> = {
  terms: {
    title: "Términos y Condiciones",
    body: "El documento contractual completo todavía no fue incorporado. Debe publicarse y revisarse antes de habilitar el cobro.",
  },
  privacy: {
    title: "Política de Privacidad",
    body: "La política completa sobre tratamiento y protección de datos personales todavía debe publicarse antes del lanzamiento comercial.",
  },
  refunds: {
    title: "Política de Reembolsos",
    body: "La política comercial de reembolsos requiere una definición expresa antes de habilitar pagos. No se presentan aquí condiciones que todavía no fueron aprobadas.",
  },
  contact: {
    title: "Contacto",
    body: "Canal oficial de soporte y verificación por WhatsApp: +54 9 11 5155-0781. Nunca envíes contraseñas, tokens, cookies ni claves privadas.",
  },
};

export function PublicLanding({ onLogin, onRegister }: PublicLandingProps) {
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#05060b] text-slate-100 selection:bg-violet-400/30">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.17),transparent_67%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-[37rem] h-80 w-48 rounded-full bg-violet-600/5 blur-3xl sm:h-96 sm:w-80" />

      <header className="relative z-40 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Brand />
        <div className="flex items-center gap-1 sm:gap-2">
          <button className="min-h-11 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 sm:px-4" onClick={onLogin} type="button">Iniciar sesión</button>
          <button className="hidden min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:border-violet-300/40 hover:bg-violet-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 sm:inline-flex sm:items-center" onClick={onRegister} type="button">Crear cuenta</button>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12">
        <section className="pb-20 pt-14 sm:pb-28 sm:pt-20 lg:pb-32 lg:pt-24">
          <div className="max-w-5xl">
            <Eyebrow>Panel de análisis</Eyebrow>
            <h1 className="mt-5 max-w-5xl text-[2.72rem] font-semibold leading-[0.98] tracking-[-0.045em] text-white min-[390px]:text-[3rem] sm:text-6xl lg:text-[5.3rem] lg:leading-[0.96]">
              Analizá el mercado con más contexto, en un solo panel.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">Nexo Digital Pro organiza indicadores técnicos, estructura de mercado y niveles relevantes con datos reales para ayudarte a evaluar el mercado con una lectura más clara.</p>
            <div className="mt-8 flex flex-col gap-3 min-[430px]:flex-row">
              <PrimaryButton onClick={onRegister}>Crear cuenta</PrimaryButton>
              <SecondaryButton onClick={onLogin}>Ya tengo cuenta</SecondaryButton>
            </div>
            <p className="mt-6 flex max-w-lg items-start gap-2 text-xs leading-5 text-slate-500 sm:text-sm"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-violet-300/80" strokeWidth={1.8} />No ejecuta operaciones. No promete resultados.</p>
          </div>
        </section>

        <section aria-labelledby="capacidades-title" className="border-t border-white/[0.07] py-20 sm:py-24">
          <SectionHeading eyebrow="Lo esencial" id="capacidades-title" title="Una lectura técnica, sin ruido innecesario." description="Tres capacidades concretas para entender qué está mostrando el mercado antes de tomar una decisión." />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {capabilities.map((capability, index) => <CapabilityCard key={capability.title} {...capability} number={`0${index + 1}`} />)}
          </div>
        </section>

        <section aria-labelledby="founders-title" className="py-8 sm:py-14">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-violet-300/20 bg-[#0c0b15] px-5 py-8 shadow-[0_28px_90px_rgba(0,0,0,0.32)] sm:px-9 sm:py-10 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:px-12 lg:py-12">
            <div aria-hidden="true" className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-violet-500/12 blur-3xl" />
            <div className="relative">
              <Eyebrow>Acceso Founders</Eyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl" id="founders-title">Entrá en la etapa inicial.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">Acceso permanente a Nexo Digital Pro para quienes ingresen durante la etapa Founders.</p>
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-violet-100"><Check className="h-4 w-4 text-violet-300" />Sin suscripción mensual para miembros Founders.</p>
            </div>
            <div className="relative mt-8 border-t border-white/8 pt-7 lg:mt-0 lg:min-w-64 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
              <p className="text-5xl font-semibold tracking-[-0.05em] text-white">USD 27</p>
              <p className="mt-1 text-sm text-slate-400">pago único</p>
              <button className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-400 px-5 text-sm font-bold text-[#150c2d] transition hover:bg-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200" onClick={onRegister} type="button">Obtener acceso <ArrowRight className="h-4 w-4" /></button>
              <p className="mt-3 text-xs leading-5 text-slate-500">Creá tu cuenta para elegir el método y cargar la evidencia del pago.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="preview-title" className="py-20 sm:py-28">
          <SectionHeading eyebrow="Producto real" id="preview-title" title="Todo el contexto técnico, reunido." description="Una vista previa estructural del panel privado. Las cotizaciones y los valores se consultan desde el producto, no se inventan en esta demostración." />
          <ProductPreview />
        </section>

        <section aria-labelledby="servicio-title" className="grid gap-10 border-y border-white/[0.07] py-20 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <Eyebrow>Información del servicio</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-5xl" id="servicio-title">Qué es Nexo Digital Pro</h2>
          </div>
          <div className="space-y-5 text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            <p>Nexo Digital Pro procesa indicadores, niveles y estructura de mercado mediante reglas técnicas definidas. Ordena esa información para que puedas consultar el contexto de BTC desde una interfaz clara.</p>
            <p className="text-slate-400">No reemplaza tu criterio, no administra capital y no conecta tu cuenta con un bróker o una plataforma de intercambio para ejecutar operaciones.</p>
          </div>
        </section>

        <section aria-labelledby="pasos-title" className="py-20 sm:py-28">
          <SectionHeading eyebrow="Acceso" id="pasos-title" title="Cómo funciona" description="Un circuito simple, con validación humana antes de habilitar el acceso comercial." />
          <ol className="mt-12 border-t border-white/8">
            {steps.map(([title, description], index) => <Step description={description} index={index + 1} key={title} title={title} />)}
          </ol>
          <p className="mt-6 max-w-2xl text-xs leading-5 text-slate-500">La solicitud queda guardada antes de abrir WhatsApp. La validación administrativa en la plataforma es la fuente de verdad.</p>
        </section>

        <section aria-labelledby="mercados-title" className="pb-20 sm:pb-28">
          <SectionHeading eyebrow="Cobertura" id="mercados-title" title="Mercados" description="Disponibilidad comercial comunicada sin confundir integración técnica con acceso de lanzamiento." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <MarketStatus available label="BTC" detail="Bitcoin · BTCUSDT" />
            <MarketStatus label="XAUUSD" detail="Oro frente al dólar" />
          </div>
        </section>

        <section aria-labelledby="riesgo-title" className="rounded-[1.5rem] border border-amber-400/25 bg-amber-400/[0.055] p-5 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200"><ShieldAlert className="h-5 w-5" strokeWidth={1.8} /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200/80">Aviso legal y de riesgo</p>
              <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl" id="riesgo-title">Las decisiones y el riesgo siguen bajo tu control.</h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
                <p>Nexo Digital Pro brinda información técnica y no constituye asesoramiento financiero. No garantiza ganancias y los resultados históricos no garantizan resultados futuros.</p>
                <p>Vos decidís si operás. Nexo Digital Pro no ejecuta operaciones, no administra fondos y no abre ni cierra posiciones por el usuario.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-title" className="py-20 sm:py-28" id="preguntas">
          <SectionHeading eyebrow="Antes de empezar" id="faq-title" title="Preguntas frecuentes" description="Respuestas breves sobre acceso, mercados y alcance del servicio." />
          <div className="mt-10 divide-y divide-white/8 border-y border-white/8">
            {faqs.map(([question, answer]) => <Faq answer={answer} key={question} question={question} />)}
          </div>
        </section>

        <section className="pb-20 sm:pb-28">
          <div className="rounded-[1.75rem] border border-white/8 bg-[#0a0b12] px-5 py-12 text-center sm:px-10 sm:py-16">
            <Sparkles className="mx-auto h-6 w-6 text-violet-300" strokeWidth={1.7} />
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Creá tu cuenta y conocé Nexo Digital Pro</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">Registrate, elegí tu método de pago y enviá la solicitud desde tu cuenta.</p>
            <div className="mx-auto mt-8 flex max-w-md flex-col justify-center gap-3 min-[430px]:flex-row">
              <PrimaryButton onClick={onRegister}>Crear cuenta</PrimaryButton>
              <SecondaryButton onClick={onLogin}>Iniciar sesión</SecondaryButton>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-white/[0.07] bg-black/20">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-9 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12">
          <div>
            <Brand />
            <p className="mt-4 max-w-md text-xs leading-5 text-slate-500">Análisis técnico e información de mercado. No constituye asesoramiento financiero ni ejecuta operaciones.</p>
          </div>
          <nav aria-label="Información legal" className="flex max-w-xl flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-slate-400">
            <FooterButton onClick={() => setLegalDocument("terms")}>Términos y Condiciones</FooterButton>
            <FooterButton onClick={() => setLegalDocument("privacy")}>Política de Privacidad</FooterButton>
            <FooterButton onClick={() => setLegalDocument("refunds")}>Política de Reembolsos</FooterButton>
            <FooterButton onClick={() => setLegalDocument("contact")}>Contacto</FooterButton>
          </nav>
        </div>
      </footer>

      {legalDocument ? <LegalNotice document={legalDocument} onClose={() => setLegalDocument(null)} /> : null}
    </main>
  );
}

export function Brand() {
  return <div className="flex min-w-0 items-center gap-2.5"><div aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-violet-300/25 bg-violet-500/10 text-sm font-bold text-violet-100">N</div><p className="max-w-[9.5rem] text-[0.68rem] font-bold leading-4 tracking-[0.16em] text-white min-[390px]:max-w-none min-[390px]:text-xs sm:text-sm">NEXO DIGITAL PRO</p></div>;
}

function Eyebrow({ children }: { children: string }) {
  return <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-violet-300 sm:text-xs">{children}</p>;
}

function SectionHeading({ eyebrow, id, title, description }: { eyebrow: string; id: string; title: string; description: string }) {
  return <div className="max-w-3xl"><Eyebrow>{eyebrow}</Eyebrow><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl" id={id}>{title}</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base sm:leading-7">{description}</p></div>;
}

function PrimaryButton({ children, onClick }: { children: string; onClick: () => void }) {
  return <button className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-400 px-6 text-sm font-bold text-[#150c2d] transition hover:bg-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 min-[430px]:w-auto" onClick={onClick} type="button">{children}</button>;
}

function SecondaryButton({ children, onClick }: { children: string; onClick: () => void }) {
  return <button className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-white/12 bg-white/[0.025] px-6 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 min-[430px]:w-auto" onClick={onClick} type="button">{children}</button>;
}

function CapabilityCard({ title, description, icon: IconComponent, number }: { title: string; description: string; icon: Icon; number: string }) {
  return <article className="group min-h-60 rounded-[1.4rem] border border-white/[0.075] bg-[#090a11] p-6 transition hover:border-violet-300/20 sm:p-7"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/15 bg-violet-400/[0.07] text-violet-300"><IconComponent className="h-5 w-5" strokeWidth={1.7} /></span><span className="text-xs font-medium tracking-[0.16em] text-slate-700">{number}</span></div><h3 className="mt-12 text-xl font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{description}</p></article>;
}

function ProductPreview() {
  return <div className="relative mt-10 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#090a11] p-3 shadow-[0_34px_100px_rgba(0,0,0,0.4)] sm:p-5 lg:p-7">
    <div aria-hidden="true" className="absolute left-1/3 top-0 h-56 w-72 -translate-y-1/2 rounded-full bg-violet-600/10 blur-3xl" />
    <div className="relative rounded-[1.2rem] border border-white/[0.07] bg-[#07080e]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4 sm:px-6"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /><span className="text-xs font-semibold text-slate-300">BTC · Disponible</span></div><span className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">Panel privado</span></div>
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="space-y-4">
          <PreviewBlock icon={CircleGauge} label="Activo y temporalidad"><p className="mt-2 text-lg font-semibold text-white">BTCUSDT</p><div className="mt-3 flex flex-wrap gap-1.5">{["15 min", "1 h", "4 h", "1 d"].map((item) => <span className="rounded-md border border-white/8 bg-white/[0.035] px-2 py-1 text-[0.65rem] font-medium text-slate-400" key={item}>{item}</span>)}</div></PreviewBlock>
          <PreviewBlock icon={Layers3} label="Herramientas"><div className="mt-3 flex flex-wrap gap-2">{["EMA", "RSI", "Fibonacci", "Estructura"].map((item) => <span className="rounded-full border border-violet-300/15 bg-violet-400/[0.06] px-2.5 py-1 text-[0.65rem] font-semibold text-violet-200" key={item}>{item}</span>)}</div></PreviewBlock>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4 sm:p-5">
          <div className="flex items-center justify-between"><div><p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-500">Estado del análisis</p><p className="mt-1.5 text-sm font-semibold text-white">Se calcula al realizar la consulta</p></div><Activity className="h-5 w-5 text-violet-300" strokeWidth={1.6} /></div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3"><PreviewMetric label="Indicadores" value="Lectura técnica" /><PreviewMetric label="Estructura" value="Contexto de mercado" /><PreviewMetric label="Niveles" value="Referencias calculadas" /></div>
          <div className="mt-5 rounded-lg border border-dashed border-white/10 px-4 py-5 text-center text-xs leading-5 text-slate-500">Sin cotizaciones ficticias en esta vista previa.<br />Los datos se cargan desde el sistema real.</div>
        </div>
      </div>
    </div>
  </div>;
}

function PreviewBlock({ icon: IconComponent, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  return <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-500"><IconComponent className="h-3.5 w-3.5 text-violet-300" strokeWidth={1.8} />{label}</div>{children}</div>;
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-slate-600">{label}</p><p className="mt-1.5 text-xs font-medium leading-5 text-slate-300">{value}</p></div>;
}

function Step({ index, title, description }: { index: number; title: string; description: string }) {
  return <li className="grid grid-cols-[3.5rem_1fr] gap-3 border-b border-white/8 py-7 sm:grid-cols-[5.5rem_0.7fr_1.3fr] sm:items-center sm:gap-6 sm:py-8"><span className="grid h-11 w-11 place-items-center rounded-full border border-violet-300/20 bg-violet-400/[0.06] text-sm font-semibold text-violet-200 sm:h-13 sm:w-13">{String(index).padStart(2, "0")}</span><h3 className="text-lg font-semibold text-white sm:text-xl">{title}</h3><p className="col-start-2 mt-1 text-sm leading-6 text-slate-400 sm:col-start-3 sm:mt-0">{description}</p></li>;
}

function MarketStatus({ available = false, label, detail }: { available?: boolean; label: string; detail: string }) {
  return <article className="flex items-center justify-between gap-4 rounded-[1.25rem] border border-white/[0.075] bg-[#090a11] p-5 sm:p-6"><div><p className="text-xl font-semibold text-white">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${available ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200" : "border-white/10 bg-white/[0.035] text-slate-400"}`}>{available ? "Disponible" : "Próximamente"}</span></article>;
}

function Faq({ question, answer }: { question: string; answer: string }) {
  return <details className="group"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-5 text-left text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-300 sm:text-base"><span>{question}</span><ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180 group-open:text-violet-300" /></summary><p className="max-w-3xl pb-6 pr-7 text-sm leading-6 text-slate-400 sm:text-base sm:leading-7">{answer}</p></details>;
}

function FooterButton({ children, onClick }: { children: string; onClick: () => void }) {
  return <button className="inline-flex min-h-11 items-center text-left underline-offset-4 transition hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300" onClick={onClick} type="button">{children}</button>;
}

function LegalNotice({ document, onClose }: { document: LegalDocument; onClose: () => void }) {
  const content = legalDocuments[document];
  return <div aria-labelledby="legal-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-end bg-black/75 p-3 backdrop-blur-sm sm:place-items-center" role="dialog"><button aria-label="Cerrar información legal" className="absolute inset-0 cursor-default" onClick={onClose} type="button" /><div className="relative w-full max-w-lg rounded-[1.4rem] border border-white/10 bg-[#0c0d15] p-6 shadow-2xl sm:p-8"><button aria-label="Cerrar" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/8 text-slate-400 transition hover:bg-white/5 hover:text-white" onClick={onClose} type="button"><X className="h-4 w-4" /></button><p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-violet-300">Documento pendiente de publicación</p><h2 className="mt-3 pr-10 text-2xl font-semibold text-white" id="legal-title">{content.title}</h2><p className="mt-4 text-sm leading-6 text-slate-300">{content.body}</p><button className="mt-7 min-h-11 w-full rounded-xl bg-white/[0.06] text-sm font-semibold text-white transition hover:bg-white/10" onClick={onClose} type="button">Entendido</button></div></div>;
}
