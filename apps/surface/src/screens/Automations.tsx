import { useApp } from "../state/AppState";
import { fmtClock } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import type { AutomationSource, ScheduledTask } from "@acc/protocol";

const SOURCE_LABEL: Record<AutomationSource, string> = {
  "windows-task-scheduler": "Task Scheduler",
  cron: "cron",
  launchd: "launchd",
  systemd: "systemd",
  docker: "docker",
  n8n: "n8n",
  "github-actions": "GitHub Actions",
  vercel: "Vercel",
  supabase: "Supabase",
};

const CLOUD_SOURCES = new Set<AutomationSource>([
  "n8n",
  "github-actions",
  "vercel",
  "supabase",
]);

function Row({ t }: { t: ScheduledTask }) {
  return (
    <div className="auto-row" data-status={t.status.toLowerCase()}>
      <span className="auto-row__dot" />
      <div className="auto-row__main">
        <div className="auto-row__name">
          {t.name}
          <span className="src-tag" data-cloud={CLOUD_SOURCES.has(t.source)}>
            {SOURCE_LABEL[t.source]}
          </span>
        </div>
        {t.description && (
          <div className="auto-row__desc muted">{t.description}</div>
        )}
      </div>
      <div className="auto-row__meta">
        <div>
          {t.nextRunAt ? `next ${fmtClock(t.nextRunAt)}` : "no next run"}
        </div>
        <div className="muted">
          {t.lastRunAt ? `last ${fmtClock(t.lastRunAt)}` : "never run"} ·{" "}
          {t.lastResult ?? "—"}
        </div>
      </div>
      <span className="auto-row__status">{t.status}</span>
    </div>
  );
}

export function Automations() {
  const { snapshot } = useApp();
  const tasks = snapshot?.automations ?? [];
  const collector = snapshot?.collectors.find((c) => c.name === "automations");

  if (tasks.length === 0) {
    return (
      <EmptyState
        kind={collector?.health === "HEALTHY" ? "waiting" : "not-configured"}
        title="No automations to show"
        detail={
          collector?.detail ??
          "No scheduled tasks were found on the selected machine."
        }
      />
    );
  }

  const failed = tasks.filter((t) => t.status === "ERROR");
  const running = tasks.filter((t) => t.status === "RUNNING");
  const upcoming = tasks
    .filter((t) => t.status === "SCHEDULED" && t.nextRunAt)
    .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!));
  const other = tasks.filter(
    (t) => !failed.includes(t) && !running.includes(t) && !upcoming.includes(t),
  );

  const groups: [string, ScheduledTask[]][] = [
    ["Running", running],
    ["Failed", failed],
    ["Upcoming", upcoming],
    ["Other", other],
  ];

  return (
    <div className="stack">
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([title, list]) => (
          <section key={title}>
            <h2 className="section-title">
              {title} ({list.length})
            </h2>
            <div className="auto-list">
              {list.map((t) => (
                <Row key={t.id} t={t} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
