import type { AutomationStatus, ScheduledTask } from "@acc/protocol";

/**
 * Parse the output of `launchctl list` into normalized ScheduledTasks. Pure — the agent
 * runs `launchctl list` on macOS and feeds the text here.
 *
 * Format (tab-separated, with a header row):
 *   PID   Status  Label
 *   1234  0       com.example.agent
 *   -     0       com.example.idle
 *   -     78      com.example.failed
 *
 * PID "-" means not currently running. A non-zero Status is the last exit code. By default
 * Apple's own `com.apple.*` agents are excluded to focus on user automations (mirrors the
 * `\Microsoft\` exclusion on Windows).
 */
export function parseLaunchctlList(
  text: string,
  machineId: string,
  opts: { excludeApple?: boolean } = {},
): ScheduledTask[] {
  const excludeApple = opts.excludeApple ?? true;
  const tasks: ScheduledTask[] = [];
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\t+|\s{2,}|\s+/);
    if (cols.length < 3) continue;
    const [pidStr, statusStr, ...labelParts] = cols;
    const label = labelParts.join(" ");
    if (pidStr === "PID" || statusStr === "Status") continue; // header
    if (excludeApple && label.startsWith("com.apple.")) continue;

    const running = pidStr !== "-" && pidStr !== "";
    const pid = running ? Number(pidStr) : null;
    const exitCode =
      statusStr === "-" || statusStr === "" ? null : Number(statusStr);

    let status: AutomationStatus = "SCHEDULED";
    if (running) status = "RUNNING";
    else if (exitCode !== null && exitCode !== 0) status = "ERROR";

    tasks.push({
      id: `launchd:${machineId}:${label}`,
      machineId,
      source: "launchd",
      name: label,
      description: null,
      schedule: null, // schedule lives in the plist; enriched separately if available
      enabled: true, // listed => loaded
      nextRunAt: null,
      lastRunAt: null,
      lastResult:
        exitCode === null ? null : exitCode === 0 ? "ok" : `exit ${exitCode}`,
      lastExitCode: Number.isFinite(pid as number) && running ? null : exitCode,
      status,
    });
  }
  return tasks;
}
