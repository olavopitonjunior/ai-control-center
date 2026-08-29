# CLAUDE.md — AI Control Center

Project context for future Claude Code sessions. Read this first.

## Product goal

A **local-first, touch-first AI observability appliance**. The **Surface Pro is the
control plane**; monitored machines (a **Mac over Wi‑Fi**, a **PC over Ethernet**, more
later) each run a lightweight **AI Monitor Agent**. The Surface shows AI provider
usage/limits, active/historical AI coding sessions, system telemetry, automations, and
deterministic analytics/insights — across multiple machines, switchable from the UI.

**Current focus:** Claude Code usage (via ccusage) + system telemetry (via Glances).
codexbar (OFFICIAL provider quotas) is **deferred** until the user opts in.

## Architecture (see docs/ARCHITECTURE.md)

```
Monitored machine: ccusage(CLI) + Glances(REST 127.0.0.1) + scheduler → AI Monitor Agent → LAN
Surface: AI Control Center (Tauri+React) → SQLite history → analytics/insights → dashboard
```

The agent is the **only** LAN-facing process; everything else binds localhost. Transport
is HTTP/JSON over IP (Wi‑Fi/Ethernet/USB4 are interchangeable).

## Repository structure

```
packages/protocol   zod-validated normalized model (the wire contract)
packages/analytics  deterministic math: percent, countdown, velocity, exhaustion forecast
packages/adapters   Collector interface + pure normalizers (ccusage, Glances) + fixtures
apps/agent          Fastify service: /health, /v1/snapshot, collector registry, auth
apps/surface        Tauri 2 + React + Vite control-plane app (SQLite via tauri-plugin-sql)
scripts             install-surface.ps1, install-agent.ps1, install-agent-macos.sh
docs                AUDIT, ARCHITECTURE, SECURITY, DATA_SOURCES, UPSTREAM, BUILD_LOG
tests               cross-package integration/failure tests (M1+)
```

## Commands

```bash
pnpm install                 # install workspace deps
pnpm test                    # all unit/integration tests (vitest)
pnpm -r typecheck            # typecheck every package
pnpm format                  # prettier
pnpm agent:dev               # run the agent (tsx watch)  -> http://127.0.0.1:47600
pnpm surface:dev             # run the Surface UI in a browser (Vite, no Rust needed)
pnpm surface:tauri           # run the native Surface app (needs Rust + MSVC + WebView2)
```

Agent env: `ACC_AGENT_HOST` (default 127.0.0.1), `ACC_AGENT_PORT` (default 47600),
`ACC_AGENT_TOKEN` (required to bind non-loopback), `ACC_MACHINE_ID`, `ACC_MACHINE_NAME`.

## Tests

Vitest. Pure functions and normalizers are tested against **real captured fixtures**
(ccusage + Glances output from 2026-08-28). Agent routes are tested via Fastify `inject`.
Never require real provider credentials in CI — use fixtures.

## Security rules (see docs/SECURITY.md) — do not violate

- Provider credentials never leave the monitored machine; Surface gets normalized results.
- Agent binds loopback by default; **refuses** non-loopback bind without a bearer token.
- Constant-time token check; logger redacts `authorization`/`cookie`.
- Never log secrets. Never auto-extract browser cookies. Optional TLS via
  `ACC_TLS_CERT`/`ACC_TLS_KEY`; cloud-provider tokens live on the agent only.

## Data source precedence (see docs/DATA_SOURCES.md)

Quota: codexbar OFFICIAL → provider CLI → local CALCULATED → ESTIMATED.
Session tokens: ccusage (native log) → codexbar scan → estimate.
System: Glances → intentional native fallback only.
Dedup sessions by fingerprint; never double-count across collectors.

## OFFICIAL / CALCULATED / ESTIMATED

- **OFFICIAL** — authoritative from provider/OS.
- **CALCULATED** — correct math from authoritative local data (e.g. ccusage blocks).
- **ESTIMATED** — the value/capacity itself was inferred/projected (e.g. exhaustion time).
  Never show ESTIMATED as an official provider number.

## Conventions

