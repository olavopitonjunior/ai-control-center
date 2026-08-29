import { useApp } from "../state/AppState";
import { useSettings } from "../data/settings";
import {
  Bar,
  Card,
  Countdown,
  Provenance,
  Stat,
  fmtClock,
  fmtCompact,
  fmtPercent,
} from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import {
  forecastFromCeiling,
  formatCountdown,
  secondsUntil,
} from "@acc/analytics";

const FIVE_HOURS_MS = 5 * 3600_000;

export function Limits() {
  const { snapshot, history } = useApp();
  const [settings] = useSettings();
  const providers = snapshot?.providers ?? [];
  const ccusage = snapshot?.collectors.find((c) => c.name === "ccusage");
  const limits = providers.flatMap((p) =>
    p.limits.map((l) => ({
      provider: p.provider,
      updatedAt: p.updatedAt,
      limit: l,
    })),
  );

  if (limits.length === 0) {
    return (
      <EmptyState
        kind={
          ccusage?.health === "HEALTHY" ? "not-available" : "not-configured"
        }
        title="No quota windows to show yet"
        detail={
          ccusage?.health === "HEALTHY"
            ? "No active usage window right now. A 5-hour window appears here once Claude Code activity is detected."
            : (ccusage?.detail ??
              "ccusage is not available on the selected machine.")
        }
      />
    );
  }

  const now = Date.now();

  return (
    <div className="grid">
      {limits.map(({ provider, updatedAt, limit }) => {
        // If the user configured a ceiling for the Claude 5-hour window, we can show a %
        // and an ESTIMATED exhaustion forecast. Otherwise % stays "Not available".
        const ceiling =
          provider === "Claude" && limit.label === "5-hour"
            ? settings.claude5hCeilingTokens
            : null;
        const usedPct =
          limit.usedPercent ??
          (ceiling && limit.used !== null
            ? Math.min(100, (limit.used / ceiling) * 100)
            : null);

        let forecastLine: string | null = null;
        if (ceiling && limit.used !== null && limit.resetAt) {
          const end = Date.parse(limit.resetAt);
          const f = forecastFromCeiling({
            used: limit.used,
            ceiling,
            windowStartMs: end - FIVE_HOURS_MS,
            windowEndMs: end,
            nowMs: now,
            observations: history.length,
          });
          if (f.projectedExhaustionMs) {
            const secs = secondsUntil(f.projectedExhaustionMs, now);
            forecastLine = `Projected exhaustion in ${formatCountdown(secs) ?? "—"} (${f.confidence} confidence, ${f.velocity?.toFixed(2)}× pace)`;
          }
        }

        return (
          <Card
            key={limit.id}
            title={`${provider} · ${limit.label}`}
            right={
              <Provenance
                source={limit.source}
                quality={ceiling ? "ESTIMATED" : limit.sourceQuality}
              />
            }
          >
            <Bar percent={usedPct} />
            <div className="limit-row">
              <Stat
                label="Used"
                value={
                  usedPct === null
                    ? fmtCompact(limit.used) + " tokens"
                    : fmtPercent(usedPct)
                }
              />
              <Stat
                label="Remaining"
                value={usedPct === null ? "—" : fmtPercent(100 - usedPct)}
              />
            </div>
            <div className="limit-row">
              <Stat label="Resets" value={fmtClock(limit.resetAt)} />
              <Stat
                label="Countdown"
                value={<Countdown resetAt={limit.resetAt} />}
              />
            </div>
            {forecastLine && (
              <div className="limit-foot">
                <span className="prov__q" data-q="ESTIMATED">
                  ESTIMATED
                </span>{" "}
                {forecastLine}
              </div>
            )}
            <div className="limit-foot muted">
              {usedPct === null && (
                <span>
                  Quota ceiling unknown — set it in Settings for a % and
                  forecast.{" "}
                </span>
              )}
              Updated {fmtClock(updatedAt)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
