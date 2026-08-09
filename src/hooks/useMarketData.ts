import { useState, useEffect } from 'react';
import { PriceDataPoint } from '../types';

export function useMarketData() {
  const [btcPrice, setBtcPrice] = useState<number | null>(64230.50);
  const [xauPrice, setXauPrice] = useState<number | null>(2340.15);
  const [btcHistory, setBtcHistory] = useState<PriceDataPoint[]>([]);
  const [xauHistory, setXauHistory] = useState<PriceDataPoint[]>([]);
  const [isConnected, setIsConnected] = useState(true); // Mock connected
  const [lastUpdate, setLastUpdate] = useState<Date | null>(new Date());

  useEffect(() => {
    // Generate some mock history for charts
    const generateMockHistory = (basePrice: number, volatility: number) => {
      const data: PriceDataPoint[] = [];
      let currentPrice = basePrice;
      const now = Date.now();
      for (let i = 60; i >= 0; i--) {
        const time = new Date(now - i * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        currentPrice = currentPrice + (Math.random() - 0.5) * volatility;
        data.push({ time, price: currentPrice });
      }
      return data;
    };

    setBtcHistory(generateMockHistory(64200, 100));
    setXauHistory(generateMockHistory(2340, 2));

    const interval = setInterval(() => {
      setBtcPrice(prev => prev ? prev + (Math.random() - 0.5) * 50 : 64230);
      setXauPrice(prev => prev ? prev + (Math.random() - 0.5) * 1 : 2340);
      setLastUpdate(new Date());
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return { btcPrice, xauPrice, btcHistory, xauHistory, isConnected, lastUpdate };
}
