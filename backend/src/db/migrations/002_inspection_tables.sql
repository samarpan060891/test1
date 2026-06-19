-- Migration 002: Inspection Workflow Tables
-- Run AFTER 001_master_tables.sql
-- Creates the 5 tables that power the inspection workflow.

-- 1. CHECKLIST TEMPLATE
-- A named set of checkpoints for a specific product category.
-- Only QA can create/activate these. One template can be "active" per category/sub-category.
CREATE TABLE qc_inspection.checklist_template (
  template_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category        TEXT NOT NULL,               -- Must match item_master.category
  sub_category    TEXT NOT NULL,               -- Must match item_master.sub_category
  name            TEXT NOT NULL,               -- e.g. "Upholstered Seating v2"
  version         TEXT NOT NULL DEFAULT '1.0',
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','archived')),
  created_by      UUID REFERENCES qc_inspection.team_stakeholder(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active template per category/sub-category at a time
CREATE UNIQUE INDEX idx_one_active_template
  ON qc_inspection.checklist_template(category, sub_category)
  WHERE status = 'active';

-- 2. CHECKLIST ITEM
-- Each individual checkpoint inside a template.
-- e.g. "Stitching quality", "Frame stability", "Label accuracy"
CREATE TABLE qc_inspection.checklist_item (
  item_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES qc_inspection.checklist_template(template_id) ON DELETE CASCADE,
  section         TEXT NOT NULL,               -- Groups checkpoints, e.g. "Structural", "Finishing"
  checkpoint_text TEXT NOT NULL,               -- The actual question/check, e.g. "Stitching is even and consistent"
  criticality     TEXT NOT NULL DEFAULT 'major'
                  CHECK (criticality IN ('critical','major','minor')),
  sort_order      INTEGER NOT NULL DEFAULT 0,  -- Controls display order within a section
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checklist_item_template ON qc_inspection.checklist_item(template_id);

-- 3. INSPECTION JOB
-- One inspection assignment. Links a PO + Item + Agency + Checklist together.
-- This is the central record that everything else hangs off.
CREATE TABLE qc_inspection.inspection_job (
  job_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no               TEXT NOT NULL REFERENCES qc_inspection.po_master(po_no),
  item_code           TEXT NOT NULL REFERENCES qc_inspection.item_master(item_code),
  supplier_code       TEXT NOT NULL REFERENCES qc_inspection.supplier_master(supplier_code),
  agency_code         TEXT NOT NULL REFERENCES qc_inspection.quality_agency_master(agency_code),
  checklist_template_id UUID NOT NULL REFERENCES qc_inspection.checklist_template(template_id),
  status              TEXT NOT NULL DEFAULT 'mapped_awaiting_inspection'
                      CHECK (status IN (
                        'mapped_awaiting_inspection',
                        'submitted_pending_qa',
                        'qa_approved'
                      )),
  inspection_date     DATE,
  -- Final outcome — only set by QA, only when status = 'qa_approved'
  final_outcome       TEXT CHECK (final_outcome IN ('pass','fail','partial')),
  qa_notes            TEXT,                    -- QA's notes when giving final decision
  mapped_by           UUID REFERENCES qc_inspection.team_stakeholder(user_id),
  mapped_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at        TIMESTAMPTZ,             -- When agency submitted
  decided_at          TIMESTAMPTZ,             -- When QA gave final decision
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_job_po       ON qc_inspection.inspection_job(po_no);
CREATE INDEX idx_inspection_job_agency   ON qc_inspection.inspection_job(agency_code);
CREATE INDEX idx_inspection_job_supplier ON qc_inspection.inspection_job(supplier_code);
CREATE INDEX idx_inspection_job_status   ON qc_inspection.inspection_job(status);

-- 4. INSPECTION RESPONSE
-- The agency's answers — one row per checkpoint per job.
-- Saved progressively (agency can save and come back before submitting).
CREATE TABLE qc_inspection.inspection_response (
  response_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES qc_inspection.inspection_job(job_id) ON DELETE CASCADE,
  checklist_item_id   UUID NOT NULL REFERENCES qc_inspection.checklist_item(item_id),
  result              TEXT CHECK (result IN ('pass','fail','na')),
  photo_url           TEXT,                    -- Cloudinary/S3 URL for uploaded photo
  remark              TEXT,
  answered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One answer per checkpoint per job
  UNIQUE (job_id, checklist_item_id)
);

CREATE INDEX idx_inspection_response_job ON qc_inspection.inspection_response(job_id);

-- 5. LOG ENTRY
-- The shared remarks thread visible to all 4 roles on a job.
-- Any party with access to that job can post here.
CREATE TABLE qc_inspection.log_entry (
  log_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES qc_inspection.inspection_job(job_id) ON DELETE CASCADE,
  po_no           TEXT NOT NULL,               -- Denormalised for easy filtering by PO
  author_id       UUID NOT NULL REFERENCES qc_inspection.team_stakeholder(user_id),
  author_role     TEXT NOT NULL,               -- Snapshot of role at time of posting
  message         TEXT NOT NULL,
  attachment_url  TEXT,                        -- Optional file attachment
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_log_entry_job   ON qc_inspection.log_entry(job_id);
CREATE INDEX idx_log_entry_po    ON qc_inspection.log_entry(po_no);

-- 6. NOTIFICATION EVENT
-- A record of every notification sent (email or in-app alert).
CREATE TABLE qc_inspection.notification_event (
  event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES qc_inspection.inspection_job(job_id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL
                  CHECK (event_type IN (
                    'checklist_missing',
                    'agency_mapping_confirmed',
                    'inspection_submitted',
                    'final_decision_recorded'
                  )),
  recipient_role  TEXT NOT NULL,
  recipient_email TEXT,
  channel         TEXT NOT NULL CHECK (channel IN ('email','in_app')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_job ON qc_inspection.notification_event(job_id);
