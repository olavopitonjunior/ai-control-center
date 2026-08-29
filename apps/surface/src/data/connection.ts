import type { MachineStatus } from "@acc/protocol";

export type Connection = "PAIRING" | "ONLINE" | "DEGRADED" | "OFFLINE";

/**
 * Pure connection-state decision, extracted from the polling loop so it can be tested.
 *
 * - success: ONLINE, or DEGRADED if the agent reported DEGRADED.
 * - failure: OFFLINE if we've never succeeded or the last success is older than the
 *   offline timeout; otherwise keep the previous state (a transient blip).
 */
export function deriveConnection(params: {
  success: boolean;
  snapshotStatus?: MachineStatus;
  everSucceeded: boolean;
  msSinceLastSuccess: number;
  offlineAfterMs: number;
  previous: Connection;
}): Connection {
  const { success, snapshotStatus, everSucceeded, msSinceLastSuccess, offlineAfterMs, previous } =
    params;
  if (success) return snapshotStatus === "DEGRADED" ? "DEGRADED" : "ONLINE";
  if (!everSucceeded || msSinceLastSuccess > offlineAfterMs) return "OFFLINE";
  return previous;
}
