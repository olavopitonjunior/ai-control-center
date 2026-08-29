import type { CollectorResult } from "@acc/adapters";
import type { AutomationStatus, ScheduledTask } from "@acc/protocol";
import { execWithTimeout } from "./exec";

export interface TasksOptions {
  timeoutMs: number;
  machineId: string;
  /** Exclude the hundreds of built-in `\Microsoft\` tasks to focus on user automations. */
  excludeMicrosoft: boolean;
}

interface RawTask {
  name: string;
  path: string;
  state: string;
  description: string | null;
  nextRun: string | null;
  lastRun: string | null;
  lastResult: number | null;
}

// Emits one JSON object per line via ConvertTo-Json -Compress, avoiding the
// Windows PowerShell 5.1 single-element-array collapse. Dates are ISO-8601 UTC.
const PS_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
Get-ScheduledTask | ForEach-Object {
  $t=$_; $i=$t | Get-ScheduledTaskInfo
  $lr = if ($i.LastRunTime -and $i.LastRunTime.Year -gt 1900) { $i.LastRunTime.ToUniversalTime().ToString('o') } else { $null }
  $nr = if ($i.NextRunTime -and $i.NextRunTime.Year -gt 1900) { $i.NextRunTime.ToUniversalTime().ToString('o') } else { $null }
  [pscustomobject]@{ name=$t.TaskName; path=$t.TaskPath; state=[string]$t.State; description=$t.Description; nextRun=$nr; lastRun=$lr; lastResult=$i.LastTaskResult } | ConvertTo-Json -Compress
}
`;

// Task Scheduler SCHED_S_TASK_* codes (0x00041300–0x0004131F, i.e. 267008–267039) are
// informational "success" statuses, NOT failures. Only other non-zero codes are errors.
function isSchedSuccess(code: number): boolean {
  return code === 0 || (code >= 267008 && code <= 267039);
}

export function mapStatus(
  state: string,
  enabled: boolean,
  lastResult: number | null,
): AutomationStatus {
  const s = state.toLowerCase();
  if (s === "running" || lastResult === 267009) return "RUNNING";
  if (s === "disabled" || !enabled) return "DISABLED";
  if (lastResult !== null && !isSchedSuccess(lastResult)) return "ERROR";
  if (s === "ready") return "SCHEDULED";
  return "UNKNOWN";
}

/** Interpret a Task Scheduler LastTaskResult HRESULT into a short human string. */
export function resultText(code: number | null): string | null {
  if (code === null) return null;
  if (code === 0) return "success";
  if (code === 267009) return "running";
  if (code === 267011) return "not yet run";
  if (code === 267014) return "terminated";
  if (isSchedSuccess(code)) return "ok";
  return `0x${(code >>> 0).toString(16).toUpperCase()}`;
}

/**
 * Windows Task Scheduler collector. On non-Windows it reports NOT_CONFIGURED (cron/launchd
 * land in Milestone 3). Uses official PowerShell cmdlets (Get-ScheduledTask /
 * Get-ScheduledTaskInfo) rather than scraping UI.
 */
export async function collectTasks(
  opts: TasksOptions,
  _nowIso: string,
): Promise<CollectorResult<ScheduledTask[]>> {
  if (process.platform !== "win32") {
    return {
      data: null,
      health: "NOT_CONFIGURED",
      detail: "cron/launchd collectors arrive in Milestone 3",
      lastError: null,
    };
  }

  try {
    // Pass the script as a base64 UTF-16LE -EncodedCommand so no shell/cmd quoting can
    // mangle the multi-line PowerShell. Invoke powershell.exe directly (shell:false).
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    const { stdout, code } = await execWithTimeout(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      opts.timeoutMs,
      { shell: false },
    );
    if (code !== 0 && !stdout.trim())
      throw new Error(`Get-ScheduledTask exited ${code}`);

    const raw: RawTask[] = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l) as RawTask);

    const filtered = opts.excludeMicrosoft
      ? raw.filter((t) => !t.path.startsWith("\\Microsoft\\"))
      : raw;

    const tasks: ScheduledTask[] = filtered.map((t) => {
      const enabled = t.state.toLowerCase() !== "disabled";
      return {
        id: `wts:${t.path}${t.name}`,
        machineId: opts.machineId,
        source: "windows-task-scheduler",
        name: t.name,
        description: t.description || null,
        schedule: null, // trigger parsing deferred; nextRun conveys timing for M1
        enabled,
        nextRunAt: t.nextRun,
        lastRunAt: t.lastRun,
        lastResult: resultText(t.lastResult),
        lastExitCode: t.lastResult,
        status: mapStatus(t.state, enabled, t.lastResult),
      };
    });

    return {
      data: tasks,
      health: "HEALTHY",
      detail: `${tasks.length} task(s)${opts.excludeMicrosoft ? " (excluding \\Microsoft\\)" : ""}`,
      lastError: null,
    };
  } catch (error) {
    return {
      data: null,
      health: "ERROR",
      detail: "Task Scheduler query failed",
      lastError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function defaultTasksOptions(machineId: string): TasksOptions {
  return {
    timeoutMs: 20_000,
    machineId,
    excludeMicrosoft: process.env.ACC_TASKS_INCLUDE_MICROSOFT !== "1",
  };
}
