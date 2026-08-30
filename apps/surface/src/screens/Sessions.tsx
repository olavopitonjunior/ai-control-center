import { useMemo, useState } from "react";
import { useApp } from "../state/appContext";
import {
  Card,
  Provenance,
  Stat,
  fmtClock,
  fmtCompact,
  fmtDuration,
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
        <Stat label="Duration" value={fmtDuration(s.durationSeconds)} />
      </div>
      <div className="limit-row">
        <Stat label="Started" value={fmtClock(s.startedAt)} />
        <Stat label="Last activity" value={fmtClock(s.lastActivityAt)} />
      </div>
      <div className="muted">
        <Provenance source="ccusage" quality="CALCULATED" /> status derived from
        activity recency
      </div>
    </Card>
  );
}

/** A labelled <select> filter; "all" clears it. */
function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="machine-selector">
      <span className="machine-selector__label">{label}</span>
      <select
        className="machine-selector__select filter__select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {AGENT_LABEL[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Sessions() {
  const { snapshot } = useApp();
  const sessions = useMemo(() => snapshot?.sessions ?? [], [snapshot]);
  const ccusage = snapshot?.collectors.find((c) => c.name === "ccusage");

  const [agent, setAgent] = useState("all");
  const [project, setProject] = useState("all");
  const [model, setModel] = useState("all");
  const [day, setDay] = useState("all");

  const uniq = (xs: (string | null)[]) =>
    [...new Set(xs.filter((x): x is string => !!x))].sort();
  const agents = uniq(sessions.map((s) => s.agent));
  const projects = uniq(sessions.map((s) => s.projectName));
  const models = uniq(sessions.map((s) => s.model));
  const days = uniq(
    sessions.map(
      (s) => (s.lastActivityAt ?? s.startedAt)?.slice(0, 10) ?? null,
    ),
  );

  const filtered = sessions.filter((s) => {
    if (agent !== "all" && s.agent !== agent) return false;
    if (project !== "all" && s.projectName !== project) return false;
    if (model !== "all" && s.model !== model) return false;
    if (
      day !== "all" &&
      (s.lastActivityAt ?? s.startedAt)?.slice(0, 10) !== day
    )
      return false;
    return true;
  });

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

  const active = filtered.filter((s) => s.status === "ACTIVE");
  const idle = filtered.filter((s) => s.status === "IDLE");
  const history = filtered.filter(
    (s) => s.status === "ENDED" || s.status === "UNKNOWN",
  );

  const groups: [string, AISession[]][] = [
    ["Active", active],
    ["Idle", idle],
    ["History", history],
  ];

  return (
    <div className="stack">
      <div className="filters">
        <Filter
          label="Agent"
          value={agent}
          options={agents}
          onChange={setAgent}
        />
        <Filter
          label="Project"
          value={project}
          options={projects}
          onChange={setProject}
        />
        <Filter
          label="Model"
          value={model}
          options={models}
          onChange={setModel}
        />
        <Filter label="Date" value={day} options={days} onChange={setDay} />
        <span className="muted">
          {filtered.length} of {sessions.length} session(s)
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No sessions match these filters.</p>
      ) : (
        groups
          .filter(([, list]) => list.length > 0)
          .map(([title, list]) => (
            <section key={title}>
              <h2 className="section-title">
                {title} ({list.length})
              </h2>
              <div className="grid">
                {list.map((s) => (
                  <SessionCard key={s.id} s={s} />
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
