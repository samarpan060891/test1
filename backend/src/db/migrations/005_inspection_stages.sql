-- Add inspection stage to inspection jobs
ALTER TABLE qc_inspection.inspection_job
  ADD COLUMN IF NOT EXISTS inspection_stage TEXT
  CHECK (inspection_stage IN ('pre_production', 'inline', 'final', 'loading'));

-- Backfill existing jobs with 'final' as default stage
UPDATE qc_inspection.inspection_job
  SET inspection_stage = 'final'
  WHERE inspection_stage IS NULL;
