import { describe, expect, it } from "vitest";
import {
  activeBlockLimit,
  activeBlockTokens,
  ccusageForAgentOnDay,
  ccusageTokensForAgent,
  mapAgentKind,
  normalizeCcusageCost,
  normalizeCcusageReport,
  normalizeCcusageSessions,
  normalizeCcusageTotals,
  normalizeGlances,
  parseUptime,
  sessionStatusFromActivity,
  type CcusageBlocksReport,
  type CcusageDailyReport,
  type CcusagePeriodReport,
  type CcusageSessionReport,
  type GlancesSnapshot,
} from "./index";

// Real fixture captured from `npx ccusage@latest daily --json` on 2026-08-28.
const CCUSAGE: CcusageDailyReport = {
  daily: [
    {
      period: "2026-06-11",
      agent: "all",
      inputTokens: 496,
      outputTokens: 258,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 754,
      totalCost: 0.0032,
      modelsUsed: ["gpt-5"],
      metadata: { agents: ["codex"] },
    },
    {
      period: "2026-08-28",
      agent: "all",
      inputTokens: 16287,
      outputTokens: 19064,
      cacheCreationTokens: 81842,
      cacheReadTokens: 719110,
      totalTokens: 836303,
      totalCost: 1.73601,
      modelsUsed: ["claude-opus-4-8"],
      metadata: { agents: ["claude"] },
    },
  ],
  totals: {
    inputTokens: 16783,
    outputTokens: 19322,
    cacheCreationTokens: 81842,
    cacheReadTokens: 719110,
    totalTokens: 837057,
    totalCost: 1.7392100000000001,
  },
};

describe("ccusage normalizer", () => {
  it("maps totals to TokenUsage", () => {
    expect(normalizeCcusageTotals(CCUSAGE)).toEqual({
      inputTokens: 16783,
      outputTokens: 19322,
      cacheReadTokens: 719110,
      cacheCreationTokens: 81842,
      totalTokens: 837057,
    });
  });

  it("labels cost as CALCULATED from ccusage", () => {
    const cost = normalizeCcusageCost(CCUSAGE);
    expect(cost.amount).toBeCloseTo(1.73921);
    expect(cost.currency).toBe("USD");
    expect(cost.source).toBe("ccusage");
    expect(cost.sourceQuality).toBe("CALCULATED");
  });

  it("sums tokens for a specific agent", () => {
    const claude = ccusageTokensForAgent(CCUSAGE, "claude");
    expect(claude.totalTokens).toBe(836303);
    expect(claude.cacheReadTokens).toBe(719110);
  });

  // Regression: the Overview card is labelled "Today" but was fed lifetime totals.
  // On a real Mac that rendered $5,554 and 6.0B tokens as "today's" usage.
  it("ccusageForAgentOnDay returns ONE day, not the lifetime total", () => {
    const today = ccusageForAgentOnDay(CCUSAGE, "claude", "2026-08-28");
    expect(today.tokens.totalTokens).toBe(836303);
    expect(today.cost).toBeCloseTo(1.73601);
    // The lifetime helper sums every day and must stay larger than a single day.
    expect(normalizeCcusageTotals(CCUSAGE).totalTokens).toBe(837057);
  });

  it("ccusageForAgentOnDay reports null (not zero) for a day with no usage", () => {
    const none = ccusageForAgentOnDay(CCUSAGE, "claude", "2026-01-01");
    expect(none.tokens.totalTokens).toBeNull();
    expect(none.cost).toBeNull();
  });

  it("does not attribute another agent's usage to the requested day", () => {
    // 2026-06-11 belongs to codex, not claude.
    expect(
      ccusageForAgentOnDay(CCUSAGE, "claude", "2026-06-11").cost,
    ).toBeNull();
    expect(
      ccusageForAgentOnDay(CCUSAGE, "codex", "2026-06-11").cost,
    ).toBeCloseTo(0.0032);
  });

  it("returns nulls (not zeros) for an agent with no data", () => {
    const gemini = ccusageTokensForAgent(CCUSAGE, "gemini");
    expect(gemini.totalTokens).toBeNull();
    expect(gemini.inputTokens).toBeNull();
  });
});

