# BUILD_LOG

A running journal across sessions. Newest first.

---

## 2026-08-29 — Spec gap closure (post-M5 conformance pass)

Re-read the 64-section master spec against the delivered code and closed the
remaining gaps. No rewrite: everything is additive on top of v0.1.1.

**What changed**

- **§55 dedup** — `sessionFingerprint` + `dedupeSessions` with source precedence
  (ccusage > codexbar > analytics). Values are _chosen_, never summed, so two
  collectors observing one session cannot double a user's tokens. Applied in the agent
  snapshot and enforced in storage by a unique index (migration 0004).
- **§24 history** — agent ring buffer + `GET /v1/history?limit=N` (and `/v1/containers`).
- **§19/§1 containers & processes** — Glances `processcount` + `containers` plugins →
  `SystemMetric.processCount` and `Snapshot.containers` (migration 0003); System screen
  shows both, or "Not available" when no engine is present.
- **§41 persistence** — `ingestSnapshot` now writes the seven tables that existed but
  were never used (heartbeats, provider usage/limits, token usage, cost, sessions,
  collector health) plus scheduled tasks.
- **§42 retention** — change-detection skips unchanged payloads; the hash excludes
  volatile fields (`updatedAt`, live process counts) that previously made every poll look
  "changed". Retention now cascades 1m→5m→1h instead of only pruning.
- **§21/§22 analytics** — `sessionStats`, `byProject`, `peakUsageHours`, and
  `weightedConsumptionRate` (exponentially weighted, ignores quota resets) feeding
  `forecastExhaustionWeighted`. Algorithm documented in source; result stays ESTIMATED.
- **§33 Surface Mode** — opt-in fullscreen + reduced chrome, plus independent
  keep-awake (Screen Wake Lock) and launch-at-login (tauri-plugin-autostart) switches.
  All default OFF.
- **§17 Sessions** — filter by agent / project / model / date with Active/Idle/History.
- **§57 power** — Performance / Balanced / Low Power / Auto; changes cadence only.
- **§58 backup** — `exportBackup` dumps every history table to JSON; the `machines`
  table is selected column-by-column so pairing tokens can never be exported.
- **§61 acceptance** — `scripts/acceptance.ts` drives the real Surface client against a
  real agent process.

**Verified**

- MVP acceptance: **11/11 checks pass**, including the previously unverified items 14
  (kill → requests fail → blip keeps state → OFFLINE after timeout) and 15 (restart →
  ONLINE), plus 13, 16–18, 19 (no secrets in logs) and 20 (no fake metrics).
- Persistence: all nine tables populate with real data in the running app (10 real
  Windows tasks, Claude 5-hour limit, deduped sessions); across 12 consecutive polls
  `provider_limits` stayed at 10 and `collector_health` at 24 while `system_metrics` and
  `machine_heartbeats` grew — duplicates suppressed, time series retained.
- Live agent: 242 real processes, containers `[]` (no Docker here), history buffer
  populated, all collectors HEALTHY.
- **97 unit/integration tests pass**; typecheck, prettier, frontend build and the native
  Rust build (with the autostart plugin) all clean.

**Still open (honest)**

- macOS agent on real Mac hardware; cloud adapters against live accounts.
- Backup **restore** is not implemented (export only).
- codexbar OFFICIAL provider quotas remain deferred, so Claude limits are
  CALCULATED/ESTIMATED and the 5-hour percentage needs a user-supplied ceiling.
- The raw `cargo build` debug exe still doesn't serve the embedded frontend; use
  `tauri dev` / `tauri build`.

---

## 2026-08-28 — Milestone 5: Cloud automation adapters

**What changed**

