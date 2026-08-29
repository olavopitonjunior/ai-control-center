import { useState } from "react";
import type { DiscoveredAgent } from "@acc/protocol";
import { useApp } from "../state/AppState";
import { useSettings } from "../data/settings";
import { fetchDiscover } from "../data/protocolClient";
import { Card } from "../components/ui";

export function Settings() {
  const { machines, selected, addMachine, removeMachine } = useApp();
  const [settings, updateSettings] = useSettings();
  const [discovered, setDiscovered] = useState<DiscoveredAgent[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverErr, setDiscoverErr] = useState<string | null>(null);

  async function discover() {
    if (!selected) {
      setDiscoverErr(
        "Add and select one machine first — discovery runs through a reachable agent.",
      );
      return;
    }
    setDiscovering(true);
    setDiscoverErr(null);
    setDiscovered(null);
    try {
      const agents = await fetchDiscover(selected);
      const known = new Set(machines.map((m) => m.address));
      setDiscovered(agents.filter((a) => !known.has(`${a.host}:${a.port}`)));
    } catch (e) {
      setDiscoverErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscovering(false);
    }
  }

  async function addDiscovered(a: DiscoveredAgent) {
    const scheme = a.scheme === "https" ? "https://" : "";
    await addMachine({
      displayName: a.name || a.machineId || a.host,
      address: `${scheme}${a.host}:${a.port}`,
      token: null,
    });
    setDiscovered((d) => (d ? d.filter((x) => x !== a) : d));
  }
  const [displayName, setName] = useState("");
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!displayName.trim() || !address.trim()) {
      setErr("Name and address are required.");
      return;
    }
    setBusy(true);
    try {
      await addMachine({
        displayName: displayName.trim(),
        address: address.trim(),
        token: token.trim() || null,
      });
      setName("");
      setAddress("");
      setToken("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  async function addLocalhost() {
    await addMachine({
      displayName: "This PC (local agent)",
      address: "127.0.0.1:47600",
      token: null,
    });
  }

  return (
    <div className="grid">
      <Card title="Add a machine">
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Name</span>
            <input
              value={displayName}
              onChange={(e) => setName(e.target.value)}
              placeholder="OLAVO-PC"
            />
          </label>
          <label className="field">
            <span>Address (host:port)</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="192.168.0.20:47600"
            />
          </label>
          <label className="field">
            <span>Pairing token (optional for a local agent)</span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste token"
              type="password"
            />
          </label>
          {err && <p className="form__err">{err}</p>}
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Adding…" : "Add machine"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void addLocalhost()}
            >
              Add this PC (127.0.0.1:47600)
            </button>
          </div>
        </form>
      </Card>

      <Card title="Discover on network (mDNS)">
        <p className="muted">
          Browses the LAN for AI Control Center agents advertising{" "}
          <span className="mono">_ai-control._tcp</span>, via the currently
          selected machine's agent. Add the first machine manually, then
          discover the rest.
        </p>
        <div className="form__actions">
          <button
            className="btn"
            onClick={() => void discover()}
            disabled={discovering}
          >
            {discovering ? "Discovering…" : "Discover machines"}
          </button>
        </div>
        {discoverErr && <p className="form__err">{discoverErr}</p>}
        {discovered && discovered.length === 0 && (
          <p className="muted">No new machines found.</p>
        )}
        {discovered && discovered.length > 0 && (
          <ul className="machine-list">
            {discovered.map((a) => (
              <li key={`${a.host}:${a.port}`} className="machine-list__item">
                <div>
                  <div className="machine-list__name">
                    {a.name || a.machineId}
                  </div>
                  <div className="machine-list__addr mono">
                    {a.host}:{a.port} · {a.os ?? "?"} · {a.scheme}
                  </div>
                </div>
                <button
                  className="btn btn--primary"
                  onClick={() => void addDiscovered(a)}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Quota ceilings (optional)">
        <p className="muted">
          Local coding-agent logs don't expose your plan's quota ceiling. Enter
          it to see a percentage and an <b>ESTIMATED</b> exhaustion forecast for
          the Claude 5-hour window. Leave blank to keep percentages honest as
          "Not available".
        </p>
        <label className="field">
          <span>Claude 5-hour token ceiling</span>
          <input
            type="number"
            min={0}
            value={settings.claude5hCeilingTokens ?? ""}
            onChange={(e) =>
              updateSettings({
                claude5hCeilingTokens:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="e.g. 20000000"
          />
        </label>
      </Card>

      <Card title={`Registered machines (${machines.length})`}>
        {machines.length === 0 ? (
          <p className="muted">No machines yet. Add one above.</p>
        ) : (
          <ul className="machine-list">
            {machines.map((m) => (
              <li key={m.id} className="machine-list__item">
                <div>
                  <div className="machine-list__name">{m.displayName}</div>
                  <div className="machine-list__addr mono">
                    {m.address} {m.token ? "· token set" : "· no token"}
                  </div>
                </div>
                <button
                  className="btn btn--danger"
                  onClick={() => void removeMachine(m.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
