import type { AutomationStatus, ScheduledTask } from "@acc/protocol";

/**
 * Pure normalizer for the n8n public REST API. The agent fetches with an
 * `X-N8N-API-KEY` header and feeds JSON here; no I/O or credentials in this module.
 *
 * Shapes (subset):
 *   GET {base}/api/v1/workflows   -> { data: N8nWorkflow[] }
 *   GET {base}/api/v1/executions  -> { data: N8nExecution[] }
 */
export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
}

export interface N8nExecution {
  id: string;
  workflowId: string;
  finished?: boolean;
  startedAt?: string | null;
  stoppedAt?: string | null;
  status?: string; // 'success' | 'error' | 'running' | 'waiting' | 'canceled' | 'crashed'
}

function statusFor(
  active: boolean,
  exec: N8nExecution | undefined,
): AutomationStatus {
  if (!active) return "DISABLED";
  if (!exec) return "SCHEDULED";
  const s = exec.status ?? (exec.finished ? "success" : "running");
  if (s === "running" || s === "waiting") return "RUNNING";
  if (s === "error" || s === "crashed") return "ERROR";
  return "SCHEDULED"; // success / canceled
}

/** Normalize n8n workflows + latest executions into ScheduledTasks (source "n8n"). */
export function normalizeN8n(
  workflows: N8nWorkflow[],
  executions: N8nExecution[],
  machineId: string,
): ScheduledTask[] {
  const latestByWorkflow = new Map<string, N8nExecution>();
  const sorted = [...executions].sort(
    (a, b) => Date.parse(b.startedAt ?? "") - Date.parse(a.startedAt ?? ""),
  );
  for (const e of sorted) {
    if (!latestByWorkflow.has(e.workflowId))
      latestByWorkflow.set(e.workflowId, e);
  }

  return workflows.map((wf) => {
    const exec = latestByWorkflow.get(wf.id);
    return {
      id: `n8n:${machineId}:${wf.id}`,
      machineId,
      source: "n8n",
      name: wf.name,
      description: null,
      schedule: null,
      enabled: wf.active,
      nextRunAt: null,
      lastRunAt: exec ? (exec.stoppedAt ?? exec.startedAt ?? null) : null,
      lastResult: exec
        ? (exec.status ?? (exec.finished ? "success" : "running"))
        : null,
      lastExitCode: null,
      status: statusFor(wf.active, exec),
    };
  });
}
