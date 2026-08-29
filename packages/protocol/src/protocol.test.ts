import { describe, expect, it } from "vitest";
import {
  MachineSchema,
  SnapshotSchema,
  SystemMetricSchema,
  UsageLimitSchema,
  toSourceQuality,
  PROTOCOL_VERSION,
} from "./index";

describe("toSourceQuality", () => {
  it("collapses internal provenance to the three user-facing labels", () => {
    expect(toSourceQuality("OFFICIAL")).toBe("OFFICIAL");
    expect(toSourceQuality("OFFICIAL_LOCAL")).toBe("OFFICIAL");
    expect(toSourceQuality("CALCULATED")).toBe("CALCULATED");
    expect(toSourceQuality("ESTIMATED")).toBe("ESTIMATED");
  });
});

describe("MachineSchema", () => {
  it("accepts a machine with unknown fields left null, applying defaults", () => {
    const m = MachineSchema.parse({
      id: "olavo-pc",
      hostname: "OLAVO-PC",
      displayName: "OLAVO-PC",
      os: "windows",
      osVersion: null,
      architecture: null,
      agentVersion: null,
      lastSeen: null,
      status: "PAIRING",
    });
    expect(m.ipAddresses).toEqual([]);
    expect(m.connectionType).toBe("unknown");
  });

  it("rejects an invalid OS", () => {
    expect(() =>
      MachineSchema.parse({
        id: "x",
        hostname: "x",
        displayName: "x",
        os: "beos",
        osVersion: null,
        architecture: null,
        agentVersion: null,
        lastSeen: null,
        status: "ONLINE",
      }),
    ).toThrow();
  });
});

describe("SystemMetricSchema", () => {
  it("allows every hardware field to be null (missing GPU / temp sensor)", () => {
    const s = SystemMetricSchema.parse({
      timestamp: "2026-08-28T18:00:00.000Z",
      cpuPercent: 22,
      cpuTemperature: null,
      ramUsed: 7793135616,
      ramTotal: 8424185856,
      ramPercent: 92.5,
      gpuName: null,
      gpuPercent: null,
      vramUsed: null,
      vramTotal: null,
      vramPercent: null,
      gpuTemperature: null,
      gpuPowerWatts: null,
      diskUsed: 155264032768,
      diskTotal: 254794526720,
      networkRx: 0,
      networkTx: 0,
      uptime: 3775976,
    });
    expect(s.gpuName).toBeNull();
    expect(s.ramPercent).toBe(92.5);
  });

  it("rejects a cpuPercent above 100", () => {
    expect(() =>
      SystemMetricSchema.parse({
        timestamp: "2026-08-28T18:00:00.000Z",
        cpuPercent: 150,
        cpuTemperature: null,
        ramUsed: null,
        ramTotal: null,
        ramPercent: null,
        gpuName: null,
        gpuPercent: null,
        vramUsed: null,
        vramTotal: null,
        vramPercent: null,
        gpuTemperature: null,
        gpuPowerWatts: null,
        diskUsed: null,
        diskTotal: null,
        networkRx: null,
        networkTx: null,
        uptime: null,
      }),
    ).toThrow();
  });
});

describe("UsageLimitSchema", () => {
  it("requires a source and quality so provenance is never lost", () => {
    const limit = UsageLimitSchema.parse({
      id: "claude-5h",
      label: "5-hour",
      used: 72,
      remaining: 28,
      capacity: 100,
      usedPercent: 72,
      remainingPercent: 28,
      resetAt: "2026-08-28T20:14:00.000Z",
      resetInSeconds: 8040,
      source: "ccusage",
      sourceQuality: "CALCULATED",
    });
    expect(limit.sourceQuality).toBe("CALCULATED");
  });
});

describe("SnapshotSchema", () => {
  it("validates a minimal honest snapshot with empty collector sections", () => {
    const snap = SnapshotSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      generatedAt: "2026-08-28T18:00:00.000Z",
      machine: {
        id: "surface",
        hostname: "SURFACE-PRO",
        displayName: "Surface Pro",
        os: "windows",
        osVersion: null,
        architecture: null,
        agentVersion: "0.0.0",
        lastSeen: "2026-08-28T18:00:00.000Z",
        status: "ONLINE",
      },
      system: null,
    });
    expect(snap.providers).toEqual([]);
    expect(snap.sessions).toEqual([]);
    expect(snap.automations).toEqual([]);
    expect(snap.collectors).toEqual([]);
  });
});
