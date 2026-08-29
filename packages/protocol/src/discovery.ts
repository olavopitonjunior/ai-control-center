import { z } from "zod";

/**
 * An agent discovered on the local network via mDNS/DNS-SD. Carries only identity + how
 * to reach it — never a token. The Surface uses this to offer one-click "add machine".
 */
export const DiscoveredAgentSchema = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number().int(),
  machineId: z.string().nullable(),
  os: z.string().nullable(),
  scheme: z.string().default("http"),
});
export type DiscoveredAgent = z.infer<typeof DiscoveredAgentSchema>;

export const DiscoverResponseSchema = z.object({
  agents: z.array(DiscoveredAgentSchema).default([]),
});
export type DiscoverResponse = z.infer<typeof DiscoverResponseSchema>;
