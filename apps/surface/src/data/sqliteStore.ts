import Database from "@tauri-apps/plugin-sql";
import type { SystemMetric } from "@acc/protocol";
import { downsample, retentionPlan, type SystemSample } from "@acc/analytics";
import type { MachineInput, MachineRecord, Store } from "./types";

/**
 * SQLite-backed store (inside Tauri). Migrations are registered in Rust
 * (src-tauri/src/lib.rs) and run automatically on load. All timestamps are UTC.
 */
export class SqliteStore implements Store {
  private db: Database | null = null;

  async init(): Promise<void> {
    this.db = await Database.load("sqlite:ai-control-center.db");
  }

  private get conn(): Database {
    if (!this.db) throw new Error("SqliteStore not initialized");
    return this.db;
  }

  async listMachines(): Promise<MachineRecord[]> {
    const rows = await this.conn.select<
      { id: string; display_name: string; address: string | null; token: string | null }[]
    >("SELECT id, display_name, address, token FROM machines ORDER BY display_name");
    return rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      address: r.address ?? "",
      token: r.token,
    }));
  }

  async addMachine(input: MachineInput): Promise<MachineRecord> {
    const id = crypto.randomUUID();
    await this.conn.execute(
      "INSERT INTO machines (id, display_name, address, token, status) VALUES ($1, $2, $3, $4, 'PAIRING')",
      [id, input.displayName, input.address, input.token],
    );
    return { id, ...input };
  }

  async removeMachine(id: string): Promise<void> {
    await this.conn.execute("DELETE FROM machines WHERE id = $1", [id]);
    await this.conn.execute("DELETE FROM system_metrics WHERE machine_id = $1", [id]);
  }

  async recordSystemMetric(machineId: string, m: SystemMetric): Promise<void> {
    await this.conn.execute(
      `INSERT INTO system_metrics
        (machine_id, timestamp, cpu_percent, cpu_temperature, ram_used, ram_total, ram_percent,
         gpu_name, gpu_percent, vram_used, vram_total, gpu_temperature, disk_used, disk_total,
         network_rx, network_tx, uptime, process_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        machineId, m.timestamp, m.cpuPercent, m.cpuTemperature, m.ramUsed, m.ramTotal,
        m.ramPercent, m.gpuName, m.gpuPercent, m.vramUsed, m.vramTotal, m.gpuTemperature,
        m.diskUsed, m.diskTotal, m.networkRx, m.networkTx, m.uptime, m.processCount,
      ],
    );
  }

  async recentSystemMetrics(machineId: string, limit: number): Promise<SystemMetric[]> {
    const rows = await this.conn.select<Record<string, number | string | null>[]>(
      `SELECT * FROM system_metrics WHERE machine_id = $1 ORDER BY timestamp DESC LIMIT $2`,
      [machineId, limit],
    );
    return rows
      .map((r) => ({
        timestamp: r.timestamp as string,
        cpuPercent: r.cpu_percent as number | null,
        cpuTemperature: r.cpu_temperature as number | null,
        ramUsed: r.ram_used as number | null,
        ramTotal: r.ram_total as number | null,
        ramPercent: r.ram_percent as number | null,
        gpuName: r.gpu_name as string | null,
        gpuPercent: r.gpu_percent as number | null,
        vramUsed: r.vram_used as number | null,
        vramTotal: r.vram_total as number | null,
        vramPercent: null,
        gpuTemperature: r.gpu_temperature as number | null,
        gpuPowerWatts: null,
        diskUsed: r.disk_used as number | null,
        diskTotal: r.disk_total as number | null,
        networkRx: r.network_rx as number | null,
        networkTx: r.network_tx as number | null,
        uptime: r.uptime as number | null,
        processCount: (r.process_count ?? null) as number | null,
      }))
      .reverse(); // return chronological order
  }

  async runRetention(nowMs: number): Promise<{ rolledUp: number; prunedRaw: number }> {
    const plan = retentionPlan(nowMs);
    const rawCutoff = new Date(plan.rawCutoffMs).toISOString();

    const raw = await this.conn.select<
      {
        machine_id: string;
        timestamp: string;
        cpu_percent: number | null;
        ram_percent: number | null;
        gpu_percent: number | null;
      }[]
    >(
      "SELECT machine_id, timestamp, cpu_percent, ram_percent, gpu_percent FROM system_metrics WHERE timestamp < $1",
      [rawCutoff],
    );

    let rolledUp = 0;
    if (raw.length > 0) {
      // Group raw samples per machine and roll up to 1-minute averages.
      const byMachine = new Map<string, SystemSample[]>();
      for (const r of raw) {
        const arr = byMachine.get(r.machine_id) ?? [];
        arr.push({ t: Date.parse(r.timestamp), cpu: r.cpu_percent, ram: r.ram_percent, gpu: r.gpu_percent });
        byMachine.set(r.machine_id, arr);
      }
      for (const [machineId, samples] of byMachine) {
        for (const b of downsample(samples, 60_000)) {
          await this.conn.execute(
            "INSERT OR IGNORE INTO system_metric_rollups (machine_id, bucket, timestamp, cpu_percent, ram_percent, gpu_percent) VALUES ($1,'1m',$2,$3,$4,$5)",
            [machineId, new Date(b.t).toISOString(), b.cpu, b.ram, b.gpu],
          );
          rolledUp += 1;
        }
      }
      await this.conn.execute("DELETE FROM system_metrics WHERE timestamp < $1", [rawCutoff]);
    }

    // Prune old rollups per the policy.
    await this.conn.execute("DELETE FROM system_metric_rollups WHERE bucket = '1m' AND timestamp < $1", [
      new Date(plan.oneMinuteCutoffMs).toISOString(),
    ]);
    await this.conn.execute("DELETE FROM system_metric_rollups WHERE bucket = '5m' AND timestamp < $1", [
      new Date(plan.fiveMinuteCutoffMs).toISOString(),
    ]);

    return { rolledUp, prunedRaw: raw.length };
  }
}
