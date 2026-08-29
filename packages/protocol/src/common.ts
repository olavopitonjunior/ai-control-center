import { z } from "zod";

/**
 * Source quality as presented to the USER. These three values are the only
 * quality labels the Surface UI shows next to a metric. Internally, provenance
 * can be richer (see {@link SourceProvenance}), but everything collapses to one
 * of these three for display.
 *
 * - OFFICIAL   — the number came straight from the provider/OS as an authoritative value.
 * - CALCULATED — derived deterministically from authoritative local data (e.g. ccusage
 *                summing token events into a 5-hour block). Correct math, local source.
 * - ESTIMATED  — the capacity or value itself was inferred/guessed (e.g. an unknown quota
 *                ceiling). Never present this as an official provider value.
 */
export const SourceQuality = z.enum(["OFFICIAL", "CALCULATED", "ESTIMATED"]);
export type SourceQuality = z.infer<typeof SourceQuality>;

/**
 * Richer internal provenance. Maps down to {@link SourceQuality} for the UI.
 * OFFICIAL_LOCAL = authoritative reading from the local OS/hardware (e.g. Glances RAM).
 */
export const SourceProvenance = z.enum([
  "OFFICIAL",
  "OFFICIAL_LOCAL",
  "CALCULATED",
  "ESTIMATED",
]);
export type SourceProvenance = z.infer<typeof SourceProvenance>;

export function toSourceQuality(p: SourceProvenance): SourceQuality {
  switch (p) {
    case "OFFICIAL":
    case "OFFICIAL_LOCAL":
      return "OFFICIAL";
    case "CALCULATED":
      return "CALCULATED";
    case "ESTIMATED":
      return "ESTIMATED";
  }
}

/** The name of the tool/source that produced a datum (for the provenance line in the UI). */
export const SourceName = z.enum([
  "ccusage",
  "codexbar",
  "glances",
  "windows-task-scheduler",
  "cron",
  "launchd",
  "process",
  "agent",
  "analytics",
]);
export type SourceName = z.infer<typeof SourceName>;

export const OperatingSystem = z.enum(["windows", "macos", "linux"]);
export type OperatingSystem = z.infer<typeof OperatingSystem>;

/** How the Surface reaches an agent. Data semantics are identical across all of these. */
export const ConnectionType = z.enum(["wifi", "ethernet", "usb4", "unknown"]);
export type ConnectionType = z.infer<typeof ConnectionType>;

/**
 * Top-level machine state.
 * - ONLINE   — reachable, all important collectors healthy.
 * - DEGRADED — reachable but at least one important collector is failing.
 * - OFFLINE  — no heartbeat within the timeout.
 * - PAIRING  — registered but not yet authenticated/paired.
 */
export const MachineStatus = z.enum([
  "ONLINE",
  "DEGRADED",
  "OFFLINE",
  "PAIRING",
]);
export type MachineStatus = z.infer<typeof MachineStatus>;

/** Health of a single collector. Every collector fails independently. */
export const CollectorHealth = z.enum([
  "HEALTHY",
  "STALE",
  "ERROR",
  "NOT_INSTALLED",
  "NOT_CONFIGURED",
]);
export type CollectorHealth = z.infer<typeof CollectorHealth>;

/** An ISO-8601 UTC timestamp string. All timestamps on the wire are UTC. */
export const IsoTimestamp = z.string().datetime({ offset: true });
export type IsoTimestamp = z.infer<typeof IsoTimestamp>;
