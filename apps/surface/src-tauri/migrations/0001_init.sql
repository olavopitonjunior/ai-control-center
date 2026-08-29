-- AI Control Center — initial schema (Milestone 0).
-- All timestamps are stored as UTC ISO-8601 TEXT. The Surface converts to local
-- time only for display. Tables mirror the normalized @acc/protocol model.

CREATE TABLE IF NOT EXISTS machines (
  id            TEXT PRIMARY KEY,
  hostname      TEXT,               -- null until first contact (never faked)
  display_name  TEXT NOT NULL,
  os            TEXT,               -- null until first contact (never faked)
  os_version    TEXT,
  architecture  TEXT,
  agent_version TEXT,
  address       TEXT,
  token         TEXT,          -- Surface's copy of the pairing token (local DB only)
  connection_type TEXT NOT NULL DEFAULT 'unknown',
  last_seen     TEXT,
  status        TEXT NOT NULL DEFAULT 'PAIRING'
);

CREATE TABLE IF NOT EXISTS machine_heartbeats (
  machine_id    TEXT NOT NULL,
  observed_at   TEXT NOT NULL,
  status        TEXT NOT NULL,
  agent_version TEXT,
  PRIMARY KEY (machine_id, observed_at)
);

CREATE TABLE IF NOT EXISTS provider_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id  TEXT NOT NULL,
  provider    TEXT NOT NULL,
  account     TEXT,
  source      TEXT NOT NULL,
  updated_at  TEXT,
  credits     REAL,
  status      TEXT,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_limits (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id        TEXT NOT NULL,
  provider          TEXT NOT NULL,
  label             TEXT NOT NULL,
  used              REAL,
  remaining         REAL,
  capacity          REAL,
  used_percent      REAL,
  remaining_percent REAL,
  reset_at          TEXT,
  source            TEXT NOT NULL,
  source_quality    TEXT NOT NULL,
  observed_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS token_usage (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id            TEXT NOT NULL,
  scope                 TEXT NOT NULL,           -- provider | session | project | model
  scope_key             TEXT NOT NULL,
  input_tokens          INTEGER,
  output_tokens         INTEGER,
  cache_read_tokens     INTEGER,
  cache_creation_tokens INTEGER,
  total_tokens          INTEGER,
  observed_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id  TEXT NOT NULL,
  scope       TEXT NOT NULL,
  scope_key   TEXT NOT NULL,
  amount      REAL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  source      TEXT NOT NULL,
  source_quality TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id               TEXT PRIMARY KEY,
  machine_id       TEXT NOT NULL,
  agent            TEXT NOT NULL,
  pid              INTEGER,
  project_name     TEXT,
  project_path     TEXT,
  terminal         TEXT,
  started_at       TEXT,
  last_activity_at TEXT,
  duration_seconds INTEGER,
  status           TEXT NOT NULL,
  model            TEXT,
  total_tokens     INTEGER,
  cost_amount      REAL,
  fingerprint      TEXT                          -- for cross-collector dedup
);

CREATE TABLE IF NOT EXISTS system_metrics (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id     TEXT NOT NULL,
  timestamp      TEXT NOT NULL,
  cpu_percent    REAL,
  cpu_temperature REAL,
  ram_used       INTEGER,
  ram_total      INTEGER,
  ram_percent    REAL,
  gpu_name       TEXT,
  gpu_percent    REAL,
  vram_used      INTEGER,
  vram_total     INTEGER,
  gpu_temperature REAL,
  disk_used      INTEGER,
  disk_total     INTEGER,
  network_rx     INTEGER,
  network_tx     INTEGER,
  uptime         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_system_metrics_machine_time
  ON system_metrics (machine_id, timestamp);

CREATE TABLE IF NOT EXISTS system_metric_rollups (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id   TEXT NOT NULL,
  bucket       TEXT NOT NULL,                    -- 1m | 5m | 1h
  timestamp    TEXT NOT NULL,
  cpu_percent  REAL,
  ram_percent  REAL,
  gpu_percent  REAL
);
CREATE INDEX IF NOT EXISTS idx_rollups_machine_bucket_time
  ON system_metric_rollups (machine_id, bucket, timestamp);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id             TEXT PRIMARY KEY,
  machine_id     TEXT NOT NULL,
  source         TEXT NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  schedule       TEXT,
  enabled        INTEGER,
  next_run_at    TEXT,
  last_run_at    TEXT,
  last_result    TEXT,
  last_exit_code INTEGER,
  status         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL,
  machine_id  TEXT NOT NULL,
  started_at  TEXT,
  finished_at TEXT,
  result      TEXT,
  exit_code   INTEGER
);

CREATE TABLE IF NOT EXISTS collector_health (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id     TEXT NOT NULL,
  name           TEXT NOT NULL,
  health         TEXT NOT NULL,
  detail         TEXT,
  last_success_at TEXT,
  last_error     TEXT,
  observed_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insights (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id  TEXT,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  confidence  TEXT,
  created_at  TEXT NOT NULL
);