- TypeScript everywhere (ESM). zod schema + inferred type for every wire object.
- Nullable > fake. Missing data → null → UI shows "Not available"/"Not configured",
  never `0`.
- Collectors fail independently; one failure must not break the dashboard.
- All timestamps UTC on the wire; convert to local only for display.

## Prohibited shortcuts (spec §37, §63)

- No hard-coded fake metrics in production UI. A DEMO mode, if ever added, must be
  unmistakably separate.
- Don't re-implement what ccusage/Glances/OS already provide — adapt it.
- Don't vendor/link Glances (LGPL). Call its REST API as a separate process.
- Don't mark TODO/incomplete work as finished.

## Current status — Milestones 0–5 complete (78 tests green)

Run the app: `pnpm surface:tauri` (native, needs Rust+MSVC+WebView2) or `pnpm surface:dev`
(browser dev, MemoryStore). Run an agent to monitor: `pnpm agent:dev`. On the Surface,
Settings → "Add this PC (127.0.0.1:47600)" to watch the local machine.

**M0–M2:** audit + scaffold; live MVP (ccusage/Glances/scheduler, SQLite, dashboard,
pairing, heartbeat); analytics/history/retention (migration 0002), `/v1/usage`
daily/weekly/monthly, SVG charts, CSV/JSON export, optional ceiling → ESTIMATED forecast,
deterministic insights.

**Milestone 3 complete (code)** — macOS agent path: pure `crontab`/`launchctl` parsers
(unit-tested), a platform-dispatched `automations` collector (win→Task Scheduler,
mac→cron+launchd, else NOT_CONFIGURED), and `install/uninstall-agent-macos.sh` (per-user
launchd, no root). ⚠️ Not run on macOS hardware in this environment — confirm on a real Mac
before treating the Mac path as production-ready. ccusage + Glances are already cross-platform.

**Milestone 4 complete** — connection enhancements: interface classifier
(`machine.connectionType`, Surface badge), optional **TLS** (`ACC_TLS_CERT`/`ACC_TLS_KEY`

- `scripts/generate-cert.sh`), and **mDNS** (`_ai-control._tcp` advertise + `GET /v1/discover`
- Surface "Discover machines" one-click add). All verified live on this box (wifi detected,
  HTTPS via curl -k, two-agent discovery). Surface discovery runs through a reachable agent's
  `/v1/discover` (webview can't do raw mDNS) — manual-add first machine, discover the rest.

Env: `ACC_TLS_CERT`/`ACC_TLS_KEY` (HTTPS), `ACC_GLANCES_URL`/`ACC_GLANCES_AUTOSTART`,
`ACC_TASKS_INCLUDE_MICROSOFT`. Agent advertises mDNS only when LAN-exposed.

**Milestone 5 complete** — cloud automation adapters: GitHub Actions, n8n, Supabase
(pg_cron), Vercel normalizers (pure, tested vs real API shapes) + an env-configured `cloud`
collector merged into automations. Credentials live on the **agent** only
(`ACC_GITHUB_TOKEN`/`ACC_GITHUB_REPOS`, `ACC_N8N_URL`/`ACC_N8N_KEY`) — never on the Surface,
never logged. Verified end-to-end via a mock n8n server; real services need your tokens.

**All planned milestones (0–5) are complete, plus a spec-conformance pass** that closed
the remaining gaps: session dedup (§55), `/v1/history` (§24), containers + process count
(§19), full snapshot persistence (§41), retention cascade + duplicate suppression (§42),
session/project analytics and weighted exhaustion forecast (§21/§22), Surface Mode (§33),
session filtering (§17), power modes (§57), backup export (§58) and the MVP acceptance
test (§61, 11/11 passing). **97 tests green.**

Run the acceptance test (starts/stops a real agent):
`cd apps/agent && npx tsx ../../scripts/acceptance.ts`

Remaining real-world confirmations: macOS agent on Mac hardware; cloud adapters against
live accounts. Known not-implemented: backup **restore** (export only) and codexbar
OFFICIAL quotas. See docs/BUILD_LOG.md.