- **Protocol:** `AutomationSource` gains `github-actions`, `vercel`, `supabase`.
- **Adapters (pure, tested against real API shapes):**
  - `normalizeGithubActions` (workflows + runs → tasks; latest run per workflow; failed →
    ERROR, disabled → DISABLED; cron/next-run null since not in the workflows API).
  - `normalizeN8n` (workflows + executions; status field with a `finished`-boolean fallback).
  - `normalizeSupabaseCron` (pg_cron `cron.job` + `cron.job_run_details`; **includes the
    cron schedule**).
  - `normalizeVercelCrons` (cron defs from `vercel.json`; run status honestly null — the
    Vercel API doesn't expose cron executions).
- **Agent:** `collectCloudAutomations` runs the providers configured via the agent's env
  (`ACC_GITHUB_TOKEN`/`ACC_GITHUB_REPOS`, `ACC_N8N_URL`/`ACC_N8N_KEY`), fails per-provider,
  and is merged into the snapshot's automations with a `cloud` collector-health entry.
  Credentials stay on the agent — never sent to the Surface, stored in its DB, or logged.
- **Surface:** Automations rows show a source tag (Task Scheduler / cron / launchd / n8n /
  GitHub Actions / Vercel / Supabase), cloud sources highlighted.

**Verified**

- **End-to-end via a mock n8n server** (no external creds): the agent fetched
  `/api/v1/workflows` + `/executions`, normalized, and **merged into `/v1/automations`** —
  "Rankd Lead Enrichment" → ERROR (failed execution), "Idle Flow" → DISABLED; `cloud`
  collector HEALTHY. Default (no cloud env) → `cloud` NOT_CONFIGURED (no regression).
- 78 tests pass (incl. 8 cloud-normalizer tests against real GitHub/n8n/pg_cron/Vercel
  shapes); typecheck + prettier clean; Surface build OK.

**NOT verified (honest — needs your tokens / live services)**

- GitHub Actions, n8n, Supabase, and Vercel adapters have **not** been run against the real
  services (only the mock n8n path + fixture tests). The GitHub fetch hits `api.github.com`
  and needs a real token + repos; Supabase needs a Postgres connection to run pg_cron
  queries (the agent's DB-connection wiring for Supabase is not implemented — only the
  normalizer). Confirm against live accounts before relying on them.

**Project status:** Milestones 0–5 complete. The full planned scope (audit → MVP →
analytics → Mac agent → connection/TLS/mDNS → cloud automations) is implemented, with
macOS-on-hardware and live-cloud paths flagged as the remaining real-world confirmations.

---

## 2026-08-28 — Milestone 4: Connection enhancements (mDNS, TLS, interface detection)

**What changed**

- **Interface detection:** `classifyInterface` (usb4/Thunderbolt → wifi → ethernet →
  unknown) + `preferredConnectionType` (USB4 > Ethernet > Wi-Fi). Agent sets
  `machine.connectionType` + reports interfaces; the Surface shows a connection-type badge.
- **TLS:** agent serves **HTTPS** when `ACC_TLS_CERT` + `ACC_TLS_KEY` are set (fail-closed
  if a path is unreadable). `scripts/generate-cert.sh` makes a self-signed cert (fixed a
  Git-Bash MSYS path-mangling bug on `-subj` via `MSYS_NO_PATHCONV=1`). Client already
  handles `https://` addresses.
- **mDNS:** agent advertises `_ai-control._tcp` (bonjour-service) with identity TXT records
  when LAN-exposed; `browseAgents` discovery helper; `GET /v1/discover` browses the LAN and
  returns peers (excludes self, bearer-protected). Surface: `fetchDiscover` + Settings
  "Discover machines" → one-click add. New `DiscoveredAgent` protocol schema.

**Verified with REAL network activity on this box**

- Live connection type detected: **wifi** (this Surface is on Wi-Fi).
- **TLS**: generated a self-signed cert, ran the agent with it → log "listening on https",
  `curl -k https://127.0.0.1/health` returned valid JSON.
- **mDNS advertise+discover**: a browser discovered the live agent
  (`OLAVO-PC @ 192.168.0.228 os=windows`); with two agents (pc-a/pc-b), `GET /v1/discover`
  on A returned **B** and excluded A.
- 70 tests pass (incl. netiface classifier tests); typecheck + prettier clean; Surface build OK.

**Known limitations (honest)**

- Surface discovery runs **through a reachable agent's** `/v1/discover` (the webview can't
  do raw mDNS) — add the first machine manually, then discover the rest. A native
  (Rust/`mdns-sd`) browser in the Surface is a possible future alternative.
- Self-signed TLS requires trust/pinning; no cert-pinning-at-pairing yet.
- `connectionType` reflects the agent's own best interface, not necessarily the exact path
  the Surface used to reach it (transport is descriptive metadata only).
- USB4 is detected by interface name; not separately exercised on hardware here.
- The Surface "Discover → Add" click flow is verified by construction (it calls the
  verified `/v1/discover` + the M1-proven add-machine path), not via a headless UI click.

**Next step**
Milestone 5 — cloud automation adapters (n8n, GitHub Actions, Vercel, Supabase): running /
next-run / last-result / failures / history, without storing cloud credentials in plaintext.

