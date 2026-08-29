import { spawn } from "node:child_process";
import {
  normalizeContainers,
  normalizeGlances,
  type CollectorResult,
  type GlancesSnapshot,
} from "@acc/adapters";
import type { ContainerInfo, SystemMetric } from "@acc/protocol";

export interface GlancesOptions {
  /** Base URL of the local Glances REST API. */
  baseUrl: string;
  timeoutMs: number;
  /** If true and Glances is unreachable, try to spawn it bound to loopback once. */
  autostart: boolean;
  /** Command used for autostart, e.g. ["python", "-m", "glances"]. */
  autostartCommand: string[];
}

const PLUGINS = [
  "cpu",
  "mem",
  "fs",
  "sensors",
  "gpu",
  "network",
  "uptime",
  "processcount",
  "containers",
] as const;

/** System telemetry plus the container list (spec §19). */
export interface GlancesData {
  metric: SystemMetric;
  containers: ContainerInfo[];
}

async function fetchPlugin(
  base: string,
  plugin: string,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/4/${plugin}`, {
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const text = await res.text();
    if (!text.trim()) return undefined; // cpu/mem can be empty until first refresh cycle
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live Glances collector. Queries the local REST API and normalizes to a SystemMetric.
 * Individual plugins may be empty/absent (e.g. no GPU) → those fields become null, never
 * fabricated. If Glances is entirely unreachable, degrades to NOT_CONFIGURED and the
 * System section shows "Not available" — provider/session monitoring keeps working.
 */
export async function collectGlances(
  opts: GlancesOptions,
  nowIso: string,
): Promise<CollectorResult<GlancesData>> {
  try {
    const results = await Promise.allSettled(
      PLUGINS.map((p) => fetchPlugin(opts.baseUrl, p, opts.timeoutMs)),
    );

    // If every request failed to connect, Glances isn't up.
    const anyConnected = results.some((r) => r.status === "fulfilled");
    if (!anyConnected) {
      if (opts.autostart) tryAutostart(opts);
      return {
        data: null,
        health: "NOT_CONFIGURED",
        detail: `Glances not reachable at ${opts.baseUrl} (start it with 'glances -w')`,
        lastError: firstRejection(results),
      };
    }

    const snap: GlancesSnapshot = {};
    PLUGINS.forEach((plugin, i) => {
      const r = results[i];
      if (r && r.status === "fulfilled" && r.value !== undefined) {
        // @ts-expect-error indexed assignment into the partial snapshot
        snap[plugin] = r.value;
      }
    });

    const metric = normalizeGlances(snap, nowIso);
    const containers = normalizeContainers(snap.containers);
    return {
      data: { metric, containers },
      health: "HEALTHY",
      detail:
        (metric.gpuName
          ? `gpu: ${metric.gpuName}`
          : "no discrete GPU reported") +
        `; ${metric.processCount ?? "?"} procs; ${containers.length} container(s)`,
      lastError: null,
    };
  } catch (error) {
    return {
      data: null,
      health: "ERROR",
      detail: "Glances query failed",
      lastError: error instanceof Error ? error.message : String(error),
    };
  }
}

let autostartAttempted = false;
function tryAutostart(opts: GlancesOptions): void {
  if (autostartAttempted) return;
  autostartAttempted = true;
  const [cmd, ...args] = opts.autostartCommand;
  if (!cmd) return;
  try {
    const child = spawn(
      cmd,
      [...args, "-w", "-p", "61208", "--disable-webui"],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        shell: process.platform === "win32",
      },
    );
    child.unref();
  } catch {
    // best-effort; next poll will report NOT_CONFIGURED if it didn't come up
  }
}

function firstRejection(
  results: PromiseSettledResult<unknown>[],
): string | null {
  const rej = results.find((r) => r.status === "rejected");
  return rej && rej.status === "rejected"
    ? rej.reason instanceof Error
      ? rej.reason.message
      : String(rej.reason)
    : null;
}

export function defaultGlancesOptions(): GlancesOptions {
  return {
    baseUrl: process.env.ACC_GLANCES_URL?.trim() || "http://127.0.0.1:61208",
    timeoutMs: 4000,
    autostart: process.env.ACC_GLANCES_AUTOSTART === "1",
    autostartCommand: (
      process.env.ACC_GLANCES_CMD || "python -m glances"
    ).split(" "),
  };
}
