import {
  DiscoverResponseSchema,
  HealthResponseSchema,
  SnapshotSchema,
  UsageReportSchema,
  type DiscoveredAgent,
  type HealthResponse,
  type Snapshot,
  type UsageGranularity,
  type UsageReport,
} from "@acc/protocol";
import type { MachineRecord } from "./types";

export function baseUrl(address: string): string {
  return /^https?:\/\//i.test(address)
    ? address.replace(/\/+$/, "")
    : `http://${address}`;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function getJson(
  url: string,
  token: string | null,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: authHeaders(token),
      signal: controller.signal,
    });
    if (res.status === 401)
      throw new Error("unauthorized (check pairing token)");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap liveness + identity check. Validated against the protocol schema. */
export async function fetchHealth(
  machine: MachineRecord,
  timeoutMs = 4000,
): Promise<HealthResponse> {
  const data = await getJson(
    `${baseUrl(machine.address)}/health`,
    machine.token,
    timeoutMs,
  );
  return HealthResponseSchema.parse(data);
}

/**
 * Fetch and VALIDATE the normalized snapshot. Validation at this boundary means a
 * malformed agent payload is rejected here rather than corrupting the local database.
 */
export async function fetchSnapshot(
  machine: MachineRecord,
  // A cold snapshot spawns ccusage and queries Glances/schedulers; measured at ~4s on a
  // quiet machine and longer on one with many sessions or a laggy Wi-Fi link. 8s was too
  // tight and made a healthy agent look OFFLINE, so allow generous headroom.
  timeoutMs = 25000,
): Promise<Snapshot> {
  const data = await getJson(
    `${baseUrl(machine.address)}/v1/snapshot`,
    machine.token,
    timeoutMs,
  );
  return SnapshotSchema.parse(data);
}

/** Fetch and validate a usage report for the given granularity. */
export async function fetchUsage(
  machine: MachineRecord,
  granularity: UsageGranularity,
  timeoutMs = 15000,
): Promise<UsageReport> {
  const url = `${baseUrl(machine.address)}/v1/usage?granularity=${granularity}`;
  const data = (await getJson(url, machine.token, timeoutMs)) as {
    report: unknown;
  };
  return UsageReportSchema.parse(data.report);
}

/**
 * Ask a reachable agent to browse the LAN (mDNS) for other agents. Returns discovered
 * peers (never their tokens) for one-click registration on the Surface.
 */
export async function fetchDiscover(
  machine: MachineRecord,
  timeoutMs = 9000,
): Promise<DiscoveredAgent[]> {
  const url = `${baseUrl(machine.address)}/v1/discover?timeoutMs=4000`;
  const data = await getJson(url, machine.token, timeoutMs);
  return DiscoverResponseSchema.parse(data).agents;
}
