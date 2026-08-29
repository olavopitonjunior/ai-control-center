import { describe, expect, it } from "vitest";
import { parseCrontab, parseLaunchctlList } from "./index";

describe("parseCrontab", () => {
  const CRONTAB = `# m h dom mon dow command
SHELL=/bin/sh
PATH=/usr/bin:/bin

*/5 * * * * /Users/olavo/scripts/sync.sh
0 9 * * 1-5 /usr/bin/python3 /Users/olavo/report.py --daily
@daily /Users/olavo/backup.sh
@reboot /Users/olavo/startup.sh

# a comment line
malformed line without enough fields`;

  const tasks = parseCrontab(CRONTAB, "mac");

  it("parses 5-field and @keyword entries, skipping comments/env/blank/malformed", () => {
    expect(tasks).toHaveLength(4);
    expect(tasks[0]!.schedule).toBe("*/5 * * * *");
    expect(tasks[0]!.name).toContain("sync.sh");
    expect(tasks[0]!.source).toBe("cron");
    expect(tasks[0]!.status).toBe("SCHEDULED");
  });

  it("captures @keyword schedules and their command", () => {
    const daily = tasks.find((t) => t.schedule === "@daily")!;
    expect(daily.name).toContain("backup.sh");
    const reboot = tasks.find((t) => t.schedule === "@reboot")!;
    expect(reboot.name).toContain("startup.sh");
  });

  it("does not fabricate next-run times", () => {
    for (const t of tasks) expect(t.nextRunAt).toBeNull();
  });

  it("handles an empty crontab", () => {
    expect(parseCrontab("", "mac")).toEqual([]);
    expect(parseCrontab("no crontab for olavo", "mac")).toEqual([]);
  });
});

describe("parseLaunchctlList", () => {
  const OUT = `PID\tStatus\tLabel
1234\t0\tcom.example.runner
-\t0\tcom.example.idle
-\t78\tcom.example.failed
555\t0\tcom.apple.systemagent`;

  it("parses running / idle / failed user agents and excludes com.apple.*", () => {
    const tasks = parseLaunchctlList(OUT, "mac");
    expect(tasks.map((t) => t.name).sort()).toEqual([
      "com.example.failed",
      "com.example.idle",
      "com.example.runner",
    ]);
    expect(tasks.find((t) => t.name === "com.example.runner")!.status).toBe(
      "RUNNING",
    );
    expect(tasks.find((t) => t.name === "com.example.idle")!.status).toBe(
      "SCHEDULED",
    );
    const failed = tasks.find((t) => t.name === "com.example.failed")!;
    expect(failed.status).toBe("ERROR");
    expect(failed.lastResult).toBe("exit 78");
    expect(failed.lastExitCode).toBe(78);
  });

  it("can include Apple agents when asked", () => {
    const all = parseLaunchctlList(OUT, "mac", { excludeApple: false });
    expect(all.some((t) => t.name === "com.apple.systemagent")).toBe(true);
  });

  // Labels captured verbatim from `launchctl list` on a real MacBook (2026-08-29).
  // Every open GUI app registers an `application.*` entry; these are running apps, not
  // automations, and `application.com.apple.*` also evades the com.apple. prefix filter.
  const REAL_MAC = `28015\t0\tcom.aicontrolcenter.agent
-\t0\tapplication.com.microsoft.VSCode.707372.708019
-\t0\tapplication.com.apple.Terminal.1152921500311914150.1152921500311914155
501\t0\thomebrew.mxcl.postgresql
-\t0\tcom.apple.SafariHistoryServiceAgent
0x7f8a.anonymous.launchd\t0\t0x7f8a.anonymous.launchd`;

  it("excludes running GUI apps and anonymous entries, keeps real agents", () => {
    const tasks = parseLaunchctlList(REAL_MAC, "mac");
    const names = tasks.map((t) => t.name).sort();
    expect(names).toEqual([
      "com.aicontrolcenter.agent",
      "homebrew.mxcl.postgresql",
    ]);
    // Specifically: no VS Code / Terminal noise on the Automations screen.
    expect(names.some((n) => n.startsWith("application."))).toBe(false);
  });

  it("still filters application.com.apple.* even though it lacks the com.apple. prefix", () => {
    const tasks = parseLaunchctlList(REAL_MAC, "mac", { excludeApple: false });
    expect(tasks.some((t) => t.name.includes("Terminal"))).toBe(false);
  });
});
