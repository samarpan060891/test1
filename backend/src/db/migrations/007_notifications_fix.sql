-- Fix notification_event table: relax event_type constraint and add message column

ALTER TABLE qc_inspection.notification_event
  DROP CONSTRAINT IF EXISTS notification_event_event_type_check;

ALTER TABLE qc_inspection.notification_event
  ADD CONSTRAINT notification_event_event_type_check
  CHECK (event_type IN (
    'JOB_MAPPED',
    'SUBMITTED_FOR_QA',
    'QA_APPROVED',
    'QA_REJECTED',
    'REINSPECTION_TRIGGERED',
    'checklist_missing',
    'agency_mapping_confirmed',
    'inspection_submitted',
    'final_decision_recorded'
  ));

ALTER TABLE qc_inspection.notification_event
  ADD COLUMN IF NOT EXISTS message TEXT;
