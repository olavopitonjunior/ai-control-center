import type { CollectorResult } from "@acc/adapters";
import type { ScheduledTask } from "@acc/protocol";
import { collectTasks, defaultTasksOptions } from "./tasks";
import { collectMacAutomations, defaultMacAutomationOptions } from "./mac";

/**
 * Platform-dispatched automations collector: Windows Task Scheduler on win32, cron +
 * launchd on macOS, and NOT_CONFIGURED elsewhere (Linux systemd/cron is a later milestone).
 * This is the single "automations" collector surfaced in the snapshot.
 */
export async function collectAutomations(
  machineId: string,
  nowIso: string,
): Promise<CollectorResult<ScheduledTask[]>> {
  switch (process.platform) {
    case "win32":
      return collectTasks(defaultTasksOptions(machineId), nowIso);
    case "darwin":
      return collectMacAutomations(
        defaultMacAutomationOptions(machineId),
        nowIso,
      );
    default:
      return {
        data: null,
        health: "NOT_CONFIGURED",
        detail:
          "automations collector supports Windows and macOS (Linux is a later milestone)",
        lastError: null,
      };
  }
}
