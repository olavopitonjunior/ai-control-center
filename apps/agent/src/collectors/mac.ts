import {
  parseCrontab,
  parseLaunchctlList,
  type CollectorResult,
} from "@acc/adapters";
import type { ScheduledTask } from "@acc/protocol";
import { execWithTimeout } from "./exec";

export interface MacAutomationOptions {
  timeoutMs: number;
  machineId: string;
}

/** Read the user crontab. `crontab -l` exits non-zero with "no crontab" when empty. */
async function collectCron(
  opts: MacAutomationOptions,
): Promise<ScheduledTask[]> {
  const { stdout } = await execWithTimeout("crontab", ["-l"], opts.timeoutMs, {
    shell: false,
  }).catch(() => ({ stdout: "", stderr: "", code: 1 }));
  return parseCrontab(stdout, opts.machineId);
}

/** List loaded launchd services for this user. */
async function collectLaunchd(
  opts: MacAutomationOptions,
): Promise<ScheduledTask[]> {
  const { stdout } = await execWithTimeout(
    "launchctl",
    ["list"],
    opts.timeoutMs,
    { shell: false },
  );
  return parseLaunchctlList(stdout, opts.machineId);
}

/**
 * macOS automations: user crontab + launchd user agents, combined. Each source fails
 * independently; if both fail we report ERROR, otherwise HEALTHY with whatever we got.
 * No root required.
 */
export async function collectMacAutomations(
  opts: MacAutomationOptions,
  _nowIso: string,
): Promise<CollectorResult<ScheduledTask[]>> {
  const [cron, launchd] = await Promise.allSettled([
    collectCron(opts),
    collectLaunchd(opts),
  ]);

  const tasks: ScheduledTask[] = [];
  if (cron.status === "fulfilled") tasks.push(...cron.value);
  if (launchd.status === "fulfilled") tasks.push(...launchd.value);

  const cronOk = cron.status === "fulfilled";
  const launchdOk = launchd.status === "fulfilled";
  if (!cronOk && !launchdOk) {
    const err = [cron, launchd]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) =>
        r.reason instanceof Error ? r.reason.message : String(r.reason),
      )
      .join("; ");
    return {
      data: null,
      health: "ERROR",
      detail: "cron and launchd both failed",
      lastError: err,
    };
  }

  return {
    data: tasks,
    health: "HEALTHY",
    detail: `${tasks.length} automation(s) (cron${cronOk ? "" : " err"} + launchd${launchdOk ? "" : " err"})`,
    lastError: null,
  };
}

export function defaultMacAutomationOptions(
  machineId: string,
): MacAutomationOptions {
  return { timeoutMs: 15_000, machineId };
}
