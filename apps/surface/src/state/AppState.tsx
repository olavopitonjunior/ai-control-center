import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Snapshot, SystemMetric } from "@acc/protocol";
import { AppCtx, type AppState } from "./appContext";
import { getStore } from "../data/store";
import { fetchSnapshot } from "../data/protocolClient";
import { deriveConnection, type Connection } from "../data/connection";
import { usePowerMode } from "../data/power";
import type { MachineInput, MachineRecord } from "../data/types";

export type { Connection };

// No successful poll within this window -> OFFLINE. Must exceed the snapshot request
// timeout (25s), otherwise a single slow-but-healthy agent would be declared OFFLINE
// while its request is still in flight.
const OFFLINE_AFTER_MS = 35000;

// Guards against overlapping retention sweeps across component instances/effect re-runs.
let retentionInFlight = false;

export function AppProvider({ children }: { children: ReactNode }) {
  const [machines, setMachines] = useState<MachineRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<Connection>("PAIRING");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [history, setHistory] = useState<SystemMetric[]>([]);
  const lastSuccessRef = useRef<number>(0);
  // Battery awareness (spec §57): power mode changes cadence only, never semantics.
  const { profile } = usePowerMode();

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
    const timer = setInterval(() => void sweep(), profile.retentionMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [profile.retentionMs]);

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

  const updateMachine = useCallback(
    async (id: string, input: MachineInput) => {
      const store = await getStore();
      await store.updateMachine(id, input);
      await reload();
      // Reset live state so the next poll re-evaluates with the new address/token.
      lastSuccessRef.current = 0;
      setConnection("PAIRING");
      setSnapshot(null);
      setLastError(null);
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
    // A snapshot can take several seconds (cold ccusage). Without this guard, polls
    // overlap and queue up against a slow agent, compounding the delay.
    let inFlight = false;

    async function poll(machine: MachineRecord) {
      if (inFlight) return;
      inFlight = true;
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
        if (snap.system)
          await store.recordSystemMetric(machine.id, snap.system);
        // Persist the rest of the normalized snapshot (providers/limits/tokens/cost/
        // sessions/tasks/collector health) — unchanged payloads are skipped (spec §41/§42).
        await store.ingestSnapshot(machine.id, snap);
        if (snap.system) {
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
      } finally {
        inFlight = false;
      }
    }

    void poll(selected);
    const timer = setInterval(() => void poll(selected), profile.pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected, profile.pollMs]);

  const value: AppState = {
    machines,
    selected,
    select: setSelectedId,
    addMachine,
    updateMachine,
    removeMachine,
    snapshot,
    connection,
    lastError,
    lastUpdated,
    history,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
