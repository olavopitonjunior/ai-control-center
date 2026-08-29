import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { HealthResponseSchema, SnapshotSchema } from "@acc/protocol";
import { buildServer } from "./server";
import type { AgentConfig } from "./config";
import type { AgentCollectors } from "./snapshot";

function testConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    token: null,
    machineId: "test-machine",
    hostname: "TEST-MACHINE",
    displayName: "Test Machine",
    ...overrides,
  };
}

// Deterministic stub collectors — no real CLI/HTTP, so tests are fast and hermetic.
function stubCollectors(): AgentCollectors {
  return {
    ccusage: async () => ({
      data: null,
      health: "NOT_CONFIGURED",
      detail: "stub",
      lastError: null,
    }),
    glances: async () => ({
      data: null,
      health: "NOT_CONFIGURED",
      detail: "stub",
      lastError: null,
    }),
    tasks: async () => ({
      data: null,
      health: "NOT_CONFIGURED",
      detail: "stub",
      lastError: null,
    }),
    cloud: async () => ({
      data: null,
      health: "NOT_CONFIGURED",
      detail: "stub",
      lastError: null,
    }),
    usage: async (granularity) => ({
      data: {
        granularity,
        source: "ccusage",
        generatedAt: "2026-08-28T23:00:00.000Z",
        points: [],
        totals: {
          tokens: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            totalTokens: 0,
          },
          cost: 0,
        },
        byModel: [],
        byAgent: [],
        byProject: [],
      },
      health: "HEALTHY",
      detail: "stub",
      lastError: null,
    }),
  };
}

describe("agent server (loopback, no token)", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer(testConfig(), stubCollectors());
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns a valid HealthResponse", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const parsed = HealthResponseSchema.parse(res.json());
    expect(parsed.ok).toBe(true);
    expect(parsed.machineId).toBe("test-machine");
  });

  it("GET /v1/snapshot returns a schema-valid snapshot; collectors reported honestly", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/snapshot" });
    expect(res.statusCode).toBe(200);
    const snap = SnapshotSchema.parse(res.json());
    expect(snap.system).toBeNull();
    expect(snap.providers).toEqual([]);
    expect(snap.machine.status).toBe("ONLINE"); // NOT_CONFIGURED is not an error
    const names = snap.collectors.map((c) => c.name).sort();
    expect(names).toEqual(["automations", "ccusage", "cloud", "glances"]);
    for (const c of snap.collectors) expect(c.health).toBe("NOT_CONFIGURED");
  });

  it("granular endpoints return their slice", async () => {
    const sys = await app.inject({ method: "GET", url: "/v1/system" });
    expect(sys.json()).toEqual({ system: null });
    const prov = await app.inject({ method: "GET", url: "/v1/providers" });
    expect(prov.json()).toEqual({ providers: [] });
  });

  it("GET /v1/usage returns a report for the requested granularity", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/usage?granularity=weekly",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { report: { granularity: string } };
    expect(body.report.granularity).toBe("weekly");
  });

  it("reports DEGRADED when a collector errors", async () => {
    const erroring: AgentCollectors = {
      ...stubCollectors(),
      glances: async () => ({
        data: null,
        health: "ERROR",
        detail: "boom",
        lastError: "connection refused",
      }),
    };
    const app2 = buildServer(testConfig(), erroring);
    await app2.ready();
    const res = await app2.inject({ method: "GET", url: "/v1/snapshot" });
    const snap = SnapshotSchema.parse(res.json());
    expect(snap.machine.status).toBe("DEGRADED");
    await app2.close();
  });
});

describe("agent server (token required on /v1)", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer(
      testConfig({ token: "s3cret-pairing-token" }),
      stubCollectors(),
    );
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects /v1 without a bearer token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/snapshot" });
    expect(res.statusCode).toBe(401);
  });

  it("accepts /v1 with the correct bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/snapshot",
      headers: { authorization: "Bearer s3cret-pairing-token" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("leaves /health public (liveness)", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });
});
