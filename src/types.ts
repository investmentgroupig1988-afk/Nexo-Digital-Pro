export type ViewState = 'landing' | 'register' | 'login' | 'access' | 'dashboard' | 'admin';

export interface User {
  name: string;
  email: string;
  password?: string;
  isApproved: boolean;
  isAdmin?: boolean;
  accessGrantedAt?: string;
  paymentMethod?: 'Crypto' | 'Transferencia';
}

export type Asset = 'BTC/USD' | 'XAU/USD';
export type SignalType = 'LONG' | 'SHORT' | 'BUY' | 'SELL' | 'HOLD';
export type SignalStatus = 'ACTIVE' | 'WON' | 'LOST' | 'CANCELLED';
export type Timeframe = '1m' | '5m' | '15m' | '1H' | '4H' | '1D';
export type SignalSource = 'LIVE' | 'BACKTEST';
export type SystemState = 'NO_DISPONIBLE' | 'ESPERANDO_DATOS' | 'ANALIZANDO' | 'HOLD' | 'BUY' | 'SELL';

export interface TradeSignal {
  id: string;
  asset: Asset;
  type: SignalType;
  timeframe: Timeframe;
  timestamp: number;
  score: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: string;
  
  ema20?: number;
  ema50?: number;
  ema200?: number;
  fibonacci?: {
    level0382: number;
    level0500: number;
    level0618: number;
  };
  support?: number;
  resistance?: number;
  volume?: number;
  trend?: 'ALCISTA' | 'BAJISTA' | 'LATERAL';
  marketStructure?: 'ALCISTA' | 'BAJISTA' | 'LATERAL';
  
  reasons: string[];
  status: SignalStatus;
  profitPercentage?: number;
  exitPrice?: number;
  exitTimestamp?: number;
  source: SignalSource;
}

export interface PriceDataPoint {
  time: string;
  price: number;
  volume?: number;
}
