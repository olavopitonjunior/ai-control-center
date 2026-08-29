import { useApp } from "../state/AppState";
import {
  Bar,
  Card,
  Countdown,
  Provenance,
  Stat,
  fmtClock,
  fmtCompact,
  fmtPercent,
  fmtUSD,
} from "../components/ui";
import { EmptyState } from "../components/EmptyState";

export function Overview() {
  const { snapshot, connection } = useApp();
  if (!snapshot) {
    return (
      <EmptyState
        kind={connection === "OFFLINE" ? "not-available" : "waiting"}
        title={
          connection === "OFFLINE" ? "Machine offline" : "Connecting to agent…"
        }
        detail={
          connection === "OFFLINE"
            ? "No heartbeat from the agent. Check it is running and reachable."
            : "Waiting for the first snapshot from the agent."
        }
      />
    );
  }

  const claude = snapshot.providers.find((p) => p.provider === "Claude");
  const fiveHour = claude?.limits.find((l) => l.label === "5-hour") ?? null;
  const active = snapshot.sessions.filter((s) => s.status === "ACTIVE");
  const byAgent = active.reduce<Record<string, number>>((acc, s) => {
    acc[s.agent] = (acc[s.agent] ?? 0) + 1;
    return acc;
  }, {});
  const sys = snapshot.system;
  const nextAuto = snapshot.automations
    .filter((t) => t.status === "SCHEDULED" && t.nextRunAt)
    .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))[0];

  return (
    <div className="grid">
      <Card title="Active agents">
        {active.length === 0 ? (
          <p className="muted">No active AI sessions right now.</p>
        ) : (
          <div className="chips">
            {Object.entries(byAgent).map(([agent, n]) => (
              <span key={agent} className="chip">
                {agent}: <b>{n}</b>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Claude · 5-hour window"
        right={
          fiveHour && (
            <Provenance
              source={fiveHour.source}
              quality={fiveHour.sourceQuality}
            />
          )
        }
      >
        {fiveHour ? (
          <>
            <Bar percent={fiveHour.usedPercent} />
            <div className="limit-row">
              <Stat
                label="Used"
                value={`${fmtCompact(fiveHour.used)} tokens`}
              />
              <Stat
                label="Resets in"
                value={<Countdown resetAt={fiveHour.resetAt} />}
              />
            </div>
          </>
        ) : (
          <p className="muted">No active window.</p>
        )}
      </Card>

      <Card
        title="Today"
        right={
          claude?.cost && <Provenance source="ccusage" quality="CALCULATED" />
        }
      >
        <div className="limit-row">
          <Stat
            label="Tokens"
            value={fmtCompact(claude?.tokens?.totalTokens ?? null)}
          />
          <Stat label="Cost" value={fmtUSD(claude?.cost?.amount ?? null)} />
        </div>
        <Stat label="Sessions" value={snapshot.sessions.length} />
      </Card>

      <Card
        title="System"
        right={sys && <Provenance source="glances" quality="OFFICIAL_LOCAL" />}
      >
        {sys ? (
          <>
            <Stat label="CPU" value={fmtPercent(sys.cpuPercent)} />
            <Bar percent={sys.cpuPercent} />
            <Stat label="RAM" value={fmtPercent(sys.ramPercent)} />
            <Bar percent={sys.ramPercent} />
            <Stat label="GPU" value={sys.gpuName ?? "Not available"} />
          </>
        ) : (
          <p className="muted">System telemetry not available.</p>
        )}
      </Card>

      <Card title="Next automation">
        {nextAuto ? (
          <>
            <div className="stat__value">{nextAuto.name}</div>
            <Stat
              label="Runs at"
              value={fmtClock(nextAuto.nextRunAt)}
              sub={<Countdown resetAt={nextAuto.nextRunAt} />}
            />
          </>
        ) : (
          <p className="muted">No upcoming scheduled tasks.</p>
        )}
      </Card>
    </div>
  );
}
