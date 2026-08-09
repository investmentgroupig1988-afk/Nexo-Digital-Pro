import { motion } from 'motion/react';
import { MessageCircle, CheckCircle2, Lock, RefreshCw, LogOut } from 'lucide-react';
import { useState } from 'react';
import { APP_CONFIG } from '../config';

interface AccessWallProps {
  onCheckApproval: () => void;
  onLogout: () => void;
  userName: string;
  userEmail: string;
}

export function AccessWall({ onCheckApproval, onLogout, userName, userEmail }: AccessWallProps) {
  const [checking, setChecking] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);

  const handleRequestAccess = () => {
    // In a real app, this would send an API request to notify the admin
    setHasRequested(true);
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent(`Hola, acabo de solicitar información de acceso a Nexo Digital Pro. Mi correo es ${userEmail}. Quiero coordinar mi ingreso al panel de análisis.`);
    window.open(`${APP_CONFIG.CONTACT_WHATSAPP_URL}?text=${message}`, '_blank');
  };

  const handleCheck = () => {
    setChecking(true);
    setTimeout(() => {
      onCheckApproval();
      setChecking(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center p-4 selection:bg-indigo-500/30">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-[#121620] border border-slate-800 rounded-xl p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <button onClick={onLogout} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"> 
          <LogOut className="w-5 h-5" />
        </button>

        <div className="text-center mb-8 relative z-10">
          <div className="w-16 h-16 bg-slate-900/40 border border-slate-800 rounded-lg flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-indigo-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
            {hasRequested ? 'Solicitud Enviada' : 'Solicitar Acceso'}
          </h2>
          <p className="text-slate-400 text-sm">
            {hasRequested ? (
              <>
                Se ha registrado tu solicitud para <span className="font-semibold text-slate-200">{userEmail}</span>.
              </>
            ) : (
              <>
                Hola <span className="font-semibold text-slate-200">{userName}</span>, el acceso al panel de análisis requiere aprobación manual.
              </>
            )}
          </p>
        </div>

        {!hasRequested ? (
          <div className="space-y-4 relative z-10">
            <div className="bg-slate-900/40 rounded-lg p-6 border border-slate-800 mb-8">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">{APP_CONFIG.PLAN_NAME}</span>
                <span className="text-white font-bold text-xl">Acceso Total</span>
              </div>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Panel de Análisis Integrado</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Seguimiento para {APP_CONFIG.ASSETS.join(' & ')}</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Soporte personalizado</li>
              </ul>
            </div>
            
            <button
              onClick={handleRequestAccess}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 text-sm shadow-lg shadow-indigo-600/20"
            >
              Solicitar Acceso
            </button>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 relative z-10"
          >
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 mb-6">
              <p className="text-sm text-indigo-200/90 text-center leading-relaxed">
                Para finalizar y activar tu cuenta, comunícate por WhatsApp. Una vez confirmado, el equipo aprobará tu ingreso.
              </p>
            </div>
            <button
              onClick={handleWhatsApp}
              className="w-full bg-[#25D366] hover:bg-[#1DA851] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95 text-sm"
            >
              <MessageCircle className="w-5 h-5" />
              Contactar por WhatsApp
            </button>

            <button
              onClick={handleCheck}
              disabled={checking}
              className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
            >
              {checking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verificando estado...
                </>
              ) : (
                'Verificar Acceso'
              )}
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
