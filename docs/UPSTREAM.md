# UPSTREAM — Reuse & Update Strategy

## Principle: reuse as external tools, not forks

AI Control Center **does not fork or vendor** any upstream. Each is consumed at a stable
boundary (CLI JSON or REST), so upstream improvements flow in for free and there is no
merge burden. This is the pragmatic realization of spec §5–§6, §51, §63.

| Upstream                   | License  | How we consume it                                                         | How to update                                                                                        |
| -------------------------- | -------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **ccusage**                | MIT      | `npx ccusage@latest <period> --json`                                      | Bump the pinned version in the agent's ccusage collector; re-capture fixtures if the schema changes. |
| **Glances**                | LGPL‑3.0 | Local REST API (`glances -w`, :61208), **separate process, never linked** | `pip install -U 'glances[web]'`; re-verify `/api/4/pluginslist`.                                     |
| **Win-CodexBar** (nesszer) | MIT      | _(deferred)_ `codexbar-cli` / `codexbar serve` on localhost               | Install/upgrade the CLI; capture its JSON before writing the adapter.                                |
| **CodexBar** (steipete)    | MIT      | _(Milestone 3, macOS)_ `codexbar` CLI                                     | Homebrew upgrade; same adapter boundary.                                                             |

## Why not fork Win-CodexBar

1. **No Rust on monitored machines.** Linking its Rust core would force a Rust toolchain
   everywhere; the CLI/JSON boundary avoids that.
2. **Claude-first MVP doesn't need it.** ccusage already covers Claude Code usage.
3. **Upstream tracking stays trivial** — we track a CLI contract, not source.

If we ever _do_ need to fork (e.g. to add a provider upstream lacks), configure remotes as
`origin → our repo`, `upstream → nesszer/Win-CodexBar`, keep our changes in an adapter
layer, and never modify per-provider implementations directly. Not needed for M0–M2.

## LGPL hygiene (Glances) — must stay true

We call Glances over HTTP as a **separate process** and never import/link its code. This
keeps us outside LGPL‑3.0 linking obligations. Do **not** vendor Glances source, embed its
Python, or statically link anything from it. If that ever changes, the LGPL obligations
(offer of source, relink ability) must be honored — so simply don't.

## Adapter isolation

All upstream-specific parsing lives in `packages/adapters` as **pure normalizers** with
captured fixtures. If an upstream changes its JSON, only one normalizer + its fixture test
changes — nothing else in the codebase. This is the seam that makes upstream updates safe.

## Version capture

Record the exact versions in use in `docs/BUILD_LOG.md` at each meaningful change, and
keep a representative real payload as a fixture in `adapters.test.ts` so a breaking
upstream change fails a test rather than silently corrupting data.
