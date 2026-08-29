import { z } from "zod";
import { IsoTimestamp } from "./common";

/** Where a scheduled task/automation comes from. */
export const AutomationSource = z.enum([
  "windows-task-scheduler",
  "cron",
  "launchd",
  "systemd",
  "docker",
  "n8n",
  "github-actions",
  "vercel",
  "supabase",
]);
export type AutomationSource = z.infer<typeof AutomationSource>;

export const AutomationStatus = z.enum([
  "SCHEDULED",
  "RUNNING",
  "DISABLED",
  "ERROR",
  "UNKNOWN",
]);
export type AutomationStatus = z.infer<typeof AutomationStatus>;

/** A scheduled task / cron job / launchd agent, normalized across platforms. */
export const ScheduledTaskSchema = z.object({
  id: z.string().min(1),
  machineId: z.string().min(1),
  source: AutomationSource,
  name: z.string().min(1),
  description: z.string().nullable(),
  schedule: z.string().nullable(),
  enabled: z.boolean().nullable(),
  nextRunAt: IsoTimestamp.nullable(),
  lastRunAt: IsoTimestamp.nullable(),
  lastResult: z.string().nullable(),
  lastExitCode: z.number().int().nullable(),
  status: AutomationStatus,
});
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>;

/** A single historical execution of an automation. */
export const AutomationRunSchema = z.object({
  taskId: z.string().min(1),
  machineId: z.string().min(1),
  startedAt: IsoTimestamp.nullable(),
  finishedAt: IsoTimestamp.nullable(),
  result: z.string().nullable(),
  exitCode: z.number().int().nullable(),
});
export type AutomationRun = z.infer<typeof AutomationRunSchema>;
