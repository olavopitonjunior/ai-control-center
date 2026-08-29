import { timingSafeEqual } from "node:crypto";
import os from "node:os";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import {
  PROTOCOL_VERSION,
  type HealthResponse,
  type Snapshot,
} from "@acc/protocol";
import { AGENT_VERSION, type AgentConfig } from "./config";
import {
  buildSnapshot,
  defaultCollectors,
  getHistory,
  normalizeOs,
  type AgentCollectors,
} from "./snapshot";
import { browseAgents } from "./mdns";

const startedAt = new Date().toISOString();

/** Constant-time bearer token comparison to avoid timing leaks. */
function tokenMatches(configured: string, presented: string): boolean {
  const a = Buffer.from(configured);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildServer(
  config: AgentConfig,
  collectors: AgentCollectors = defaultCollectors(config),
): FastifyInstance {
  const app = Fastify({
    // When TLS material is configured the agent serves HTTPS; otherwise plaintext HTTP.
    ...(config.tls
      ? { https: { key: config.tls.key, cert: config.tls.cert } }
      : {}),
    logger: {
      level: process.env.ACC_LOG_LEVEL ?? "info",
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie"],
        censor: "[REDACTED]",
      },
    },
  });

  // CORS: reflect the requesting origin so both the Tauri webview (tauri://localhost) and
  // the browser dev shell (http://localhost:1420) can call the API. /v1/* is still
  // bearer-protected, so reflecting the origin does not weaken authentication.
  void app.register(cors, { origin: true });

  // A very short snapshot cache so rapid granular calls (/v1/system etc.) don't each
  // re-run the collectors. ccusage additionally caches its own CLI output for 60s.
  let cached: { at: number; snapshot: Snapshot } | null = null;
  async function snapshot(): Promise<Snapshot> {
    const now = Date.now();
    if (cached && now - cached.at < 2000) return cached.snapshot;
    const snap = await buildSnapshot(
      config,
      new Date(now).toISOString(),
      collectors,
    );
    cached = { at: now, snapshot: snap };
    return snap;
  }

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/v1/")) return;
    if (!config.token) return; // loopback dev mode
    const header = request.headers.authorization ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!presented || !tokenMatches(config.token, presented)) {
      reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/health", async (): Promise<HealthResponse> => {
    const now = new Date().toISOString();
    return {
      ok: true,
      agentVersion: AGENT_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      machineId: config.machineId,
      hostname: config.hostname,
      os: normalizeOs(os.platform()),
      startedAt,
      now,
    };
  });

  app.get("/v1/snapshot", async () => snapshot());
  app.get("/v1/system", async () => ({ system: (await snapshot()).system }));
  app.get("/v1/providers", async () => ({
    providers: (await snapshot()).providers,
  }));
  app.get("/v1/sessions", async () => ({
    sessions: (await snapshot()).sessions,
  }));
  app.get("/v1/automations", async () => ({
    automations: (await snapshot()).automations,
  }));
  app.get("/v1/collectors", async () => ({
    collectors: (await snapshot()).collectors,
  }));

  app.get("/v1/containers", async () => ({
    containers: (await snapshot()).containers,
  }));

  // Recent buffered system samples (spec §24). Ensure at least one sample exists by
  // building a snapshot first, so a fresh agent doesn't return an empty history.
  app.get("/v1/history", async (request) => {
    await snapshot();
    const q = (request.query ?? {}) as { limit?: string };
    const limit = Number(q.limit) || 240;
    return { system: getHistory(limit) };
  });

  app.get("/v1/discover", async (request) => {
    const q = (request.query ?? {}) as { timeoutMs?: string };
    const timeout = Math.min(8000, Math.max(1000, Number(q.timeoutMs) || 3000));
    const agents = await browseAgents(timeout);
    // Exclude ourselves from the results.
    return { agents: agents.filter((a) => a.machineId !== config.machineId) };
  });

  app.get("/v1/usage", async (request, reply) => {
    const q = (request.query ?? {}) as { granularity?: string };
    const granularity =
      q.granularity === "weekly" || q.granularity === "monthly"
        ? q.granularity
        : "daily";
    const result = await collectors.usage(
      granularity,
      new Date().toISOString(),
    );
    if (!result.data) {
      return reply.code(503).send({
        error: result.detail ?? "usage unavailable",
        health: result.health,
      });
    }
    return { report: result.data, health: result.health };
  });

  return app;
}