// Shaped from real `npx ccusage@latest daily --json` output (2 periods, 2 agents/models).
const PERIOD: CcusagePeriodReport = {
  rows: [
    {
      period: "2026-06-11",
      inputTokens: 496,
      outputTokens: 258,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 754,
      totalCost: 0.0032,
      modelBreakdowns: [
        {
          modelName: "gpt-5",
          inputTokens: 496,
          outputTokens: 258,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          cost: 0.0032,
        },
      ],
      metadata: { agents: ["codex"] },
    },
    {
      period: "2026-08-28",
      inputTokens: 16287,
      outputTokens: 19064,
      cacheCreationTokens: 81842,
      cacheReadTokens: 719110,
      totalTokens: 836303,
      totalCost: 1.73601,
      modelBreakdowns: [
        {
          modelName: "claude-opus-4-8",
          inputTokens: 16287,
          outputTokens: 19064,
          cacheCreationTokens: 81842,
          cacheReadTokens: 719110,
          cost: 1.73601,
        },
      ],
      metadata: { agents: ["claude"] },
    },
  ],
  totals: {
    inputTokens: 16783,
    outputTokens: 19322,
    cacheCreationTokens: 81842,
    cacheReadTokens: 719110,
    totalTokens: 837057,
    totalCost: 1.73921,
  },
};

describe("normalizeCcusageReport", () => {
  const report = normalizeCcusageReport(
    PERIOD,
    "daily",
    "2026-08-28T23:00:00.000Z",
  );

  it("builds a sorted time series of points", () => {
    expect(report.granularity).toBe("daily");
    expect(report.points.map((p) => p.period)).toEqual([
      "2026-06-11",
      "2026-08-28",
    ]);
    expect(report.points[1]!.tokens.totalTokens).toBe(836303);
    expect(report.points[1]!.agents).toEqual(["claude"]);
  });

  it("aggregates by model and by agent", () => {
    expect(report.byModel.map((m) => m.key).sort()).toEqual([
      "claude-opus-4-8",
      "gpt-5",
    ]);
    const claude = report.byModel.find((m) => m.key === "claude-opus-4-8")!;
    expect(claude.tokens.totalTokens).toBe(836303);
    const byAgent = report.byAgent.find((a) => a.key === "claude")!;
    expect(byAgent.cost).toBeCloseTo(1.73601);
  });

  it("carries totals and marks project breakdown empty (not faked)", () => {
    expect(report.totals.tokens.totalTokens).toBe(837057);
    expect(report.totals.cost).toBeCloseTo(1.73921);
    expect(report.byProject).toEqual([]);
  });
});

// Real fixture from `npx ccusage@latest blocks --json` on 2026-08-28 (active 5h window).
const BLOCKS: CcusageBlocksReport = {
  blocks: [
    {
      id: "2026-08-28T21:00:00.000Z",
      startTime: "2026-08-28T21:00:00.000Z",
      endTime: "2026-08-29T02:00:00.000Z",
      actualEndTime: "2026-08-28T22:08:08.380Z",
      isActive: true,
      isGap: false,
      models: ["claude-opus-4-8"],
      totalTokens: 12798045,
      costUSD: 11.5912955,
      tokenCounts: {
        inputTokens: 31972,
        outputTokens: 121656,
        cacheCreationInputTokens: 217666,
        cacheReadInputTokens: 12426751,
      },
      projection: { remainingMinutes: 231 },
    },
  ],
};

describe("ccusage blocks (5-hour window)", () => {
  it("builds a 5-hour limit with a real reset time and CALCULATED quality", () => {
    const now = Date.parse("2026-08-28T22:08:00.000Z");
    const limit = activeBlockLimit(BLOCKS, now)!;
    expect(limit.label).toBe("5-hour");
    expect(limit.used).toBe(12798045);
    expect(limit.resetAt).toBe("2026-08-29T02:00:00.000Z");
    expect(limit.resetInSeconds).toBe(
      Math.round((Date.parse("2026-08-29T02:00:00.000Z") - now) / 1000),
    );
    // Ceiling unknown from local logs -> percent must be null, never invented.
    expect(limit.capacity).toBeNull();
    expect(limit.usedPercent).toBeNull();
    expect(limit.sourceQuality).toBe("CALCULATED");
  });

  it("maps block-specific token field names correctly", () => {
    const t = activeBlockTokens(BLOCKS)!;
    expect(t.cacheReadTokens).toBe(12426751);
    expect(t.cacheCreationTokens).toBe(217666);
    expect(t.totalTokens).toBe(12798045);
  });

  it("returns null when there is no active block", () => {
    expect(activeBlockLimit({ blocks: [] }, Date.now())).toBeNull();
  });
});

