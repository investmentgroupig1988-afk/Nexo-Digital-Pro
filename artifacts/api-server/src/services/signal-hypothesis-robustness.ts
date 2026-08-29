import {
  netRealizedR,
  type BacktestTrade,
  type ExitConfiguration,
} from "./signal-backtest";
import { FROZEN_1H_FORWARD_CUTOFF, FROZEN_1H_HYPOTHESIS_HASH } from "./signal-hypothesis-snapshot";

export const BTC_ROBUSTNESS_START = "2018-08-28T00:00:00.000Z";
export const BTC_DISCOVERY_ERA_START = "2022-08-28T00:00:00.000Z";
export const BTC_ROBUSTNESS_END = FROZEN_1H_FORWARD_CUTOFF;
export const BTC_ROBUSTNESS_COSTS_BPS = [0, 5, 10, 15] as const;
export const BTC_SENSITIVITY_STOP_ATR = [1.4, 1.5, 1.6] as const;
export const BTC_SENSITIVITY_EXPIRY = [10, 12, 14] as const;

export type FixedTimeWindow = {
  id: string;
  start: string;
  end: string;
};

export type BootstrapDistribution = {
  seed: number;
  iterations: number;
  blockLength: number;
  sampleSize: number;
  frictionBps: number;
  expectancyR: { p2_5: number; p50: number; p97_5: number };
  maximumDrawdownR: { p50: number; p90: number; p95: number; p97_5: number };
  longestNegativeStreak: { p50: number; p90: number; p95: number; p97_5: number };
  probabilityPositiveExpectancyPct: number;
  probabilityNegativeExpectancyPct: number;
  probabilityNegativeStreakAtLeast5Pct: number;
  method: string;
};

export function frozenSensitivityGrid(): ExitConfiguration[] {
  return BTC_SENSITIVITY_STOP_ATR.flatMap((atrMultiple) =>
    BTC_SENSITIVITY_EXPIRY.map((expiryCandles) => ({
      name: `FROZEN_SENSITIVITY_ATR_${atrMultiple.toFixed(1)}_RR1_5_E${expiryCandles}`,
      riskMode: "ATR" as const,
      atrMultiple,
      rewardRisk: 1.5,
      expiryCandles,
    })));
}

export function independentTwoYearWindows(): FixedTimeWindow[] {
  return [
    window("INDEPENDENT_2018_2020", "2018-08-28T00:00:00.000Z", "2020-08-28T00:00:00.000Z"),
    window("INDEPENDENT_2020_2022", "2020-08-28T00:00:00.000Z", "2022-08-28T00:00:00.000Z"),
    window("INDEPENDENT_2022_2024", "2022-08-28T00:00:00.000Z", "2024-08-28T00:00:00.000Z"),
    window("INDEPENDENT_2024_2026", "2024-08-28T00:00:00.000Z", BTC_ROBUSTNESS_END),
  ];
}

export function rollingTwoYearWindows(): FixedTimeWindow[] {
  return [
    window("ROLLING_2018_2020", "2018-08-28T00:00:00.000Z", "2020-08-28T00:00:00.000Z"),
    window("ROLLING_2019_2021", "2019-08-28T00:00:00.000Z", "2021-08-28T00:00:00.000Z"),
    window("ROLLING_2020_2022", "2020-08-28T00:00:00.000Z", "2022-08-28T00:00:00.000Z"),
    window("ROLLING_2021_2023", "2021-08-28T00:00:00.000Z", "2023-08-28T00:00:00.000Z"),
    window("ROLLING_2022_2024", "2022-08-28T00:00:00.000Z", "2024-08-28T00:00:00.000Z"),
    window("ROLLING_2023_2025", "2023-08-28T00:00:00.000Z", "2025-08-28T00:00:00.000Z"),
    window("ROLLING_2024_2026", "2024-08-28T00:00:00.000Z", BTC_ROBUSTNESS_END),
  ];
}

