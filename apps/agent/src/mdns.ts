import { Bonjour, type Service } from "bonjour-service";
import type { AgentConfig } from "./config";
import { AGENT_VERSION } from "./config";
import { normalizeOs } from "./snapshot";
import os from "node:os";

/** The mDNS service type. Advertised as `_ai-control._tcp.local`. */
export const MDNS_TYPE = "ai-control";

let bonjour: Bonjour | null = null;
let published: Service | null = null;

/**
 * Advertise this agent on the local network via mDNS/DNS-SD so Surfaces can discover it
 * without knowing its address. TXT records carry identity (not secrets). Only meaningful
 * when LAN-exposed; the caller decides whether to advertise.
 */
export function advertise(config: AgentConfig, scheme: "http" | "https"): void {
  if (published) return;
  bonjour = new Bonjour();
  published = bonjour.publish({
    name: config.displayName || config.hostname,
    type: MDNS_TYPE,
    port: config.port,
    txt: {
      machineId: config.machineId,
      hostname: config.hostname,
      os: normalizeOs(os.platform()),
      v: AGENT_VERSION,
      scheme,
      auth: config.token ? "token" : "none",
    },
  });
}

/** Stop advertising and release the socket. */
export function unadvertise(): Promise<void> {
  return new Promise((resolve) => {
    if (!bonjour) return resolve();
    bonjour.unpublishAll(() => {
      bonjour?.destroy();
      bonjour = null;
      published = null;
      resolve();
    });
  });
}

export interface DiscoveredAgent {
  name: string;
  host: string; // first reachable address
  port: number;
  machineId: string | null;
  os: string | null;
  scheme: string;
}

/**
 * Browse the LAN for AI Control Center agents for `timeoutMs`, returning what was found.
 * Used for discovery verification and could back a CLI; the Surface uses its own native
 * mDNS browser, but both consume the same advertised service.
 */
export function browseAgents(timeoutMs = 3000): Promise<DiscoveredAgent[]> {
  return new Promise((resolve) => {
    const b = new Bonjour();
    const found: DiscoveredAgent[] = [];
    const browser = b.find({ type: MDNS_TYPE }, (svc: Service) => {
      const txt = (svc.txt ?? {}) as Record<string, string>;
      const host = svc.referer?.address ?? svc.addresses?.[0] ?? svc.host;
      found.push({
        name: svc.name,
        host,
        port: svc.port,
        machineId: txt.machineId ?? null,
        os: txt.os ?? null,
        scheme: txt.scheme ?? "http",
      });
    });
    setTimeout(() => {
      browser.stop();
      b.destroy();
      resolve(found);
    }, timeoutMs);
  });
}
