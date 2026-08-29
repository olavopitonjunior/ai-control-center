import { describe, expect, it } from "vitest";
import {
  bucketStart,
  downsample,
  forecastFromCeiling,
  percentChange,
  retentionPlan,
  shares,
  type SystemSample,
} from "./aggregate";

const MIN = 60_000;

describe("bucketStart / downsample", () => {
  it("floors timestamps to bucket boundaries", () => {
    expect(bucketStart(90_000, MIN)).toBe(60_000);
    expect(bucketStart(120_000, MIN)).toBe(120_000);
  });

  it("averages samples per bucket, ignoring nulls", () => {
    const samples: SystemSample[] = [
      { t: 0, cpu: 10, ram: 50, gpu: null },
      { t: 30_000, cpu: 20, ram: 60, gpu: null },
      { t: 61_000, cpu: 40, ram: null, gpu: 70 },
    ];
    const rolled = downsample(samples, MIN);
    expect(rolled).toHaveLength(2);
    expect(rolled[0]!.cpu).toBe(15); // (10+20)/2
    expect(rolled[0]!.gpu).toBeNull(); // no gpu readings -> null, not 0
    expect(rolled[1]!.cpu).toBe(40);
    expect(rolled[1]!.ram).toBeNull();
    expect(rolled[0]!.count).toBe(2);
  });
});

describe("retentionPlan", () => {
  it("produces ordered cutoffs (raw < 1m < 5m windows)", () => {
    const p = retentionPlan(1_000_000_000_000);
    expect(p.rawCutoffMs).toBeGreaterThan(p.oneMinuteCutoffMs);
    expect(p.oneMinuteCutoffMs).toBeGreaterThan(p.fiveMinuteCutoffMs);
  });
});

describe("percentChange / shares", () => {
  it("computes percent change and guards divide-by-zero", () => {
    expect(percentChange(130, 100)).toBeCloseTo(30);
    expect(percentChange(70, 100)).toBeCloseTo(-30);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(null, 100)).toBeNull();
  });

  it("computes shares that sum to ~100", () => {
    const s = shares([
      { key: "a", value: 3 },
      { key: "b", value: 1 },
    ]);
    expect(s.find((x) => x.key === "a")!.percent).toBeCloseTo(75);
    expect(s.reduce((a, x) => a + x.percent, 0)).toBeCloseTo(100);
  });

  it("handles zero total without NaN", () => {
    expect(shares([{ key: "a", value: 0 }])[0]!.percent).toBe(0);
  });
});

describe("forecastFromCeiling", () => {
  it("projects (ESTIMATED) when a ceiling is provided and pace is high", () => {
    const start = 0;
    const end = 7 * 24 * 3600_000;
    const now = 0.54 * end;
    const f = forecastFromCeiling({
      used: 68,
      ceiling: 100,
      windowStartMs: start,
      windowEndMs: end,
      nowMs: now,
      observations: 25,
    });
    expect(f.beforeReset).toBe(true);
    expect(f.projectedExhaustionMs).not.toBeNull();
  });

  it("returns no projection without a ceiling", () => {
    const f = forecastFromCeiling({
      used: 68,
      ceiling: null,
      windowStartMs: 0,
      windowEndMs: 100,
      nowMs: 50,
      observations: 5,
    });
    expect(f.projectedExhaustionMs).toBeNull();
  });
});
