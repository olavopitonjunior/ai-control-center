-- Make downsample rollups idempotent: one row per (machine, bucket, timestamp).
-- Guards against duplicate rollups if a retention sweep runs more than once for the
-- same raw window (e.g. overlapping timers or a dev double-invoke).
CREATE UNIQUE INDEX IF NOT EXISTS ux_rollups_machine_bucket_ts
  ON system_metric_rollups (machine_id, bucket, timestamp);
