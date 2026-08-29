import { z } from "zod";
import { IsoTimestamp } from "./common";

/**
 * A point-in-time system telemetry sample, normalized from Glances. EVERY metric
 * is nullable because hardware varies (e.g. this Surface reports no discrete GPU
 * and no CPU-temperature sensor — those must render "Not available", never 0).
 */
export const SystemMetricSchema = z.object({
  timestamp: IsoTimestamp,

  cpuPercent: z.number().min(0).max(100).nullable(),
  cpuTemperature: z.number().nullable(),

  ramUsed: z.number().nonnegative().nullable(),
  ramTotal: z.number().nonnegative().nullable(),
  ramPercent: z.number().min(0).max(100).nullable(),

  gpuName: z.string().nullable(),
  gpuPercent: z.number().min(0).max(100).nullable(),

  vramUsed: z.number().nonnegative().nullable(),
  vramTotal: z.number().nonnegative().nullable(),
  vramPercent: z.number().min(0).max(100).nullable(),

  gpuTemperature: z.number().nullable(),
  gpuPowerWatts: z.number().nullable(),

  diskUsed: z.number().nonnegative().nullable(),
  diskTotal: z.number().nonnegative().nullable(),

  networkRx: z.number().nonnegative().nullable(),
  networkTx: z.number().nonnegative().nullable(),

  uptime: z.number().int().nonnegative().nullable(),

  /** Total process count (Glances `processcount`). Null when unavailable. */
  processCount: z.number().int().nonnegative().nullable().default(null),
});
export type SystemMetric = z.infer<typeof SystemMetricSchema>;

/**
 * A container reported by the local container engine via Glances (`containers` plugin).
 * Every field is nullable: Glances returns `{}` when no engine is present, and field
 * availability varies by engine/version — we never invent values.
 */
export const ContainerInfoSchema = z.object({
  id: z.string().nullable(),
  name: z.string(),
  status: z.string().nullable(),
  image: z.string().nullable(),
  cpuPercent: z.number().nullable(),
  memoryUsage: z.number().nullable(),
});
export type ContainerInfo = z.infer<typeof ContainerInfoSchema>;
