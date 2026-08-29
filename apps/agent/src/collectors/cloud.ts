import {
  normalizeGithubActions,
  normalizeN8n,
  type CollectorResult,
  type GithubRun,
  type GithubWorkflow,
  type N8nExecution,
  type N8nWorkflow,
} from "@acc/adapters";
import type { ScheduledTask } from "@acc/protocol";

/**
 * Cloud automation collector. Reads provider credentials from the AGENT's environment
 * only — they never travel to the Surface and are never logged. Each provider fails
 * independently; unconfigured providers are simply skipped.
 *
 * Config:
 *   GitHub Actions: ACC_GITHUB_TOKEN + ACC_GITHUB_REPOS="owner/repo,owner/repo2"
 *   n8n:            ACC_N8N_URL + ACC_N8N_KEY
 */
async function fetchJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok)
      throw new Error(`HTTP ${res.status} for ${url.replace(/\?.*/, "")}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function collectGithub(
  machineId: string,
  timeoutMs: number,
): Promise<ScheduledTask[]> {
  const token = process.env.ACC_GITHUB_TOKEN?.trim();
  const repos = (process.env.ACC_GITHUB_REPOS ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  if (!token || repos.length === 0) return [];
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const out: ScheduledTask[] = [];
  for (const repo of repos) {
    const wf = (await fetchJson(
      `https://api.github.com/repos/${repo}/actions/workflows`,
      headers,
      timeoutMs,
    )) as {
      workflows: GithubWorkflow[];
    };
    const runs = (await fetchJson(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=100`,
      headers,
      timeoutMs,
    )) as {
      workflow_runs: GithubRun[];
    };
    out.push(
      ...normalizeGithubActions(
        repo,
        wf.workflows ?? [],
        runs.workflow_runs ?? [],
        machineId,
      ),
    );
  }
  return out;
}

async function collectN8n(
  machineId: string,
  timeoutMs: number,
): Promise<ScheduledTask[]> {
  const base = process.env.ACC_N8N_URL?.trim().replace(/\/+$/, "");
  const key = process.env.ACC_N8N_KEY?.trim();
  if (!base || !key) return [];
  const headers = { "X-N8N-API-KEY": key, accept: "application/json" };
  const wf = (await fetchJson(
    `${base}/api/v1/workflows`,
    headers,
    timeoutMs,
  )) as { data: N8nWorkflow[] };
  const ex = (await fetchJson(
    `${base}/api/v1/executions?limit=100`,
    headers,
    timeoutMs,
  )) as {
    data: N8nExecution[];
  };
  return normalizeN8n(wf.data ?? [], ex.data ?? [], machineId);
}

export async function collectCloudAutomations(
  machineId: string,
  _nowIso: string,
  timeoutMs = 12_000,
): Promise<CollectorResult<ScheduledTask[]>> {
  const providers: { name: string; run: () => Promise<ScheduledTask[]> }[] = [];
  if (process.env.ACC_GITHUB_TOKEN && process.env.ACC_GITHUB_REPOS)
    providers.push({
      name: "github-actions",
      run: () => collectGithub(machineId, timeoutMs),
    });
  if (process.env.ACC_N8N_URL && process.env.ACC_N8N_KEY)
    providers.push({
      name: "n8n",
      run: () => collectN8n(machineId, timeoutMs),
    });

  if (providers.length === 0) {
    return {
      data: null,
      health: "NOT_CONFIGURED",
      detail:
        "no cloud providers configured (set ACC_GITHUB_TOKEN/ACC_GITHUB_REPOS or ACC_N8N_URL/ACC_N8N_KEY)",
      lastError: null,
    };
  }

  const results = await Promise.allSettled(providers.map((p) => p.run()));
  const tasks: ScheduledTask[] = [];
  const errors: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") tasks.push(...r.value);
    else
      errors.push(
        `${providers[i]!.name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
      );
  });

  const anyOk = results.some((r) => r.status === "fulfilled");
  return {
    data: anyOk ? tasks : null,
    health: anyOk ? "HEALTHY" : "ERROR",
    detail: `${tasks.length} cloud automation(s) from ${providers.length} provider(s)${errors.length ? " — " + errors.length + " failing" : ""}`,
    lastError: errors.length ? errors.join("; ") : null,
  };
}
