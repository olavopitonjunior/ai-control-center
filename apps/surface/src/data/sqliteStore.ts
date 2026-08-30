import Database from "@tauri-apps/plugin-sql";
import type { Snapshot, SystemMetric } from "@acc/protocol";
import {
  downsample,
  retentionPlan,
  sessionFingerprint,
  type SystemSample,
} from "@acc/analytics";
import type { BackupBundle, MachineInput, MachineRecord, Store } from "./types";

/** Cheap stable hash used to skip storing unchanged snapshots (spec §42). */
function hash(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
}

/**
 * SQLite-backed store (inside Tauri). Migrations are registered in Rust
 * (src-tauri/src/lib.rs) and run automatically on load. All timestamps are UTC.
 */
export class SqliteStore implements Store {
  private db: Database | null = null;
  /** Last-written payload hashes per machine, so unchanged rows aren't re-inserted. */
  private lastHashes = new Map<
    string,
    { providers: string; automations: string; collectors: string }
  >();

  async init(): Promise<void> {
    this.db = await Database.load("sqlite:ai-control-center.db");
  }

  private get conn(): Database {
    if (!this.db) throw new Error("SqliteStore not initialized");
    return this.db;
  }

  async listMachines(): Promise<MachineRecord[]> {
    const rows = await this.conn.select<
      {
        id: string;
        display_name: string;
        address: string | null;
        token: string | null;
      }[]
    >(
      "SELECT id, display_name, address, token FROM machines ORDER BY display_name",
    );
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

  async updateMachine(id: string, input: MachineInput): Promise<void> {
    await this.conn.execute(
      "UPDATE machines SET display_name = $1, address = $2, token = $3 WHERE id = $4",
      [input.displayName, input.address, input.token, id],
    );
    // Force the next ingest to re-write provider/automation rows for this machine.
    this.lastHashes.delete(id);
  }

  async removeMachine(id: string): Promise<void> {
    await this.conn.execute("DELETE FROM machines WHERE id = $1", [id]);
    await this.conn.execute(
      "DELETE FROM system_metrics WHERE machine_id = $1",
      [id],
    );
  }

  async recordSystemMetric(machineId: string, m: SystemMetric): Promise<void> {
    await this.conn.execute(
      `INSERT INTO system_metrics
        (machine_id, timestamp, cpu_percent, cpu_temperature, ram_used, ram_total, ram_percent,
         gpu_name, gpu_percent, vram_used, vram_total, gpu_temperature, disk_used, disk_total,
         network_rx, network_tx, uptime, process_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        machineId,
        m.timestamp,
        m.cpuPercent,
        m.cpuTemperature,
        m.ramUsed,
        m.ramTotal,
        m.ramPercent,
        m.gpuName,
        m.gpuPercent,
        m.vramUsed,
        m.vramTotal,
        m.gpuTemperature,
        m.diskUsed,
        m.diskTotal,
        m.networkRx,
        m.networkTx,
        m.uptime,
        m.processCount,
      ],
    );
  }

  async recentSystemMetrics(
    machineId: string,
    limit: number,
  ): Promise<SystemMetric[]> {
    const rows = await this.conn.select<
      Record<string, number | string | null>[]
    >(
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

  async ingestSnapshot(machineId: string, snap: Snapshot): Promise<void> {
    const at = snap.generatedAt;
    const db = this.conn;

    // Machine identity + heartbeat (always — this is what drives uptime history).
    await db.execute(
      `UPDATE machines SET hostname = $1, os = $2, os_version = $3, architecture = $4,
         agent_version = $5, connection_type = $6, last_seen = $7, status = $8 WHERE id = $9`,
      [
        snap.machine.hostname,
        snap.machine.os,
        snap.machine.osVersion,
        snap.machine.architecture,
        snap.machine.agentVersion,
        snap.machine.connectionType,
        at,
        snap.machine.status,
        machineId,
      ],
    );
    await db.execute(
      `INSERT INTO machine_heartbeats (machine_id, observed_at, status, agent_version)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [machineId, at, snap.machine.status, snap.machine.agentVersion],
    );

    const prev = this.lastHashes.get(machineId) ?? {
      providers: "",
      automations: "",
      collectors: "",
    };
    // Hash only MEANINGFUL values. Volatile fields that change every poll (updatedAt,
    // free-text collector detail like a live process count) are excluded, otherwise the
    // hash always differs and we would store a duplicate row on every tick (spec §42).
    const next = {
      providers: hash(
        snap.providers.map((p) => [
          p.provider,
          p.account,
          p.credits,
          p.status,
          p.cost?.amount ?? null,
          p.tokens?.totalTokens ?? null,
          p.limits.map((l) => [
            l.label,
            l.used,
            l.remaining,
            l.capacity,
            l.resetAt,
          ]),
        ]),
      ),
      automations: hash(
        snap.automations.map((t) => [
          t.id,
          t.status,
          t.enabled,
          t.nextRunAt,
          t.lastRunAt,
          t.lastResult,
        ]),
      ),
      collectors: hash(snap.collectors.map((c) => [c.name, c.health])),
    };

    // Provider usage / limits / tokens / cost — only when the payload actually changed.
    if (next.providers !== prev.providers) {
      for (const p of snap.providers) {
        await db.execute(
          `INSERT INTO provider_usage (machine_id, provider, account, source, updated_at, credits, status, observed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            machineId,
            p.provider,
            p.account,
            p.source,
            p.updatedAt,
            p.credits,
            p.status,
            at,
          ],
        );
        for (const l of p.limits) {
          await db.execute(
            `INSERT INTO provider_limits (machine_id, provider, label, used, remaining, capacity,
               used_percent, remaining_percent, reset_at, source, source_quality, observed_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              machineId,
              p.provider,
              l.label,
              l.used,
              l.remaining,
              l.capacity,
              l.usedPercent,
              l.remainingPercent,
              l.resetAt,
              l.source,
              l.sourceQuality,
              at,
            ],
          );
        }
        if (p.tokens) {
          await db.execute(
            `INSERT INTO token_usage (machine_id, scope, scope_key, input_tokens, output_tokens,
               cache_read_tokens, cache_creation_tokens, total_tokens, observed_at)
             VALUES ($1,'provider',$2,$3,$4,$5,$6,$7,$8)`,
            [
              machineId,
              p.provider,
              p.tokens.inputTokens,
              p.tokens.outputTokens,
              p.tokens.cacheReadTokens,
              p.tokens.cacheCreationTokens,
              p.tokens.totalTokens,
              at,
            ],
          );
        }
        if (p.cost) {
          await db.execute(
            `INSERT INTO cost_records (machine_id, scope, scope_key, amount, currency, source, source_quality, observed_at)
             VALUES ($1,'provider',$2,$3,$4,$5,$6,$7)`,
            [
              machineId,
              p.provider,
              p.cost.amount,
              p.cost.currency,
              p.cost.source,
              p.cost.sourceQuality,
              at,
            ],
          );
        }
      }
    }

    // Sessions — upserted by stable fingerprint so repeat observations update one row.
    for (const s of snap.sessions) {
      await db.execute(
        `INSERT OR REPLACE INTO ai_sessions (id, machine_id, agent, pid, project_name, project_path,
           terminal, started_at, last_activity_at, duration_seconds, status, model, total_tokens,
           cost_amount, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          s.id,
          machineId,
          s.agent,
          s.pid,
          s.projectName,
          s.projectPath,
          s.terminal,
          s.startedAt,
          s.lastActivityAt,
          s.durationSeconds,
          s.status,
          s.model,
          s.tokens?.totalTokens ?? null,
          s.cost?.amount ?? null,
          sessionFingerprint(s),
        ],
      );
    }

    // Scheduled tasks — upsert by stable id.
    if (next.automations !== prev.automations) {
      for (const t of snap.automations) {
        await db.execute(
          `INSERT OR REPLACE INTO scheduled_tasks (id, machine_id, source, name, description, schedule,
             enabled, next_run_at, last_run_at, last_result, last_exit_code, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            t.id,
            machineId,
            t.source,
            t.name,
            t.description,
            t.schedule,
            t.enabled === null ? null : t.enabled ? 1 : 0,
            t.nextRunAt,
            t.lastRunAt,
            t.lastResult,
            t.lastExitCode,
            t.status,
          ],
        );
      }
    }

