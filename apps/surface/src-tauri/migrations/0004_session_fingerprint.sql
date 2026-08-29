-- Enforce session deduplication at the storage layer (spec §55): one row per
-- (machine, fingerprint). Combined with INSERT OR REPLACE, a session observed by two
-- collectors updates the same row instead of being counted twice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_sessions_machine_fingerprint
  ON ai_sessions (machine_id, fingerprint)
  WHERE fingerprint IS NOT NULL;

-- Frequently queried time ranges.
CREATE INDEX IF NOT EXISTS idx_provider_limits_machine_time
  ON provider_limits (machine_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_collector_health_machine_time
  ON collector_health (machine_id, observed_at);
