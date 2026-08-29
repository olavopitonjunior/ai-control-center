import { forecastExhaustion, type ExhaustionForecast } from "./index";

/** Floor a ms timestamp to the start of its bucket. */
export function bucketStart(ms: number, bucketMs: number): number {
  return Math.floor(ms / bucketMs) * bucketMs;
}

export interface SystemSample {
  t: number; // ms epoch
  cpu: number | null;
  ram: number | null;
  gpu: number | null;
}

export interface Rollup {
  t: number; // bucket start ms
  cpu: number | null;
  ram: number | null;
  gpu: number | null;
  count: number;
}

/**
 * Downsample raw samples into fixed-interval buckets, averaging each field and
 * ignoring nulls (a bucket with no readings for a field yields null, never 0).
 * Pure and deterministic — the caller supplies bucket size and samples.
 */
export function downsample(
  samples: SystemSample[],
  bucketMs: number,
): Rollup[] {
  const buckets = new Map<
    number,
    { cpu: number[]; ram: number[]; gpu: number[]; count: number }
  >();
  for (const s of samples) {
    const key = bucketStart(s.t, bucketMs);
    const b = buckets.get(key) ?? { cpu: [], ram: [], gpu: [], count: 0 };
    if (s.cpu !== null) b.cpu.push(s.cpu);
    if (s.ram !== null) b.ram.push(s.ram);
    if (s.gpu !== null) b.gpu.push(s.gpu);
    b.count += 1;
    buckets.set(key, b);
  }
  const avg = (xs: number[]): number | null =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, b]) => ({
      t,
      cpu: avg(b.cpu),
      ram: avg(b.ram),
      gpu: avg(b.gpu),
      count: b.count,
    }));
}

/**
 * Retention policy (spec §42), expressed as cutoff timestamps relative to `now`.
 * Raw kept 24h; 1-minute rollups 7d; 5-minute rollups 90d; hourly beyond.
 */
export interface RetentionPlan {
  rawCutoffMs: number; // delete raw system_metrics older than this
  oneMinuteCutoffMs: number; // beyond this, only 5-minute rollups
  fiveMinuteCutoffMs: number; // beyond this, only hourly rollups
}
export function retentionPlan(nowMs: number): RetentionPlan {
  const H = 3600_000;
  const D = 24 * H;
  return {
    rawCutoffMs: nowMs - 24 * H,
    oneMinuteCutoffMs: nowMs - 7 * D,
    fiveMinuteCutoffMs: nowMs - 90 * D,
  };
}

/** Percentage change from previous to current. Null if not computable. */
export function percentChange(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export interface ShareEntry {
  key: string;
  value: number;
  percent: number;
}
/** Compute each entry's share (%) of the total. Entries with 0 total -> 0%. */
export function shares(
  entries: { key: string; value: number }[],
): ShareEntry[] {
  const total = entries.reduce((a, e) => a + e.value, 0);
  return entries.map((e) => ({
    key: e.key,
    value: e.value,
    percent: total > 0 ? (e.value / total) * 100 : 0,
  }));
}

/**
 * Forecast quota exhaustion from a configured ceiling. usedFraction = used/ceiling.
 * The result is always ESTIMATED (the ceiling is user-supplied). Null ceiling -> no
 * projection.
 */
export function forecastFromCeiling(params: {
  used: number | null;
  ceiling: number | null;
  windowStartMs: number | null;
  windowEndMs: number | null;
  nowMs: number;
  observations: number;
}): ExhaustionForecast {
  const { used, ceiling, windowStartMs, windowEndMs, nowMs, observations } =
    params;
  const usedFraction =
    used !== null && ceiling !== null && ceiling > 0 ? used / ceiling : null;
  return forecastExhaustion({
    usedFraction,
    windowStartMs,
    windowEndMs,
    nowMs,
    observations,
  });
}
