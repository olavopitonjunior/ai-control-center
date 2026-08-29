import type { SystemMetric } from "@acc/protocol";

/** A machine the user has registered on the Surface. */
export interface MachineRecord {
  id: string;
  displayName: string;
  /** host or host:port, e.g. "192.168.0.228:47600". */
  address: string;
  /** Pairing token (bearer). Null for a local, loopback, token-less agent. */
  token: string | null;
}

export interface MachineInput {
  displayName: string;
  address: string;
  token: string | null;
}

/** A stored system-metric sample (for basic history). */
export interface StoredMetric extends SystemMetric {
  machineId: string;
}

/**
 * Persistence abstraction. Backed by SQLite inside Tauri; by an in-memory store in the
 * browser dev shell so the UI is fully usable without a Rust build.
 */
export interface Store {
  init(): Promise<void>;
  listMachines(): Promise<MachineRecord[]>;
  addMachine(input: MachineInput): Promise<MachineRecord>;
  removeMachine(id: string): Promise<void>;
  recordSystemMetric(machineId: string, metric: SystemMetric): Promise<void>;
  recentSystemMetrics(machineId: string, limit: number): Promise<SystemMetric[]>;
  /**
   * Apply the retention/downsampling policy: roll raw samples older than 24h into
   * 1-minute rollups, then prune. Returns counts for logging. Safe to call repeatedly.
   */
  runRetention(nowMs: number): Promise<{ rolledUp: number; prunedRaw: number }>;
}
