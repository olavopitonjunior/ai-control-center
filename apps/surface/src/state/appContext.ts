import { createContext, useContext } from "react";
import type { Snapshot, SystemMetric } from "@acc/protocol";
import type { Connection } from "../data/connection";
import type { MachineInput, MachineRecord } from "../data/types";

/**
 * Context + hook live in their OWN module, separate from the provider component.
 *
 * React Fast Refresh requires a file to export only components; a file exporting both
 * `AppProvider` and `useApp` gets invalidated on edit ("Could not Fast Refresh"), which
 * tears down the render tree and leaves a blank window during development. Splitting
 * them keeps hot reload working.
 */
export interface AppState {
  machines: MachineRecord[];
  selected: MachineRecord | null;
  select: (id: string) => void;
  addMachine: (input: MachineInput) => Promise<void>;
  updateMachine: (id: string, input: MachineInput) => Promise<void>;
  removeMachine: (id: string) => Promise<void>;

  snapshot: Snapshot | null;
  connection: Connection;
  lastError: string | null;
  lastUpdated: string | null;
  history: SystemMetric[];
}

export const AppCtx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
