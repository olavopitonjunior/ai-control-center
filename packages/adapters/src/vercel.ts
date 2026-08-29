import type { ScheduledTask } from "@acc/protocol";

/**
 * Vercel Cron Jobs are declared in `vercel.json` and executed by Vercel on a schedule.
 * As of now Vercel's public API does NOT expose a clean "list cron jobs / executions"
 * endpoint (crons are project config, and invocations surface only as function logs). So
 * rather than fake data, this adapter normalizes cron definitions the caller has already
 * read from a project's `vercel.json` (`crons: [{ path, schedule }]`). Execution status is
 * not available from the API and is left null/UNKNOWN — honestly.
 */
export interface VercelCronDef {
  path: string;
  schedule: string; // cron expression
}

export function normalizeVercelCrons(
  projectName: string,
  crons: VercelCronDef[],
  machineId: string,
): ScheduledTask[] {
  return crons.map((c, i) => ({
    id: `vercel:${machineId}:${projectName}:${i}`,
    machineId,
    source: "vercel",
    name: `${projectName} · ${c.path}`,
    description: null,
    schedule: c.schedule,
    enabled: true,
    nextRunAt: null,
    lastRunAt: null, // not exposed by the Vercel API
    lastResult: null,
    lastExitCode: null,
    status: "SCHEDULED",
  }));
}
