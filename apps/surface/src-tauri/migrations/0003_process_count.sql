-- Store the process count sampled from Glances alongside each system metric (spec §19).
ALTER TABLE system_metrics ADD COLUMN process_count INTEGER;
