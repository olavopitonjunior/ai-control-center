# AI Control Center

[![CI](https://github.com/olavopitonjunior/ai-control-center/actions/workflows/ci.yml/badge.svg)](https://github.com/olavopitonjunior/ai-control-center/actions/workflows/ci.yml)

A **local-first, touch-first AI observability appliance**. A Microsoft Surface Pro acts as
a dedicated **control plane** that continuously displays and analyzes AI usage across your
machines — provider quotas and limits, tokens and cost, active/historical AI coding
sessions, system telemetry, and scheduled automations — for a **Mac (over Wi‑Fi)**, a
**PC (over Ethernet)**, and more.

> **Status: Milestones 0–5 complete.** A functional, local-first appliance. The agent
> collects **live** Claude Code usage (ccusage), system telemetry (Glances), local
> scheduled tasks (Windows Task Scheduler / macOS cron + launchd), and cloud automations
> (GitHub Actions / n8n / Supabase / Vercel) behind one authenticated, optionally-TLS API,
> and serves daily/weekly/monthly usage series. It advertises itself on the LAN via mDNS.
> The Surface discovers/registers machines, polls them, persists + downsamples history to
> SQLite, and shows real data with charts across Overview / Limits / Sessions / System /
> Usage / Automations / Insights — token/cost breakdowns, CSV/JSON export, and (with an
> optional quota ceiling) an **ESTIMATED** exhaustion forecast. Source provenance
> everywhere; no fabricated values.
>
> **Real-world confirmations still pending** (built + unit-tested, not yet run on the target
> hardware/accounts in the dev environment): the **macOS agent** on a Mac, and the **cloud
> adapters** against live GitHub/n8n/Supabase/Vercel accounts. See `docs/BUILD_LOG.md`.

## Architecture

```
 Monitored machine                          Surface Pro (control plane)
 ┌───────────────────────────┐              ┌──────────────────────────────┐
 │ ccusage (CLI)             ─┐             │ AI CONTROL CENTER (Tauri+React)│
 │ Glances (REST, localhost) ─┤  HTTP/JSON  │  Overview · Sessions · Usage   │
 │ Task Scheduler/cron/launchd┤  bearer     │  Limits · Automations · System │
 │            AI MONITOR AGENT─┼────────────▶│  Insights · Settings           │
 │   (Fastify, localhost-bound)│  LAN opt-in │  SQLite history · analytics    │
 └───────────────────────────┘              └──────────────────────────────┘
```

The agent is the only LAN-facing process; everything else binds localhost. Transport is
plain IP — Wi‑Fi, Ethernet, or USB4 networking are interchangeable. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Supported operating systems

- **Surface control plane:** Windows 11 (Tauri 2 + WebView2).
- **Agent:** Windows 11 and macOS (Node-based — runs anywhere Node runs). The macOS launchd
  path is built + unit-tested but not yet run on Mac hardware here.

## Dependencies

- **Node ≥ 20** + **pnpm** (workspace).
- **Rust + MSVC C++ Build Tools + WebView2** — only to build the native Surface app.
- **Glances** (`pip install 'glances[web]'`) on monitored machines — system telemetry.
- **ccusage** via `npx ccusage@latest` — Claude Code usage (no install).

## Develop

```bash
pnpm install            # install workspace deps
pnpm test               # all tests (78 passing)
pnpm -r typecheck       # typecheck every package
pnpm agent:dev          # agent on http://127.0.0.1:47600  (GET /health, /v1/snapshot)
pnpm surface:dev        # Surface UI in a browser (Vite) — no Rust required
pnpm surface:tauri      # native Surface app (requires Rust + MSVC + WebView2)
```

## Install

```powershell
# On the Surface:
scripts\install-surface.ps1        # validates prereqs, prints run steps
# On a monitored Windows PC:
scripts\install-agent.ps1 -GenerateToken   # prereqs + pairing token + connection details
```

```bash
# On a monitored Mac:
scripts/install-agent-macos.sh     # prereqs + token + per-user launchd agent (no root)
scripts/generate-cert.sh           # optional self-signed TLS cert
```

The Windows/mac agent scripts generate a high-entropy pairing token and print the address +
token to enter on the Surface. The macOS script installs a launchd agent (RunAtLoad +
KeepAlive). Nothing unsafe is installed silently.

## Networking & security

- Agent binds `127.0.0.1` by default; a LAN bind **requires** a bearer pairing token and
  is refused without one.
- Provider credentials never leave the monitored machine — the Surface receives only
  normalized results. Secrets are never logged. Full policy: [`docs/SECURITY.md`](docs/SECURITY.md).
- **Discovery:** LAN-exposed agents advertise `_ai-control._tcp` (mDNS); the Surface can
  discover peers via a reachable agent's `/v1/discover` and add them in one click.
- **TLS (optional):** set `ACC_TLS_CERT` + `ACC_TLS_KEY` (generate with
  `scripts/generate-cert.sh`) and the agent serves HTTPS; register the machine with an
  `https://` address. Default is plaintext HTTP on a trusted private LAN.

## Privacy

Local-first. No AI Control Center cloud, no telemetry to us, no analytics tracking, no
ads. The app talks only to the providers/tools you configure.

## Data provenance

Every metric is labeled **OFFICIAL**, **CALCULATED**, or **ESTIMATED**, with its source
tool. Missing data shows _Not available_ — never a fake `0`. See
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

## Updating from upstream

ccusage, Glances, and (later) codexbar are consumed as external tools, not forked. See
[`docs/UPSTREAM.md`](docs/UPSTREAM.md).

## Troubleshooting

- **`python`/Glances "No module named glances"** — a shadowing venv is on PATH; use your
  real Python (e.g. `…\Python312\python.exe -m glances -w`).
- **Native build fails** — ensure Rust, MSVC C++ Build Tools, and WebView2 are installed.
- **Agent won't bind to LAN** — set `ACC_AGENT_TOKEN`; non-loopback bind without a token
  is refused by design.

## Docs

[AUDIT](docs/AUDIT.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [SECURITY](docs/SECURITY.md)
· [DATA_SOURCES](docs/DATA_SOURCES.md) · [UPSTREAM](docs/UPSTREAM.md) ·
[BUILD_LOG](docs/BUILD_LOG.md) · [CLAUDE.md](CLAUDE.md)

## License

**MIT** — see [LICENSE](LICENSE). Upstream tools retain their own licenses (ccusage MIT,
CodexBar/Win-CodexBar MIT, Glances LGPL‑3.0 — used as a separate process, never vendored).
