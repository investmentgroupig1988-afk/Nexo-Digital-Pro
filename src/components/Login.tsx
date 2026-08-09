import { motion } from 'motion/react';
import { LogIn, ArrowRight, Mail, Lock } from 'lucide-react';
import { useState, FormEvent } from 'react';

interface LoginProps {
  onLogin: (email: string, pass: string) => void;
  onSwitchToRegister: () => void;
  error?: string;
}

export function Login({ onLogin, onSwitchToRegister, error }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim() && password.trim()) {
      onLogin(email, password);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center p-4 selection:bg-amber-500/30">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-[#0F1218] border border-slate-800 rounded-xl p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-900/40 border border-slate-800 rounded flex items-center justify-center mx-auto mb-6">
            <LogIn className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Iniciar Sesión</h2>
          <p className="text-slate-400 text-sm">
            Accede a tu panel de control y señales.
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-3 rounded-lg text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Correo Electrónico</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-500" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#0B0E14] border border-slate-800 text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all placeholder:text-slate-600 text-sm"
                placeholder="tucorreo@ejemplo.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-slate-500" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#0B0E14] border border-slate-800 text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all placeholder:text-slate-600 text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-3 rounded-lg flex items-center justify-center gap-2 mt-8 transition-all active:scale-95 group text-sm"
          >
            Entrar
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="text-center mt-4 pt-4 border-t border-slate-800">
            <button type="button" onClick={onSwitchToRegister} className="text-xs text-slate-400 hover:text-amber-500 transition-colors">
              ¿No tienes cuenta? Solicitar Acceso
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
