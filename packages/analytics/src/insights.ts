import type { AISession } from "@acc/protocol";
import {
  confidenceFrom,
  type Confidence,
  type ExhaustionForecast,
} from "./index";
import { shares } from "./aggregate";

/**
 * Deterministic session/project analytics (spec §21) and a weighted quota-exhaustion
 * forecast (spec §22). Pure functions — callers pass `now`; nothing reads the clock.
 */

export interface SessionStats {
  count: number;
  /** Sessions that reported a duration (the basis for the duration averages). */
  timedCount: number;
  avgDurationSeconds: number | null;
  longestDurationSeconds: number | null;
  avgTokens: number | null;
  avgCost: number | null;
  totalTokens: number;
  totalCost: number;
}

/**
 * Aggregate session statistics. Averages are computed only over sessions that actually
 * reported the underlying value, and are null when none did — never 0-as-data.
 */
export function sessionStats(sessions: AISession[]): SessionStats {
  const durations = sessions
    .map((s) => s.durationSeconds)
    .filter((d): d is number => d !== null && d >= 0);
  const tokenValues = sessions
    .map((s) => s.tokens?.totalTokens ?? null)
    .filter((t): t is number => t !== null);
  const costValues = sessions
    .map((s) => s.cost?.amount ?? null)
    .filter((c): c is number => c !== null);

  const avg = (xs: number[]): number | null =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  return {
    count: sessions.length,
    timedCount: durations.length,
    avgDurationSeconds: avg(durations),
    longestDurationSeconds: durations.length ? Math.max(...durations) : null,
    avgTokens: avg(tokenValues),
    avgCost: avg(costValues),
    totalTokens: tokenValues.reduce((a, b) => a + b, 0),
    totalCost: costValues.reduce((a, b) => a + b, 0),
  };
}

/** Tokens (and cost) grouped by project, with each project's share of the total. */
export function byProject(sessions: AISession[]): {
  key: string;
  tokens: number;
  cost: number;
  percent: number;
}[] {
  const acc = new Map<string, { tokens: number; cost: number }>();
  for (const s of sessions) {
    const key = s.projectName ?? s.projectPath ?? "unknown";
    const cur = acc.get(key) ?? { tokens: 0, cost: 0 };
    cur.tokens += s.tokens?.totalTokens ?? 0;
    cur.cost += s.cost?.amount ?? 0;
    acc.set(key, cur);
  }
  const withShare = shares(
    [...acc.entries()].map(([key, v]) => ({ key, value: v.tokens })),
  );
  return withShare
    .map((s) => ({
      key: s.key,
      tokens: s.value,
      cost: acc.get(s.key)!.cost,
      percent: s.percent,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

/**
 * Busiest hours of the day by activity count, using each session's last-activity time.
 * Returns hours (0–23) sorted by count, so the UI can say "Highest AI usage: 09:00–11:00".
 * `hourOf` converts a timestamp to a local hour; injected for testability.
 */
export function peakUsageHours(
  sessions: AISession[],
  hourOf: (iso: string) => number = (iso) => new Date(iso).getHours(),
): { hour: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const s of sessions) {
    const iso = s.lastActivityAt ?? s.startedAt;
    if (!iso) continue;
    const h = hourOf(iso);
    if (!Number.isFinite(h)) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count || a.hour - b.hour);
}

// ---------------------------------------------------------------------------
// Weighted consumption velocity + forecast (spec §22)
// ---------------------------------------------------------------------------

export interface UsageObservation {
  /** ms epoch */
  t: number;
  /** cumulative fraction of the quota consumed at that time (0..1) */
  usedFraction: number;
}

/**
 * Consumption rate (quota-fraction per millisecond) from recent observations, using
 * EXPONENTIAL WEIGHTING so recent behaviour dominates rather than a naive
 * first-to-last extrapolation (spec §22).
 *
 * Algorithm (documented):
 *   1. Sort observations by time and take consecutive pairs.
 *   2. For each pair compute the instantaneous rate  (Δfraction / Δtime), ignoring
 *      non-positive Δtime and quota resets (Δfraction < 0).
 *   3. Weight each pair by  w = 2^(-age / halfLife), where age is measured from the
 *      newest observation. A pair one half-life old counts half as much.
 *   4. Return the weighted mean rate.
 *
 * Returns null when fewer than two usable observations exist.
 */
export function weightedConsumptionRate(
  observations: UsageObservation[],
  halfLifeMs = 30 * 60_000,
): number | null {
  const obs = [...observations].sort((a, b) => a.t - b.t);
  if (obs.length < 2) return null;
  const newest = obs[obs.length - 1]!.t;

  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 1; i < obs.length; i++) {
    const prev = obs[i - 1]!;
    const cur = obs[i]!;
    const dt = cur.t - prev.t;
    const df = cur.usedFraction - prev.usedFraction;
    if (dt <= 0 || df < 0) continue; // ignore bad spacing and quota resets
    const age = newest - cur.t;
    const w = Math.pow(2, -age / halfLifeMs);
    weightedSum += (df / dt) * w;
    weightTotal += w;
  }
  if (weightTotal === 0) return null;
  return weightedSum / weightTotal;
}

/**
 * Project quota exhaustion from the WEIGHTED recent rate. Falls back to null when the
 * rate can't be established. The result is always ESTIMATED — the caller must never
 * present it as an official provider value.
 */
export function forecastExhaustionWeighted(params: {
  observations: UsageObservation[];
  currentUsedFraction: number;
  windowEndMs: number;
  nowMs: number;
  halfLifeMs?: number;
}): ExhaustionForecast {
  const { observations, currentUsedFraction, windowEndMs, nowMs, halfLifeMs } =
    params;
  const rate = weightedConsumptionRate(observations, halfLifeMs);
  const confidence: Confidence = confidenceFrom(observations.length);

  if (rate === null || rate <= 0 || currentUsedFraction >= 1) {
    return {
      projectedExhaustionMs: currentUsedFraction >= 1 ? nowMs : null,
      beforeReset: currentUsedFraction >= 1 ? nowMs < windowEndMs : null,
      velocity: null,
      confidence: currentUsedFraction >= 1 ? confidence : "LOW",
    };
  }

  const remaining = Math.max(0, 1 - currentUsedFraction);
  const projectedExhaustionMs = Math.round(nowMs + remaining / rate);

  // Velocity relative to the pace that would exactly consume the window: the rate that
  // would finish the remaining quota exactly at reset.
  const msToReset = windowEndMs - nowMs;
  const parRate = msToReset > 0 ? remaining / msToReset : null;
  const velocity = parRate && parRate > 0 ? rate / parRate : null;

  return {
    projectedExhaustionMs,
    beforeReset: projectedExhaustionMs < windowEndMs,
    velocity,
    confidence,
  };
}
