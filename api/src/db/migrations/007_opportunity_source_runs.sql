-- Link normalized opportunities to the discovery run that produced them.
ALTER TABLE opportunity_records
  ADD COLUMN IF NOT EXISTS source_run_id BIGINT
  REFERENCES opportunity_source_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opportunity_records_source_run
  ON opportunity_records(source_run_id) WHERE source_run_id IS NOT NULL;
