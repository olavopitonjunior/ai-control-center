import type { AutomationStatus, ScheduledTask } from "@acc/protocol";

/**
 * Pure normalizer for the GitHub Actions REST API. The agent fetches (with a token) and
 * feeds the JSON here; this module never does I/O and never sees credentials.
 *
 * Shapes (subset) from:
 *   GET /repos/{owner}/{repo}/actions/workflows   -> { workflows: GithubWorkflow[] }
 *   GET /repos/{owner}/{repo}/actions/runs         -> { workflow_runs: GithubRun[] }
 */
export interface GithubWorkflow {
  id: number;
  name: string;
  path: string;
  state: string; // 'active' | 'disabled_manually' | 'disabled_inactivity' | ...
}

export interface GithubRun {
  id: number;
  workflow_id: number;
  status: string; // 'queued' | 'in_progress' | 'completed' | 'waiting'
  conclusion: string | null; // 'success' | 'failure' | 'cancelled' | 'skipped' | null
  event: string; // 'schedule' | 'push' | 'workflow_dispatch' | ...
  created_at: string;
  run_started_at?: string | null;
}

function statusFor(
  workflowState: string,
  run: GithubRun | undefined,
): AutomationStatus {
  if (workflowState !== "active") return "DISABLED";
  if (!run) return "SCHEDULED";
  if (
    run.status === "in_progress" ||
    run.status === "queued" ||
    run.status === "waiting"
  )
    return "RUNNING";
  if (run.status === "completed") {
    if (run.conclusion === "failure" || run.conclusion === "timed_out")
      return "ERROR";
    return "SCHEDULED"; // success / skipped / cancelled -> back to scheduled
  }
  return "UNKNOWN";
}

/**
 * Normalize workflows + their most-recent runs into ScheduledTasks (source
 * "github-actions"). Cron/next-run aren't in the workflows API (they live in the workflow
 * YAML), so `schedule`/`nextRunAt` stay null rather than guessed.
 */
export function normalizeGithubActions(
  repo: string, // "owner/name"
  workflows: GithubWorkflow[],
  runs: GithubRun[],
  machineId: string,
): ScheduledTask[] {
  // Latest run per workflow_id (runs come newest-first from the API, but sort to be safe).
  const latestByWorkflow = new Map<number, GithubRun>();
  for (const r of [...runs].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )) {
    if (!latestByWorkflow.has(r.workflow_id))
      latestByWorkflow.set(r.workflow_id, r);
  }

  return workflows.map((wf) => {
    const run = latestByWorkflow.get(wf.id);
    return {
      id: `github:${repo}:${wf.id}`,
      machineId,
      source: "github-actions",
      name: `${repo} · ${wf.name}`,
      description: wf.path,
      schedule: null,
      enabled: wf.state === "active",
      nextRunAt: null,
      lastRunAt: run ? (run.run_started_at ?? run.created_at) : null,
      lastResult: run ? (run.conclusion ?? run.status) : null,
      lastExitCode: null,
      status: statusFor(wf.state, run),
    };
  });
}
