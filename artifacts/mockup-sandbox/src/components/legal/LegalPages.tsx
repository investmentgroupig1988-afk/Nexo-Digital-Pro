import { useState, type FormEvent, type ReactNode } from "react";
import { createConsumerRequest, type ConsumerRequestType } from "@workspace/api-client-react";
import { createLegalIdentity, isLegalIdentityComplete, PRODUCT } from "@workspace/product";
import { Brand } from "@/components/access/PublicLanding";

export type LegalPath = "/terminos" | "/privacidad" | "/reembolsos" | "/descargo-de-responsabilidad" | "/propiedad-intelectual" | "/contacto" | "/arrepentimiento" | "/baja-de-servicio";

const legalIdentity = createLegalIdentity({
  operatorName: import.meta.env.VITE_LEGAL_OPERATOR_NAME,
  taxId: import.meta.env.VITE_LEGAL_TAX_ID,
  address: import.meta.env.VITE_LEGAL_ADDRESS,
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL,
  legalEmail: import.meta.env.VITE_LEGAL_EMAIL,
});
const legalIdentityComplete = isLegalIdentityComplete(legalIdentity);
const linkClass = "inline-flex min-h-12 items-center rounded-xl border border-violet-300/25 bg-violet-400/10 px-4 font-semibold text-violet-100 hover:bg-violet-400/15";

export function LegalPage({ path }: { path: LegalPath }) {
  const content = documents[path];
  return <main className="min-h-screen overflow-x-hidden bg-[#070812] px-4 py-5 text-slate-100 sm:px-6"><div className="mx-auto max-w-4xl"><header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#0b0d1b] px-4 py-3"><a className="inline-flex min-h-11 items-center" href="/"><Brand /></a><a className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-violet-200 hover:bg-violet-300/10" href="/">Volver al inicio</a></header><article className="mt-6 rounded-3xl border border-white/8 bg-slate-950/60 p-5 sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">TRENORO · Información legal</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">{content.title}</h1><p className="mt-3 text-sm text-slate-500">Última actualización: {PRODUCT.legalLastUpdated}</p>{content.body}</article><LegalNav /></div></main>;
}

