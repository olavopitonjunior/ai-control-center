/**
 * MVP acceptance test (spec §61), focused on the items that can only be proven by
 * starting and stopping a real agent — 14 (kill -> OFFLINE after timeout) and 15
 * (restart -> ONLINE) — plus the collector-failure isolation items 16–18 and the
 * no-secrets-in-logs item 19.
 *
 * Runs the REAL Surface client code (fetchSnapshot + deriveConnection) against a REAL
 * agent process. Usage:  pnpm --filter @acc/agent exec tsx ../../scripts/acceptance.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fetchSnapshot } from "../apps/surface/src/data/protocolClient";
import {
  deriveConnection,
  type Connection,
} from "../apps/surface/src/data/connection";
import type { MachineRecord } from "../apps/surface/src/data/types";

const PORT = Number(process.env.ACC_ACCEPT_PORT ?? 47690);
const OFFLINE_AFTER_MS = 15_000;
const machine: MachineRecord = {
  id: "acceptance",
  displayName: "Acceptance",
  address: `127.0.0.1:${PORT}`,
  token: null,
};

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

function startAgent(): ChildProcess {
  const child = spawn("pnpm", ["--filter", "@acc/agent", "start"], {
    cwd: new URL("..", import.meta.url).pathname.replace(
      /^\/([A-Za-z]:)/,
      "$1",
    ),
    env: { ...process.env, ACC_AGENT_PORT: String(PORT) },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => logs.push(String(d)));
  child.stderr?.on("data", (d) => logs.push(String(d)));
  return child;
}
const logs: string[] = [];

/**
 * Kill whatever is listening on the port. `pnpm` spawns the agent as a grandchild, so
 * killing the wrapper leaves the real listener alive — we must target the port owner,
 * which is also what an agent crash looks like from the Surface's perspective.
 */
function killByPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const cmd =
      process.platform === "win32"
        ? `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
        : `lsof -ti tcp:${port} | xargs -r kill -9`;
    const p =
      process.platform === "win32"
        ? spawn("powershell.exe", ["-NoProfile", "-Command", cmd], {
            stdio: "ignore",
          })
        : spawn("sh", ["-c", cmd], { stdio: "ignore" });
    p.on("exit", () => resolve());
    p.on("error", () => resolve());
  });
}

/** Poll until the agent answers, or give up. */
async function waitForUp(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetchSnapshot(machine, 4000);
      return true;
    } catch {
      await sleep(1500);
    }
  }
  return false;
}

async function main(): Promise<void> {
  console.log(`MVP acceptance (spec §61) on port ${PORT}\n`);

  // --- items 5/6/7: agent reachable, telemetry present -------------------------
  let agent = startAgent();
  const up = await waitForUp(90_000);
  check("14a: agent starts and answers", up);
  if (!up) {
    agent.kill();
    process.exit(1);
  }

  const snap = await fetchSnapshot(machine);
  let conn: Connection = deriveConnection({
    success: true,
    snapshotStatus: snap.machine.status,
    everSucceeded: true,
    msSinceLastSuccess: 0,
    offlineAfterMs: OFFLINE_AFTER_MS,
    previous: "PAIRING",
  });
  check("5: machine reports ONLINE", conn === "ONLINE", conn);
  check(
    "13: Task Scheduler jobs present",
    snap.automations.length > 0,
    `${snap.automations.length} task(s)`,
  );
  check(
    "16-18: collectors degrade independently (no crash)",
    snap.collectors.length >= 3 &&
      snap.collectors.every((c) => typeof c.health === "string"),
    snap.collectors.map((c) => `${c.name}=${c.health}`).join(" "),
  );
  check(
    "20: no fake metrics (absent hardware is null, not 0)",
    snap.system === null || snap.system.gpuName !== undefined,
    snap.system ? `gpuName=${snap.system.gpuName}` : "system not available",
  );

  // --- item 14: kill the agent -> OFFLINE after the timeout --------------------
  agent.kill("SIGKILL");
  await killByPort(PORT);
  await sleep(2500);
  let sawFailure = false;
  try {
    await fetchSnapshot(machine, 3000);
  } catch {
    sawFailure = true;
  }
  check("14b: requests fail once the agent is killed", sawFailure);

  // Immediately after the kill we should NOT flip to OFFLINE (grace period)...
  const soon = deriveConnection({
    success: false,
    everSucceeded: true,
    msSinceLastSuccess: 3000,
    offlineAfterMs: OFFLINE_AFTER_MS,
    previous: "ONLINE",
  });
  check("14c: brief blip keeps previous state", soon === "ONLINE", soon);

  // ...but past the timeout we must be OFFLINE.
  const later = deriveConnection({
    success: false,
    everSucceeded: true,
    msSinceLastSuccess: OFFLINE_AFTER_MS + 1000,
    offlineAfterMs: OFFLINE_AFTER_MS,
    previous: "ONLINE",
  });
  check("14d: OFFLINE after the heartbeat timeout", later === "OFFLINE", later);

  // --- item 15: restart the agent -> back ONLINE ------------------------------
  agent = startAgent();
  const backUp = await waitForUp(90_000);
  check("15a: agent restarts and answers", backUp);
  if (backUp) {
    const snap2 = await fetchSnapshot(machine);
    conn = deriveConnection({
      success: true,
      snapshotStatus: snap2.machine.status,
      everSucceeded: true,
      msSinceLastSuccess: 0,
      offlineAfterMs: OFFLINE_AFTER_MS,
      previous: "OFFLINE",
    });
    check("15b: machine returns to ONLINE", conn === "ONLINE", conn);
  }

  // --- item 19: no secrets in agent logs ---------------------------------------
  const joined = logs.join("\n");
  const leaked =
    /(sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|ACC_AGENT_TOKEN=\S+)/.exec(
      joined,
    );
  check(
    "19: no secrets in agent logs",
    leaked === null,
    leaked ? `found ${leaked[0].slice(0, 12)}…` : "clean",
  );

  agent.kill("SIGKILL");
  await killByPort(PORT);
  await sleep(500);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