---

## 2026-08-28 — Milestone 3: macOS agent (cron + launchd)

**What changed**

- **Adapters (pure, tested):** `parseCrontab` (5-field + `@keyword` entries; skips comments,
  blank lines, and `NAME=value` env assignments; never guesses next-run) and
  `parseLaunchctlList` (PID/Status/Label; running/idle/failed; excludes `com.apple.*`).
- **Agent:** `collectMacAutomations` runs `crontab -l` + `launchctl list` on macOS (each
  fails independently). New **platform-dispatched** `collectAutomations`: win32 → Task
  Scheduler, darwin → cron+launchd, else NOT_CONFIGURED. The snapshot's automations
  collector was renamed `windows-task-scheduler` → `automations` (source stays specific on
  each task). Updated the Surface Automations lookup + agent test accordingly.
- **Install:** `install-agent-macos.sh` now validates prereqs, generates/reuses a pairing
  token (gitignored, `umask 077`), writes a per-user launchd plist
  (`~/Library/LaunchAgents/com.aicontrolcenter.agent.plist`, RunAtLoad + KeepAlive, bound
  0.0.0.0 with the token), and `launchctl load`s it — no root. Added
  `uninstall-agent-macos.sh`. Docs updated (DATA_SOURCES automations section).

**Verified here (Windows)**

- 65 tests pass (incl. 6 new mac-parser tests against real crontab/launchctl formats);
  typecheck + prettier clean; Surface build OK.
- Windows agent unchanged through the dispatch: `automations` collector HEALTHY, 10 real
  tasks (source `windows-task-scheduler`).
- `bash -n` validates both macOS scripts; the plist heredoc renders correctly.

**NOT verified (honest — no macOS hardware in this environment)**

- The macOS collectors and the launchd installer have **not been run on a Mac**. They are
  built from the documented `crontab`/`launchctl`/launchd formats and unit-tested against
  those formats, but on-hardware behavior (real `launchctl list` columns across macOS
  versions, launchd load, LAN reachability) must be confirmed on an actual Mac before
  calling the Mac path production-ready.

**Next step**
Milestone 4 — connection enhancements: mDNS discovery, one-click pairing, USB4/Ethernet
interface detection, TLS/secure pairing. On a real Mac: run install-agent-macos.sh and
confirm cron/launchd automations + Glances + ccusage appear on the Surface.

---

## 2026-08-28 — Milestone 2: Analytics, History & Forecast

**What changed**

- **Protocol:** `UsageReport` / `UsagePoint` / `UsageBreakdownEntry` (time series + by-model/
  by-agent/by-project), `UsageGranularity`.
- **Adapters:** `normalizeCcusageReport` builds a sorted series + by-model/by-agent
  breakdowns from any ccusage daily/weekly/monthly report (deriving model totals from
  parts, since ccusage modelBreakdowns omit totalTokens). Tested on a real 2-period fixture.
- **Agent:** `/v1/usage?granularity=daily|weekly|monthly` via a cached usage collector
  (5-min TTL); wired into the injectable collector set.
- **Analytics:** `downsample` (raw → interval averages, null-safe), `retentionPlan`
  (24h raw / 7d 1-min / 90d 5-min cutoffs), `percentChange`, `shares`, `forecastFromCeiling`
  (usedFraction = used/ceiling → ESTIMATED exhaustion). Unit-tested.
- **Surface:** dependency-free SVG charts (BarChart / LineChart / Donut). **Usage** screen:
  daily/weekly/monthly selector → tokens & cost per period, by-model, by-agent, by-project
  (best-effort from sessions), composition + ratios, CSV/JSON export. **System**: CPU/RAM
  history line charts. **Settings**: optional Claude 5-hour token ceiling. **Limits**: when a
  ceiling is set, shows % + an ESTIMATED exhaustion forecast (pace, confidence). **Insights**:
  real week-over-week token trend, top-agent share, cache utilization, forecast, failing
  automations. **Retention job** runs on startup + every 5 min (idempotent).

**Verified with REAL data on this box**

- `/v1/usage?granularity=weekly`: 2 points; by-model claude-opus-4-8 = 61.2M tokens,
  gpt-5 = 754; by-agent claude = $41.77; totals present.
