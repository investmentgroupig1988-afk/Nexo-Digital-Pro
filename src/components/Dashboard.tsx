import { useState, useMemo, ReactNode } from 'react';
import { 
  LogOut, Activity, Clock, Zap, TrendingUp, TrendingDown, 
  BarChart2, History, ChevronDown, ChevronUp, AlertCircle,
  Wifi, Target, Shield, Crosshair, DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import { APP_CONFIG } from '../config';
import { useMarketData } from '../hooks/useMarketData';
import { useTradingBot } from '../hooks/useTradingBot';
import { TradeSignal, Asset } from '../types';

interface DashboardProps {
  onLogout: () => void;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
}

export function Dashboard({ onLogout, isAdmin, onOpenAdmin }: DashboardProps) {
  const { btcPrice, xauPrice, btcHistory, xauHistory, isConnected } = useMarketData();
  const { activeSignals, historySignals, stats } = useTradingBot(btcPrice, xauPrice, false);

  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'performance'>('overview');
  const [selectedChartAsset, setSelectedChartAsset] = useState<Asset>('BTC/USD');
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null);

  // Use mock data if history is empty to show the UI
  const displayHistory = historySignals.length > 0 ? historySignals : MOCK_HISTORY;
  const displayActive = activeSignals.length > 0 ? activeSignals : MOCK_ACTIVE;
  const displayStats = historySignals.length > 0 ? stats : MOCK_STATS;

  const chartData = selectedChartAsset === 'BTC/USD' ? btcHistory : xauHistory;
  const currentPrice = selectedChartAsset === 'BTC/USD' ? btcPrice : xauPrice;

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200 font-sans selection:bg-indigo-500/30 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#0B0E14]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/20">
              N
            </div>
            <span className="text-xl font-bold tracking-tight text-white hidden sm:block">
              NEXO<span className="text-indigo-500">DIGITAL</span> PRO
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-slate-900/50 rounded-full px-3 py-1.5 border border-slate-800">
              {isConnected ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                {isConnected ? 'Sistema Activo' : 'Sincronizando'}
              </span>
            </div>

            <div className="hidden md:flex gap-6 text-sm font-medium">
              <button 
                onClick={() => setActiveTab('overview')}
                className={cn("pb-5 pt-5 border-b-2 transition-colors", activeTab === 'overview' ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-white")}
              >
                DASHBOARD
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={cn("pb-5 pt-5 border-b-2 transition-colors", activeTab === 'history' ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-white")}
              >
                HISTORIAL
              </button>
              {isAdmin && (
                <button 
                  onClick={onOpenAdmin} 
                  className="pb-5 pt-5 border-b-2 border-transparent text-slate-400 hover:text-white transition-colors"
                >
                  ADMIN
                </button>
              )}
            </div>
            
            <button onClick={onLogout} className="p-2 text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-semibold">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        
        {activeTab === 'overview' && (
          <>
            {/* Top Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard 
                title="Win Rate" 
                value={`${displayStats.winrate || 0}%`} 
                icon={<Target className="w-5 h-5 text-indigo-400" />} 
                trend={displayStats.winrate && displayStats.winrate > 50 ? 'up' : 'down'}
              />
              <StatCard 
                title="Profit Factor" 
                value={displayStats.profitFactor.toString()} 
                icon={<Activity className="w-5 h-5 text-emerald-400" />}
                trend={displayStats.profitFactor > 1.5 ? 'up' : 'down'}
              />
              <StatCard 
                title="P&L Acumulado" 
                value={`${displayStats.cumulativeProfit > 0 ? '+' : ''}${displayStats.cumulativeProfit}%`} 
                icon={<DollarSign className="w-5 h-5 text-amber-400" />} 
                trend={displayStats.cumulativeProfit > 0 ? 'up' : 'down'}
                trendValue={displayStats.cumulativeProfit > 0 ? 'Rentable' : 'Pérdida'}
              />
              <StatCard 
                title="Operaciones" 
                value={displayStats.totalClosed.toString()} 
                icon={<History className="w-5 h-5 text-slate-400" />} 
                trendValue={`${displayStats.wonCount} W / ${displayStats.lostCount} L`}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column (Main) */}
              <div className="lg:col-span-2 space-y-8">
                
                {/* Active Signals */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-500" /> Señales Activas
                    </h2>
                    <span className="bg-amber-500/10 text-amber-500 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-500/20">
                      {displayActive.length} LIVE
                    </span>
                  </div>
                  
                  {displayActive.length === 0 ? (
                    <div className="bg-[#121620] border border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center">
                      <div className="w-16 h-16 bg-slate-900/50 rounded-full flex items-center justify-center mb-4">
                        <Crosshair className="w-8 h-8 text-slate-600" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-300 mb-2">Buscando oportunidades</h3>
                      <p className="text-sm text-slate-500 max-w-md mx-auto">
                        El sistema está monitoreando el mercado continuamente. No hay señales activas en este momento que cumplan con los criterios de riesgo algorítmico.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {displayActive.map((signal) => (
                        <SignalCard 
                          key={signal.id} 
                          signal={signal} 
                          isExpanded={expandedSignal === signal.id}
                          onToggle={() => setExpandedSignal(expandedSignal === signal.id ? null : signal.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* Live Chart */}
                <section className="bg-[#121620] border border-slate-800 rounded-2xl p-6">
                  <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-indigo-400" /> Análisis de Mercado
                    </h2>
                    <div className="flex bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                      <button 
                        onClick={() => setSelectedChartAsset('BTC/USD')}
                        className={cn("px-4 py-1.5 text-xs font-bold rounded-md transition-colors", selectedChartAsset === 'BTC/USD' ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white")}
                      >
                        BTC/USD
                      </button>
                      <button 
                        onClick={() => setSelectedChartAsset('XAU/USD')}
                        className={cn("px-4 py-1.5 text-xs font-bold rounded-md transition-colors", selectedChartAsset === 'XAU/USD' ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white")}
                      >
                        XAU/USD
                      </button>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-3 mb-6">
                    <span className="text-3xl font-black text-white">
                      {currentPrice ? `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Cargando...'}
                    </span>
                    <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Precio Actual (Simulado)</span>
                  </div>

                  <div className="h-64 w-full">
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="time" hide />
                          <YAxis domain={['auto', 'auto']} hide />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0B0E14', borderColor: '#1e293b', color: '#f8fafc', borderRadius: '0.5rem', fontSize: '12px' }}
                            itemStyle={{ color: '#818cf8' }}
                          />
                          <Area type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                        Esperando datos de mercado...
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* Right Column */}
              <div className="space-y-8">
                <section className="bg-[#121620] border border-slate-800 rounded-2xl p-6 flex flex-col h-[calc(100%-2rem)]">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <History className="w-5 h-5 text-slate-400" /> Operaciones Recientes
                    </h2>
                    <button 
                      onClick={() => setActiveTab('history')}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider"
                    >
                      Ver Todas
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    {displayHistory.length === 0 ? (
                      <div className="text-center py-12 text-sm text-slate-500">
                        No hay operaciones registradas aún.
                      </div>
                    ) : (
                      displayHistory.slice(0, 8).map(trade => (
                        <div key={trade.id} className="bg-[#0B0E14] border border-slate-800/60 rounded-xl p-3 flex justify-between items-center">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn(
                                "w-2 h-2 rounded-full",
                                trade.type === 'LONG' || trade.type === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500'
                              )} />
                              <span className="text-sm font-bold text-slate-200">{trade.asset}</span>
                            </div>
                            <span className="text-[10px] text-slate-500">{new Date(trade.timestamp).toLocaleString()}</span>
                          </div>
                          <div className="text-right">
                            <div className={cn(
                              "text-sm font-bold",
                              trade.profitPercentage && trade.profitPercentage > 0 ? "text-emerald-400" : "text-rose-400"
                            )}>
                              {trade.profitPercentage && trade.profitPercentage > 0 ? '+' : ''}
                              {trade.profitPercentage}%
                            </div>
                            <span className="text-[10px] uppercase font-bold text-slate-500">{trade.status}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <div className="bg-[#121620] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" /> Historial de Operaciones
              </h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-400">
                <thead className="bg-slate-900/50 text-xs uppercase font-bold text-slate-500 border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Activo</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Entrada</th>
                    <th className="px-6 py-4">Salida</th>
                    <th className="px-6 py-4 text-right">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {displayHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No hay operaciones registradas aún.
                      </td>
                    </tr>
                  ) : (
                    displayHistory.map((trade) => {
                      const isLong = trade.type === 'LONG' || trade.type === 'BUY';
                      const isWon = trade.profitPercentage && trade.profitPercentage > 0;
                      return (
                        <tr key={trade.id} className="hover:bg-slate-900/20 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                            {new Date(trade.timestamp).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 font-semibold text-white">
                            {trade.asset}
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn("px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider", isLong ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                              {trade.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-300">
                            ${trade.entryPrice.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-slate-300">
                            {trade.exitPrice ? `$${trade.exitPrice.toLocaleString()}` : '-'}
                          </td>
                          <td className={cn("px-6 py-4 font-bold text-right", isWon ? "text-emerald-400" : "text-rose-400")}>
                            {isWon ? '+' : ''}{trade.profitPercentage}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// Subcomponents

function StatCard({ title, value, icon, trend, trendValue }: { title: string, value: string, icon: ReactNode, trend?: 'up' | 'down', trendValue?: string }) {
  return (
    <div className="bg-[#121620] border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition-colors">
      <div className="flex justify-between items-start mb-4 relative z-10">
        <h3 className="text-sm font-medium text-slate-400">{title}</h3>
        <div className="p-2 bg-slate-900/50 rounded-lg">{icon}</div>
      </div>
      <div className="flex items-baseline gap-2 relative z-10">
        <span className="text-2xl sm:text-3xl font-black text-white">{value}</span>
        {trend && (
          <span className={cn("text-xs font-bold flex items-center", trend === 'up' ? "text-emerald-400" : "text-rose-400")}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {trendValue}
          </span>
        )}
        {!trend && trendValue && (
          <span className="text-xs font-bold text-slate-500">{trendValue}</span>
        )}
      </div>
    </div>
  );
}

function SignalCard({ signal, isExpanded, onToggle }: { key?: string, signal: TradeSignal, isExpanded: boolean, onToggle: () => void }) {
  const isLong = signal.type === 'LONG' || signal.type === 'BUY';
  
  return (
    <div className={cn("bg-[#121620] border rounded-2xl overflow-hidden transition-colors", isExpanded ? "border-slate-700" : "border-slate-800")}>
      {/* Main Signal Row */}
      <div className="p-5 cursor-pointer hover:bg-slate-900/40 transition-colors" onClick={onToggle}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          
          {/* Asset & Direction */}
          <div className="flex items-center gap-4 min-w-[150px]">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border", 
              isLong ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            )}>
              {isLong ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{signal.asset}</h3>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-bold uppercase tracking-wider", isLong ? "text-emerald-500" : "text-rose-500")}>
                  {signal.type}
                </span>
                <span className="text-[10px] text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">
                  {signal.timeframe}
                </span>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-4 sm:gap-8 flex-1">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Entry</p>
              <p className="text-sm font-semibold text-white">${signal.entryPrice.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Target</p>
              <p className="text-sm font-semibold text-emerald-400">${signal.takeProfit.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Stop</p>
              <p className="text-sm font-semibold text-rose-400">${signal.stopLoss.toLocaleString()}</p>
            </div>
          </div>

          {/* Status & Expand */}
          <div className="flex items-center gap-4 justify-between sm:justify-end min-w-[100px]">
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">R/R</p>
              <p className="text-sm font-semibold text-slate-300">{signal.riskReward}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400">
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>

        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-[#0B0E14] border-t border-slate-800"
          >
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Technical Analysis */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" /> Indicadores Técnicos
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Tendencia General</span>
                    <span className="font-semibold text-slate-200">{signal.trend || 'ALCISTA'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Confianza Algorítmica</span>
                    <span className="font-semibold text-indigo-400">{(signal.score * 10).toFixed(1)}%</span>
                  </div>
                  {signal.ema50 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">EMA 50</span>
                      <span className="font-semibold text-slate-200">${signal.ema50.toLocaleString()}</span>
                    </div>
                  )}
                  {signal.support && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Soporte Clave</span>
                      <span className="font-semibold text-slate-200">${signal.support.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Rationale */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" /> Razón de Entrada
                </h4>
                <ul className="space-y-2">
                  {signal.reasons && signal.reasons.length > 0 ? (
                    signal.reasons.map((reason, i) => (
                      <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-indigo-500 mt-1">•</span> {reason}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-indigo-500 mt-1">•</span> Confirmación de estructura y ruptura de volumen.
                    </li>
                  )}
                </ul>
                <div className="mt-4 text-[10px] text-slate-600">
                  Generado: {new Date(signal.timestamp).toLocaleString()}
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- MOCK DATA FOR UI PRESENTATION ---

const MOCK_STATS = {
  totalClosed: 124,
  wonCount: 89,
  lostCount: 35,
  winrate: 71.8,
  cumulativeProfit: 42.5,
  profitFactor: 2.1,
  maxDrawdown: 12.4
};

const MOCK_ACTIVE: TradeSignal[] = [
  {
    id: 'demo_sig_1',
    asset: 'BTC/USD',
    type: 'LONG',
    timeframe: '1H',
    timestamp: Date.now() - 3600000,
    score: 8.5,
    entryPrice: 63800,
    stopLoss: 62500,
    takeProfit: 66400,
    riskReward: '1:2',
    status: 'ACTIVE',
    source: 'LIVE',
    trend: 'ALCISTA',
    ema50: 63100,
    support: 62800,
    reasons: [
      'Rebote en soporte dinámico EMA 50.',
      'Divergencia alcista confirmada en RSI.',
      'Incremento de volumen institucional en temporalidad menor.'
    ]
  },
  {
    id: 'demo_sig_2',
    asset: 'XAU/USD',
    type: 'SHORT',
    timeframe: '15m',
    timestamp: Date.now() - 1800000,
    score: 7.2,
    entryPrice: 2345.5,
    stopLoss: 2352.0,
    takeProfit: 2330.0,
    riskReward: '1:2.3',
    status: 'ACTIVE',
    source: 'LIVE',
    trend: 'LATERAL',
    resistance: 2348,
    reasons: [
      'Rechazo en nivel de resistencia clave.',
      'Estructura de distribución menor.'
    ]
  }
];

const MOCK_HISTORY: TradeSignal[] = [
  {
    id: 'demo_hist_1',
    asset: 'BTC/USD',
    type: 'LONG',
    timeframe: '4H',
    timestamp: Date.now() - 86400000 * 1,
    score: 9,
    entryPrice: 61000,
    stopLoss: 59500,
    takeProfit: 64000,
    riskReward: '1:2',
    status: 'WON',
    profitPercentage: 4.9,
    source: 'LIVE',
    reasons: []
  },
  {
    id: 'demo_hist_2',
    asset: 'BTC/USD',
    type: 'SHORT',
    timeframe: '1H',
    timestamp: Date.now() - 86400000 * 2,
    score: 6.5,
    entryPrice: 65000,
    stopLoss: 66000,
    takeProfit: 63000,
    riskReward: '1:2',
    status: 'LOST',
    profitPercentage: -1.5,
    source: 'LIVE',
    reasons: []
  },
  {
    id: 'demo_hist_3',
    asset: 'XAU/USD',
    type: 'LONG',
    timeframe: '15m',
    timestamp: Date.now() - 86400000 * 3,
    score: 8,
    entryPrice: 2310,
    stopLoss: 2300,
    takeProfit: 2330,
    riskReward: '1:2',
    status: 'WON',
    profitPercentage: 0.8,
    source: 'LIVE',
    reasons: []
  },
  {
    id: 'demo_hist_4',
    asset: 'XAU/USD',
    type: 'SHORT',
    timeframe: '1H',
    timestamp: Date.now() - 86400000 * 3,
    score: 7.5,
    entryPrice: 2360,
    stopLoss: 2370,
    takeProfit: 2340,
    riskReward: '1:2',
    status: 'WON',
    profitPercentage: 0.85,
    source: 'LIVE',
    reasons: []
  }
];
