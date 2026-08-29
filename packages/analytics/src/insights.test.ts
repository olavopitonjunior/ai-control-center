import { describe, expect, it } from "vitest";
import type { AISession } from "@acc/protocol";
import {
  byProject,
  forecastExhaustionWeighted,
  peakUsageHours,
  sessionStats,
  weightedConsumptionRate,
} from "./insights";

const MIN = 60_000;

function s(over: Partial<AISession> = {}): AISession {
  return {
    id: "claude-code:x",
    machineId: "m",
    agent: "claude-code",
    pid: null,
    projectName: "Rankd",
    projectPath: null,
    terminal: null,
    startedAt: "2026-08-29T09:00:00.000Z",
    lastActivityAt: "2026-08-29T09:30:00.000Z",
    durationSeconds: 1800,
    status: "ENDED",
    model: "claude-opus-4-8",
    tokens: {
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheCreationTokens: null,
      totalTokens: 1000,
    },
    cost: {
      amount: 2,
      currency: "USD",
      source: "ccusage",
      sourceQuality: "CALCULATED",
    },
    provenance: [],
    ...over,
  };
}

describe("sessionStats", () => {
  it("computes averages, longest, and totals", () => {
    const st = sessionStats([
      s({
        id: "a",
        durationSeconds: 600,
        tokens: { ...s().tokens!, totalTokens: 100 },
      }),
      s({
        id: "b",
        durationSeconds: 1800,
        tokens: { ...s().tokens!, totalTokens: 300 },
      }),
    ]);
    expect(st.count).toBe(2);
    expect(st.avgDurationSeconds).toBe(1200);
    expect(st.longestDurationSeconds).toBe(1800);
    expect(st.avgTokens).toBe(200);
    expect(st.totalTokens).toBe(400);
    expect(st.avgCost).toBe(2);
  });

  it("returns null averages (not zero) when nothing reported a value", () => {
    const st = sessionStats([
      s({ durationSeconds: null, tokens: null, cost: null }),
    ]);
    expect(st.avgDurationSeconds).toBeNull();
    expect(st.longestDurationSeconds).toBeNull();
    expect(st.avgTokens).toBeNull();
    expect(st.avgCost).toBeNull();
    expect(st.count).toBe(1);
    expect(st.timedCount).toBe(0);
  });
});

describe("byProject", () => {
  it("groups tokens/cost per project with shares summing to ~100", () => {
    const rows = byProject([
      s({ projectName: "Rankd", tokens: { ...s().tokens!, totalTokens: 750 } }),
      s({
        projectName: "Immobpro",
        tokens: { ...s().tokens!, totalTokens: 250 },
      }),
    ]);
    expect(rows[0]!.key).toBe("Rankd");
    expect(rows[0]!.percent).toBeCloseTo(75);
    expect(rows.reduce((a, r) => a + r.percent, 0)).toBeCloseTo(100);
  });
});

describe("peakUsageHours", () => {
  it("ranks hours by activity count", () => {
    const hourOf = (iso: string) => Number(iso.slice(11, 13)); // UTC hour, deterministic
    const rows = peakUsageHours(
      [
        s({ lastActivityAt: "2026-08-29T09:10:00.000Z" }),
        s({ lastActivityAt: "2026-08-29T09:40:00.000Z" }),
        s({ lastActivityAt: "2026-08-29T14:00:00.000Z" }),
      ],
      hourOf,
    );
    expect(rows[0]).toEqual({ hour: 9, count: 2 });
    expect(rows[1]).toEqual({ hour: 14, count: 1 });
  });

  it("ignores sessions with no timestamps", () => {
    expect(
      peakUsageHours([s({ lastActivityAt: null, startedAt: null })]),
    ).toEqual([]);
  });
});

describe("weightedConsumptionRate", () => {
  it("weights recent behaviour above older behaviour", () => {
    // Slow for the first hour, then 4x faster in the last 10 minutes.
    const obs = [
      { t: 0, usedFraction: 0 },
      { t: 60 * MIN, usedFraction: 0.1 },
      { t: 65 * MIN, usedFraction: 0.15 },
      { t: 70 * MIN, usedFraction: 0.2 },
    ];
    const weighted = weightedConsumptionRate(obs, 10 * MIN)!;
    const naive = (0.2 - 0) / (70 * MIN); // first-to-last
    expect(weighted).toBeGreaterThan(naive); // recent burst dominates
  });

  it("ignores quota resets (negative deltas) and bad spacing", () => {
    const obs = [
      { t: 0, usedFraction: 0.9 },
      { t: 10 * MIN, usedFraction: 0.0 }, // reset
      { t: 20 * MIN, usedFraction: 0.1 },
    ];
    const rate = weightedConsumptionRate(obs, 10 * MIN);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0);
  });

  it("returns null with fewer than two usable observations", () => {
    expect(weightedConsumptionRate([{ t: 0, usedFraction: 0.5 }])).toBeNull();
  });
});

describe("forecastExhaustionWeighted", () => {
  it("projects exhaustion before reset when burning fast", () => {
    const now = 70 * MIN;
    const f = forecastExhaustionWeighted({
      observations: [
        { t: 0, usedFraction: 0 },
        { t: 60 * MIN, usedFraction: 0.5 },
        { t: 70 * MIN, usedFraction: 0.8 },
      ],
      currentUsedFraction: 0.8,
      windowEndMs: now + 120 * MIN,
      nowMs: now,
      halfLifeMs: 20 * MIN,
    });
    expect(f.projectedExhaustionMs).not.toBeNull();
    expect(f.beforeReset).toBe(true);
    expect(f.velocity!).toBeGreaterThan(1); // faster than par pace
  });

  it("does not project exhaustion before reset when under pace", () => {
    const now = 100 * MIN;
    const f = forecastExhaustionWeighted({
      observations: [
        { t: 0, usedFraction: 0 },
        { t: 100 * MIN, usedFraction: 0.1 },
      ],
      currentUsedFraction: 0.1,
      windowEndMs: now + 60 * MIN,
      nowMs: now,
    });
    expect(f.beforeReset).toBe(false);
  });

  it("reports LOW confidence and no projection without usable data", () => {
    const f = forecastExhaustionWeighted({
      observations: [],
      currentUsedFraction: 0.4,
      windowEndMs: 100,
      nowMs: 0,
    });
    expect(f.projectedExhaustionMs).toBeNull();
    expect(f.confidence).toBe("LOW");
  });
});
