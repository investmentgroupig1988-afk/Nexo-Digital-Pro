import { describe, expect, it } from "vitest";
import {
  MARKET_TIMEFRAMES,
  formatDirection,
  formatNumber,
  formatStructure,
  formatTrend,
  refreshIntervalFor,
} from "./market";

describe("market presentation", () => {
  it("never turns a missing numeric value into zero", () => {
    expect(formatNumber(null)).toBe("No disponible");
    expect(formatNumber(undefined)).toBe("No disponible");
    expect(formatNumber(0)).not.toBe("No disponible");
  });

  it("translates known market-structure values for the user interface", () => {
    expect(formatTrend("bullish")).toBe("Alcista");
    expect(formatStructure("higher_high_and_higher_low")).toBe("HH + HL");
    expect(formatDirection("downtrend")).toBe("Bajista");
  });

  it("uses a bounded refresh interval for every supported timeframe", () => {
    expect(MARKET_TIMEFRAMES).not.toContain("1m");
    expect(refreshIntervalFor("4h")).toBe(600_000);
  });
});
