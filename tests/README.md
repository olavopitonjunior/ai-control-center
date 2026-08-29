# tests/

Cross-package integration and failure tests live here from Milestone 1 onward
(CodexBar/ccusage/Glances adapters end-to-end, agent snapshot, Surface API client, and the
failure matrix from master spec §36: missing ccusage/Glances, provider timeout, malformed
JSON, machine offline, stale data, invalid token).

Milestone 0 tests are colocated with their packages and run via `pnpm test`:
- `packages/protocol/src/protocol.test.ts` — schema validation, null handling, provenance.
- `packages/analytics/src/analytics.test.ts` — percentages, countdown, velocity, forecast.
- `packages/adapters/src/adapters.test.ts` — ccusage & Glances normalizers vs real fixtures.
- `apps/agent/src/server.test.ts` — `/health` + `/v1/snapshot` + bearer auth via inject.

Never require real provider credentials in CI — use sanitized fixtures.