    // Collector health — only on change, so a steady-state agent doesn't spam rows.
    if (next.collectors !== prev.collectors) {
      for (const c of snap.collectors) {
        await db.execute(
          `INSERT INTO collector_health (machine_id, name, health, detail, last_success_at, last_error, observed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            machineId,
            c.name,
            c.health,
            c.detail,
            c.lastSuccessAt,
            c.lastError,
            at,
          ],
        );
      }
    }

    this.lastHashes.set(machineId, next);
  }

  async exportBackup(): Promise<BackupBundle> {
    // Every history table EXCEPT credentials. `machines` is selected column-by-column so
    // the pairing token can never end up in a backup file (spec §58).
    const tables: Record<string, unknown[]> = {};
    tables.machines = await this.conn.select(
      "SELECT id, hostname, display_name, os, os_version, architecture, agent_version, address, connection_type, last_seen, status FROM machines",
    );
    for (const t of [
      "machine_heartbeats",
      "provider_usage",
      "provider_limits",
      "token_usage",
      "cost_records",
      "ai_sessions",
      "system_metrics",
      "system_metric_rollups",
      "scheduled_tasks",
      "automation_runs",
      "collector_health",
      "insights",
    ]) {
      tables[t] = await this.conn.select(`SELECT * FROM ${t}`);
    }
    return {
      format: "ai-control-center-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      tables,
    };
  }

  async runRetention(
    nowMs: number,
  ): Promise<{ rolledUp: number; prunedRaw: number }> {
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
        arr.push({
          t: Date.parse(r.timestamp),
          cpu: r.cpu_percent,
          ram: r.ram_percent,
          gpu: r.gpu_percent,
        });
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
      await this.conn.execute(
        "DELETE FROM system_metrics WHERE timestamp < $1",
        [rawCutoff],
      );
    }

    // Cascade: 1m -> 5m beyond 7 days, then 5m -> 1h beyond 90 days (spec §42), so old
    // history keeps shrinking instead of being dropped outright.
    rolledUp += await this.cascade(
      "1m",
      "5m",
      plan.oneMinuteCutoffMs,
      5 * 60_000,
    );
    rolledUp += await this.cascade(
      "5m",
      "1h",
      plan.fiveMinuteCutoffMs,
      3600_000,
    );

    return { rolledUp, prunedRaw: raw.length };
  }

  /** Roll `from` buckets older than the cutoff into coarser `to` buckets, then prune them. */
  private async cascade(
    from: string,
    to: string,
    cutoffMs: number,
    bucketMs: number,
  ): Promise<number> {
    const cutoff = new Date(cutoffMs).toISOString();
    const rows = await this.conn.select<
      {
        machine_id: string;
        timestamp: string;
        cpu_percent: number | null;
        ram_percent: number | null;
        gpu_percent: number | null;
      }[]
    >(
      "SELECT machine_id, timestamp, cpu_percent, ram_percent, gpu_percent FROM system_metric_rollups WHERE bucket = $1 AND timestamp < $2",
      [from, cutoff],
    );
    if (rows.length === 0) return 0;

    const byMachine = new Map<string, SystemSample[]>();
    for (const r of rows) {
      const arr = byMachine.get(r.machine_id) ?? [];
      arr.push({
        t: Date.parse(r.timestamp),
        cpu: r.cpu_percent,
        ram: r.ram_percent,
        gpu: r.gpu_percent,
      });
      byMachine.set(r.machine_id, arr);
    }
    let written = 0;
    for (const [machineId, samples] of byMachine) {
      for (const b of downsample(samples, bucketMs)) {
        await this.conn.execute(
          "INSERT OR IGNORE INTO system_metric_rollups (machine_id, bucket, timestamp, cpu_percent, ram_percent, gpu_percent) VALUES ($1,$2,$3,$4,$5,$6)",
          [machineId, to, new Date(b.t).toISOString(), b.cpu, b.ram, b.gpu],
        );
        written += 1;
      }
    }
    await this.conn.execute(
      "DELETE FROM system_metric_rollups WHERE bucket = $1 AND timestamp < $2",
      [from, cutoff],
    );
    return written;
  }
}
