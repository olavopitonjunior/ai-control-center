import type { Snapshot, SystemMetric } from "@acc/protocol";
import type { BackupBundle, MachineInput, MachineRecord, Store } from "./types";

/**
 * In-memory store for the browser dev shell (no Tauri/SQLite). Machines are seeded from
 * localStorage so registrations survive a page reload during development. System-metric
 * history is kept in memory only (bounded).
 */
export class MemoryStore implements Store {
  private machines: MachineRecord[] = [];
  private metrics = new Map<string, SystemMetric[]>();
  private readonly LS_KEY = "acc.machines";
  private readonly MAX = 500;

  async init(): Promise<void> {
    try {
      const raw = localStorage.getItem(this.LS_KEY);
      if (raw) this.machines = JSON.parse(raw) as MachineRecord[];
    } catch {
      this.machines = [];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(this.LS_KEY, JSON.stringify(this.machines));
    } catch {
      /* ignore quota/availability errors in dev */
    }
  }

  async listMachines(): Promise<MachineRecord[]> {
    return [...this.machines];
  }

  async addMachine(input: MachineInput): Promise<MachineRecord> {
    const record: MachineRecord = { id: crypto.randomUUID(), ...input };
    this.machines.push(record);
    this.persist();
    return record;
  }

  async updateMachine(id: string, input: MachineInput): Promise<void> {
    this.machines = this.machines.map((m) =>
      m.id === id ? { ...m, ...input } : m,
    );
    this.persist();
  }

  async removeMachine(id: string): Promise<void> {
    this.machines = this.machines.filter((m) => m.id !== id);
    this.metrics.delete(id);
    this.persist();
  }

  async recordSystemMetric(
    machineId: string,
    metric: SystemMetric,
  ): Promise<void> {
    const arr = this.metrics.get(machineId) ?? [];
    arr.push(metric);
    if (arr.length > this.MAX) arr.splice(0, arr.length - this.MAX);
    this.metrics.set(machineId, arr);
  }

  async recentSystemMetrics(
    machineId: string,
    limit: number,
  ): Promise<SystemMetric[]> {
    const arr = this.metrics.get(machineId) ?? [];
    return arr.slice(-limit);
  }

  /**
   * The browser dev shell keeps only the system-metric series in memory; the durable
   * relational history is a Tauri/SQLite concern, so this records the metric and drops
   * the rest rather than pretending to persist it.
   */
  async ingestSnapshot(machineId: string, snapshot: Snapshot): Promise<void> {
    if (snapshot.system)
      await this.recordSystemMetric(machineId, snapshot.system);
  }

  async exportBackup(): Promise<BackupBundle> {
    return {
      format: "ai-control-center-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      tables: {
        // Tokens are deliberately omitted — a backup must never carry credentials.
        machines: this.machines.map((m) => ({
          id: m.id,
          display_name: m.displayName,
          address: m.address,
        })),
        system_metrics: [...this.metrics.entries()].flatMap(
          ([machineId, arr]) =>
            arr.map((m) => ({ machine_id: machineId, ...m })),
        ),
      },
    };
  }

  async runRetention(
    nowMs: number,
  ): Promise<{ rolledUp: number; prunedRaw: number }> {
    // In-memory: just drop samples older than 24h (no persistent rollups needed).
    const cutoff = nowMs - 24 * 3600_000;
    let pruned = 0;
    for (const [id, arr] of this.metrics) {
      const kept = arr.filter((m) => Date.parse(m.timestamp) >= cutoff);
      pruned += arr.length - kept.length;
      this.metrics.set(id, kept);
    }
    return { rolledUp: 0, prunedRaw: pruned };
  }
}
