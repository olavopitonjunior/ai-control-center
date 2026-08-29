import { useState } from "react";

/**
 * Dependency-free SVG charts. Kept deliberately small and touch-friendly, themed via
 * CSS custom properties. Every chart answers a specific question — no decoration.
 */

export const CHART_COLORS = [
  "#3b82f6",
  "#2ea043",
  "#d29922",
  "#a371f7",
  "#22d3ee",
  "#f85149",
  "#8b949e",
];

interface Datum {
  label: string;
  value: number;
}

/** Vertical bar chart with value-on-hover; scales to the max value. */
export function BarChart({
  data,
  height = 160,
  format = (n: number) => n.toLocaleString(),
}: {
  data: Datum[];
  height?: number;
  format?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) return <p className="muted">No data.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="chart">
      <div className="barchart" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={d.label + i}
            className="barchart__col"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover((h) => (h === i ? null : h))}
          >
            <div className="barchart__value">
              {hover === i ? format(d.value) : " "}
            </div>
            <div
              className="barchart__bar"
              style={{
                height: `${(d.value / max) * 100}%`,
                background: CHART_COLORS[0],
              }}
            />
            <div className="barchart__label">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Line chart for a numeric series over time; null values create gaps. */
export function LineChart({
  values,
  height = 160,
  color = CHART_COLORS[0],
  yMax,
}: {
  values: (number | null)[];
  height?: number;
  color?: string;
  yMax?: number;
}) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <p className="muted">Not enough data yet.</p>;
  const w = 600;
  const h = height;
  const max = yMax ?? Math.max(...nums, 1);
  const step = w / (values.length - 1);
  // Build path with gaps for nulls: lift the pen on a null, drop it again after.
  let d = "";
  let penDown = false;
  values.forEach((v, i) => {
    if (v === null) {
      penDown = false;
      return;
    }
    const x = i * step;
    const y = h - (v / max) * h;
    d += penDown ? ` L ${x} ${y}` : ` M ${x} ${y}`;
    penDown = true;
  });
  return (
    <svg
      className="linechart"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ height }}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Donut chart for a categorical breakdown, with a legend + percentages. */
export function Donut({
  data,
  format = (n: number) => n.toLocaleString(),
}: {
  data: Datum[];
  format?: (n: number) => string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total <= 0) return <p className="muted">No data.</p>;
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" className="donut__svg">
        <g transform="translate(80,80) rotate(-90)">
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const seg = (
              <circle
                key={d.label}
                r={r}
                fill="none"
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth="22"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
        </g>
      </svg>
      <ul className="donut__legend">
        {data.map((d, i) => (
          <li key={d.label}>
            <span
              className="donut__swatch"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="donut__key">{d.label}</span>
            <span className="mono">
              {format(d.value)} · {Math.round((d.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
