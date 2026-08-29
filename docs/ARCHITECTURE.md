# ARCHITECTURE — AI Control Center

## Product shape

A **local-first, touch-first observability appliance**. The **Surface Pro is the control
plane**; each monitored machine (a **Mac over Wi‑Fi**, a **PC over Ethernet**, future
machines) runs a lightweight **AI Monitor Agent**. The Surface never mirrors a display —
it talks to agents over normal IP networking.

```
     MONITORED MACHINE (Mac / PC / …)                      SURFACE PRO (control plane)
 ┌───────────────────────────────────────┐            ┌──────────────────────────────────┐
 │ ccusage (CLI) ─┐                       │            │ AI CONTROL CENTER (Tauri+React)   │
 │ Glances (REST 127.0.0.1:61208) ─┤      │            │  ├─ Overview/Sessions/Usage/...   │
 │ Task Scheduler / cron / launchd ─┤     │  HTTP(S)   │  ├─ SQLite history + retention    │
 │ (codexbar CLI — later) ─┤              │  bearer    │  ├─ Deterministic analytics       │
 │                          ▼            ─┼───────────▶│  ├─ Insights + exhaustion forecast│
 │                 AI MONITOR AGENT       │  LAN only  │  └─ Machine selector / status     │
 │            (Fastify, normalizes all)   │  when opt- │                                    │
 │            binds 127.0.0.1 by default  │  in        │                                    │
 └───────────────────────────────────────┘            └──────────────────────────────────┘
```

## Transport-agnostic by design

The protocol is **HTTP/JSON over IP**. Whether IP rides Wi‑Fi, Ethernet, or a USB4/
Thunderbolt network is irrelevant to the application layer. `connectionType`
(`wifi | ethernet | usb4 | unknown`) is descriptive metadata only — data semantics are
identical across transports. No proprietary USB serial protocol.

## Components & tech choices

| Component            | Tech                       | Why                                                                                                                                         |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/protocol`  | TypeScript + **zod**       | One validated wire contract; runtime validation at both boundaries.                                                                         |
| `packages/analytics` | Pure TS                    | Deterministic math (percent, countdown, velocity, forecast). No LLM, no clock reads inside.                                                 |
| `packages/adapters`  | Pure TS                    | Collector interface + pure normalizers (ccusage, Glances) → fully unit-testable against real fixtures.                                      |
| `apps/agent`         | Node + **Fastify**         | The single LAN-facing service. Mature, fast, good auth/logging. Runs anywhere Node runs (Win + mac) — no Rust needed on monitored machines. |
| `apps/surface`       | **Tauri 2** + React + Vite | Real touch-first desktop appliance on the Surface; SQLite via `tauri-plugin-sql`; autostart/fullscreen later.                               |
| History DB           | **SQLite** (WAL)           | Simplest robust local store; migrations from day one.                                                                                       |

### Why the agent shells out instead of linking upstream code

Spec §63: prove existing tools can't provide the data before building custom. ccusage and
Glances already do the hard parsing/telemetry. Consuming them as **external CLI/REST**
means: no Rust toolchain on every monitored machine, clean LGPL separation from Glances,
and trivial upstream updates. The agent's job is **normalization + error isolation +
auth**, not re-implementation.

## Collector model (error isolation)

Every source is a `Collector` that **fails independently**. The registry runs them
concurrently and catches throws, converting them to `ERROR` status. One dead collector
degrades only its own snapshot section; the dashboard stays live. Health states:
`HEALTHY | STALE | ERROR | NOT_INSTALLED | NOT_CONFIGURED`. Machine states:
`ONLINE | DEGRADED | OFFLINE | PAIRING` (DEGRADED = reachable but an important collector
is failing).

## API surface (agent)

```
GET /health          # cheap liveness + machine identity (public)
GET /v1/snapshot     # full normalized snapshot (bearer-protected when a token is set)
# Milestone 1+: /v1/system /v1/providers /v1/sessions /v1/automations /v1/history, WS /v1/live
```

Snapshots are validated through `SnapshotSchema` **before leaving the agent**, so
malformed data never reaches the Surface DB.

## Refresh cadences (targets, adaptive to upstream limits)

hardware 1–3s · sessions 3–10s · automations 30–60s · provider limits 30–120s ·
cost/history 1–5m. Never hammer provider APIs.

## Data flow into history

Surface polls each agent's `/v1/snapshot`, validates, writes normalized rows to SQLite,
and downsamples system metrics over time (raw → 1m → 5m → 1h). Provenance is stored with
every metric so the UI can show OFFICIAL/CALCULATED/ESTIMATED and the source tool.

## Milestones (this repo currently at M0 complete)

- **M0** ✅ audit, scaffold, toolchain, protocol, honest empty UI, agent skeleton.
- **M1** functional MVP: pairing, live ccusage+Glances+Task Scheduler collectors,
  heartbeat/OFFLINE, populated Overview/Limits/Sessions/System.
- **M2** full analytics + history + retention + insights + exhaustion forecast.
- **M3** Mac agent (ccusage + Glances + cron + launchd, optional codexbar CLI).
- **M4** mDNS discovery, one-click pairing, USB4 interface detection, TLS.
- **M5** cloud automations (n8n, GitHub Actions, Vercel, Supabase).
