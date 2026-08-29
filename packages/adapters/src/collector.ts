import type { CollectorHealth } from "@acc/protocol";

/**
 * A Collector gathers one slice of the snapshot from one underlying source
 * (ccusage, Glances, Task Scheduler, ...). Collectors MUST fail independently:
 * `collect()` should resolve with a health status rather than throwing, so one
 * broken source degrades only its own section of the dashboard.
 */
export interface Collector<T> {
  /** Stable identifier shown in the UI's per-source health list, e.g. "ccusage". */
  readonly name: string;

  /** Cheap check of whether the underlying tool is installed/configured. */
  probe(): Promise<CollectorStatusLite>;

  /** Gather the data. Never throws for expected failures — report via status. */
  collect(): Promise<CollectorResult<T>>;
}

export interface CollectorStatusLite {
  health: CollectorHealth;
  detail: string | null;
}

export interface CollectorResult<T> {
  /** The normalized data, or null when unavailable. Null is honest — never faked. */
  data: T | null;
  health: CollectorHealth;
  detail: string | null;
  lastError: string | null;
}

/** Convenience constructor for a healthy result. */
export function ok<T>(
  data: T,
  detail: string | null = null,
): CollectorResult<T> {
  return { data, health: "HEALTHY", detail, lastError: null };
}

/** Convenience constructor for an unavailable result (no data, but not an error). */
export function unavailable<T>(
  health: Exclude<CollectorHealth, "HEALTHY">,
  detail: string,
): CollectorResult<T> {
  return { data: null, health, detail, lastError: null };
}

/** Convenience constructor for an errored result. */
export function errored<T>(detail: string, error: unknown): CollectorResult<T> {
  const lastError = error instanceof Error ? error.message : String(error);
  return { data: null, health: "ERROR", detail, lastError };
}
