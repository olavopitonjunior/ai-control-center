import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Snapshot, SystemMetric } from "@acc/protocol";
import { getStore } from "../data/store";
import { fetchSnapshot } from "../data/protocolClient";
import { deriveConnection, type Connection } from "../data/connection";
import type { MachineInput, MachineRecord } from "../data/types";

export type { Connection };

const POLL_MS = 4000;
const OFFLINE_AFTER_MS = 15000; // no successful poll within this -> OFFLINE

// Guards against overlapping retention sweeps across component instances/effect re-runs.
let retentionInFlight = false;

interface AppState {
  machines: MachineRecord[];
  selected: MachineRecord | null;
  select: (id: string) => void;
  addMachine: (input: MachineInput) => Promise<void>;
  removeMachine: (id: string) => Promise<void>;

  snapshot: Snapshot | null;
  connection: Connection;
  lastError: string | null;
  lastUpdated: string | null;
  history: SystemMetric[];
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [machines, setMachines] = useState<MachineRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<Connection>("PAIRING");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [history, setHistory] = useState<SystemMetric[]>([]);
  const lastSuccessRef = useRef<number>(0);

  const reload = useCallback(async () => {
    try {
      const store = await getStore();
      const list = await store.listMachines();
      setMachines(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch (e) {
      console.error("failed to load machines from store", e);
      throw e;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Retention/downsampling job: on startup and every 5 minutes, roll raw metrics
  // older than 24h into 1-minute rollups and prune — bounding DB growth (spec §42).
  useEffect(() => {
    let cancelled = false;
    async function sweep() {
      if (retentionInFlight) return; // never overlap sweeps (guards StrictMode double-invoke)
      retentionInFlight = true;
      try {
        const store = await getStore();
        const res = await store.runRetention(Date.now());
        if (!cancelled && (res.rolledUp || res.prunedRaw)) {
          console.info(
            `retention: rolled up ${res.rolledUp}, pruned ${res.prunedRaw} raw`,
          );
        }
      } catch (e) {
        console.error("retention sweep failed", e);
      } finally {
        retentionInFlight = false;
      }
    }
    void sweep();
    const timer = setInterval(() => void sweep(), 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const selected = useMemo(
    () => machines.find((m) => m.id === selectedId) ?? null,
    [machines, selectedId],
  );

  const addMachine = useCallback(
    async (input: MachineInput) => {
      const store = await getStore();
      const rec = await store.addMachine(input);
      await reload();
      setSelectedId(rec.id);
    },
    [reload],
  );

  const removeMachine = useCallback(
    async (id: string) => {
      const store = await getStore();
      await store.removeMachine(id);
      setSelectedId((prev) => (prev === id ? null : prev));
      await reload();
    },
    [reload],
  );

  // Reset live state whenever the selected machine changes.
  useEffect(() => {
    setSnapshot(null);
    setConnection("PAIRING");
    setLastError(null);
    setLastUpdated(null);
    setHistory([]);
    lastSuccessRef.current = 0;
  }, [selectedId]);

  // Poll the selected machine's agent, validate, persist, and update connection state.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;

    async function poll(machine: MachineRecord) {
      try {
        const snap = await fetchSnapshot(machine);
        if (cancelled) return;
        lastSuccessRef.current = Date.now();
        setSnapshot(snap);
        setConnection((prev) =>
          deriveConnection({
            success: true,
            snapshotStatus: snap.machine.status,
            everSucceeded: true,
            msSinceLastSuccess: 0,
            offlineAfterMs: OFFLINE_AFTER_MS,
            previous: prev,
          }),
        );
        setLastError(null);
        setLastUpdated(snap.generatedAt);
        const store = await getStore();
        if (snap.system) {
          await store.recordSystemMetric(machine.id, snap.system);
          const recent = await store.recentSystemMetrics(machine.id, 120);
          if (!cancelled) setHistory(recent);
        }
      } catch (err) {
        if (cancelled) return;
        setLastError(err instanceof Error ? err.message : String(err));
        setConnection((prev) =>
          deriveConnection({
            success: false,
            everSucceeded: lastSuccessRef.current !== 0,
            msSinceLastSuccess:
              lastSuccessRef.current === 0
                ? Infinity
                : Date.now() - lastSuccessRef.current,
            offlineAfterMs: OFFLINE_AFTER_MS,
            previous: prev,
          }),
        );
      }
    }

    void poll(selected);
    const timer = setInterval(() => void poll(selected), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected]);

  const value: AppState = {
    machines,
    selected,
    select: setSelectedId,
    addMachine,
    removeMachine,
    snapshot,
    connection,
    lastError,
    lastUpdated,
    history,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