// Real fixture from `npx ccusage@latest session --json` on 2026-08-28.
const SESSIONS: CcusageSessionReport = {
  session: [
    {
      agent: "claude",
      period: "a1ddc4c9-f3d8-42a1-b753-a5544c78db4f",
      inputTokens: 31972,
      outputTokens: 121656,
      cacheCreationTokens: 217666,
      cacheReadTokens: 12426751,
      totalTokens: 12798045,
      totalCost: 11.5912955,
      modelsUsed: ["claude-opus-4-8"],
      metadata: { lastActivity: "2026-08-28T22:08:08.380Z" },
    },
  ],
};

describe("ccusage sessions", () => {
  it("maps agent strings to protocol AgentKind", () => {
    expect(mapAgentKind("claude")).toBe("claude-code");
    expect(mapAgentKind("codex")).toBe("codex");
    expect(mapAgentKind("gemini")).toBe("gemini-cli");
    expect(mapAgentKind("weird")).toBe("other");
  });

  it("derives status from activity recency (CALCULATED, honest)", () => {
    const base = Date.parse("2026-08-28T22:10:00.000Z");
    expect(
      sessionStatusFromActivity(Date.parse("2026-08-28T22:08:00.000Z"), base),
    ).toBe("ACTIVE");
    expect(
      sessionStatusFromActivity(Date.parse("2026-08-28T21:40:00.000Z"), base),
    ).toBe("IDLE");
    expect(
      sessionStatusFromActivity(Date.parse("2026-08-28T18:00:00.000Z"), base),
    ).toBe("ENDED");
    expect(sessionStatusFromActivity(null, base)).toBe("UNKNOWN");
  });

  it("normalizes a Claude session with provenance and no fabricated pid/duration", () => {
    const now = Date.parse("2026-08-28T22:10:00.000Z");
    const [s] = normalizeCcusageSessions(SESSIONS, "olavo-pc", now);
    expect(s!.agent).toBe("claude-code");
    expect(s!.machineId).toBe("olavo-pc");
    expect(s!.model).toBe("claude-opus-4-8");
    expect(s!.tokens?.totalTokens).toBe(12798045);
    expect(s!.status).toBe("ACTIVE");
    expect(s!.pid).toBeNull();
    expect(s!.durationSeconds).toBeNull();
    expect(s!.provenance.find((p) => p.field === "status")?.source).toBe(
      "analytics",
    );
  });
});

// Real fixtures captured from Glances REST API v4 on 2026-08-28 (Surface/Windows).
const GLANCES: GlancesSnapshot = {
  cpu: { total: 22.5 },
  mem: { total: 8424185856, used: 7793135616, percent: 92.5 },
  fs: [{ size: 254794526720, used: 155264032768 }],
  sensors: [{ label: "Battery", value: 60, unit: "%", type: "battery" }],
  gpu: [],
  network: [{ bytes_recv_rate_per_sec: 0, bytes_sent_rate_per_sec: 0 }],
  uptime: "43 days, 17:16:16",
};

describe("glances normalizer", () => {
  it("normalizes a Surface snapshot with no GPU and no CPU-temp sensor", () => {
    const m = normalizeGlances(GLANCES, "2026-08-28T18:00:00.000Z");
    expect(m.cpuPercent).toBe(22.5);
    expect(m.ramTotal).toBe(8424185856);
    expect(m.ramPercent).toBe(92.5);
    expect(m.diskTotal).toBe(254794526720);
    // No discrete GPU / no CPU temperature on this machine -> null, never 0.
    expect(m.gpuName).toBeNull();
    expect(m.gpuPercent).toBeNull();
    expect(m.cpuTemperature).toBeNull();
    expect(m.uptime).toBe(43 * 86400 + 17 * 3600 + 16 * 60 + 16);
  });

  it("parses uptime strings", () => {
    expect(parseUptime("43 days, 17:16:16")).toBe(
      43 * 86400 + 17 * 3600 + 16 * 60 + 16,
    );
    expect(parseUptime("2:03:04")).toBe(2 * 3600 + 3 * 60 + 4);
    expect(parseUptime(null)).toBeNull();
    expect(parseUptime("garbage")).toBeNull();
  });
});
