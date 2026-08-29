import type {
  AISession,
  AgentKind,
  Cost,
  SessionStatus,
  TokenUsage,
  UsageBreakdownEntry,
  UsageGranularity,
  UsagePoint,
  UsageReport,
  UsageLimit,
} from "@acc/protocol";

/**
 * Minimal shape of `ccusage <period> --json` output that we rely on. ccusage owns
 * the parsing of coding-agent logs; we only normalize its already-computed totals
 * into the protocol model. We deliberately keep this permissive (extra fields are
 * ignored) so ccusage upgrades don't break us.
 *
 * Captured live from `npx ccusage@latest daily --json` on 2026-08-28.
 */
export interface CcusageModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export interface CcusageDayRow {
  period: string;
  agent?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed?: string[];
  modelBreakdowns?: CcusageModelBreakdown[];
  metadata?: { agents?: string[] };
}

/** A ccusage period report (daily/weekly/monthly all share this shape). */
export interface CcusagePeriodReport {
  rows: CcusageDayRow[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
  };
}

function emptyTokens(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
  };
}
function addTokens(
  a: TokenUsage,
  r: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalTokens?: number;
  },
): TokenUsage {
  // ccusage modelBreakdowns omit totalTokens — derive it from the parts when absent.
  const rTotal =
    r.totalTokens ??
    (r.inputTokens ?? 0) +
      (r.outputTokens ?? 0) +
      (r.cacheReadTokens ?? 0) +
      (r.cacheCreationTokens ?? 0);
  return {
    inputTokens: (a.inputTokens ?? 0) + (r.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (r.outputTokens ?? 0),
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (r.cacheReadTokens ?? 0),
    cacheCreationTokens:
      (a.cacheCreationTokens ?? 0) + (r.cacheCreationTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + rTotal,
  };
}

/**
 * Normalize a ccusage period report into the protocol UsageReport: a time series of
 * points plus by-model and by-agent breakdowns. Pure and deterministic; the generatedAt
 * timestamp is injected by the caller. All figures are CALCULATED (from local logs).
 */
export function normalizeCcusageReport(
  report: CcusagePeriodReport,
  granularity: UsageGranularity,
  generatedAtIso: string,
): UsageReport {
  // Group rows by period into points.
  const pointMap = new Map<string, UsagePoint>();
  const modelMap = new Map<string, UsageBreakdownEntry>();
  const agentMap = new Map<string, UsageBreakdownEntry>();

  for (const row of report.rows) {
    const point =
      pointMap.get(row.period) ??
      ({
        period: row.period,
        tokens: emptyTokens(),
        cost: 0,
        byModel: [],
        agents: [],
      } as UsagePoint);
    point.tokens = addTokens(point.tokens, row);
    point.cost = (point.cost ?? 0) + (row.totalCost ?? 0);
    for (const a of row.metadata?.agents ?? []) {
      if (!point.agents.includes(a)) point.agents.push(a);
    }
    pointMap.set(row.period, point);

    // by-model (from per-row modelBreakdowns)
    for (const mb of row.modelBreakdowns ?? []) {
      const entry = modelMap.get(mb.modelName) ?? {
        key: mb.modelName,
        tokens: emptyTokens(),
        cost: 0,
      };
      entry.tokens = addTokens(entry.tokens, mb);
      entry.cost = (entry.cost ?? 0) + (mb.cost ?? 0);
      modelMap.set(mb.modelName, entry);
      // also record on the point
      const pm = point.byModel.find((m) => m.key === mb.modelName);
      if (pm)
        ((pm.tokens = addTokens(pm.tokens, mb)),
          (pm.cost = (pm.cost ?? 0) + (mb.cost ?? 0)));
      else
        point.byModel.push({
          key: mb.modelName,
          tokens: addTokens(emptyTokens(), mb),
          cost: mb.cost ?? 0,
        });
    }

    // by-agent (rows are tagged with their agent(s))
    for (const a of row.metadata?.agents ?? ["unknown"]) {
      const entry = agentMap.get(a) ?? {
        key: a,
        tokens: emptyTokens(),
        cost: 0,
      };
      entry.tokens = addTokens(entry.tokens, row);
      entry.cost = (entry.cost ?? 0) + (row.totalCost ?? 0);
      agentMap.set(a, entry);
    }
  }

  const points = [...pointMap.values()].sort((a, b) =>
    a.period.localeCompare(b.period),
  );
  const byModel = [...modelMap.values()].sort(
    (a, b) => (b.tokens.totalTokens ?? 0) - (a.tokens.totalTokens ?? 0),
  );
  const byAgent = [...agentMap.values()].sort(
    (a, b) => (b.tokens.totalTokens ?? 0) - (a.tokens.totalTokens ?? 0),
  );

  return {
    granularity,
    source: "ccusage",
    generatedAt: generatedAtIso,
    points,
    totals: {
      tokens: {
        inputTokens: report.totals.inputTokens ?? null,
        outputTokens: report.totals.outputTokens ?? null,
        cacheReadTokens: report.totals.cacheReadTokens ?? null,
        cacheCreationTokens: report.totals.cacheCreationTokens ?? null,
        totalTokens: report.totals.totalTokens ?? null,
      },
      cost: report.totals.totalCost ?? null,
    },
    byModel,
    byAgent,
    byProject: [], // ccusage per-instance split not available in this version; filled from sessions elsewhere
  };
}

export interface CcusageDailyReport {
  daily: CcusageDayRow[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
  };
}

/** Normalize ccusage `totals` into the protocol TokenUsage shape. */
export function normalizeCcusageTotals(report: CcusageDailyReport): TokenUsage {
  const t = report.totals;
  return {
    inputTokens: t.inputTokens ?? null,
    outputTokens: t.outputTokens ?? null,
    cacheReadTokens: t.cacheReadTokens ?? null,
    cacheCreationTokens: t.cacheCreationTokens ?? null,
    totalTokens: t.totalTokens ?? null,
  };
}

/** Normalize ccusage total cost into the protocol Cost shape. ccusage cost is CALCULATED. */
export function normalizeCcusageCost(report: CcusageDailyReport): Cost {
  return {
    amount: report.totals.totalCost ?? null,
    currency: "USD",
    source: "ccusage",
    sourceQuality: "CALCULATED",
  };
}

/**
 * Sum token usage for a single agent (e.g. "claude") across all day rows. ccusage
 * tags each row's agent(s) in `metadata.agents`. Returns null token fields when
 * the agent produced no matching rows (honest absence, not zero-as-data).
 */
export function ccusageTokensForAgent(
  report: CcusageDailyReport,
  agent: string,
): TokenUsage {
  const rows = report.daily.filter((r) => r.metadata?.agents?.includes(agent));
  if (rows.length === 0) {
    return {
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheCreationTokens: null,
      totalTokens: null,
    };
  }
  const sum = (pick: (r: CcusageDayRow) => number) =>
    rows.reduce((acc, r) => acc + (pick(r) || 0), 0);
  return {
    inputTokens: sum((r) => r.inputTokens),
    outputTokens: sum((r) => r.outputTokens),
    cacheReadTokens: sum((r) => r.cacheReadTokens),
    cacheCreationTokens: sum((r) => r.cacheCreationTokens),
    totalTokens: sum((r) => r.totalTokens),
  };
}

// ---------------------------------------------------------------------------
// blocks --json  (Claude's 5-hour billing windows). NOTE: block token field
// names differ from the daily report (cacheCreationInputTokens / cacheReadInputTokens).
// Captured live 2026-08-28.
// ---------------------------------------------------------------------------

export interface CcusageBlock {
  id: string;
  startTime: string;
  endTime: string;
  actualEndTime?: string | null;
  isActive: boolean;
  isGap?: boolean;
  models?: string[];
  totalTokens: number;
  costUSD?: number;
  tokenCounts?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  projection?: { remainingMinutes?: number } | null;
}

export interface CcusageBlocksReport {
  blocks: CcusageBlock[];
}

/**
 * Build a UsageLimit from the currently-active 5-hour block. `used` is the tokens
 * consumed in the window (CALCULATED) and `resetAt` is the block's end time (a real,
 * authoritative-for-the-window value). The quota CEILING is not known from local logs,
 * so capacity/percent stay null (UI shows "Not available") unless a ceiling is
 * configured elsewhere — we never invent a percentage. Returns null if no active block.
 */
export function activeBlockLimit(
  report: CcusageBlocksReport,
  nowMs: number,
): UsageLimit | null {
  const block = report.blocks.find((b) => b.isActive && !b.isGap);
  if (!block) return null;
  const resetMs = Date.parse(block.endTime);
  const resetInSeconds = Number.isFinite(resetMs)
    ? Math.max(0, Math.round((resetMs - nowMs) / 1000))
    : null;
  return {
    id: `claude-5h:${block.id}`,
    label: "5-hour",
    used: block.totalTokens ?? null,
    remaining: null,
    capacity: null,
    usedPercent: null,
    remainingPercent: null,
    resetAt: Number.isFinite(resetMs) ? new Date(resetMs).toISOString() : null,
    resetInSeconds,
    source: "ccusage",
    sourceQuality: "CALCULATED",
  };
}

/** TokenUsage for the active block (maps the block-specific field names). */
export function activeBlockTokens(
  report: CcusageBlocksReport,
): TokenUsage | null {
  const block = report.blocks.find((b) => b.isActive && !b.isGap);
  if (!block) return null;
  const tc = block.tokenCounts ?? {};
  return {
    inputTokens: tc.inputTokens ?? null,
    outputTokens: tc.outputTokens ?? null,
    cacheReadTokens: tc.cacheReadInputTokens ?? null,
    cacheCreationTokens: tc.cacheCreationInputTokens ?? null,
    totalTokens: block.totalTokens ?? null,
  };
}

// ---------------------------------------------------------------------------
// session --json  (per-session rollups). Captured live 2026-08-28.
// ---------------------------------------------------------------------------

export interface CcusageSessionRow {
  agent?: string;
  period?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed?: string[];
  metadata?: { lastActivity?: string };
}

export interface CcusageSessionReport {
  session: CcusageSessionRow[];
}

/** Map ccusage's agent string to the protocol AgentKind. */
export function mapAgentKind(agent: string | undefined): AgentKind {
  switch ((agent ?? "").toLowerCase()) {
    case "claude":
    case "claude-code":
      return "claude-code";
    case "codex":
      return "codex";
    case "gemini":
    case "gemini-cli":
      return "gemini-cli";
    case "opencode":
      return "opencode";
    case "ollama":
      return "ollama";
    default:
      return "other";
  }
}

/**
 * Derive a best-effort session status from recency of last activity. ccusage cannot
 * prove a process is running, so this is CALCULATED and flagged via provenance:
 * ACTIVE < 10m, IDLE < 60m, otherwise ENDED. UNKNOWN when no activity timestamp.
 */
export function sessionStatusFromActivity(
  lastActivityMs: number | null,
  nowMs: number,
): SessionStatus {
  if (lastActivityMs === null) return "UNKNOWN";
  const ageMin = (nowMs - lastActivityMs) / 60000;
  if (ageMin < 10) return "ACTIVE";
  if (ageMin < 60) return "IDLE";
  return "ENDED";
}

/**
 * Normalize ccusage `session` rows into AISession[]. Best-effort: ccusage provides
 * tokens/cost/model/lastActivity but not pid/start/duration, so those stay null and the
 * status is derived from recency. `period` is used as a best-effort project label.
 */
export function normalizeCcusageSessions(
  report: CcusageSessionReport,
  machineId: string,
  nowMs: number,
): AISession[] {
  return report.session.map((row) => {
    const lastActivity = row.metadata?.lastActivity
      ? Date.parse(row.metadata.lastActivity)
      : null;
    const lastActivityMs =
      lastActivity !== null && Number.isFinite(lastActivity)
        ? lastActivity
        : null;
    const agent = mapAgentKind(row.agent);
    return {
      id: `${agent}:${row.period ?? "unknown"}`,
      machineId,
      agent,
      pid: null,
      projectName: row.period ?? null,
      projectPath: null,
      terminal: null,
      startedAt: null,
      lastActivityAt:
        lastActivityMs !== null ? new Date(lastActivityMs).toISOString() : null,
      durationSeconds: null,
      status: sessionStatusFromActivity(lastActivityMs, nowMs),
      model: row.modelsUsed?.[0] ?? null,
      tokens: {
        inputTokens: row.inputTokens ?? null,
        outputTokens: row.outputTokens ?? null,
        cacheReadTokens: row.cacheReadTokens ?? null,
        cacheCreationTokens: row.cacheCreationTokens ?? null,
        totalTokens: row.totalTokens ?? null,
      },
      cost: {
        amount: row.totalCost ?? null,
        currency: "USD",
        source: "ccusage",
        sourceQuality: "CALCULATED",
      },
      provenance: [
        { field: "tokens", source: "ccusage" },
        { field: "cost", source: "ccusage" },
        { field: "model", source: "ccusage" },
        { field: "status", source: "analytics" },
      ],
    };
  });
}
