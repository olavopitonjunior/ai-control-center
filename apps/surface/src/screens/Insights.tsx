import { useEffect, useState } from "react";
import type { UsageReport } from "@acc/protocol";
import { useApp } from "../state/appContext";
import { useSettings } from "../data/settings";
import { fetchUsage } from "../data/protocolClient";
import { Card, fmtCompact } from "../components/ui";
import {
  byProject,
  forecastFromCeiling,
  formatCountdown,
  peakUsageHours,
  percentChange,
  secondsUntil,
  sessionStats,
  shares,
} from "@acc/analytics";
import { EmptyState } from "../components/EmptyState";

interface Insight {
  title: string;
  body: string;
}

const FIVE_HOURS_MS = 5 * 3600_000;

export function Insights() {
  const { snapshot, history, selected } = useApp();
  const [settings] = useSettings();
  const [weekly, setWeekly] = useState<UsageReport | null>(null);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetchUsage(selected, "weekly")
      .then((r) => !cancelled && setWeekly(r))
      .catch(() => !cancelled && setWeekly(null));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const insights: Insight[] = [];
  const now = Date.now();

  // Week-over-week token trend (deterministic, from ccusage weekly series).
  if (weekly && weekly.points.length >= 2) {
    const last = weekly.points[weekly.points.length - 1]!;
    const prev = weekly.points[weekly.points.length - 2]!;
    const delta = percentChange(
      last.tokens.totalTokens ?? null,
      prev.tokens.totalTokens ?? null,
    );
    if (delta !== null) {
      insights.push({
        title: "Week-over-week usage",
        body: `Token usage ${delta >= 0 ? "increased" : "decreased"} ${Math.abs(Math.round(delta))}% versus the previous week (${fmtCompact(prev.tokens.totalTokens)} → ${fmtCompact(last.tokens.totalTokens)}).`,
      });
    }
  }

  // Agent share this period.
  if (weekly && weekly.byAgent.length > 0) {
    const sh = shares(
      weekly.byAgent.map((a) => ({
        key: a.key,
        value: a.tokens.totalTokens ?? 0,
      })),
    );
    const top = sh.sort((a, b) => b.percent - a.percent)[0];
    if (top && top.percent > 0) {
      insights.push({
        title: "Top coding agent",
        body: `${top.key} accounted for ${Math.round(top.percent)}% of coding-agent tokens in the recent weeks.`,
      });
    }
  }

  if (snapshot) {
    const claude = snapshot.providers.find((p) => p.provider === "Claude");
    const t = claude?.tokens;
    const fiveHour = claude?.limits.find((l) => l.label === "5-hour");

    if (fiveHour?.resetAt) {
      const secs = secondsUntil(Date.parse(fiveHour.resetAt), now);
      const ceiling = settings.claude5hCeilingTokens;
      if (ceiling && fiveHour.used !== null) {
        const end = Date.parse(fiveHour.resetAt);
        const f = forecastFromCeiling({
          used: fiveHour.used,
          ceiling,
          windowStartMs: end - FIVE_HOURS_MS,
          windowEndMs: end,
          nowMs: now,
          observations: history.length,
        });
        const pct = Math.round((fiveHour.used / ceiling) * 100);
        insights.push({
          title: "Claude 5-hour window (ESTIMATED)",
          body:
            f.projectedExhaustionMs && f.beforeReset
              ? `At the current ${f.velocity?.toFixed(2)}× pace, the window (~${pct}% used) may be exhausted in ${formatCountdown(secondsUntil(f.projectedExhaustionMs, now)) ?? "—"} — before it resets in ${formatCountdown(secs) ?? "—"}. Confidence: ${f.confidence}.`
              : `~${pct}% of the configured ceiling used; on current pace it should not exhaust before reset in ${formatCountdown(secs) ?? "—"}.`,
        });
      } else {
        insights.push({
          title: "Claude 5-hour window",
          body: `Used ${fmtCompact(fiveHour.used)} tokens this window; resets in ${formatCountdown(secs) ?? "—"}. Set a ceiling in Settings for a % and exhaustion forecast.`,
        });
      }
    }

    if (t && t.totalTokens) {
      const cache = (t.cacheReadTokens ?? 0) + (t.cacheCreationTokens ?? 0);
      insights.push({
        title: "Cache utilization",
        body: `${Math.round((cache / t.totalTokens) * 100)}% of today's tokens are cache reads/writes — a high ratio means cheaper, faster context reuse.`,
      });
    }

    // Session statistics (spec §21) — only shown when sessions actually reported values.
    const stats = sessionStats(snapshot.sessions);
    if (stats.count > 0) {
      const parts: string[] = [`${stats.count} session(s) detected`];
      if (stats.avgDurationSeconds !== null)
        parts.push(
          `average ${formatCountdown(Math.round(stats.avgDurationSeconds))}`,
        );
      if (stats.longestDurationSeconds !== null)
        parts.push(
          `longest ${formatCountdown(Math.round(stats.longestDurationSeconds))}`,
        );
      if (stats.avgTokens !== null)
        parts.push(`~${fmtCompact(Math.round(stats.avgTokens))} tokens each`);
      insights.push({
        title: "Session profile",
        body:
          parts.join(" · ") +
          (stats.timedCount === 0
            ? ". Durations are Not available — ccusage does not expose session start times."
            : "."),
      });
    }

    // Project share (spec §21).
    const projects = byProject(snapshot.sessions).filter((p) => p.tokens > 0);
    if (projects.length > 0 && projects[0]) {
      const top = projects[0];
      insights.push({
        title: "Top project",
        body: `${top.key} accounted for ${Math.round(top.percent)}% of detected coding-agent tokens (${fmtCompact(top.tokens)}).`,
      });
    }

    // Peak usage hours (spec §21), computed in the Surface's local timezone.
    const peaks = peakUsageHours(snapshot.sessions);
    if (peaks.length > 0 && peaks[0] && peaks[0].count > 1) {
      const h = peaks[0].hour;
      insights.push({
        title: "Peak activity",
        body: `Most AI activity is around ${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00 (local time).`,
      });
    }

    const failing = snapshot.automations.filter((a) => a.status === "ERROR");
    if (failing.length > 0) {
      insights.push({
        title: "Automations need attention",
        body: `${failing.length} scheduled task(s) last completed with an error: ${failing
          .slice(0, 3)
          .map((a) => a.name)
          .join(", ")}.`,
      });
    }
  }

  if (insights.length === 0) {
    return (
      <EmptyState
        kind="waiting"
        title="No insights yet"
        detail="Deterministic insights appear as data arrives from the agent and ccusage."
      />
    );
  }

  return (
    <div className="grid">
      {insights.map((i) => (
        <Card key={i.title} title={i.title}>
          <p className="insight-body">{i.body}</p>
        </Card>
      ))}
    </div>
  );
}
