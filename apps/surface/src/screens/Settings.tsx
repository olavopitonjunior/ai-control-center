import { useState } from "react";
import type { DiscoveredAgent } from "@acc/protocol";
import { useApp } from "../state/AppState";
import { useSettings } from "../data/settings";
import { useSurfaceMode } from "../data/surfaceMode";
import { usePowerMode } from "../data/power";
import { fetchDiscover, testConnection } from "../data/protocolClient";
import { getStore } from "../data/store";
import { validateAddress, validateToken } from "../data/validation";
import type { MachineRecord } from "../data/types";
import { Card } from "../components/ui";

export function Settings() {
  const { machines, selected, addMachine, updateMachine, removeMachine } =
    useApp();
  const [settings, updateSettings] = useSettings();
  const [surfaceMode, updateSurfaceMode] = useSurfaceMode();
  const {
    setting: powerSetting,
    setSetting: setPowerSetting,
    mode: powerMode,
    profile: powerProfile,
    charging,
    level,
  } = usePowerMode();
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  async function doBackup() {
    setBackingUp(true);
    setBackupMsg(null);
    try {
      const store = await getStore();
      const bundle = await store.exportBackup();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-control-center-backup-${bundle.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const rows = Object.values(bundle.tables).reduce(
        (n, t) => n + t.length,
        0,
      );
      setBackupMsg(
        `Exported ${rows} row(s) across ${Object.keys(bundle.tables).length} table(s).`,
      );
    } catch (e) {
      setBackupMsg(
        `Export failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBackingUp(false);
    }
  }
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
  /** Machine id being edited, or null when the form is in "add" mode. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const addrIssue = validateAddress(address);
  const tokenIssue = validateToken(token);
  const blocking =
    addrIssue?.level === "error" || tokenIssue?.level === "error";

  function resetForm() {
    setEditingId(null);
    setName("");
    setAddress("");
    setToken("");
    setErr(null);
    setTestMsg(null);
  }

  function startEdit(m: MachineRecord) {
    setEditingId(m.id);
    setName(m.displayName);
    setAddress(m.address);
    setToken(m.token ?? "");
    setErr(null);
    setTestMsg(null);
  }

  async function runTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const result = await testConnection({
        id: editingId ?? "probe",
        displayName: displayName.trim() || "probe",
        address: address.trim(),
        token: token.trim() || null,
      });
      setTestMsg(
        result.ok
          ? {
              ok: true,
              text: `Connected: ${result.hostname} (${result.os}), agent ${result.agentVersion}.`,
            }
          : { ok: false, text: result.detail },
      );
    } finally {
      setTesting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!displayName.trim() || !address.trim()) {
      setErr("Name and address are required.");
      return;
    }
    if (blocking) {
      setErr("Fix the highlighted problems first.");
      return;
    }
    setBusy(true);
    try {
      const input = {
        displayName: displayName.trim(),
        address: address.trim(),
        token: token.trim() || null,
      };
      if (editingId) await updateMachine(editingId, input);
      else await addMachine(input);
      resetForm();
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
      <Card title={editingId ? "Edit machine" : "Add a machine"}>
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
              placeholder="my-machine.local:47600"
            />
            {addrIssue && (
              <span className={`field__hint field__hint--${addrIssue.level}`}>
                {addrIssue.message}
              </span>
            )}
          </label>
          <label className="field">
            <span>Pairing token (leave blank for a local agent)</span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste the 43-character token"
              type="text"
              spellCheck={false}
              autoComplete="off"
            />
            {tokenIssue ? (
              <span className={`field__hint field__hint--${tokenIssue.level}`}>
                {tokenIssue.message}
              </span>
            ) : (
              token.trim() !== "" && (
                <span className="field__hint field__hint--ok">
                  Looks like a valid token ({token.trim().length} characters).
                </span>
              )
            )}
          </label>
          {err && <p className="form__err">{err}</p>}
          {testMsg && (
            <p
              className={
                testMsg.ok ? "field__hint field__hint--ok" : "form__err"
              }
            >
              {testMsg.text}
            </p>
          )}
          <div className="form__actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy || blocking}
            >
              {busy ? "Saving…" : editingId ? "Save changes" : "Add machine"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void runTest()}
              disabled={testing || !address.trim()}
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
            {editingId ? (
              <button type="button" className="btn" onClick={resetForm}>
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => void addLocalhost()}
              >
                Add this PC (127.0.0.1:47600)
              </button>
            )}
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

      <Card title="Surface Mode">
        <p className="muted">
          A dedicated control-center presentation: fullscreen with reduced
          chrome. Nothing here is on by default — the Surface is never forced to
          stay awake.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={surfaceMode.enabled}
            onChange={(e) => updateSurfaceMode({ enabled: e.target.checked })}
          />
          <span>Fullscreen Surface Mode</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={surfaceMode.preventSleep}
            disabled={!surfaceMode.enabled}
            onChange={(e) =>
              updateSurfaceMode({ preventSleep: e.target.checked })
            }
          />
          <span>Keep display awake (use while plugged in)</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={surfaceMode.autostart}
            onChange={(e) => updateSurfaceMode({ autostart: e.target.checked })}
          />
          <span>Launch at login</span>
        </label>
      </Card>

      <Card title="Power &amp; battery">
        <p className="muted">
          Changes refresh cadence only — never provider semantics or how values
          are labelled. Auto uses Low Power when on battery below 30%.
          {charging !== null && (
            <>
              {" "}
              Currently {charging ? "plugged in" : "on battery"}
              {level !== null ? ` (${Math.round(level * 100)}%)` : ""}.
            </>
          )}
        </p>
        <div className="seg">
          {(["auto", "performance", "balanced", "low-power"] as const).map(
            (m) => (
              <button
                key={m}
                className={`seg__btn${powerSetting === m ? " seg__btn--active" : ""}`}
                onClick={() => setPowerSetting(m)}
              >
                {m.replace("-", " ")}
              </button>
            ),
          )}
        </div>
        <p className="muted">
          Effective: <b>{powerMode}</b> · poll every{" "}
          {Math.round(powerProfile.pollMs / 1000)}s
        </p>
      </Card>

      <Card title="Backup">
        <p className="muted">
          Export the local history (machines, usage, limits, sessions, metrics,
          automations) as JSON. Pairing tokens are never included.
        </p>
        <div className="form__actions">
          <button
            className="btn"
            onClick={() => void doBackup()}
            disabled={backingUp}
          >
            {backingUp ? "Exporting…" : "Export backup (JSON)"}
          </button>
        </div>
        {backupMsg && <p className="muted">{backupMsg}</p>}
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
                <div className="machine-list__actions">
                  <button className="btn" onClick={() => startEdit(m)}>
                    Edit
                  </button>
                  <button
                    className="btn btn--danger"
                    onClick={() => void removeMachine(m.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
