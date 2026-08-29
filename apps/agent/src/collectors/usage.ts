import {
  normalizeCcusageReport,
  type CcusageDayRow,
  type CcusagePeriodReport,
  type CollectorResult,
} from "@acc/adapters";
import type { UsageGranularity, UsageReport } from "@acc/protocol";
import { execWithTimeout, TtlCache } from "./exec";
import type { CcusageOptions } from "./ccusage";

// History changes slowly; cache each granularity's raw output for 5 minutes.
const cache = new TtlCache<string>(300_000);

interface RawPeriodReport {
  totals: CcusagePeriodReport["totals"];
  daily?: CcusageDayRow[];
  weekly?: CcusageDayRow[];
  monthly?: CcusageDayRow[];
}

/**
 * Live usage collector: runs `ccusage <granularity> --json` and normalizes it into a
 * UsageReport time series + by-model/by-agent breakdowns. Fails soft (NOT_INSTALLED /
 * ERROR) with no fabricated data.
 */
export async function collectUsage(
  opts: CcusageOptions,
  granularity: UsageGranularity,
  nowIso: string,
): Promise<CollectorResult<UsageReport>> {
  try {
    let raw = cache.get(granularity);
    if (!raw) {
      const { stdout, code } = await execWithTimeout(
        opts.command,
        [...opts.baseArgs, granularity, "--json"],
        opts.timeoutMs,
      );
      if (code !== 0 && !stdout.trim().startsWith("{")) {
        throw new Error(`ccusage ${granularity} exited ${code}`);
      }
      raw = stdout;
      cache.set(granularity, raw);
    }
    const parsed = JSON.parse(raw) as RawPeriodReport;
    const rows = parsed[granularity] ?? [];
    const report = normalizeCcusageReport(
      { rows, totals: parsed.totals },
      granularity,
      nowIso,
    );
    return {
      data: report,
      health: "HEALTHY",
      detail: `${report.points.length} ${granularity} point(s)`,
      lastError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notInstalled = /ENOENT|not recognized|command not found/i.test(
      message,
    );
    return {
      data: null,
      health: notInstalled ? "NOT_INSTALLED" : "ERROR",
      detail: notInstalled
        ? "ccusage not runnable (need Node + npx)"
        : "ccusage usage failed",
      lastError: message,
    };
  }
}
