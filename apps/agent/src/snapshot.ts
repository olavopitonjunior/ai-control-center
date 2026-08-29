import os from "node:os";
import {
  PROTOCOL_VERSION,
  SnapshotSchema,
  type CollectorStatus,
  type Machine,
  type MachineStatus,
  type OperatingSystem,
  type Snapshot,
} from "@acc/protocol";
import {
  classifyInterface,
  preferredConnectionType,
  type CollectorResult,
} from "@acc/adapters";
import { dedupeSessions } from "@acc/analytics";
import type {
  ScheduledTask,
  SystemMetric,
  UsageGranularity,
  UsageReport,
} from "@acc/protocol";
import type { AgentConfig } from "./config";
import { AGENT_VERSION } from "./config";
import {
  collectCcusage,
  defaultCcusageOptions,
  type CcusageData,
} from "./collectors/ccusage";
import {
  collectGlances,
  defaultGlancesOptions,
  type GlancesData,
} from "./collectors/glances";
import { collectAutomations } from "./collectors/automations";
import { collectCloudAutomations } from "./collectors/cloud";
import { collectUsage } from "./collectors/usage";

/**
 * The set of collectors the snapshot builder runs. Injectable so tests can supply fast,
 * deterministic stubs instead of spawning real CLIs.
 */
export interface AgentCollectors {
  ccusage: (nowIso: string) => Promise<CollectorResult<CcusageData>>;
  glances: (nowIso: string) => Promise<CollectorResult<GlancesData>>;
  tasks: (nowIso: string) => Promise<CollectorResult<ScheduledTask[]>>;
  cloud: (nowIso: string) => Promise<CollectorResult<ScheduledTask[]>>;
  usage: (
    granularity: UsageGranularity,
    nowIso: string,
  ) => Promise<CollectorResult<UsageReport>>;
}

/** Real collectors bound to this machine's config. */
export function defaultCollectors(config: AgentConfig): AgentCollectors {
  const ccusageOpts = defaultCcusageOptions(config.machineId);
  const glancesOpts = defaultGlancesOptions();
  return {
    ccusage: (nowIso) => collectCcusage(ccusageOpts, nowIso),
    glances: (nowIso) => collectGlances(glancesOpts, nowIso),
    tasks: (nowIso) => collectAutomations(config.machineId, nowIso),
    cloud: (nowIso) => collectCloudAutomations(config.machineId, nowIso),
    usage: (granularity, nowIso) =>
      collectUsage(ccusageOpts, granularity, nowIso),
  };
}

export function normalizeOs(platform: NodeJS.Platform): OperatingSystem {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  return "linux";
}

/** Build this machine's identity record from the OS — all real, nothing invented. */
export function selfMachine(
  config: AgentConfig,
  nowIso: string,
  status: MachineStatus,
): Machine {
  const ifaces = localInterfaces();
  return {
    id: config.machineId,
    hostname: config.hostname,
    displayName: config.displayName,
    os: normalizeOs(os.platform()),
    osVersion: os.release() || null,
    architecture: os.arch() || null,
    agentVersion: AGENT_VERSION,
    ipAddresses: ifaces.map((i) => i.address),
    connectionType: preferredConnectionType(ifaces.map((i) => i.type)),
    lastSeen: nowIso,
    status,
  };
}

/** Non-internal interfaces with their classified connection type. */
export function localInterfaces(): {
  name: string;
  address: string;
  type: ReturnType<typeof classifyInterface>;
}[] {
  const out: {
    name: string;
    address: string;
    type: ReturnType<typeof classifyInterface>;
  }[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (!a.internal)
        out.push({ name, address: a.address, type: classifyInterface(name) });
    }
  }
  return out;
}

function statusOf(
  name: string,
  result: CollectorResult<unknown>,
  nowIso: string,
): CollectorStatus {
  return {
    name,
    health: result.health,
    detail: result.detail,
    lastSuccessAt: result.health === "HEALTHY" ? nowIso : null,
    lastError: result.lastError,
  };
}

/**
 * Compose the full normalized snapshot by running every collector in parallel with
 * error isolation. A collector that fails degrades only its own section. The whole
 * payload is validated through SnapshotSchema before it leaves the agent.
 */
export async function buildSnapshot(
  config: AgentConfig,
  nowIso: string,
  collectors: AgentCollectors = defaultCollectors(config),
): Promise<Snapshot> {
  const [ccusage, glances, tasks, cloud] = await Promise.all([
    collectors.ccusage(nowIso),
    collectors.glances(nowIso),
    collectors.tasks(nowIso),
    collectors.cloud(nowIso),
  ]);

  const collectorStatuses: CollectorStatus[] = [
    statusOf("ccusage", ccusage, nowIso),
    statusOf("glances", glances, nowIso),
    statusOf("automations", tasks, nowIso),
    statusOf("cloud", cloud, nowIso),
  ];

  // The agent's self-view: an ERROR in any collector means DEGRADED. Expected absence
  // (NOT_CONFIGURED / NOT_INSTALLED) is not an error. The Surface still owns ONLINE/
  // OFFLINE via heartbeat.
  const degraded = collectorStatuses.some((c) => c.health === "ERROR");
  const machine = selfMachine(config, nowIso, degraded ? "DEGRADED" : "ONLINE");

  const snapshot: Snapshot = {
    protocolVersion: PROTOCOL_VERSION,
    generatedAt: nowIso,
    machine,
    providers: ccusage.data?.provider ? [ccusage.data.provider] : [],
    // Deduplicate before serving: when more than one collector observes the same local
    // session (ccusage + codexbar), keep one record by source precedence so a user's
    // tokens can never double (spec §55).
    sessions: dedupeSessions(ccusage.data?.sessions ?? []),
    system: glances.data?.metric ?? null,
    containers: glances.data?.containers ?? [],
    automations: [...(tasks.data ?? []), ...(cloud.data ?? [])],
    collectors: collectorStatuses,
  };

  const parsed = SnapshotSchema.parse(snapshot);
  if (parsed.system) recordHistory(parsed.system);
  return parsed;
}

/**
 * Bounded in-memory ring buffer of recent system samples, so a freshly-connected Surface
 * can render history immediately (before it has collected its own). Memory-only and
 * bounded — the durable store is the Surface's SQLite (spec §20).
 */
const HISTORY_LIMIT = 720;
const history: SystemMetric[] = [];

function recordHistory(metric: SystemMetric): void {
  const last = history[history.length - 1];
  // Skip duplicate unchanged samples (spec §42).
  if (last && last.timestamp === metric.timestamp) return;
  history.push(metric);
  if (history.length > HISTORY_LIMIT)
    history.splice(0, history.length - HISTORY_LIMIT);
}

/** Most recent buffered samples, oldest first. */
export function getHistory(limit = HISTORY_LIMIT): SystemMetric[] {
  return history.slice(-Math.max(1, Math.min(limit, HISTORY_LIMIT)));
}