- **Retention end-to-end**: seeded 6 raw samples ~30h old across 3 one-minute buckets →
  after app startup, exactly **3 deduplicated rollups** (`rollups=3 distinct=3`) and old raw
  pruned; fresh raw kept accumulating from live polling. Fixed a StrictMode double-invoke
  duplicate-rollup race with a unique index (migration 0002) + `INSERT OR IGNORE` + an
  in-flight guard.
- 59 tests pass; typecheck + prettier clean; Surface Vite build OK; migrations 0001+0002
  apply cleanly.

**Known limitations (honest)**

- Project breakdown is best-effort from live sessions (ccusage `--instances` returns nothing
  in this version) — labeled ESTIMATED.
- Exhaustion forecast requires a user-supplied ceiling (ESTIMATED) — no OFFICIAL ceiling
  until codexbar (deferred). Confidence is driven by in-session observation count.
- Retention implements raw→1-minute rollups + prune; the 1m→5m→1h re-rollup chain is
  pruned-but-not-yet-cascaded (documented; safe against growth).
- Provider-limit / session history persistence over time is deferred (usage history comes
  from ccusage directly).

**Next step**
Milestone 3 — Mac agent (ccusage + Glances + cron + launchd + optional codexbar CLI);
seamless machine switching Surface-side is already in place.

---

## 2026-08-28 — Milestone 1: Functional MVP

**What changed**

