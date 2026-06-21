-- Fix notification_event table

-- 1. Drop rigid event_type CHECK so any event type string is accepted
ALTER TABLE qc_inspection.notification_event
  DROP CONSTRAINT IF EXISTS notification_event_event_type_check;

-- 2. Add message column for storing notification text
ALTER TABLE qc_inspection.notification_event
  ADD COLUMN IF NOT EXISTS message TEXT;

-- 3. Add advice_id column so charge notifications don't need a job_id
ALTER TABLE qc_inspection.notification_event
  ADD COLUMN IF NOT EXISTS advice_id UUID REFERENCES qc_inspection.inspection_charges_advice(advice_id) ON DELETE CASCADE;
