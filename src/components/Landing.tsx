import { useState } from 'react';
import { Zap, Activity, CheckCircle, MessageCircle, Copy, ArrowRight, ChevronDown, BarChart3, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { APP_CONFIG } from '../config';

interface LandingProps {
  onStart: () => void;
}

export function Landing({ onStart }: LandingProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      question: "¿Qué incluye el acceso?",
      answer: "Al activarlo obtendrás uso completo de la plataforma de análisis, seguimiento de activos en tiempo real (cripto y metales), y soporte básico."
    },
    {
      question: "¿Qué activos cubrirá la plataforma?",
      answer: `Actualmente la plataforma está preparada para realizar seguimiento de los pares ${APP_CONFIG.ASSETS.join(' y ')}.`
    },
    {
      question: "¿Cuándo estarán disponibles los datos en tiempo real?",
      answer: "La integración de datos en tiempo real se encuentra en preparación. Próximamente habilitaremos la conexión con nuestro motor de análisis."
    },
    {
      question: "¿Es asesoramiento financiero?",
      answer: "No. El sistema es una herramienta automatizada de análisis y no ofrece recomendaciones financieras personalizadas. Los resultados no están garantizados."
    },
    {
      question: "¿Cómo se solicitará el acceso?",
      answer: "Puedes solicitar información de acceso a través de nuestro soporte. Una vez realizado y confirmado el pago, habilitaremos tu cuenta."
    },
    {
      question: "¿Qué ocurre si tengo un problema?",
      answer: `Puedes contactarnos a través de nuestro soporte oficial en ${APP_CONFIG.SUPPORT_EMAIL}.`
    }
  ];

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200 font-sans flex flex-col selection:bg-indigo-500/30">
      {/* Navbar */}
      <nav className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between border-b border-slate-800/60 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]">
            N
          </div>
          <span className="text-xl font-semibold tracking-tight text-white">NEXO<span className="text-indigo-500">DIGITAL</span> PRO</span>
        </div>
        <button 
          onClick={onStart}
          className="text-sm font-semibold text-slate-300 hover:text-white transition-colors border border-slate-800 px-4 py-2 rounded-lg bg-slate-900/50 hover:bg-slate-800"
        >
          Iniciar Sesión
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 pt-16 pb-24 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none"></div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto mb-16 relative z-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[11px] uppercase tracking-widest font-bold mb-6 shadow-[0_0_20px_rgba(79,70,229,0.15)]">
            <Activity className="w-3.5 h-3.5" />
            Panel de Análisis
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white tracking-tight mb-6 leading-tight">
            Análisis automatizado para <br className="hidden md:block"/> BTC y Oro, en un solo panel
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto mb-4">
            Plataforma preparada para centralizar señales, datos de mercado y seguimiento de activos digitales en un entorno seguro y profesional.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => {
                const el = document.getElementById('access-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-lg shadow-indigo-600/20"
            >
              Solicitar información de acceso
            </button>
          </div>
          <p className="mt-6 text-[11px] text-amber-500/80 uppercase tracking-widest font-semibold flex items-center justify-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            La integración de datos en tiempo real estará disponible próximamente
          </p>
        </motion.div>

        {/* Features Section */}
        <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-24 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-[#121620] border border-slate-800 rounded-2xl p-6"
          >
            <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Seguimiento de Activos</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Panel preparado para monitorear BTC/USD y XAU/USD con indicadores técnicos.
            </p>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-[#121620] border border-slate-800 rounded-2xl p-6"
          >
            <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-4">
              <Zap className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Panel Centralizado</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Toda la información, estados del sistema y alertas en una única interfaz unificada.
            </p>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bg-[#121620] border border-slate-800 rounded-2xl p-6"
          >
            <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-4">
              <Activity className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Historial y Métricas</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Módulo estadístico listo para registrar y analizar el rendimiento de las señales.
            </p>
          </motion.div>
        </div>

        {/* Access Section */}
        <div id="access-section" className="w-full max-w-5xl mx-auto mb-20 relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Acceso al Sistema</h2>
            <p className="text-lg text-slate-400">
              Solicita tu acceso y prepárate para la integración completa.
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-8 md:p-12 text-center"
            >
              <h3 className="text-2xl font-bold text-white mb-2">{APP_CONFIG.PLAN_NAME}</h3>
              <div className="flex justify-center items-baseline gap-2 mb-6">
                <span className="text-5xl font-black text-white">USD {APP_CONFIG.PRICE_USD}</span>
                <span className="text-slate-500 font-medium ml-2">pago único</span>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed mb-8 max-w-md mx-auto">
                Obtén acceso a la plataforma de análisis. El pago es único y te habilitará el uso del panel de control.
              </p>
              
              <a 
                href={APP_CONFIG.CONTACT_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-4 px-8 rounded-xl transition-all w-full md:w-auto"
              >
                <MessageCircle className="w-5 h-5" />
                Solicitar información de acceso
              </a>
            </motion.div>
          </div>
        </div>

        {/* Product Information Section (Compliance) */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="w-full max-w-5xl mx-auto relative z-10 mb-20"
        >
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Información del Servicio</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Todo lo que necesitas saber sobre nuestra plataforma y las condiciones del servicio.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-[#121620] border border-slate-800 rounded-2xl p-8 hover:border-slate-700 transition-colors">
              <h3 className="text-lg font-bold text-white mb-3">¿Qué es este servicio?</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Este es un servicio digital que ofrece acceso a una plataforma de análisis automatizado basada en algoritmos avanzados. El sistema está diseñado para ayudar a centralizar información y facilitar procesos de análisis mediante tecnología.
              </p>
            </div>
            
            <div className="bg-[#121620] border border-slate-800 rounded-2xl p-8 hover:border-slate-700 transition-colors">
              <h3 className="text-lg font-bold text-white mb-3">Modelo de acceso</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                El acceso al sistema se obtiene mediante un pago único. No existen suscripciones automáticas ni cargos recurrentes. Pagas una vez y obtienes el acceso permanente a las herramientas disponibles.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-[#121620] border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-colors col-span-1 md:col-span-3">
              <h3 className="text-lg font-bold text-white mb-6 text-center">¿Cómo funciona?</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
                <div>
                  <div className="w-10 h-10 bg-indigo-500/10 text-indigo-400 font-bold rounded-full flex items-center justify-center mx-auto mb-3">1</div>
                  <h4 className="font-bold text-slate-200 mb-2">Solicitas acceso</h4>
                  <p className="text-xs text-slate-400">Contactas a nuestro soporte para confirmar el pago y solicitar tu usuario.</p>
                </div>
                <div>
                  <div className="w-10 h-10 bg-indigo-500/10 text-indigo-400 font-bold rounded-full flex items-center justify-center mx-auto mb-3">2</div>
                  <h4 className="font-bold text-slate-200 mb-2">Validación</h4>
                  <p className="text-xs text-slate-400">El equipo valida tu acceso y habilita tu cuenta en el sistema.</p>
                </div>
                <div>
                  <div className="w-10 h-10 bg-indigo-500/10 text-indigo-400 font-bold rounded-full flex items-center justify-center mx-auto mb-3">3</div>
                  <h4 className="font-bold text-slate-200 mb-2">Accedes al panel</h4>
                  <p className="text-xs text-slate-400">Inicias sesión en la plataforma y exploras las herramientas preparadas.</p>
                </div>
                <div>
                  <div className="w-10 h-10 bg-indigo-500/10 text-amber-400 font-bold rounded-full flex items-center justify-center mx-auto mb-3">4</div>
                  <h4 className="font-bold text-slate-200 mb-2">Integración activa</h4>
                  <p className="text-xs text-slate-400">Cuando la conexión de datos esté lista, visualizarás el análisis en tiempo real.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-[#121620] border border-slate-800 rounded-2xl p-8 hover:border-slate-700 transition-colors col-span-1 md:col-span-3">
               <h3 className="text-lg font-bold text-amber-500 mb-3 flex items-center gap-2">
                 <Zap className="w-5 h-5" /> Aviso Legal y de Riesgo
               </h3>
               <p className="text-sm text-slate-400 leading-relaxed mb-4">
                 Este sistema no constituye asesoramiento financiero, legal ni fiscal. Los resultados pasados no garantizan rendimientos futuros. La plataforma proporciona herramientas de análisis basadas en algoritmos, pero el uso de esta información es bajo la exclusiva responsabilidad del usuario. No se garantizan ganancias ni precisión infalible.
               </p>
               <p className="text-sm text-slate-400 leading-relaxed">
                 Las integraciones de datos en tiempo real y funciones automatizadas se encuentran actualmente en fase de preparación técnica.
               </p>
            </div>
          </div>
          
          {/* Footer placeholders for Legal/Contact */}
          <div className="flex flex-wrap justify-center gap-4 mt-12 text-sm text-slate-500">
            <a href="#" className="hover:text-slate-300 transition-colors">Términos de Uso (Próximamente)</a>
            <span>|</span>
            <a href="#" className="hover:text-slate-300 transition-colors">Política de Privacidad (Próximamente)</a>
            <span>|</span>
            <a href="#" className="hover:text-slate-300 transition-colors">Política de Reembolsos</a>
          </div>
        </motion.div>

        {/* FAQ Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="w-full max-w-3xl mx-auto relative z-10"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-10">Preguntas Frecuentes</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div 
                key={index}
                className="bg-[#121620] border border-slate-800 rounded-xl overflow-hidden transition-colors hover:border-slate-700"
              >
                <button 
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full text-left px-6 py-5 flex items-center justify-between focus:outline-none"
                >
                  <span className="font-bold text-white">{faq.question}</span>
                  <ChevronDown className={cn("w-5 h-5 text-slate-500 transition-transform", openFaq === index && "rotate-180 text-indigo-400")} />
                </button>
                <AnimatePresence>
                  {openFaq === index && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-5 pt-0 text-sm text-slate-400 leading-relaxed">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>

      </main>
    </div>
  );
}