- **Agent — live collectors (replacing M0 placeholders):**
  - `ccusage`: shells `npx ccusage@latest daily|blocks|session --json` (cached 60s, 45s
    timeout), normalizes to the Claude provider rollup (today's tokens/cost + the active
    **5-hour window as a CALCULATED limit with a real reset countdown**) and the session
    list (status derived from activity recency).
  - `glances`: REST client to `127.0.0.1:61208`, normalizes to SystemMetric; degrades to
    NOT_CONFIGURED with a helpful message when unreachable (optional loopback autostart).
  - `windows-task-scheduler`: `Get-ScheduledTask`/`Get-ScheduledTaskInfo` via
    `-EncodedCommand` (base64 UTF-16LE, shell:false); ISO dates; excludes `\Microsoft\`
    noise; SCHED_S_* HRESULTs treated as non-errors.
  - Collectors are **injectable** (fast deterministic stubs in tests); snapshot builder
    runs them in parallel with error isolation and sets machine DEGRADED on any ERROR.
  - Added `@fastify/cors` (reflect origin) + granular `/v1/{system,providers,sessions,
automations,collectors}` + a 2s snapshot cache.
- **Surface — data layer + populated UI:**
  - `@acc/protocol` schema-validated agent client; `deriveConnection` (ONLINE/DEGRADED/
    OFFLINE/PAIRING with heartbeat timeout); polling store (4s) persisting history.
  - Storage abstraction: **SqliteStore** (Tauri, `@tauri-apps/plugin-sql`) / **MemoryStore**
    (browser dev, localStorage). Official `isTauri()` detection.
  - Machine registration (Settings) + functional machine selector + live status pill.
  - Populated screens with real data + provenance chips + live countdowns:
    Overview, Limits, Sessions, System (with sparkline + "Not available" for missing GPU/
    temp), Usage, Automations, Insights. Zero fabricated values.

**Verified with REAL data on this box**

- Agent `/v1/snapshot`: Claude cost + 18.99M tokens, active 5-hour window (`resetInSeconds`),
  CPU/RAM/disk/net from Glances (GPU/temp honestly null), 2 sessions, **10** Task Scheduler
  automations (incl. genuine ERROR states). All collectors HEALTHY; machine ONLINE.
- Error isolation: with Glances down, its collector → NOT_CONFIGURED while ccusage + tasks
  stay HEALTHY and the machine stays ONLINE.
- CORS: `access-control-allow-origin` reflected → the Surface webview can reach the agent.
- Native Tauri app (`tauri dev`): creates + migrates SQLite (**15 tables, WAL**); the
  webview polled the live agent **260×** successfully; persistence INSERT validated against
  the migrated schema (17 cols, nullable GPU/temp, index present).
- 47 unit/integration tests pass; typecheck + prettier clean; surface Vite build OK.

**Known limitations (honest)**

- Claude limits are CALCULATED/ESTIMATED from ccusage (no OFFICIAL provider ceiling until
  codexbar is added) — 5-hour % shows "Not available", reset countdown is real.
- Sessions lack pid/start/duration (ccusage doesn't expose them); status is recency-derived.
- Multi-period Usage (24h/7d/30d) and trend Insights need accumulated history → Milestone 2.
- Raw `cargo build` debug exe doesn't run the embedded frontend cleanly; use `pnpm
surface:tauri` (`tauri dev`) / `tauri build` — both verified.
- Mac agent (cron/launchd) is Milestone 3.

**Next step**
Milestone 2: history retention/downsampling, 24h/7d/30d aggregation + charts, project/
model/agent analytics, quota velocity + exhaustion forecast wiring, deterministic trend
insights, CSV/JSON export.

---

## 2026-08-28 — Milestone 0: Audit + Scaffold + Toolchain

**What changed**

- Audited the four upstreams (Win-CodexBar, CodexBar, ccusage, Glances) against their
  repos AND real local output. Wrote `docs/AUDIT.md`, `ARCHITECTURE.md`, `SECURITY.md`,
  `DATA_SOURCES.md`, `UPSTREAM.md`, `CLAUDE.md`, `README.md`.
- Scaffolded a pnpm + TypeScript monorepo:
  - `@acc/protocol` — zod-validated normalized model (Machine, ProviderUsage, UsageLimit,
    TokenUsage, AISession, SystemMetric, ScheduledTask, Snapshot) + enums + provenance.
  - `@acc/analytics` — deterministic percent/countdown/velocity/exhaustion-forecast.
  - `@acc/adapters` — Collector interface + pure ccusage & Glances normalizers.
  - `@acc/agent` — Fastify service: `/health`, `/v1/snapshot`, collector registry with
    error isolation, loopback-default bind, constant-time bearer auth, redacted logging.
  - `@acc/surface` — Tauri 2 + React + Vite shell: 8 nav sections, machine selector,
    status pill, honest empty states, SQLite migration (`0001_init.sql`) with all §41
    tables, generated app icons.
- Captured real fixtures: ccusage `daily --json` and Glances API v4 payloads (encoded in
  `adapters.test.ts`).

**Why**
Milestone 0 per master spec: prove the existing tools provide the data and build a
reusable, honest foundation before feature work.

**Toolchain installed / verified (this machine = Surface Pro)**

- Node v22.23.1, npm 10.9.8 (pre-existing)
- pnpm 11.24.0 (via corepack)
- Rust 1.98.0 + cargo 1.98.0 (rustup)
- MSVC C++ Build Tools (winget `Microsoft.VisualStudio.2022.BuildTools`, VCTools workload)
- WebView2 runtime 151.x (pre-existing)
- Glances 4.5.6 (Python 3.12.10, `pip install 'glances[web]'`)
- ccusage: run on demand via `npx ccusage@latest` (no install)

**Tests run**

- `pnpm test` → **31 passed** (protocol 7, analytics 13, adapters 6, agent 5).
- `pnpm -r typecheck` → clean across all 5 TS packages.
- Agent smoke test: `GET /health` and `/v1/snapshot` over real HTTP returned valid,
  schema-correct payloads with honest `NOT_CONFIGURED` collectors and real machine
  identity; startup bound `127.0.0.1` ("not reachable from the LAN"); no secrets in logs.
- `pnpm --filter @acc/surface build` (Vite) → built (31 modules).
- Native `cargo build` of `src-tauri`: **succeeded in ~8m** (full tauri/wry/webview2 +
  sqlx-sqlite stack), producing `ai-control-center.exe` (16.9 MB). Launching the binary
  opened the window and initialized the SQL plugin without crashing; closed cleanly.
- Vite dev server verified serving the app (`GET /` → title "AI Control Center", HMR +
  `main.tsx`/`App.tsx` transforms).

**Known limitations (honest)**

- Collectors are placeholders that report `NOT_CONFIGURED` — no live data yet (M1).
- Surface screens show empty states only; no charts/history/pairing yet (M1/M2).
- Provider limits will be CALCULATED/ESTIMATED from ccusage until codexbar OFFICIAL
  quotas are added (deferred by user).
- Plaintext LAN HTTP (bearer-auth, loopback default). TLS is M4.
- A local `python`/hermes venv shadows PATH; use the explicit Python 3.12 path for Glances.

**Next step**
Milestone 1: machine registration + pairing on the Surface; live ccusage, Glances, and
Windows Task Scheduler collectors in the agent; heartbeat + OFFLINE timeout; populate
Overview/Limits/Sessions/System. Then run the §61 acceptance test against a real
monitored machine.