const documents: Record<LegalPath, { title: string; body: ReactNode }> = {
  "/terminos": { title: "Términos y Condiciones", body: <Sections>
    <Section title="1. Identidad y alcance">TRENORO es el nombre comercial bajo el cual una persona humana responsable presta el servicio. TRENORO es una marca y no una sociedad ni una persona jurídica distinta de su responsable. Estos términos regulan el acceso a la plataforma informativa de señales y contexto de mercados financieros. La aceptación contractual ocurre mediante la casilla expresa del registro, no por la mera navegación.</Section>
    <LegalIdentityDetails />
    <Section title="2. Usuarios y cuenta">El servicio está destinado exclusivamente a mayores de 18 años. Cada persona debe proporcionar información auténtica, proteger sus credenciales y usar la cuenta de forma personal. Está prohibido compartir cuentas, automatizar accesos abusivos, intentar eludir controles o afectar la seguridad.</Section>
    <Section title="3. Servicio y acceso comercial">TRENORO muestra señales informativas cuando la configuración técnica satisface sus criterios. Puede existir legítimamente un estado sin señal. El rol administrativo es independiente del grant o derecho de acceso comercial. Founders Lifetime, mientras esté ofrecido, consiste en un pago único y acceso sin vencimiento programado mientras esa modalidad y el servicio continúen operativos; no es una suscripción renovable ni una promesa de existencia perpetua.</Section>
    <Section title="4. Pagos">Los medios, precio y modalidad se informan antes de enviar la solicitud. Actualmente el flujo habilitado es USDT por red TRC20 con TXID y revisión administrativa. Una aprobación concede el acceso correspondiente y queda auditada. TRENORO no custodia fondos de trading ni ejecuta operaciones.</Section>
    <Section title="5. Arrepentimiento, baja y reembolsos">Los derechos legales de revocación y protección del consumidor se respetan conforme a la Ley 24.240 y a los arts. 1110 y siguientes del Código Civil y Comercial. El sitio ofrece mecanismos públicos de arrepentimiento y baja. Una baja de acceso no implica por sí sola un reembolso automático. Consultá la política específica.</Section>
    <Section title="6. Riesgos y terceros">Las fuentes de mercado, hosting, email y otros proveedores pueden sufrir errores, latencia o interrupciones. Las señales no garantizan resultados ni constituyen asesoramiento financiero personalizado. Cada usuario decide si opera y asume el riesgo de pérdida parcial o total.</Section>
    <Section title="7. Disponibilidad, cambios y suspensión">El servicio puede requerir mantenimiento o evolucionar. Se procurará informar cambios materiales. TRENORO puede suspender cuentas ante fraude, abuso, incidentes de seguridad o incumplimiento, con revisión y registro administrativo.</Section>
    <Section title="8. Responsabilidad, ley y contacto">La responsabilidad solo se limita en la medida permitida por la legislación aplicable; nada excluye derechos inderogables del consumidor. Rige la legislación argentina sin imponer una jurisdicción contraria a las normas protectorias. Los datos de contacto definitivos se publicarán en la página de Contacto antes del lanzamiento.</Section>
  </Sections> },
  "/privacidad": { title: "Política de Privacidad", body: <Sections>
    <Section title="Responsable y contacto">TRENORO es el nombre comercial bajo el cual la persona humana identificada a continuación presta el servicio y actúa como responsable del tratamiento de datos.</Section>
    <LegalIdentityDetails />
    <Section title="Datos tratados">Según el funcionamiento actual, se tratan username, email, hash de contraseña, sesiones, cookies esenciales, IP y user-agent asociados a sesiones/auditoría, grants, solicitudes de pago, TXID o referencia, wallet remitente opcional, comprobantes, comunicaciones voluntarias y logs técnicos. No se solicita nombre completo como requisito general ni se almacenan claves privadas.</Section>
    <Section title="Finalidades y necesidad">Los datos se usan para crear y proteger cuentas, autenticar sesiones, administrar acceso, revisar pagos, atender solicitudes, prevenir fraude, mantener auditoría y operar el servicio. Los campos marcados son obligatorios; wallet, comprobante en USDT y mensajes adicionales pueden ser opcionales según el flujo.</Section>
    <Section title="Proveedores y transferencias">Railway, Vercel, PostgreSQL administrado, el proveedor de email que se configure, Telegram y proveedores de datos pueden actuar como encargados o receptores técnicos. Su infraestructura puede implicar tratamiento o transferencias internacionales con las salvaguardas aplicables. No se afirma que los datos permanezcan exclusivamente en Argentina.</Section>
    <Section title="Seguridad, conservación y cookies">Se aplican contraseñas hasheadas, cookies HttpOnly/Secure en producción, controles de acceso, logs de auditoría y minimización. Los datos se conservan durante la relación y por los plazos necesarios para seguridad, obligaciones legales, defensa y resolución de disputas; luego se eliminan o anonimizan cuando corresponda. Las cookies actuales son esenciales para autenticación.</Section>
    <Section title="Derechos">Conforme a la Ley 25.326, podés solicitar acceso, rectificación, actualización o supresión. El acceso debe responderse dentro de 10 días corridos y la rectificación, actualización o supresión dentro de 5 días hábiles, según corresponda. También podés reclamar ante la Agencia de Acceso a la Información Pública.</Section>
  </Sections> },
  "/reembolsos": { title: "Reembolsos, Cancelaciones y Derecho de Arrepentimiento", body: <Sections>
    <Section title="Derechos legales">Nada de esta política reduce derechos irrenunciables. En contrataciones a distancia, el derecho de revocación se rige por la Ley 24.240, el Código Civil y Comercial y la normativa vigente, incluida la Disposición 954/2025 y su modificación por la Disposición 3/2026.</Section>
    <Section title="Cómo solicitarlo">Usá el Botón de Arrepentimiento público. No requiere login. Se permite una verificación razonable de identidad únicamente para seguridad y procesamiento. El sistema entrega un código inmediato y la solicitud pasa a revisión humana.</Section>
    <Section title="Producto real">Founders Lifetime no tiene renovación automática ni cargos recurrentes. Fuera de los derechos legales obligatorios, normalmente no corresponde devolución por cambio de opinión fuera del plazo aplicable, falta de uso voluntaria, disconformidad con resultados o pérdidas de trading, sin perjuicio de los derechos irrenunciables previstos por la legislación aplicable.</Section>
    <Section title="Cripto y resolución">No se ejecutan devoluciones cripto irreversibles de forma automática. El equipo verifica identidad, compra, red, destino y procedencia antes de aprobar y completar cualquier devolución.</Section>
    <p><a className={linkClass} href="/arrepentimiento">Abrir Botón de Arrepentimiento</a></p>
  </Sections> },
  "/descargo-de-responsabilidad": { title: "Descargo de Responsabilidad", body: <Sections>
    <Section title="Información, no asesoramiento">TRENORO proporciona información y señales orientativas sobre mercados financieros. No son una garantía ni asesoramiento financiero personalizado y TRENORO no evalúa la situación patrimonial, objetivos o tolerancia al riesgo de cada usuario.</Section>
    <Section title="Decisión y ejecución">El usuario decide si opera. TRENORO no ejecuta operaciones, no administra ni custodia fondos de trading y actualmente no conecta cuentas de broker o exchange para operar.</Section>
    <Section title="Riesgo">Operar implica riesgo de pérdida parcial o total. Las señales pueden fallar; volatilidad, slippage, latencia y diferencias de precio pueden alterar resultados. Los datos de terceros pueden retrasarse, interrumpirse o contener errores. Resultados pasados no garantizan resultados futuros.</Section>
    <Section title="Derechos">Nada en este descargo limita derechos inderogables del consumidor ni responsabilidades que legalmente no puedan excluirse.</Section>
  </Sections> },
  "/propiedad-intelectual": { title: "Política de Propiedad Intelectual", body: <Sections>
    <Section title="Activos protegidos">La marca TRENORO, su identidad, diseños, textos propios, software, código, estructura, presentación de señales y materiales originales están protegidos en la medida reconocida por la ley.</Section>
    <Section title="Usos no permitidos">No se permite revender o redistribuir el servicio, compartir cuentas, hacer scraping abusivo o extracción masiva, copiar software ni aparentar una asociación con TRENORO sin autorización, sujeto siempre a las excepciones y derechos previstos por la legislación aplicable.</Section>
    <Section title="Terceros">TRENORO no reclama propiedad sobre Bitcoin, mercados, precios públicos, marcas de exchanges ni materiales de terceros. Cada elemento se mantiene sujeto a sus titulares y licencias.</Section>
  </Sections> },
  "/contacto": { title: "Contacto", body: <Sections>
    <Section title="Identidad del responsable">TRENORO es el nombre comercial bajo el cual una persona humana presta el servicio. Los datos identificatorios se publican aquí, donde legalmente corresponde, y no se trasladan innecesariamente a la landing.</Section>
    <LegalIdentityDetails />
    <Section title="Atención al consumidor">Podés usar los mecanismos públicos de arrepentimiento y baja disponibles a continuación. La baja no implica por sí misma una devolución automática.</Section>
    <p className="flex flex-wrap gap-3"><a className={linkClass} href="/arrepentimiento">Botón de Arrepentimiento</a><a className={linkClass} href="/baja-de-servicio">Botón de Baja de Servicio</a></p>
  </Sections> },
  "/arrepentimiento": { title: "BOTÓN DE ARREPENTIMIENTO", body: <ConsumerRequestForm type="WITHDRAWAL" /> },
  "/baja-de-servicio": { title: "BOTÓN DE BAJA DE SERVICIO", body: <ConsumerRequestForm type="SERVICE_CANCELLATION" /> },
};

