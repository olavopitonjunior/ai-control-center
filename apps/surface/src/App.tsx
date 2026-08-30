import { useState } from "react";
import { SECTIONS, type SectionId } from "./nav";
import { Screen } from "./screens/Screens";
import { RUNTIME_LABEL } from "./env";
import { AppProvider } from "./state/AppState";
import { useApp } from "./state/appContext";
import { fmtClock } from "./components/ui";

const STATUS_LABEL: Record<string, string> = {
  PAIRING: "PAIRING",
  ONLINE: "ONLINE",
  DEGRADED: "DEGRADED",
  OFFLINE: "OFFLINE",
};

function Shell() {
  const [active, setActive] = useState<SectionId>("overview");
  const {
    machines,
    selected,
    select,
    connection,
    lastUpdated,
    lastError,
    snapshot,
  } = useApp();
  const connType = snapshot?.machine.connectionType;
  const CONN_ICON: Record<string, string> = {
    wifi: "Wi-Fi",
    ethernet: "Ethernet",
    usb4: "USB4",
    unknown: "",
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo" aria-hidden>
            ◧
          </span>
          <span className="topbar__name">AI Control Center</span>
        </div>

        <div className="topbar__machine">
          <label className="machine-selector">
            <span className="machine-selector__label">Machine</span>
            <select
              className="machine-selector__select"
              disabled={machines.length === 0}
              value={selected?.id ?? ""}
              onChange={(e) => select(e.target.value)}
            >
              {machines.length === 0 ? (
                <option value="">No machines — add one in Settings</option>
              ) : (
                machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))
              )}
            </select>
          </label>

          <span
            className="status-pill"
            data-status={selected ? connection.toLowerCase() : "none"}
            title={lastError ?? undefined}
          >
            <span className="status-pill__dot" aria-hidden />
            {selected ? STATUS_LABEL[connection] : "NO MACHINE"}
          </span>
          {selected && connType && connType !== "unknown" && (
            <span className="conn-badge">{CONN_ICON[connType]}</span>
          )}
        </div>
      </header>

      <div className="body">
        <nav className="sidebar" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`nav-item${active === s.id ? " nav-item--active" : ""}`}
              aria-current={active === s.id ? "page" : undefined}
              onClick={() => setActive(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <main className="main">
          <Screen id={active} />
        </main>
      </div>

      <footer className="statusbar">
        <span>Local-first · no cloud · no telemetry</span>
        <span className="statusbar__runtime">
          {lastUpdated ? `Updated ${fmtClock(lastUpdated)}` : "—"} ·{" "}
          {RUNTIME_LABEL}
        </span>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
