import { z } from "zod";
import { CollectorHealth, IsoTimestamp } from "./common";
import { MachineSchema } from "./machine";
import { ProviderUsageSchema } from "./usage";
import { AISessionSchema } from "./session";
import { SystemMetricSchema } from "./system";
import { ScheduledTaskSchema } from "./automation";

/** Health/report for one collector, surfaced so the UI can show per-source status. */
export const CollectorStatusSchema = z.object({
  name: z.string().min(1),
  health: CollectorHealth,
  detail: z.string().nullable(),
  lastSuccessAt: IsoTimestamp.nullable(),
  lastError: z.string().nullable(),
});
export type CollectorStatus = z.infer<typeof CollectorStatusSchema>;

/** Response of `GET /health` — cheap liveness + identity, no collectors run. */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  agentVersion: z.string(),
  protocolVersion: z.string(),
  machineId: z.string(),
  hostname: z.string(),
  os: z.string(),
  startedAt: IsoTimestamp,
  now: IsoTimestamp,
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * The full normalized snapshot the agent returns from `GET /v1/snapshot`. Each
 * collector section carries its own data AND its health, so one failing
 * collector degrades only its own section — the rest of the dashboard stays live.
 */
export const SnapshotSchema = z.object({
  protocolVersion: z.string(),
  generatedAt: IsoTimestamp,
  machine: MachineSchema,
  providers: z.array(ProviderUsageSchema).default([]),
  sessions: z.array(AISessionSchema).default([]),
  system: SystemMetricSchema.nullable(),
  automations: z.array(ScheduledTaskSchema).default([]),
  collectors: z.array(CollectorStatusSchema).default([]),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
