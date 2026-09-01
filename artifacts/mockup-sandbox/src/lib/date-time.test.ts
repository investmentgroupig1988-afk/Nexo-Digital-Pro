import { describe, expect, it } from "vitest";
import { COMMERCIAL_TIME_ZONE, formatCommercialDateTime } from "./date-time";

describe("commercial date and time presentation", () => {
  it("renders a known UTC timestamp in the explicit ARG/BRA timezone", () => {
    expect(COMMERCIAL_TIME_ZONE).toBe("America/Argentina/Buenos_Aires");
    expect(formatCommercialDateTime("2026-08-26T13:30:00.000Z")).toBe("26 ago 2026 · 10:30 · ARG/BRA");
  });

  it("handles the UTC-to-ARG/BRA date boundary without double conversion", () => {
    expect(formatCommercialDateTime("2026-01-01T00:00:00.000Z")).toBe("31 dic 2025 · 21:00 · ARG/BRA");
  });

  it("fails safely for invalid values", () => {
    expect(formatCommercialDateTime("not-a-date")).toBe("No disponible");
    expect(formatCommercialDateTime(null, "—")).toBe("—");
  });
});
