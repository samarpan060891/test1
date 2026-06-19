-- QC Inspection Mapping & Workflow Schema
-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS notification_events CASCADE;
DROP TABLE IF EXISTS log_entries CASCADE;
DROP TABLE IF EXISTS inspection_responses CASCADE;
DROP TABLE IF EXISTS inspection_jobs CASCADE;
DROP TABLE IF EXISTS checklist_items CASCADE;
DROP TABLE IF EXISTS checklist_templates CASCADE;
DROP TABLE IF EXISTS team_stakeholders CASCADE;
DROP TABLE IF EXISTS quality_agency_master CASCADE;
DROP TABLE IF EXISTS po_master CASCADE;
DROP TABLE IF EXISTS supplier_master CASCADE;
DROP TABLE IF EXISTS item_master CASCADE;

-- =====================
-- MASTER TABLES
-- =====================

CREATE TABLE item_master (
  item_code       VARCHAR(20) PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  category        VARCHAR(100) NOT NULL,
  sub_category    VARCHAR(100) NOT NULL
);

CREATE TABLE supplier_master (
  supplier_code   VARCHAR(20) PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  contact_email   VARCHAR(200) NOT NULL
);

CREATE TABLE po_master (
  po_no           VARCHAR(30) PRIMARY KEY,
  supplier_code   VARCHAR(20) NOT NULL REFERENCES supplier_master(supplier_code),
  item_code       VARCHAR(20) NOT NULL REFERENCES item_master(item_code),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  status          VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled'))
);

CREATE TABLE quality_agency_master (
  agency_code     VARCHAR(20) PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  contact_emails  TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE team_stakeholders (
  user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(200) NOT NULL,
  email           VARCHAR(200) UNIQUE NOT NULL,
  role            VARCHAR(30) NOT NULL CHECK (role IN ('qa','buying','agency_user','supplier_user')),
  agency_code     VARCHAR(20) REFERENCES quality_agency_master(agency_code),
  supplier_code   VARCHAR(20) REFERENCES supplier_master(supplier_code),
  password_hash   VARCHAR(255) NOT NULL
);

-- =====================
-- NEW ENTITIES
-- =====================

CREATE TABLE checklist_templates (
  template_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category        VARCHAR(100) NOT NULL,
  sub_category    VARCHAR(100) NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, sub_category, version)
);

CREATE TABLE checklist_items (
  item_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES checklist_templates(template_id) ON DELETE CASCADE,
  section         VARCHAR(100) NOT NULL,
  checkpoint_text TEXT NOT NULL,
  criticality     VARCHAR(20) NOT NULL DEFAULT 'major' CHECK (criticality IN ('critical','major','minor')),
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE inspection_jobs (
  job_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no                   VARCHAR(30) NOT NULL REFERENCES po_master(po_no),
  item_code               VARCHAR(20) NOT NULL REFERENCES item_master(item_code),
  supplier_code           VARCHAR(20) NOT NULL REFERENCES supplier_master(supplier_code),
  agency_code             VARCHAR(20) NOT NULL REFERENCES quality_agency_master(agency_code),
  checklist_template_id   UUID NOT NULL REFERENCES checklist_templates(template_id),
  status                  VARCHAR(40) NOT NULL DEFAULT 'mapped_awaiting_inspection'
                          CHECK (status IN ('mapped_awaiting_inspection','submitted_pending_qa','qa_approved','qa_rejected')),
  inspection_date         DATE NOT NULL,
  final_outcome           VARCHAR(20) CHECK (final_outcome IN ('approved','rejected')),
  qa_remarks              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspection_responses (
  response_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID NOT NULL REFERENCES inspection_jobs(job_id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES checklist_items(item_id),
  result            VARCHAR(10) NOT NULL CHECK (result IN ('pass','fail','na')),
  photo_url         TEXT,
  remark            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, checklist_item_id)
);

CREATE TABLE log_entries (
  log_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no         VARCHAR(30) REFERENCES po_master(po_no),
  item_code     VARCHAR(20) REFERENCES item_master(item_code),
  job_id        UUID REFERENCES inspection_jobs(job_id),
  author_role   VARCHAR(30) NOT NULL,
  author_email  VARCHAR(200),
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_events (
  event_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID REFERENCES inspection_jobs(job_id) ON DELETE CASCADE,
  event_type    VARCHAR(50) NOT NULL,
  recipient_role VARCHAR(30) NOT NULL,
  recipient_email VARCHAR(200),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- INDEXES
-- =====================
CREATE INDEX idx_inspection_jobs_po_no ON inspection_jobs(po_no);
CREATE INDEX idx_inspection_jobs_agency_code ON inspection_jobs(agency_code);
CREATE INDEX idx_inspection_jobs_supplier_code ON inspection_jobs(supplier_code);
CREATE INDEX idx_inspection_jobs_status ON inspection_jobs(status);
CREATE INDEX idx_inspection_responses_job_id ON inspection_responses(job_id);
CREATE INDEX idx_log_entries_job_id ON log_entries(job_id);
CREATE INDEX idx_log_entries_po_no ON log_entries(po_no);
CREATE INDEX idx_notification_events_job_id ON notification_events(job_id);
CREATE INDEX idx_checklist_items_template_id ON checklist_items(template_id);
