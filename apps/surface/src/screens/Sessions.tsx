import { useApp } from "../state/AppState";
import {
  Card,
  Provenance,
  Stat,
  fmtClock,
  fmtCompact,
  fmtUSD,
} from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import type { AISession } from "@acc/protocol";

const AGENT_LABEL: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  opencode: "OpenCode",
  ollama: "Ollama",
  other: "Other",
};

function SessionCard({ s }: { s: AISession }) {
  return (
    <Card
      title={AGENT_LABEL[s.agent] ?? s.agent}
      right={
        <span className="pill" data-status={s.status.toLowerCase()}>
          {s.status}
        </span>
      }
    >
      <Stat label="Project" value={s.projectName ?? "—"} />
      <div className="limit-row">
        <Stat label="Model" value={s.model ?? "—"} />
        <Stat
          label="Tokens"
          value={fmtCompact(s.tokens?.totalTokens ?? null)}
        />
      </div>
      <div className="limit-row">
        <Stat label="Cost" value={fmtUSD(s.cost?.amount ?? null)} />
        <Stat label="Last activity" value={fmtClock(s.lastActivityAt)} />
      </div>
      <div className="muted">
        <Provenance source="ccusage" quality="CALCULATED" /> status derived from
        activity recency
      </div>
    </Card>
  );
}

export function Sessions() {
  const { snapshot } = useApp();
  const sessions = snapshot?.sessions ?? [];
  const ccusage = snapshot?.collectors.find((c) => c.name === "ccusage");

  if (sessions.length === 0) {
    return (
      <EmptyState
        kind={ccusage?.health === "HEALTHY" ? "waiting" : "not-configured"}
        title="No sessions detected"
        detail={
          ccusage?.detail ??
          "ccusage found no coding-agent sessions on the selected machine."
        }
      />
    );
  }

  const live = sessions.filter(
    (s) => s.status === "ACTIVE" || s.status === "IDLE",
  );
  const history = sessions.filter(
    (s) => s.status === "ENDED" || s.status === "UNKNOWN",
  );

  return (
    <div className="stack">
      <section>
        <h2 className="section-title">Active &amp; idle ({live.length})</h2>
        {live.length === 0 ? (
          <p className="muted">No active or idle sessions right now.</p>
        ) : (
          <div className="grid">
            {live.map((s) => (
              <SessionCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="section-title">History ({history.length})</h2>
        <div className="grid">
          {history.map((s) => (
            <SessionCard key={s.id} s={s} />
          ))}
        </div>
      </section>
    </div>
  );
}
