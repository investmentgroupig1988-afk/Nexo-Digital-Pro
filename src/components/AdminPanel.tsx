import { useState, useEffect } from 'react';
import { User } from '../types';
import { ArrowLeft, CheckCircle2, XCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

interface AdminPanelProps {
  onBack: () => void;
}

export function AdminPanel({ onBack }: AdminPanelProps) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const data = localStorage.getItem('nexo_users');
    if (data) {
      setUsers(JSON.parse(data));
    }
  }, []);

  const saveUsers = (newUsers: User[]) => {
    localStorage.setItem('nexo_users', JSON.stringify(newUsers));
    setUsers(newUsers);
  };

  const approveUser = (email: string, paymentMethod: 'Crypto' | 'Transferencia') => {
    const newUsers = users.map(u => u.email === email ? { 
      ...u, 
      isApproved: true,
      accessGrantedAt: new Date().toISOString(),
      paymentMethod
    } : u);
    saveUsers(newUsers);
  };

  const revokeUser = (email: string) => {
    const newUsers = users.map(u => u.email === email ? { 
      ...u, 
      isApproved: false,
      accessGrantedAt: undefined,
      paymentMethod: undefined
    } : u);
    saveUsers(newUsers);
  };

  const deleteUser = (email: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar al usuario ${email}?`)) {
      const newUsers = users.filter(u => u.email !== email);
      saveUsers(newUsers);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200 p-4 sm:p-8 selection:bg-amber-500/30">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Panel de Administrador</h1>
                <p className="text-xs text-slate-400">Gestión de usuarios y accesos</p>
              </div>
            </div>
          </div>
        </header>

        <div className="bg-[#0F1218] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="p-4">Usuario</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Fecha Acceso</th>
                  <th className="p-4">Pago</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {users.map((u, i) => (
                  <motion.tr 
                    key={u.email}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-slate-800/20 transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-medium text-white">{u.name}</div>
                      {u.isAdmin && <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mt-1 block">Admin</span>}
                    </td>
                    <td className="p-4 text-sm text-slate-400">{u.email}</td>
                    <td className="p-4">
                      {u.isApproved ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Aprobado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" /> Pendiente
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-slate-400">
                      {u.accessGrantedAt ? new Date(u.accessGrantedAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-4">
                      {u.paymentMethod ? (
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                          u.paymentMethod === 'Crypto' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {u.paymentMethod}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-4 text-right">
                      {!u.isAdmin && (
                        <div className="flex items-center justify-end gap-2">
                          {u.isApproved ? (
                            <button
                              onClick={() => revokeUser(u.email)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors"
                            >
                              Revocar Acceso
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => approveUser(u.email, 'Crypto')}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded transition-colors"
                              >
                                Aprobar Crypto
                              </button>
                              <button
                                onClick={() => approveUser(u.email, 'Transferencia')}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition-colors"
                              >
                                Aprobar Transf.
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => deleteUser(u.email)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition-colors ml-1"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
                
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 text-sm">
                      No hay usuarios registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
