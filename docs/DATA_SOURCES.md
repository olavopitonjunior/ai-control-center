# DATA_SOURCES — Precedence, Provenance & Deduplication

## The three user-facing quality labels

Every metric shown on the Surface carries exactly one of:

| Label          | Meaning                                               | Example                                                         |
| -------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| **OFFICIAL**   | Authoritative value straight from the provider or OS. | Provider quota via codexbar; RAM via Glances.                   |
| **CALCULATED** | Correct math derived from authoritative _local_ data. | ccusage summing token events into a 5‑hour block; today's cost. |
| **ESTIMATED**  | The value/capacity itself was inferred or projected.  | Unknown quota ceiling; projected exhaustion time.               |

Internally provenance is richer (`SourceProvenance`): `OFFICIAL`, `OFFICIAL_LOCAL`,
`CALCULATED`, `ESTIMATED`. `OFFICIAL_LOCAL` (e.g. local hardware) collapses to OFFICIAL
for display via `toSourceQuality()` in `packages/protocol/src/common.ts`.

> **Never present an ESTIMATE as an official provider value.** Projected exhaustion is
> always ESTIMATED and always labeled as AI Control Center analytics, never the provider.

## Source precedence (spec §54)

**Quota / limits**

1. Provider official endpoint via **codexbar** (OFFICIAL) — _deferred until user opts in_
2. Provider CLI (OFFICIAL)
3. Calculated from local data — e.g. ccusage `blocks` (CALCULATED)
4. Estimate (ESTIMATED)

_MVP reality:_ with codexbar deferred, Claude limits are sourced from ccusage and shown
as **CALCULATED** (5‑hour blocks) or **ESTIMATED** (where a ceiling must be assumed) —
clearly labeled, never dressed up as OFFICIAL.

**Session tokens**

1. Coding-tool native log via **ccusage** (CALCULATED) ← MVP primary
2. codexbar local cost scan (CALCULATED) — later
3. Calculated estimate (ESTIMATED)

**System metrics**

1. **Glances** (OFFICIAL_LOCAL)
2. Native fallback only if intentionally implemented (none in M0/M1)

**Automations** (platform-dispatched, one "automations" collector)

- Windows → Task Scheduler (`Get-ScheduledTask`), excluding `\Microsoft\` system tasks.
- macOS → user **crontab** (`crontab -l`) + **launchd** (`launchctl list`), excluding
  `com.apple.*` system agents. No root required. Next-run times for cron are not computed
  (would need a cron engine) → `nextRunAt` stays null rather than guessed.
- Linux (systemd timers / cron) → later milestone; reports NOT_CONFIGURED for now.
- **Cloud** (separate `cloud` collector, merged into the automations list): GitHub Actions
  (workflows + runs), n8n (workflows + executions), Supabase (pg_cron `cron.job` +
  `cron.job_run_details`), Vercel (cron defs from `vercel.json`; run status not exposed by
  the API → left null). Credentials are read from the **agent's** environment only
  (`ACC_GITHUB_TOKEN`/`ACC_GITHUB_REPOS`, `ACC_N8N_URL`/`ACC_N8N_KEY`, …) — never sent to
  the Surface, never stored in the Surface DB, never logged. Each provider fails
  independently. GitHub/n8n `nextRunAt` isn't in those APIs → null (not guessed).

Never silently combine numbers with incompatible definitions (e.g. provider-side quota
vs locally-summed tokens). If both exist, show both with their sources, or pick per the
precedence above — never average them.

## Missing data

If a source can't provide a value, the field is **null** and the UI renders
_Not available_ / _Not configured_ / _Waiting for data_ — **never `0`**. Proven on this
Surface: Glances reports no GPU and no CPU-temperature sensor, so those render _Not
available_ (encoded in `adapters.test.ts`).

## Collector health (per source)

`HEALTHY | STALE | ERROR | NOT_INSTALLED | NOT_CONFIGURED`. Surfaced per-collector so the
UI can show, e.g., `ccusage HEALTHY · Glances ERROR · Tasks HEALTHY` while the rest of the
dashboard keeps working. A machine reachable with a failing important collector is
`DEGRADED`, not `OFFLINE`.

## Deduplication (prevent double-counting) — spec §55

ccusage and (later) codexbar can observe the **same** local Claude sessions. A user's
totals must not double because two collectors saw one session. Strategy:

- Build a stable **fingerprint** per session:
  `agent + sessionId + projectPath + model + startedAt(rounded) + source-event`.
- The `ai_sessions` table has a `fingerprint` column; on ingest, upsert by fingerprint.
- When two sources report the same fingerprint, apply **source precedence** (native log
  via ccusage wins for tokens) rather than adding.
- Aggregate token/cost rollups are computed from the **deduplicated** session set, not by
  summing raw collector outputs.

This behavior is documented here and will be enforced in the Surface ingest layer (M1/M2)
with tests in `tests/`.

## Provenance in the UI

Each important metric is traceable to its source, e.g.:

```
Claude weekly quota   source: ccusage    quality: CALCULATED   (codexbar → OFFICIAL later)
Claude session tokens source: ccusage    quality: CALCULATED
RAM / CPU / disk      source: glances    quality: OFFICIAL
Projected exhaustion  source: analytics  quality: ESTIMATED
projectPath           source: process
```

`UsageLimit`, `Cost`, and `AISession.provenance` all carry `source` + `sourceQuality`
fields in `@acc/protocol` so the UI never loses this trail.
