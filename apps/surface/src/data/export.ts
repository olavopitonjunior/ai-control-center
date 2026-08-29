import type { UsageReport } from "@acc/protocol";

function download(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportUsageJson(report: UsageReport): void {
  download(`ai-usage-${report.granularity}.json`, "application/json", JSON.stringify(report, null, 2));
}

/** Export the usage time-series as CSV (never includes secrets). */
export function exportUsageCsv(report: UsageReport): void {
  const header = ["period", "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "totalTokens", "cost"];
  const rows = report.points.map((p) =>
    [
      p.period,
      p.tokens.inputTokens ?? "",
      p.tokens.outputTokens ?? "",
      p.tokens.cacheReadTokens ?? "",
      p.tokens.cacheCreationTokens ?? "",
      p.tokens.totalTokens ?? "",
      p.cost ?? "",
    ].join(","),
  );
  download(`ai-usage-${report.granularity}.csv`, "text/csv", [header.join(","), ...rows].join("\n"));
}
