import { useApp } from "../state/AppState";
import {
  Bar,
  Card,
  Stat,
  fmtBytes,
  fmtDuration,
  fmtPercent,
  Provenance,
} from "../components/ui";
import { LineChart, CHART_COLORS } from "../components/charts";
import { EmptyState } from "../components/EmptyState";

export function System() {
  const { snapshot, history } = useApp();
  const sys = snapshot?.system ?? null;
  const glances = snapshot?.collectors.find((c) => c.name === "glances");

  if (!sys) {
    return (
      <EmptyState
        kind="not-available"
        title="System telemetry not available"
        detail={
          glances?.detail ??
          "Glances is not reachable on this machine. Start it with 'glances -w' (binds 127.0.0.1)."
        }
      />
    );
  }

  return (
    <div className="grid">
      <Card
        title="CPU"
        right={<Provenance source="glances" quality="OFFICIAL_LOCAL" />}
      >
        <Stat label="Usage" value={fmtPercent(sys.cpuPercent)} />
        <Bar percent={sys.cpuPercent} />
        <Stat
          label="Temperature"
          value={
            sys.cpuTemperature === null
              ? "Not available"
              : `${sys.cpuTemperature}°C`
          }
        />
      </Card>

      <Card
        title="Memory"
        right={<Provenance source="glances" quality="OFFICIAL_LOCAL" />}
      >
        <Stat
          label="RAM"
          value={`${fmtBytes(sys.ramUsed)} / ${fmtBytes(sys.ramTotal)}`}
          sub={fmtPercent(sys.ramPercent)}
        />
        <Bar percent={sys.ramPercent} />
      </Card>

      <Card
        title="GPU"
        right={<Provenance source="glances" quality="OFFICIAL_LOCAL" />}
      >
        {sys.gpuName === null ? (
          <p className="muted">No discrete GPU reported — Not available</p>
        ) : (
          <>
            <Stat label={sys.gpuName} value={fmtPercent(sys.gpuPercent)} />
            <Bar percent={sys.gpuPercent} />
            <Stat
              label="VRAM"
              value={`${fmtBytes(sys.vramUsed)} / ${fmtBytes(sys.vramTotal)}`}
            />
            <Stat
              label="Temperature"
              value={
                sys.gpuTemperature === null
                  ? "Not available"
                  : `${sys.gpuTemperature}°C`
              }
            />
          </>
        )}
      </Card>

      <Card
        title="Disk & Network"
        right={<Provenance source="glances" quality="OFFICIAL_LOCAL" />}
      >
        <Stat
          label="Disk"
          value={`${fmtBytes(sys.diskUsed)} / ${fmtBytes(sys.diskTotal)}`}
        />
        <Stat
          label="Network ↓ / ↑"
          value={`${fmtBytes(sys.networkRx)}·s / ${fmtBytes(sys.networkTx)}·s`}
        />
        <Stat label="Uptime" value={fmtDuration(sys.uptime)} />
      </Card>

      <div className="card card--wide">
        <div className="card__head">
          <h3 className="card__title">History (recent)</h3>
          <span className="muted">
            {history.length} sample{history.length === 1 ? "" : "s"} stored ·
            CPU% &amp; RAM%
          </span>
        </div>
        {history.length < 2 ? (
          <p className="muted">
            Collecting samples… a line appears once enough history is stored.
          </p>
        ) : (
          <div className="hist">
            <div className="hist__row">
              <span className="hist__label" style={{ color: CHART_COLORS[0] }}>
                CPU
              </span>
              <LineChart
                values={history.map((h) => h.cpuPercent)}
                height={90}
                yMax={100}
                color={CHART_COLORS[0]}
              />
            </div>
            <div className="hist__row">
              <span className="hist__label" style={{ color: CHART_COLORS[1] }}>
                RAM
              </span>
              <LineChart
                values={history.map((h) => h.ramPercent)}
                height={90}
                yMax={100}
                color={CHART_COLORS[1]}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