function ConsumerRequestForm({ type }: { type: ConsumerRequestType }) {
  const [code, setCode] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(null); const data = new FormData(event.currentTarget); try { const result = await createConsumerRequest({ type, email: String(data.get("email") ?? ""), paymentReference: String(data.get("paymentReference") ?? "").trim() || undefined, description: String(data.get("description") ?? "").trim() || undefined }); setCode(result.request.code); } catch { setError("No se pudo registrar la solicitud. Revisá los datos o intentá más tarde."); } finally { setPending(false); } }
  if (code) return <div className="mt-7 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-5"><h2 className="text-xl font-semibold text-white">Solicitud registrada</h2><p className="mt-3 text-sm leading-6 text-slate-300">Código de registración:</p><code className="mt-2 block break-all text-lg font-bold text-emerald-200">{code}</code><p className="mt-3 text-sm leading-6 text-slate-400">Guardalo. El pedido será revisado; no produce automáticamente una devolución cripto ni elimina auditoría legal.</p></div>;
  return <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}><p className="text-sm leading-6 text-slate-300">No necesitás iniciar sesión. Los datos se usan exclusivamente para identificar y tramitar el pedido de forma segura. {type === "SERVICE_CANCELLATION" ? "La baja no implica un reembolso automático y el acceso Founders actual no tiene renovación periódica." : "No se ejecutará una devolución cripto irreversible sin revisión humana."}</p><Field label="Email asociado a la compra" name="email" type="email" required /><Field label="ID de solicitud de pago o TXID (si lo tenés)" name="paymentReference" maxLength={255} /><label className="grid gap-2 text-sm font-medium text-slate-200">Información adicional (opcional)<textarea className="min-h-28 rounded-xl border border-white/10 bg-[#090c18] p-3 text-base text-white outline-none focus:border-violet-300/70" maxLength={2000} name="description" /></label>{error ? <p className="rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3 text-sm text-rose-100" role="alert">{error}</p> : null}<button className="min-h-12 w-full rounded-xl bg-violet-400 px-4 text-sm font-bold text-[#130c29] disabled:opacity-60" disabled={pending} type="submit">{pending ? "Registrando…" : "Registrar solicitud"}</button></form>;
}

