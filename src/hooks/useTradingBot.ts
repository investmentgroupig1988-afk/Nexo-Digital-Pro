import { useState, useEffect, useCallback } from 'react';
import { Asset, SignalType, TradeSignal, SystemState } from '../types';

export function useTradingBot(btcPrice: number | null, xauPrice: number | null, notificationsEnabled: boolean) {
  const [activeSignals, setActiveSignals] = useState<TradeSignal[]>(() => {
    try {
      const saved = localStorage.getItem('nexo_active_trades');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [newSignalAlert, setNewSignalAlert] = useState<TradeSignal | null>(null);

  const [historySignals, setHistorySignals] = useState<TradeSignal[]>(() => {
    try {
      const saved = localStorage.getItem('nexo_trade_history');
      if (saved) return JSON.parse(saved);
      return [];
    } catch {
      return [];
    }
  });

  const [systemState, setSystemState] = useState<SystemState>('ESPERANDO_DATOS');

  // We are waiting for real backend data
  useEffect(() => {
    if (btcPrice === null || xauPrice === null) {
      setSystemState('ESPERANDO_DATOS');
    } else {
      // Transitioning logic will be driven by backend later
      setSystemState('ANALIZANDO');
    }
  }, [btcPrice, xauPrice]);

  useEffect(() => {
    try {
      localStorage.setItem('nexo_active_trades', JSON.stringify(activeSignals));
    } catch (e) {
      console.error('Failed to save active trades:', e);
    }
  }, [activeSignals]);

  useEffect(() => {
    try {
      localStorage.setItem('nexo_trade_history', JSON.stringify(historySignals));
    } catch (e) {
      console.error('Failed to save trade history:', e);
    }
  }, [historySignals]);

  const notifyUser = useCallback((title: string, body: string, signal?: TradeSignal) => {
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/vite.svg' });
    }
    if (signal) {
      setNewSignalAlert(signal);
      setTimeout(() => setNewSignalAlert(null), 6000);
    }
  }, [notificationsEnabled]);

  // Check active signals against live market prices
  useEffect(() => {
    if (activeSignals.length === 0) return;

    setActiveSignals(prevActive => {
      const remaining: TradeSignal[] = [];
      const newlyClosed: TradeSignal[] = [];
      
      prevActive.forEach(signal => {
        const currentPrice = signal.asset === 'BTC/USD' ? btcPrice : xauPrice;
        if (!currentPrice || currentPrice <= 0) {
          remaining.push(signal);
          return;
        }

        let isClosed = false;
        let won = false;
        let exitPrice = currentPrice;

        if (signal.type === 'LONG' || signal.type === 'BUY') {
          if (currentPrice <= signal.stopLoss) {
            isClosed = true;
            won = false;
            exitPrice = signal.stopLoss;
          } else if (currentPrice >= signal.takeProfit) {
            isClosed = true;
            won = true;
            exitPrice = signal.takeProfit;
          }
        } else if (signal.type === 'SHORT' || signal.type === 'SELL') {
          if (currentPrice >= signal.stopLoss) {
            isClosed = true;
            won = false;
            exitPrice = signal.stopLoss;
          } else if (currentPrice <= signal.takeProfit) {
            isClosed = true;
            won = true;
            exitPrice = signal.takeProfit;
          }
        }

        if (isClosed) {
          const rawProfit = (signal.type === 'LONG' || signal.type === 'BUY')
            ? ((exitPrice - signal.entryPrice) / signal.entryPrice) * 100 
            : ((signal.entryPrice - exitPrice) / signal.entryPrice) * 100;
          
          const closedSignal: TradeSignal = {
            ...signal,
            status: won ? 'WON' : 'LOST',
            profitPercentage: Number(rawProfit.toFixed(2)),
            exitPrice: Number(exitPrice.toFixed(2)),
            exitTimestamp: Date.now()
          };

          newlyClosed.push(closedSignal);
        } else {
          remaining.push(signal);
        }
      });

      if (newlyClosed.length > 0) {
        setHistorySignals(prevHist => [...newlyClosed, ...prevHist].slice(0, 100));
        newlyClosed.forEach(cs => {
          notifyUser(
            `Trade Cerrado: ${cs.asset}`, 
            `Resultado: ${cs.status === 'WON' ? 'Take Profit Alcanzado' : 'Stop Loss Alcanzado'} (${cs.profitPercentage! > 0 ? '+' : ''}${cs.profitPercentage}%)`
          );
        });
      }
      
      return remaining;
    });
  }, [btcPrice, xauPrice, notifyUser]);

  // Helper to manually add a trade for UI testing (will be replaced by backend)
  const addTrade = useCallback((asset: Asset, type: SignalType, entry: number, tp: number, sl: number) => {
    // Basic risk reward calc for testing
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    const rr = risk > 0 ? `1:${(reward/risk).toFixed(1)}` : 'N/A';

    const newSignal: TradeSignal = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      asset,
      type,
      timeframe: '5m', // default testing
      score: 4, // default valid
      entryPrice: Number(entry.toFixed(2)),
      stopLoss: Number(sl.toFixed(2)),
      takeProfit: Number(tp.toFixed(2)),
      riskReward: rr,
      reasons: ['Operación manual ingresada desde UI'],
      timestamp: Date.now(),
      status: 'ACTIVE',
      source: 'LIVE'
    };

    setActiveSignals(prev => [newSignal, ...prev]);
    notifyUser('Nexo Digital Pro - Trade Registrado', `Se creó trade ${type} en ${asset} a $${entry}`, newSignal);
  }, [notifyUser]);

  const clearHistory = useCallback(() => {
    setHistorySignals([]);
    localStorage.removeItem('nexo_trade_history');
  }, []);

  const totalClosed = historySignals.length;
  const wonCount = historySignals.filter(s => s.status === 'WON').length;
  const lostCount = totalClosed - wonCount;
  const winrate = totalClosed > 0 ? (wonCount / totalClosed) * 100 : null;
  const cumulativeProfit = historySignals.reduce((acc, s) => acc + (s.profitPercentage || 0), 0);
  
  // Profit Factor & Drawdown calculations
  const grossProfit = historySignals.filter(s => (s.profitPercentage || 0) > 0).reduce((acc, s) => acc + (s.profitPercentage || 0), 0);
  const grossLoss = Math.abs(historySignals.filter(s => (s.profitPercentage || 0) < 0).reduce((acc, s) => acc + (s.profitPercentage || 0), 0));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99.99 : 0);

  let peak = 0;
  let maxDrawdown = 0;
  let currentProfit = 0;

  // History is newest first, so we reverse to calculate drawdown chronologically
  [...historySignals].reverse().forEach(s => {
    currentProfit += (s.profitPercentage || 0);
    if (currentProfit > peak) {
      peak = currentProfit;
    }
    const drawdown = peak - currentProfit;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  });

  return { 
    activeSignals, 
    historySignals, 
    systemState, 
    newSignalAlert,
    setNewSignalAlert,
    addTrade,
    clearHistory,
    stats: {
      totalClosed,
      wonCount,
      lostCount,
      winrate: winrate !== null ? Number(winrate.toFixed(1)) : null,
      cumulativeProfit: Number(cumulativeProfit.toFixed(2)),
      profitFactor,
      maxDrawdown: Number(maxDrawdown.toFixed(2))
    }
  };
}

