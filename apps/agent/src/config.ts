import os from "node:os";
import fs from "node:fs";
import path from "node:path";

/** Filename the install scripts write the pairing token to. */
export const TOKEN_FILENAME = ".agent-pairing-token";

/**
 * Resolve the bearer token, in priority order:
 *   1. ACC_AGENT_TOKEN            (explicit, highest precedence)
 *   2. ACC_AGENT_TOKEN_FILE       (explicit path)
 *   3. `.agent-pairing-token` found in the cwd or a parent directory
 *
 * The file fallback exists so autostart (Windows Task Scheduler / launchd) never has to
 * embed the secret in a task definition or plist, which would otherwise sit in
 * world-readable XML. Whitespace is trimmed — a stray newline would silently break auth.
 */
export function resolveToken(
  env: NodeJS.ProcessEnv = process.env,
  startDir: string = process.cwd(),
  readFile: (p: string) => string = (p) => fs.readFileSync(p, "utf8"),
  exists: (p: string) => boolean = (p) => fs.existsSync(p),
): string | null {
  const inline = env.ACC_AGENT_TOKEN?.trim();
  if (inline) return inline;

  const explicit = env.ACC_AGENT_TOKEN_FILE?.trim();
  if (explicit) {
    try {
      const v = readFile(explicit).trim();
      return v || null;
    } catch {
      return null;
    }
  }

  // Walk up from the working directory (agent runs from apps/agent under pnpm).
  let dir = startDir;
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, TOKEN_FILENAME);
    if (exists(candidate)) {
      try {
        const v = readFile(candidate).trim();
        if (v) return v;
      } catch {
        /* unreadable — keep looking */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

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
  const token = resolveToken(env);
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
