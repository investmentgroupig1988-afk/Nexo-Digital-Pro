import { describe, expect, it } from "vitest";
import {
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

  it("keeps the original market-structure value visible", () => {
    expect(formatTrend("bullish")).toBe("Alcista (bullish)");
    expect(formatStructure("higher_high_and_higher_low")).toBe("HH + HL (higher_high_and_higher_low)");
    expect(formatDirection("downtrend")).toBe("Bajista (downtrend)");
  });

  it("uses a bounded refresh interval for every supported timeframe", () => {
    expect(refreshIntervalFor("1m")).toBe(30_000);
    expect(refreshIntervalFor("4h")).toBe(600_000);
  });
});
