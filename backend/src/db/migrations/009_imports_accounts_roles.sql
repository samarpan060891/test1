-- Add imports and accounts roles to team_stakeholder
ALTER TABLE qc_inspection.team_stakeholder
  DROP CONSTRAINT IF EXISTS team_stakeholder_role_check;

ALTER TABLE qc_inspection.team_stakeholder
  ADD CONSTRAINT team_stakeholder_role_check
  CHECK (role IN ('qa','buying','agency_user','supplier_user','admin','imports','accounts'));

-- Extend inspection_charges_advice status to include payment steps
ALTER TABLE qc_inspection.inspection_charges_advice
  DROP CONSTRAINT IF EXISTS inspection_charges_advice_status_check;

ALTER TABLE qc_inspection.inspection_charges_advice
  ADD CONSTRAINT inspection_charges_advice_status_check
  CHECK (status IN ('pending_qa','pending_buying','pending_imports','pending_accounts','paid','rejected'));

-- Add imports approval columns
ALTER TABLE qc_inspection.inspection_charges_advice
  ADD COLUMN IF NOT EXISTS imports_user_id     UUID REFERENCES qc_inspection.team_stakeholder(user_id),
  ADD COLUMN IF NOT EXISTS imports_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imports_notes       TEXT;

-- Add accounts approval columns
ALTER TABLE qc_inspection.inspection_charges_advice
  ADD COLUMN IF NOT EXISTS accounts_user_id     UUID REFERENCES qc_inspection.team_stakeholder(user_id),
  ADD COLUMN IF NOT EXISTS accounts_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accounts_notes       TEXT;

-- Migrate existing 'approved' records to 'paid' so old data still shows as fully done
-- (leave as-is since approved is no longer a valid status — update existing approved rows)
UPDATE qc_inspection.inspection_charges_advice SET status = 'paid' WHERE status = 'approved';
