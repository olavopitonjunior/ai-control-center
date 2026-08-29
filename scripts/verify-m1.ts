// End-to-end M1 check: exercise the SURFACE's data path (agent client + shared-schema
// validation + connection derivation) against a live agent. Run with the agent up:
//   pnpm exec tsx scripts/verify-m1.ts
import {
  fetchHealth,
  fetchSnapshot,
} from "../apps/surface/src/data/protocolClient";
import { deriveConnection } from "../apps/surface/src/data/connection";
import type { MachineRecord } from "../apps/surface/src/data/types";

const machine: MachineRecord = {
  id: "local",
  displayName: "This PC (local agent)",
  address: process.env.ACC_VERIFY_ADDR ?? "127.0.0.1:47600",
  token: process.env.ACC_VERIFY_TOKEN ?? null,
};

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

const health = await fetchHealth(machine);
assert(health.ok === true, "health.ok");
console.log(
  `health: ${health.hostname} (${health.os}) agent=${health.agentVersion}`,
);

const snap = await fetchSnapshot(machine);
assert(snap.protocolVersion.length > 0, "protocolVersion present");
const conn = deriveConnection({
  success: true,
  snapshotStatus: snap.machine.status,
  everSucceeded: true,
  msSinceLastSuccess: 0,
  offlineAfterMs: 15000,
  previous: "PAIRING",
});
console.log(`connection derived: ${conn}`);
console.log(
  `collectors: ${snap.collectors.map((c) => `${c.name}=${c.health}`).join("  ")}`,
);
console.log(
  `providers: ${snap.providers.map((p) => `${p.provider} cost=${p.cost?.amount ?? "—"} limits=${p.limits.map((l) => l.label).join(",")}`).join(" | ") || "none"}`,
);
console.log(
  `system: ${snap.system ? `cpu=${snap.system.cpuPercent}% ram=${snap.system.ramPercent}% gpu=${snap.system.gpuName ?? "Not available"}` : "Not available"}`,
);
console.log(
  `sessions=${snap.sessions.length} automations=${snap.automations.length}`,
);

// Validate the OFFLINE transition logic too.
const offline = deriveConnection({
  success: false,
  everSucceeded: true,
  msSinceLastSuccess: 999999,
  offlineAfterMs: 15000,
  previous: "ONLINE",
});
assert(offline === "OFFLINE", "derives OFFLINE past timeout");
console.log("offline transition: OK");
console.log("\n✅ M1 end-to-end (Surface client ⇄ live agent) verified.");
