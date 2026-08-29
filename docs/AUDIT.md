# AUDIT — Upstream Open-Source Projects (Milestone 0)

This audit answers the 20 questions from the master spec §4. Findings come from the
upstream repositories (the source of truth) and from **real output captured on this
machine (the Surface Pro) on 2026-08-28**. Where the spec's assumptions differed from
reality, reality wins and is noted.

## Summary table

| Project                                                 | Version/Channel                      | License  | Reuse mode                                      | Role                                      |
| ------------------------------------------------------- | ------------------------------------ | -------- | ----------------------------------------------- | ----------------------------------------- |
| [Win-CodexBar](https://github.com/nesszer/Win-CodexBar) | Tauri+React+Rust, 56 providers       | MIT      | External CLI (`codexbar-cli`, `codexbar serve`) | **Deferred** — OFFICIAL provider quotas   |
| [CodexBar](https://github.com/steipete/CodexBar)        | Swift, macOS 14+, 69+ providers      | MIT      | macOS CLI (`codexbar serve/cost/config`)        | Mac agent option (Milestone 3)            |
| [ccusage](https://github.com/ccusage/ccusage)           | npm `ccusage`, verified working here | MIT      | `npx ccusage@latest <period> --json`            | **Primary** Claude Code usage/tokens/cost |
| [Glances](https://github.com/nicolargo/glances)         | 4.5.6 (API v4), installed here       | LGPL-3.0 | REST API `glances -w` :61208                    | **Primary** system telemetry              |

---

## 1. What Win-CodexBar provides

A Windows system-tray (Tauri + React) app backed by a reusable Rust provider core,
tracking usage across **56 providers** (Claude, Codex, Cursor, Copilot, OpenAI, Gemini,
DeepSeek, Groq, OpenRouter, Mistral, Perplexity, Grok, Ollama, Azure OpenAI, JetBrains
AI, and more). Ships a Rust CLI (`codexbar-cli`) with `usage`, `cost`, `diagnose`, and a
`serve` dashboard/API. Directory layout: `apps/desktop-tauri/`, `rust/`, `scripts/`,
`docs/`. License: **MIT**.

## 2. What CodexBar (steipete) provides

The original macOS menu-bar app (Swift 6.2+, macOS 14+, SwiftUI). 69+ providers, usage
meters, reset countdowns, spend tracking, and a bundled `codexbar` CLI (`config`, `cost`,
`serve`) for macOS and Linux. License: **MIT**. We will not port the Swift UI; on macOS
we may reuse its CLI (Milestone 3).

## 3. What ccusage provides — VERIFIED HERE

Reads local coding-agent logs and reports token usage + cost with **no network access**.
Supported agents include Claude Code, Codex, OpenCode, Amp, Droid, Gemini CLI, Copilot
CLI, Kimi, Qwen, and more. Output modes: `daily`, `weekly`, `monthly`, `session`,
`blocks` (Claude 5-hour windows), each with `--json`. License **MIT**, package **ccusage**.

Real output from `npx ccusage@latest daily --json` on this machine (abridged):

```json
{
  "daily": [
    { "period": "2026-08-28", "agent": "all",
      "inputTokens": 16287, "outputTokens": 19064,
      "cacheCreationTokens": 81842, "cacheReadTokens": 719110,
      "totalTokens": 836303, "totalCost": 1.73601,
      "modelsUsed": ["claude-opus-4-8"],
      "modelBreakdowns": [ { "modelName": "claude-opus-4-8", "cost": 1.73601, ... } ],
      "metadata": { "agents": ["claude"] } }
  ],
  "totals": { "inputTokens": 16783, "outputTokens": 19322,
    "cacheCreationTokens": 81842, "cacheReadTokens": 719110,
    "totalTokens": 837057, "totalCost": 1.73921 }
}
```

It exposes: input/output/cache-read/cache-creation tokens, per-model breakdowns, per-day
periods, cost (USD), and the originating agent via `metadata.agents`. This is exactly the
Claude-Code data we need. Weekly/monthly/session/blocks share the same field vocabulary.

## 4. What Glances provides — VERIFIED HERE

Glances **4.5.6**, REST **API v4**, started with `glances -w` (default port **61208**).
`GET /api/4/pluginslist` returned:

```
alert, amps, cloud, connections, containers, core, cpu, diskio, folders, fs, gpu, help,
ip, irq, load, mem, memswap, mpp, network, now, npu, percpu, ports, processcount,
processlist, programlist, psutilversion, quicklook, raid, sensors, system, uptime,
version, vms, wifi
```

Sample real payloads captured on this Surface:

```jsonc
// /api/4/cpu     -> {"total":22.5,"user":...,"system":...,"idle":...,"cpucore":8,...}
// /api/4/mem     -> {"total":8424185856,"used":7793135616,"percent":92.5,"free":...}
// /api/4/fs      -> [{"device_name":"C:\\","fs_type":"NTFS","size":254794526720,"used":155264032768,"percent":60.9}]
// /api/4/sensors -> [{"label":"Battery","value":60,"unit":"%","type":"battery"}]  // NO CPU temp sensor here
// /api/4/gpu     -> []                                                            // NO discrete GPU here
// /api/4/network -> [{"interface_name":"...","bytes_recv_rate_per_sec":0,"bytes_sent_rate_per_sec":0,...}]
// /api/4/uptime  -> "43 days, 17:16:16"                                           // human string, must parse
```

**Key reality check:** this Surface reports **no GPU** and **no CPU-temperature sensor**.
That validates the "never fake missing data" rule — those fields must render _Not
available_, never `0`. Note Glances binds **0.0.0.0** by default → the agent must launch
it bound to `127.0.0.1` and never expose it directly.

## 5. Overlaps

- **Claude/Codex usage:** ccusage (local logs, CALCULATED) vs Win-CodexBar (provider
  endpoints, OFFICIAL). They can double-count the same local sessions → dedup needed
  (see `DATA_SOURCES.md`).
- **Providers:** Win-CodexBar and CodexBar both cover the same provider matrix on their
  respective OSes.
- **System metrics:** Glances is the single source; no overlap.

## 6. What to reuse

ccusage (Claude usage), Glances (system) — both **verified working here**. Win-CodexBar /
CodexBar CLIs for OFFICIAL provider quotas (deferred until the user opts in).

## 7. What needs custom development

The **AI Monitor Agent** (normalizes sources behind one authenticated API), the **Surface
control-plane app** (dashboard, history DB, analytics, insights, multi-machine), the
**normalized protocol** (`@acc/protocol`), the **analytics/forecast** engine, and the
**OS scheduler collectors** (Task Scheduler / cron / launchd). None of the upstreams
provide a multi-machine control plane or historical analytics.

## 8. Dependency licenses

Our code: MIT-compatible. Upstreams: ccusage **MIT**, CodexBar/Win-CodexBar **MIT**,
Glances **LGPL-3.0**. Runtime deps: Fastify (MIT), zod (MIT), React (MIT), Vite (MIT),
Tauri (MIT/Apache-2.0), `tauri-plugin-sql`/SQLx→SQLite (MIT/Apache-2.0, SQLite public
domain).

## 9. Legal reuse

Yes. MIT tools are consumed as external binaries (`npx ccusage`) — no code copied.
**Glances is LGPL-3.0 and we deliberately do NOT vendor or link it** — we call its REST
API over localhost as a separate process, which keeps us clear of LGPL linking
obligations. This must remain true (see `UPSTREAM.md`).

## 10. What stays an external dependency

Glances (REST, separate process), ccusage (CLI via npx), and — later — codexbar (CLI).

## 11. What can be imported as a library

Only our own `@acc/*` packages. No upstream is imported as a library in the agent.

## 12. What is called only through CLI/API

ccusage (CLI JSON), Glances (REST), codexbar (CLI, later).

## 13. Win-CodexBar: fork, library, or extract?

**Reference + external CLI**, not a fork. For the Claude-Code-first MVP we do not need its
Rust core; ccusage covers Claude usage. If/when OFFICIAL provider quotas are wanted, we
call `codexbar-cli`/`codexbar serve` on localhost and normalize its JSON — no fork, no
source modification. This keeps upstream tracking trivial.

## 14. Is Win-CodexBar's Rust provider layer decoupled enough to reuse in the agent?

It is exposed cleanly via the CLI, which is the decoupling boundary we use. We
intentionally avoid linking the Rust crate directly: that would force a Rust toolchain
onto every monitored machine and couple us to upstream internals. The CLI/JSON boundary
is sufficient and stable.

## 15. How macOS obtains equivalent provider data

Milestone 3: ccusage on macOS (same as Windows) for Claude usage; optionally steipete's
`codexbar` CLI for OFFICIAL provider quotas; Glances for system; cron + launchd for
automations.

## 16. Current `codexbar serve` capabilities (Win + mac)

Both expose a local dashboard/API surfacing provider/account/quota/payload metrics.
Exact flags (`--host`/`--port`/`--dashboard-token`/`--allow-plain-http`) are **not yet
confirmed on this machine** because codexbar is not installed (user deferred it). To be
captured when the OFFICIAL-quota integration is scheduled.

## 17. Current `codexbar sessions` capabilities

Not confirmed locally (deferred). For the MVP, session detection is sourced from ccusage
(`session` mode) plus local process inspection.

## 18. Exact JSON schemas currently emitted (codexbar)

Deferred — to be captured directly from the installed CLI before we build that adapter.
We will not guess schemas.

## 19. Current ccusage JSON schemas

Captured above (§3) and encoded as the `CcusageDailyReport` type + fixtures in
`packages/adapters/src/ccusage.ts` / `adapters.test.ts`.

## 20. Current Glances REST endpoints

Captured above (§4). Plugin list + representative payloads encoded as the
`GlancesSnapshot` type + fixtures in `packages/adapters/src/glances.ts` /
`adapters.test.ts`.

---

### Decisions that follow from this audit

1. **Claude-Code-first via ccusage** (user's explicit focus). codexbar OFFICIAL quotas
   deferred, cleanly, behind the same adapter boundary.
2. **Glances via localhost REST, never vendored** (LGPL hygiene + process isolation).
3. **Agent = thin normalizer over external tools**, not a re-implementation (spec §63).
4. **No fabricated data** — the live GPU/temperature absence on this Surface is the proof
   case baked into tests.
