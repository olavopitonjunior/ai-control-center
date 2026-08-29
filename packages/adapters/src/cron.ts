import type { ScheduledTask } from "@acc/protocol";

/**
 * Parse a user crontab (the output of `crontab -l`) into normalized ScheduledTasks.
 * Pure — no I/O — so it's fully unit-testable against real crontab text. The agent runs
 * `crontab -l` on macOS/Linux and feeds the text here.
 *
 * Handled: 5-field entries (`m h dom mon dow cmd`) and `@keyword cmd` shorthands.
 * Ignored: blank lines, `#` comments, and `NAME=value` environment assignments.
 * Next-run computation is intentionally omitted (would require a cron engine); nextRunAt
 * stays null rather than being guessed.
 */
export function parseCrontab(text: string, machineId: string): ScheduledTask[] {
  const tasks: ScheduledTask[] = [];
  const lines = text.split(/\r?\n/);
  let index = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)) continue; // env assignment

    let schedule: string;
    let command: string;
    if (line.startsWith("@")) {
      const sp = line.indexOf(" ");
      if (sp === -1) continue;
      schedule = line.slice(0, sp);
      command = line.slice(sp + 1).trim();
    } else {
      const parts = line.split(/\s+/);
      if (parts.length < 6) continue; // need 5 schedule fields + a command
      schedule = parts.slice(0, 5).join(" ");
      command = parts.slice(5).join(" ");
    }
    if (!command) continue;

    tasks.push({
      id: `cron:${machineId}:${index}`,
      machineId,
      source: "cron",
      name: command.length > 60 ? command.slice(0, 57) + "…" : command,
      description: null,
      schedule,
      enabled: true,
      nextRunAt: null,
      lastRunAt: null,
      lastResult: null,
      lastExitCode: null,
      status: "SCHEDULED",
    });
    index += 1;
  }
  return tasks;
}