export function approximateBreakEvenBps(trades: BacktestTrade[]): number | null {
  const completed = trades.filter((trade) => trade.realizedR !== null && trade.riskPct > 0);
  if (!completed.length) return null;
  const grossExpectancy = completed.reduce((sum, trade) => sum + trade.realizedR!, 0) / completed.length;
  const averageCostPerBpsR = completed.reduce((sum, trade) => sum + 0.01 / trade.riskPct, 0) / completed.length;
  if (grossExpectancy <= 0 || averageCostPerBpsR <= 0) return 0;
  return grossExpectancy / averageCostPerBpsR;
}

export function deterministicBlockBootstrap(input: {
  trades: BacktestTrade[];
  frictionBps?: number;
  iterations?: number;
  blockLength?: number;
  seed?: number;
}): BootstrapDistribution | null {
  const frictionBps = input.frictionBps ?? 5;
  const iterations = input.iterations ?? 10_000;
  const blockLength = input.blockLength ?? 5;
  const seed = input.seed ?? seedFromHash(FROZEN_1H_HYPOTHESIS_HASH);
  const returns = input.trades.map((trade) => netRealizedR(trade, frictionBps))
    .filter((value): value is number => value !== null);
  if (!returns.length) return null;
  if (!Number.isInteger(iterations) || iterations < 100) throw new Error("Bootstrap iterations must be at least 100.");
  if (!Number.isInteger(blockLength) || blockLength < 1 || blockLength > returns.length) {
    throw new Error("Bootstrap block length is outside the available sample.");
  }

  const random = xorshift32(seed);
  const expectancy: number[] = [];
  const drawdowns: number[] = [];
  const streaks: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample: number[] = [];
    while (sample.length < returns.length) {
      const start = Math.floor(random() * returns.length);
      for (let offset = 0; offset < blockLength && sample.length < returns.length; offset += 1) {
        sample.push(returns[(start + offset) % returns.length]);
      }
    }
    expectancy.push(average(sample));
    drawdowns.push(maximumDrawdown(sample));
    streaks.push(longestNegativeStreak(sample));
  }

  return {
    seed,
    iterations,
    blockLength,
    sampleSize: returns.length,
    frictionBps,
    expectancyR: {
      p2_5: percentile(expectancy, 0.025),
      p50: percentile(expectancy, 0.5),
      p97_5: percentile(expectancy, 0.975),
    },
    maximumDrawdownR: {
      p50: percentile(drawdowns, 0.5),
      p90: percentile(drawdowns, 0.9),
      p95: percentile(drawdowns, 0.95),
      p97_5: percentile(drawdowns, 0.975),
    },
    longestNegativeStreak: {
      p50: percentile(streaks, 0.5),
      p90: percentile(streaks, 0.9),
      p95: percentile(streaks, 0.95),
      p97_5: percentile(streaks, 0.975),
    },
    probabilityPositiveExpectancyPct: ratio(expectancy.filter((value) => value > 0).length, iterations),
    probabilityNegativeExpectancyPct: ratio(expectancy.filter((value) => value < 0).length, iterations),
    probabilityNegativeStreakAtLeast5Pct: ratio(streaks.filter((value) => value >= 5).length, iterations),
    method: "Deterministic circular moving-block bootstrap over chronological net-R results; block length 5 preserves short local clustering but cannot model non-stationary regime changes.",
  };
}

function window(id: string, start: string, end: string): FixedTimeWindow {
  return { id, start, end };
}

function seedFromHash(hash: string): number {
  return Number.parseInt(hash.slice(0, 8), 16) || 1;
}

function xorshift32(initial: number): () => number {
  let state = initial >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function maximumDrawdown(values: number[]): number {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return drawdown;
}

function longestNegativeStreak(values: number[]): number {
  let current = 0;
  let longest = 0;
  for (const value of values) {
    current = value < 0 ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator * 100;
}
