import { useState, useEffect } from 'react';
import { Landing } from './components/Landing';
import { Register } from './components/Register';
import { Login } from './components/Login';
import { AccessWall } from './components/AccessWall';
import { Dashboard } from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel';
import { ViewState, User } from './types';
import { AnimatePresence, motion } from 'motion/react';

export default function App() {
  const [view, setView] = useState<ViewState>('landing');
  const [user, setUser] = useState<User | null>(null);
  const [loginError, setLoginError] = useState<string | undefined>();

  // Use localStorage as a mock database
  const getUsers = (): User[] => {
    const data = localStorage.getItem('nexo_users');
    const users: User[] = data ? JSON.parse(data) : [];
    
    // Seed default admin if it doesn't exist
    if (!users.some(u => u.isAdmin)) {
      users.push({
        name: 'Administrador',
        email: 'admin@nexodigital.pro',
        password: 'admin',
        isApproved: true,
        isAdmin: true
      });
      localStorage.setItem('nexo_users', JSON.stringify(users));
    }
    
    return users;
  };

  const saveUsers = (users: User[]) => {
    localStorage.setItem('nexo_users', JSON.stringify(users));
  };

  useEffect(() => {
    const savedSession = localStorage.getItem('nexo_session');
    if (savedSession) {
      const users = getUsers();
      const currentUser = users.find(u => u.email === savedSession);
      if (currentUser) {
        setUser(currentUser);
        if (currentUser.isApproved) {
          setView('dashboard');
        } else {
          setView('access');
        }
      }
    }
  }, []);

  const handleStart = () => {
    if (user?.isApproved) {
      setView('dashboard');
    } else if (user) {
      setView('access');
    } else {
      setView('login');
    }
  };

  const handleRegister = (name: string, email: string, pass: string) => {
    const users = getUsers();
    if (users.some(u => u.email === email)) {
      alert('Este correo ya está registrado');
      return;
    }
    const newUser: User = { name, email, password: pass, isApproved: false };
    saveUsers([...users, newUser]);
    setUser(newUser);
    localStorage.setItem('nexo_session', email);
    setView('access');
  };

  const handleLogin = (email: string, pass: string) => {
    const users = getUsers();
    const foundUser = users.find(u => u.email === email && u.password === pass);
    if (foundUser) {
      setUser(foundUser);
      setLoginError(undefined);
      localStorage.setItem('nexo_session', email);
      if (foundUser.isApproved) {
        setView('dashboard');
      } else {
        setView('access');
      }
    } else {
      setLoginError('Credenciales incorrectas');
    }
  };

  const handleCheckApproval = () => {
    // La aprobación automática ha sido deshabilitada.
    alert('Tu solicitud sigue en revisión. El acceso se habilitará una vez confirmado el pago.');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('nexo_session');
    setView('landing');
  };

  return (
    <AnimatePresence mode="wait">
      {view === 'landing' && (
        <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Landing onStart={handleStart} />
        </motion.div>
      )}
      
      {view === 'login' && (
        <motion.div key="login" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <Login 
            onLogin={handleLogin} 
            onSwitchToRegister={() => setView('register')} 
            error={loginError}
          />
        </motion.div>
      )}

      {view === 'register' && (
        <motion.div key="register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <Register onRegister={handleRegister} onSwitchToLogin={() => setView('login')} />
        </motion.div>
      )}
      
      {view === 'access' && user && (
        <motion.div key="access" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <AccessWall 
            userName={user.name} 
            userEmail={user.email} 
            onCheckApproval={handleCheckApproval} 
            onLogout={handleLogout}
          />
        </motion.div>
      )}
      
      {view === 'dashboard' && user && user.isApproved && (
        <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Dashboard 
            onLogout={handleLogout} 
            isAdmin={user.isAdmin} 
            onOpenAdmin={() => setView('admin')} 
          />
        </motion.div>
      )}

      {view === 'admin' && user?.isAdmin && (
        <motion.div key="admin" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
          <AdminPanel onBack={() => setView('dashboard')} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
