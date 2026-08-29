import {
  activeBlockLimit,
  normalizeCcusageCost,
  normalizeCcusageSessions,
  ccusageTokensForAgent,
  type CcusageBlocksReport,
  type CcusageDailyReport,
  type CcusageSessionReport,
  type CollectorResult,
} from "@acc/adapters";
import type { AISession, ProviderUsage } from "@acc/protocol";
import { execWithTimeout, TtlCache } from "./exec";

export interface CcusageData {
  /** Claude provider rollup (today's tokens/cost + active 5-hour limit). */
  provider: ProviderUsage | null;
  sessions: AISession[];
}

export interface CcusageOptions {
  /** Command + base args. Default: `npx -y ccusage@latest`. */
  command: string;
  baseArgs: string[];
  timeoutMs: number;
  machineId: string;
}

const cache = new TtlCache<string>(60_000); // ccusage output cached 60s per report

async function runReport<T>(
  opts: CcusageOptions,
  report: "daily" | "blocks" | "session",
): Promise<T> {
  const key = report;
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached) as T;
  const { stdout, code } = await execWithTimeout(
    opts.command,
    [...opts.baseArgs, report, "--json"],
    opts.timeoutMs,
  );
  if (code !== 0 && !stdout.trim().startsWith("{")) {
    throw new Error(`ccusage ${report} exited ${code}`);
  }
  cache.set(key, stdout);
  return JSON.parse(stdout) as T;
}

/**
 * Live ccusage collector. Produces the Claude provider rollup (today's tokens/cost +
 * the active 5-hour window as a CALCULATED limit with a real reset countdown) and the
 * per-session list. Fails soft: a missing/broken ccusage yields NOT_INSTALLED/ERROR and
 * no data — never fabricated numbers.
 */
export async function collectCcusage(
  opts: CcusageOptions,
  nowIso: string,
): Promise<CollectorResult<CcusageData>> {
  const nowMs = Date.parse(nowIso);
  try {
    const [daily, blocks, sessionReport] = await Promise.all([
      runReport<CcusageDailyReport>(opts, "daily"),
      runReport<CcusageBlocksReport>(opts, "blocks"),
      runReport<CcusageSessionReport>(opts, "session"),
    ]);

    const limit = activeBlockLimit(blocks, nowMs);
    const claudeTokens = ccusageTokensForAgent(daily, "claude");
    const provider: ProviderUsage = {
      provider: "Claude",
      account: null,
      source: "ccusage",
      updatedAt: nowIso,
      limits: limit ? [limit] : [],
      credits: null,
      cost: normalizeCcusageCost(daily),
      tokens: claudeTokens,
      status: null,
    };

    const sessions = normalizeCcusageSessions(
      sessionReport,
      opts.machineId,
      nowMs,
    );

    return {
      data: { provider, sessions },
      health: "HEALTHY",
      detail: `${sessions.length} session(s); ${limit ? "active 5h window" : "no active window"}`,
      lastError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Distinguish "not installed" (spawn failure) from a runtime error.
    const notInstalled = /ENOENT|not recognized|command not found/i.test(
      message,
    );
    return {
      data: null,
      health: notInstalled ? "NOT_INSTALLED" : "ERROR",
      detail: notInstalled
        ? "ccusage not runnable (need Node + npx)"
        : "ccusage failed",
      lastError: message,
    };
  }
}

export function defaultCcusageOptions(machineId: string): CcusageOptions {
  const isWin = process.platform === "win32";
  return {
    command: isWin ? "npx.cmd" : "npx",
    baseArgs: ["-y", "ccusage@latest"],
    timeoutMs: 45_000,
    machineId,
  };
}
