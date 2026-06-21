-- Fix notification_event table: remove rigid event_type constraint and add message column

-- Drop the hardcoded CHECK so any event type string is accepted going forward
ALTER TABLE qc_inspection.notification_event
  DROP CONSTRAINT IF EXISTS notification_event_event_type_check;

-- Add message column so notification text is stored and shown in dashboard
ALTER TABLE qc_inspection.notification_event
  ADD COLUMN IF NOT EXISTS message TEXT;
