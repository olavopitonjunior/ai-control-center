import type { SystemMetric } from "@acc/protocol";

/**
 * Partial shapes of Glances REST API v4 responses that we consume. Captured live
 * from `glances -w` on 2026-08-28 (Windows/Surface). We never vendor Glances —
 * we only normalize its JSON. Missing hardware (no discrete GPU, no CPU-temp
 * sensor on this Surface) maps to null, never 0.
 */
export interface GlancesCpu {
  total?: number;
}
export interface GlancesMem {
  total?: number;
  used?: number;
  percent?: number;
}
export interface GlancesFsEntry {
  size?: number;
  used?: number;
}
export interface GlancesSensorEntry {
  label?: string;
  value?: number;
  unit?: string;
  type?: string;
}
export interface GlancesGpuEntry {
  name?: string;
  proc?: number;
  mem?: number;
  temperature?: number;
  power?: number;
}
export interface GlancesNetEntry {
  bytes_recv_rate_per_sec?: number;
  bytes_sent_rate_per_sec?: number;
}

export interface GlancesSnapshot {
  cpu?: GlancesCpu;
  mem?: GlancesMem;
  fs?: GlancesFsEntry[];
  sensors?: GlancesSensorEntry[];
  gpu?: GlancesGpuEntry[];
  network?: GlancesNetEntry[];
  /** Glances returns uptime as a human string, e.g. "43 days, 17:16:16". */
  uptime?: string;
}

/** Parse Glances' human uptime string into whole seconds. Null if unparseable. */
export function parseUptime(uptime: string | undefined | null): number | null {
  if (!uptime) return null;
  let days = 0;
  let rest = uptime.trim();
  const dayMatch = rest.match(/(\d+)\s*days?,?\s*/i);
  if (dayMatch) {
    days = Number(dayMatch[1]);
    rest = rest.slice(dayMatch[0].length);
  }
  const hms = rest.match(/(\d+):(\d+):(\d+)/);
  if (!hms) return dayMatch ? days * 86400 : null;
  const h = Number(hms[1]);
  const m = Number(hms[2]);
  const s = Number(hms[3]);
  return days * 86400 + h * 3600 + m * 60 + s;
}

/** Find a CPU temperature among Glances sensors. Battery / non-temp sensors are ignored. */
export function cpuTemperatureFromSensors(
  sensors: GlancesSensorEntry[] | undefined,
): number | null {
  if (!sensors) return null;
  const temp = sensors.find((sensor) => {
    const isTemp =
      sensor.type === "temperature_core" ||
      sensor.unit === "C" ||
      sensor.unit === "°C";
    const looksLikeCpu = /cpu|package|core|tctl|tdie/i.test(sensor.label ?? "");
    return isTemp && looksLikeCpu && typeof sensor.value === "number";
  });
  return temp?.value ?? null;
}

/**
 * Normalize a set of Glances plugin payloads into one SystemMetric. Every field
 * degrades to null when the underlying plugin is empty/absent. `timestamp` is the
 * caller-provided ISO string (agent's clock), so this stays a pure function.
 */
export function normalizeGlances(
  snap: GlancesSnapshot,
  timestamp: string,
): SystemMetric {
  const cpuPercent = numberOrNull(snap.cpu?.total);

  const ramUsed = numberOrNull(snap.mem?.used);
  const ramTotal = numberOrNull(snap.mem?.total);
  const ramPercent = numberOrNull(snap.mem?.percent);

  const gpu = snap.gpu && snap.gpu.length > 0 ? snap.gpu[0] : undefined;

  const fs = snap.fs ?? [];
  const diskUsed = fs.length ? fs.reduce((a, e) => a + (e.used ?? 0), 0) : null;
  const diskTotal = fs.length
    ? fs.reduce((a, e) => a + (e.size ?? 0), 0)
    : null;

  const net = snap.network ?? [];
  const networkRx = net.length
    ? net.reduce((a, e) => a + (e.bytes_recv_rate_per_sec ?? 0), 0)
    : null;
  const networkTx = net.length
    ? net.reduce((a, e) => a + (e.bytes_sent_rate_per_sec ?? 0), 0)
    : null;

  return {
    timestamp,
    cpuPercent: cpuPercent === null ? null : clamp(cpuPercent, 0, 100),
    cpuTemperature: cpuTemperatureFromSensors(snap.sensors),
    ramUsed,
    ramTotal,
    ramPercent,
    gpuName: gpu?.name ?? null,
    gpuPercent: numberOrNull(gpu?.proc),
    vramUsed: numberOrNull(gpu?.mem),
    vramTotal: null,
    vramPercent: null,
    gpuTemperature: numberOrNull(gpu?.temperature),
    gpuPowerWatts: numberOrNull(gpu?.power),
    diskUsed,
    diskTotal,
    networkRx,
    networkTx,
    uptime: parseUptime(snap.uptime),
  };
}

function numberOrNull(v: number | undefined | null): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
