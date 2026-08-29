import { z } from "zod";
import {
  ConnectionType,
  IsoTimestamp,
  MachineStatus,
  OperatingSystem,
} from "./common";

/**
 * A machine the Surface monitors (e.g. OLAVO-PC, MACBOOK-PRO). The Surface holds
 * one record per registered agent. Fields that an agent cannot determine are
 * nullable — never fabricated.
 */
export const MachineSchema = z.object({
  id: z.string().min(1),
  hostname: z.string().min(1),
  displayName: z.string().min(1),
  os: OperatingSystem,
  osVersion: z.string().nullable(),
  architecture: z.string().nullable(),
  agentVersion: z.string().nullable(),
  ipAddresses: z.array(z.string()).default([]),
  connectionType: ConnectionType.default("unknown"),
  lastSeen: IsoTimestamp.nullable(),
  status: MachineStatus,
});
export type Machine = z.infer<typeof MachineSchema>;

/** A single heartbeat observation, persisted by the Surface for uptime history. */
export const MachineHeartbeatSchema = z.object({
  machineId: z.string().min(1),
  observedAt: IsoTimestamp,
  status: MachineStatus,
  agentVersion: z.string().nullable(),
});
export type MachineHeartbeat = z.infer<typeof MachineHeartbeatSchema>;
