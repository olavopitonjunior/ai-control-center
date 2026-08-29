import type { AutomationStatus, ScheduledTask } from "@acc/protocol";

/**
 * Pure normalizer for Supabase scheduled jobs, which run via the Postgres `pg_cron`
 * extension. The agent queries `cron.job` + `cron.job_run_details` (read-only) and feeds
 * the rows here. Unlike the REST providers, pg_cron DOES expose the cron schedule, so we
 * populate `schedule`.
 */
export interface PgCronJob {
  jobid: number;
  schedule: string; // e.g. "*/5 * * * *"
  command: string;
  active: boolean;
  jobname?: string | null;
}

export interface PgCronRun {
  jobid: number;
  status: string; // 'succeeded' | 'failed' | 'running' | 'starting'
  return_message?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

function statusFor(
  active: boolean,
  run: PgCronRun | undefined,
): AutomationStatus {
  if (!active) return "DISABLED";
  if (!run) return "SCHEDULED";
  if (run.status === "running" || run.status === "starting") return "RUNNING";
  if (run.status === "failed") return "ERROR";
  return "SCHEDULED";
}

export function normalizeSupabaseCron(
  jobs: PgCronJob[],
  runs: PgCronRun[],
  machineId: string,
): ScheduledTask[] {
  const latestByJob = new Map<number, PgCronRun>();
  for (const r of [...runs].sort(
    (a, b) => Date.parse(b.start_time ?? "") - Date.parse(a.start_time ?? ""),
  )) {
    if (!latestByJob.has(r.jobid)) latestByJob.set(r.jobid, r);
  }

  return jobs.map((job) => {
    const run = latestByJob.get(job.jobid);
    return {
      id: `supabase:${machineId}:${job.jobid}`,
      machineId,
      source: "supabase",
      name: job.jobname || job.command,
      description: job.command,
      schedule: job.schedule,
      enabled: job.active,
      nextRunAt: null,
      lastRunAt: run ? (run.end_time ?? run.start_time ?? null) : null,
      lastResult: run ? (run.return_message ?? run.status) : null,
      lastExitCode: null,
      status: statusFor(job.active, run),
    };
  });
}
