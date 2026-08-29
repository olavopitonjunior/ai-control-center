import { useEffect, useState, type ReactNode } from "react";
import { formatCountdown, secondsUntil } from "@acc/analytics";
import type { SourceProvenance } from "@acc/protocol";

/** Re-render every `ms` so live countdowns tick. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// ---- formatters. Null -> "—" (Not available), never a fake 0. ----
export function fmtInt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US");
}
export function fmtCompact(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}
export function fmtUSD(n: number | null): string {
  return n === null
    ? "—"
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function fmtPercent(n: number | null): string {
  return n === null ? "—" : `${Math.round(n)}%`;
}
export function fmtBytes(n: number | null): string {
  if (n === null) return "—";
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = n / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}
export function fmtDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  return formatCountdown(seconds) ?? "—";
}
export function fmtClock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

/** Live countdown to an ISO reset time. */
export function Countdown({ resetAt }: { resetAt: string | null }) {
  const now = useNow(1000);
  if (!resetAt) return <span className="mono">—</span>;
  const secs = secondsUntil(Date.parse(resetAt), now);
  return <span className="mono">{formatCountdown(secs) ?? "—"}</span>;
}

const QUALITY_LABEL: Record<SourceProvenance, string> = {
  OFFICIAL: "OFFICIAL",
  OFFICIAL_LOCAL: "OFFICIAL",
  CALCULATED: "CALCULATED",
  ESTIMATED: "ESTIMATED",
};

/** Small provenance chip: source tool + quality. Never hidden — honesty is the point. */
export function Provenance({
  source,
  quality,
}: {
  source?: string;
  quality?: SourceProvenance;
}) {
  return (
    <span className="prov">
      {source && <span className="prov__src">{source}</span>}
      {quality && (
        <span className="prov__q" data-q={QUALITY_LABEL[quality]}>
          {QUALITY_LABEL[quality]}
        </span>
      )}
    </span>
  );
}

/** A labeled stat cell. `value` already formatted; pass "—" for missing. */
export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {sub != null && <div className="stat__sub">{sub}</div>}
    </div>
  );
}

/** A horizontal usage bar. percent null -> renders an "unknown" track, not a full/empty bar. */
export function Bar({
  percent,
  tone = "normal",
}: {
  percent: number | null;
  tone?: "normal" | "warn" | "crit";
}) {
  const known = percent !== null;
  const t = !known
    ? "unknown"
    : percent >= 90
      ? "crit"
      : percent >= 75
        ? "warn"
        : tone;
  return (
    <div className="bar" data-tone={t}>
      <div
        className="bar__fill"
        style={{
          width: known ? `${Math.min(100, Math.max(0, percent))}%` : "0%",
        }}
      />
      {!known && (
        <span className="bar__unknown">no ceiling — Not available</span>
      )}
    </div>
  );
}

export function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card">
      <div className="card__head">
        <h3 className="card__title">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}
