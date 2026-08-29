/**
 * @acc/analytics — deterministic, LLM-free calculations used across the app.
 *
 * Design rules:
 *  - Pure functions. No clocks read internally; callers pass `now` explicitly so
 *    everything is testable and reproducible.
 *  - Null in → null out. We never invent a value we cannot compute.
 *  - A projected/estimated result is always labeled as such by the caller
 *    (sourceQuality = ESTIMATED). This module never claims a forecast is official.
 */

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

/** used / capacity as a 0–100 percentage. Null if either input is null or capacity <= 0. */
export function usedPercent(
  used: number | null,
  capacity: number | null,
): number | null {
  if (used === null || capacity === null || capacity <= 0) return null;
  return clampPercent((used / capacity) * 100);
}

/** remaining / capacity as a 0–100 percentage. */
export function remainingPercent(
  remaining: number | null,
  capacity: number | null,
): number | null {
  if (remaining === null || capacity === null || capacity <= 0) return null;
  return clampPercent((remaining / capacity) * 100);
}

export function clampPercent(p: number): number {
  if (Number.isNaN(p)) return 0;
  return Math.min(100, Math.max(0, p));
}

/** Whole seconds from `now` until `resetAt` (both ms epoch). Never negative; null if unknown. */
export function secondsUntil(
  resetAtMs: number | null,
  nowMs: number,
): number | null {
  if (resetAtMs === null) return null;
  return Math.max(0, Math.round((resetAtMs - nowMs) / 1000));
}

/**
 * Human countdown like "2d 4h 18m", "2h 14m", "18m", "42s". Null in → null out.
 * Shows at most the two most-significant non-zero units for readability.
 */
export function formatCountdown(totalSeconds: number | null): string | null {
  if (totalSeconds === null) return null;
  if (totalSeconds < 0) totalSeconds = 0;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: Array<[number, string]> = [
    [days, "d"],
    [hours, "h"],
    [minutes, "m"],
    [seconds, "s"],
  ];
  const nonZeroFrom = parts.findIndex(([v]) => v > 0);
  if (nonZeroFrom === -1) return "0s";
  return parts
    .slice(nonZeroFrom, nonZeroFrom + 2)
    .filter(([v], i) => v > 0 || i === 0)
    .map(([v, u]) => `${v}${u}`)
    .join(" ");
}

/**
 * Consumption velocity relative to the expected pace within a quota window.
 *
 *   velocity = (fraction of quota used) / (fraction of window elapsed)
 *
 * 1.0 = exactly on pace, >1 = burning faster than the window, <1 = under pace.
 * Returns null if inputs are unknown or the window hasn't started.
 */
export function consumptionVelocity(params: {
  usedFraction: number | null; // 0..1 of the quota consumed
  windowStartMs: number | null;
  windowEndMs: number | null;
  nowMs: number;
}): number | null {
  const { usedFraction, windowStartMs, windowEndMs, nowMs } = params;
  if (usedFraction === null || windowStartMs === null || windowEndMs === null)
    return null;
  const windowLen = windowEndMs - windowStartMs;
  if (windowLen <= 0) return null;
  const elapsed = nowMs - windowStartMs;
  if (elapsed <= 0) return null;
  const elapsedFraction = Math.min(1, elapsed / windowLen);
  if (elapsedFraction <= 0) return null;
  return usedFraction / elapsedFraction;
}

export interface ExhaustionForecast {
  /** Projected ms-epoch at which the quota hits 100%, or null if not projectable. */
  projectedExhaustionMs: number | null;
  /** True if exhaustion is projected before the window's own reset. */
  beforeReset: boolean | null;
  velocity: number | null;
  confidence: Confidence;
}

/**
 * Project when a quota will be exhausted, using observed velocity within the
 * current window. This is a straight-line projection from current pace; callers
 * MUST present the result as ESTIMATED, never official.
 *
 * @param observations number of samples the velocity is based on — drives confidence.
 */
export function forecastExhaustion(params: {
  usedFraction: number | null; // 0..1
  windowStartMs: number | null;
  windowEndMs: number | null;
  nowMs: number;
  observations: number;
}): ExhaustionForecast {
  const { usedFraction, windowStartMs, windowEndMs, nowMs, observations } =
    params;
  const velocity = consumptionVelocity({
    usedFraction,
    windowStartMs,
    windowEndMs,
    nowMs,
  });

  if (
    usedFraction === null ||
    windowStartMs === null ||
    windowEndMs === null ||
    velocity === null ||
    velocity <= 0
  ) {
    return {
      projectedExhaustionMs: null,
      beforeReset: null,
      velocity,
      confidence: "LOW",
    };
  }

  if (usedFraction >= 1) {
    return {
      projectedExhaustionMs: nowMs,
      beforeReset: nowMs < windowEndMs,
      velocity,
      confidence: confidenceFrom(observations),
    };
  }

  // remaining fraction / rate-per-ms. rate = usedFraction / elapsedMs.
  const elapsedMs = Math.min(
    nowMs - windowStartMs,
    windowEndMs - windowStartMs,
  );
  if (elapsedMs <= 0) {
    return {
      projectedExhaustionMs: null,
      beforeReset: null,
      velocity,
      confidence: "LOW",
    };
  }
  const ratePerMs = usedFraction / elapsedMs;
  if (ratePerMs <= 0) {
    return {
      projectedExhaustionMs: null,
      beforeReset: null,
      velocity,
      confidence: "LOW",
    };
  }
  const msToExhaustion = (1 - usedFraction) / ratePerMs;
  const projectedExhaustionMs = Math.round(nowMs + msToExhaustion);

  return {
    projectedExhaustionMs,
    beforeReset: projectedExhaustionMs < windowEndMs,
    velocity,
    confidence: confidenceFrom(observations),
  };
}

/** Confidence tiers from how many observations back the velocity estimate. */
export function confidenceFrom(observations: number): Confidence {
  if (observations >= 20) return "HIGH";
  if (observations >= 6) return "MEDIUM";
  return "LOW";
}

export * from "./aggregate";
export * from "./dedup";
