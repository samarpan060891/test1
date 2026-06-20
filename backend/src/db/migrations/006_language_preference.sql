-- Add language preference to users
ALTER TABLE qc_inspection.team_stakeholder
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'zh', 'tr', 'ms', 'vi', 'id', 'th', 'fil'));
