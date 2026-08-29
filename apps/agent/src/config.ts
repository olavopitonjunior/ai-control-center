import os from "node:os";
import fs from "node:fs";

export const AGENT_VERSION = "0.1.0";

export interface TlsMaterial {
  cert: Buffer;
  key: Buffer;
}

export interface AgentConfig {
  /** Bind host. Defaults to 127.0.0.1 — LAN exposure is opt-in via ACC_AGENT_HOST. */
  host: string;
  port: number;
  /** Bearer token required for /v1/* when set. Required whenever host is not loopback. */
  token: string | null;
  machineId: string;
  hostname: string;
  displayName: string;
  /** When set (via ACC_TLS_CERT + ACC_TLS_KEY), the agent serves HTTPS. */
  tls?: TlsMaterial | null;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLoopback(host: string): boolean {
  return LOOPBACK.has(host);
}

/**
 * Load config from environment. Safe defaults: loopback bind, no token needed for
 * local dev. If a non-loopback host is requested WITHOUT a token, we throw rather
 * than silently exposing an unauthenticated service to the LAN.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const host = env.ACC_AGENT_HOST?.trim() || "127.0.0.1";
  const port = Number(env.ACC_AGENT_PORT ?? 47600);
  const token = env.ACC_AGENT_TOKEN?.trim() || null;
  const hostname = os.hostname();

  if (!isLoopback(host) && !token) {
    throw new Error(
      "Refusing to bind to a non-loopback address without ACC_AGENT_TOKEN. " +
        "Set a pairing token before enabling LAN access (see docs/SECURITY.md).",
    );
  }

  // Optional TLS: both cert and key paths must be set and readable.
  let tls: TlsMaterial | null = null;
  const certPath = env.ACC_TLS_CERT?.trim();
  const keyPath = env.ACC_TLS_KEY?.trim();
  if (certPath && keyPath) {
    tls = { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  }

  return {
    host,
    port: Number.isFinite(port) ? port : 47600,
    token,
    machineId: env.ACC_MACHINE_ID?.trim() || hostname.toLowerCase(),
    hostname,
    displayName: env.ACC_MACHINE_NAME?.trim() || hostname,
    tls,
  };
}
