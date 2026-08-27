export type TotalHistoryMetrics = {
  total: number;
  wins: number;
  losses: number;
  expired: number;
  accuracy: number | null;
};

type StatusCount = {
  status: string;
  count: number;
};

export function summarizeTotalHistory(rows: StatusCount[]): TotalHistoryMetrics {
  const countFor = (status: "WIN" | "LOSS" | "EXPIRED") =>
    rows.filter((row) => row.status === status).reduce((sum, row) => sum + row.count, 0);
  const wins = countFor("WIN");
  const losses = countFor("LOSS");
  const expired = countFor("EXPIRED");
  const total = wins + losses + expired;

  return {
    total,
    wins,
    losses,
    expired,
    accuracy: total === 0 ? null : round((wins / total) * 100),
  };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
