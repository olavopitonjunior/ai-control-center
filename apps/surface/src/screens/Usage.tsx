import { useEffect, useState } from "react";
import type { UsageGranularity, UsageReport } from "@acc/protocol";
import { useApp } from "../state/appContext";
import { fetchUsage } from "../data/protocolClient";
import { exportUsageCsv, exportUsageJson } from "../data/export";
import { BarChart, Donut } from "../components/charts";
import {
  Card,
  Provenance,
  Stat,
  fmtCompact,
  fmtInt,
  fmtUSD,
} from "../components/ui";
import { EmptyState } from "../components/EmptyState";

const GRANULARITIES: UsageGranularity[] = ["daily", "weekly", "monthly"];

function ratio(a: number | null, b: number | null): string {
  if (a === null || b === null || b === 0) return "—";
  return `${(a / b).toFixed(2)}×`;
}

/** Short label for a period key (2026-08-28 -> 08-28, 2026-08 -> 2026-08). */
function periodLabel(p: string): string {
  return p.length === 10 ? p.slice(5) : p;
}

export function Usage() {
  const { selected, snapshot } = useApp();
  const [granularity, setGranularity] = useState<UsageGranularity>("daily");
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUsage(selected, granularity)
      .then((r) => !cancelled && setReport(r))
      .catch(
        (e) =>
          !cancelled && setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected, granularity]);

  const selector = (
    <div className="seg">
      {GRANULARITIES.map((g) => (
        <button
          key={g}
          className={`seg__btn${granularity === g ? " seg__btn--active" : ""}`}
          onClick={() => setGranularity(g)}
        >
          {g}
        </button>
      ))}
    </div>
  );

  if (error) {
    return (
      <>
        {selector}
        <EmptyState
          kind="not-available"
          title="Usage unavailable"
          detail={error}
        />
      </>
    );
  }
  if (!report || report.points.length === 0) {
    return (
      <>
        {selector}
        <EmptyState
          kind={loading ? "waiting" : "not-available"}
          title={loading ? "Loading usage…" : "No usage in this period"}
          detail="Token usage is read from ccusage. Try another period, or run some coding-agent sessions."
        />
      </>
    );
  }

  const t = report.totals.tokens;
  const cacheTotal = (t.cacheReadTokens ?? 0) + (t.cacheCreationTokens ?? 0);
  const cachePct = t.totalTokens
    ? Math.round((cacheTotal / t.totalTokens) * 100)
    : null;

  // Project breakdown (best-effort) from the live session list.
  const byProject = Object.entries(
    (snapshot?.sessions ?? []).reduce<Record<string, number>>((acc, s) => {
      const key = s.projectName ?? "unknown";
      acc[key] = (acc[key] ?? 0) + (s.tokens?.totalTokens ?? 0);
      return acc;
    }, {}),
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div className="stack">
      <div className="usage-head">
        {selector}
        <div className="usage-head__actions">
          <button className="btn" onClick={() => exportUsageCsv(report)}>
            Export CSV
          </button>
          <button className="btn" onClick={() => exportUsageJson(report)}>
            Export JSON
          </button>
          <Provenance source="ccusage" quality="CALCULATED" />
        </div>
      </div>

      <div className="grid">
        <Card title={`Tokens by ${granularity.replace("ly", "")}`}>
          <BarChart
            data={report.points.map((p) => ({
              label: periodLabel(p.period),
              value: p.tokens.totalTokens ?? 0,
            }))}
            format={(n) => fmtCompact(n)}
          />
        </Card>
        <Card title={`Cost by ${granularity.replace("ly", "")}`}>
          <BarChart
            data={report.points.map((p) => ({
              label: periodLabel(p.period),
              value: p.cost ?? 0,
            }))}
            format={(n) => fmtUSD(n)}
          />
        </Card>
        <Card title="Tokens by model">
          <Donut
            data={report.byModel
              .slice(0, 6)
              .map((m) => ({ label: m.key, value: m.tokens.totalTokens ?? 0 }))}
            format={(n) => fmtCompact(n)}
          />
        </Card>
        <Card title="Tokens by agent">
          <Donut
            data={report.byAgent.map((a) => ({
              label: a.key,
              value: a.tokens.totalTokens ?? 0,
            }))}
            format={(n) => fmtCompact(n)}
          />
        </Card>
        <Card
          title="Tokens by project"
          right={<Provenance source="ccusage" quality="ESTIMATED" />}
        >
          {byProject.length === 0 ? (
            <p className="muted">
              Project attribution needs active sessions — Not available.
            </p>
          ) : (
            <Donut data={byProject} format={(n) => fmtCompact(n)} />
          )}
        </Card>

        <Card title="Token composition (total)">
          <div className="limit-row">
            <Stat label="Input" value={fmtInt(t.inputTokens)} />
            <Stat label="Output" value={fmtInt(t.outputTokens)} />
          </div>
          <div className="limit-row">
            <Stat label="Cache read" value={fmtInt(t.cacheReadTokens)} />
            <Stat label="Cache write" value={fmtInt(t.cacheCreationTokens)} />
          </div>
          <div className="limit-row">
            <Stat
              label="Cache util"
              value={cachePct === null ? "—" : `${cachePct}%`}
            />
            <Stat label="Out:In" value={ratio(t.outputTokens, t.inputTokens)} />
          </div>
          <Stat label="Total cost" value={fmtUSD(report.totals.cost)} />
        </Card>
      </div>
    </div>
  );
}
