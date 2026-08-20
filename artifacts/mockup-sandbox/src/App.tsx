import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccount, logout, type AccountResponse } from "@workspace/api-client-react";
import { AccountPanel } from "@/components/access/AccountPanel";
import { AdminPanel } from "@/components/access/AdminPanel";
import { AuthScreen } from "@/components/access/AuthScreen";
import { PublicLanding } from "@/components/access/PublicLanding";
import { MarketDashboard } from "@/components/market/MarketDashboard";

type Page = "landing" | "login" | "register" | "account" | "dashboard" | "admin";

function App() {
  const [page, setPage] = useState<Page>("landing");
  const queryClient = useQueryClient();
  const account = useQuery({
    queryKey: ["account"],
    queryFn: ({ signal }) => getAccount(signal),
    retry: false,
    staleTime: 60_000,
    refetchInterval: (query) => query.state.data?.access.hasAccess ? false : 30_000,
  });

  const signedIn = account.data;
  const navigateDashboard = () => setPage(signedIn?.access.hasAccess ? "dashboard" : "account");
  const afterAuthentication = async () => {
    const result = await account.refetch();
    setPage(result.data?.access.hasAccess ? "dashboard" : "account");
  };
  const signOut = async () => {
    try {
      await logout();
    } finally {
      queryClient.removeQueries({ queryKey: ["account"] });
      queryClient.removeQueries({ queryKey: ["market"] });
      queryClient.removeQueries({ queryKey: ["indicators"] });
      setPage("landing");
    }
  };

  if (account.isPending) return <LoadingScreen />;

  if (!signedIn) {
    if (page === "login" || page === "register") {
      return <AuthScreen mode={page} onBack={() => setPage("landing")} onComplete={afterAuthentication} onSwitchMode={() => setPage(page === "login" ? "register" : "login")} />;
    }
    return <PublicLanding onLogin={() => setPage("login")} onRegister={() => setPage("register")} />;
  }

  return <PrivateApp account={signedIn} page={page} onAccount={() => setPage("account")} onAdmin={() => setPage("admin")} onDashboard={navigateDashboard} onLogout={signOut} />;
}

function PrivateApp({ account, page, onDashboard, onAccount, onAdmin, onLogout }: {
  account: AccountResponse;
  page: Page;
  onDashboard: () => void;
  onAccount: () => void;
  onAdmin: () => void;
  onLogout: () => Promise<void>;
}) {
  if (page === "admin" && account.user.role === "admin") return <AdminPanel account={account} onAccount={onAccount} />;
  if (page === "dashboard" && account.access.hasAccess) return <MarketDashboard onAccount={onAccount} onAdmin={account.user.role === "admin" ? onAdmin : undefined} onLogout={() => void onLogout()} />;
  return <AccountPanel account={account} onDashboard={onDashboard} onLogout={onLogout} onAdmin={account.user.role === "admin" ? onAdmin : undefined} />;
}

function LoadingScreen() {
  return <main aria-live="polite" className="grid min-h-screen place-items-center bg-[#070812] text-sm text-slate-400"><span className="flex items-center gap-3"><i className="h-2 w-2 animate-pulse rounded-full bg-violet-300" />Comprobando sesión…</span></main>;
}

export default App;
