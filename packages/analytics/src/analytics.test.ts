import { describe, expect, it } from "vitest";
import {
  confidenceFrom,
  consumptionVelocity,
  forecastExhaustion,
  formatCountdown,
  remainingPercent,
  secondsUntil,
  usedPercent,
} from "./index";

const HOUR = 3600_000;

describe("percentages", () => {
  it("computes used/remaining percent", () => {
    // Values are precise floats; rounding for display is the caller's concern.
    expect(usedPercent(72, 100)).toBeCloseTo(72, 6);
    expect(remainingPercent(28, 100)).toBeCloseTo(28, 6);
  });
  it("returns null on unknown or zero capacity (never 0-as-data)", () => {
    expect(usedPercent(5, null)).toBeNull();
    expect(usedPercent(null, 100)).toBeNull();
    expect(usedPercent(5, 0)).toBeNull();
  });
  it("clamps out-of-range ratios", () => {
    expect(usedPercent(150, 100)).toBe(100);
  });
});

describe("secondsUntil", () => {
  it("counts forward, never negative", () => {
    const now = 1_000_000;
    expect(secondsUntil(now + 8040_000, now)).toBe(8040);
    expect(secondsUntil(now - 5000, now)).toBe(0);
    expect(secondsUntil(null, now)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("shows the two most-significant units", () => {
    expect(formatCountdown(2 * 86400 + 4 * 3600 + 18 * 60)).toBe("2d 4h");
    expect(formatCountdown(2 * 3600 + 14 * 60)).toBe("2h 14m");
    expect(formatCountdown(18 * 60)).toBe("18m");
    expect(formatCountdown(42)).toBe("42s");
    expect(formatCountdown(0)).toBe("0s");
  });
  it("returns null when unknown", () => {
    expect(formatCountdown(null)).toBeNull();
  });
});

describe("consumptionVelocity", () => {
  it("is 1.0 exactly on pace", () => {
    const start = 0;
    const end = 10 * HOUR;
    const now = 5 * HOUR; // 50% elapsed
    expect(
      consumptionVelocity({
        usedFraction: 0.5,
        windowStartMs: start,
        windowEndMs: end,
        nowMs: now,
      }),
    ).toBeCloseTo(1);
  });
  it("is >1 when burning faster than the window", () => {
    const v = consumptionVelocity({
      usedFraction: 0.68,
      windowStartMs: 0,
      windowEndMs: 10 * HOUR,
      nowMs: 5.4 * HOUR,
    });
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(1);
  });
  it("returns null on bad inputs", () => {
    expect(
      consumptionVelocity({
        usedFraction: null,
        windowStartMs: 0,
        windowEndMs: HOUR,
        nowMs: 1,
      }),
    ).toBeNull();
    expect(
      consumptionVelocity({
        usedFraction: 0.5,
        windowStartMs: 0,
        windowEndMs: 0,
        nowMs: 1,
      }),
    ).toBeNull();
  });
});

describe("forecastExhaustion", () => {
  it("projects exhaustion before reset when over pace", () => {
    // 68% used, 54% of a 7-day window elapsed -> velocity ~1.26, exhausts before end.
    const start = 0;
    const end = 7 * 24 * HOUR;
    const now = 0.54 * end;
    const f = forecastExhaustion({
      usedFraction: 0.68,
      windowStartMs: start,
      windowEndMs: end,
      nowMs: now,
      observations: 25,
    });
    expect(f.velocity).not.toBeNull();
    expect(f.velocity!).toBeGreaterThan(1);
    expect(f.projectedExhaustionMs).not.toBeNull();
    expect(f.beforeReset).toBe(true);
    expect(f.projectedExhaustionMs!).toBeGreaterThan(now);
    expect(f.projectedExhaustionMs!).toBeLessThan(end);
    expect(f.confidence).toBe("HIGH");
  });
  it("does NOT project exhaustion before reset when under pace", () => {
    const end = 7 * 24 * HOUR;
    const now = 0.8 * end; // 80% elapsed, only 40% used -> under pace
    const f = forecastExhaustion({
      usedFraction: 0.4,
      windowStartMs: 0,
      windowEndMs: end,
      nowMs: now,
      observations: 3,
    });
    expect(f.beforeReset).toBe(false);
    expect(f.confidence).toBe("LOW");
  });
  it("degrades to LOW confidence / null projection on missing data", () => {
    const f = forecastExhaustion({
      usedFraction: null,
      windowStartMs: null,
      windowEndMs: null,
      nowMs: 1,
      observations: 0,
    });
    expect(f.projectedExhaustionMs).toBeNull();
    expect(f.confidence).toBe("LOW");
  });
});

describe("confidenceFrom", () => {
  it("tiers by observation count", () => {
    expect(confidenceFrom(25)).toBe("HIGH");
    expect(confidenceFrom(10)).toBe("MEDIUM");
    expect(confidenceFrom(2)).toBe("LOW");
  });
});