function Sections({ children }: { children: ReactNode }) { return <div className="mt-8 space-y-7 text-sm leading-7 text-slate-300 sm:text-base">{children}</div>; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <section><h2 className="text-xl font-semibold text-white">{title}</h2><p className="mt-2">{children}</p></section>; }
function LegalIdentityDetails() {
  if (!legalIdentityComplete) return <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-50" role="note">Este entorno no está habilitado para contratación pública mientras la identificación legal del responsable esté incompleta.</div>;
  return <dl className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2"><LegalDatum label="Responsable" value={legalIdentity.operatorName!} /><LegalDatum label="CUIT" value={legalIdentity.taxId!} /><LegalDatum label="Domicilio" value={legalIdentity.address!} /><LegalDatum label="Soporte" value={legalIdentity.supportEmail!} email /><LegalDatum label="Legal y privacidad" value={legalIdentity.legalEmail!} email /></dl>;
}
function LegalDatum({ label, value, email = false }: { label: string; value: string; email?: boolean }) { return <div><dt className="text-xs font-bold uppercase tracking-[0.12em] text-violet-200">{label}</dt><dd className="mt-1 break-words text-slate-200">{email ? <a className="inline-flex min-h-11 items-center underline decoration-violet-300/50 underline-offset-4" href={`mailto:${value}`}>{value}</a> : value}</dd></div>; }
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="grid gap-2 text-sm font-medium text-slate-200">{label}<input className="min-h-12 rounded-xl border border-white/10 bg-[#090c18] px-3 text-base text-white outline-none focus:border-violet-300/70" {...props} /></label>; }
function LegalNav() { return <nav aria-label="Documentos legales" className="mt-6 flex flex-wrap gap-x-4 gap-y-2 rounded-2xl border border-white/8 bg-[#0b0d1b] p-4 text-xs text-slate-300">{[["/terminos","Términos"],["/privacidad","Privacidad"],["/reembolsos","Reembolsos"],["/descargo-de-responsabilidad","Descargo"],["/propiedad-intelectual","Propiedad intelectual"],["/contacto","Contacto"]].map(([href,label]) => <a className="inline-flex min-h-11 items-center hover:text-white" href={href} key={href}>{label}</a>)}</nav>; }
