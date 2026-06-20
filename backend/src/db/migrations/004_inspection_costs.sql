-- ── Sequence for ICA reference numbers ────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS qc_inspection.ica_ref_seq START 1;

-- ── Standard agency contracts (pre-agreed rates) ──────────────────────────────
CREATE TABLE IF NOT EXISTS qc_inspection.agency_contract (
  contract_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_code         TEXT        NOT NULL REFERENCES qc_inspection.quality_agency_master(agency_code),
  contract_name       TEXT        NOT NULL DEFAULT 'Standard Rate',  -- e.g. "Weekend Rate", "International"
  rate_type           TEXT        NOT NULL CHECK (rate_type IN ('percentage', 'manday')),
  rate_value          NUMERIC(10,2) NOT NULL,        -- % or per-manday rate
  travel_allowance    NUMERIC(10,2) NOT NULL DEFAULT 0,
  stay_allowance_per_day NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency            TEXT        NOT NULL DEFAULT 'USD',
  valid_from          DATE,
  valid_to            DATE,
  notes               TEXT,
  created_by          UUID        REFERENCES qc_inspection.team_stakeholder(user_id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If table already exists, add contract_name column (safe to re-run)
ALTER TABLE qc_inspection.agency_contract
  ADD COLUMN IF NOT EXISTS contract_name TEXT NOT NULL DEFAULT 'Standard Rate';

-- ── Inspection Charges Advice ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qc_inspection.inspection_charges_advice (
  advice_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  advice_ref          TEXT        UNIQUE,            -- ICA-2026-001
  agency_code         TEXT        NOT NULL REFERENCES qc_inspection.quality_agency_master(agency_code),
  contract_id         UUID        REFERENCES qc_inspection.agency_contract(contract_id),

  -- Rate details
  rate_type           TEXT        NOT NULL CHECK (rate_type IN ('percentage', 'manday')),
  rate_value          NUMERIC(10,2) NOT NULL,
  num_mandays         NUMERIC(5,1),                  -- manday type only
  travel_allowance    NUMERIC(10,2) NOT NULL DEFAULT 0,
  stay_allowance      NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency            TEXT        NOT NULL DEFAULT 'USD',

  -- Cost calculation
  po_value            NUMERIC(14,2),                 -- sum of PO values of linked jobs (for % type)
  total_cost          NUMERIC(14,2),

  -- Approval workflow
  status              TEXT        NOT NULL DEFAULT 'pending_qa'
                      CHECK (status IN ('pending_qa','pending_buying','approved','rejected')),

  qa_user_id          UUID        REFERENCES qc_inspection.team_stakeholder(user_id),
  qa_approved_at      TIMESTAMPTZ,
  qa_notes            TEXT,

  buying_user_id      UUID        REFERENCES qc_inspection.team_stakeholder(user_id),
  buying_approved_at  TIMESTAMPTZ,
  buying_notes        TEXT,

  rejected_by         UUID        REFERENCES qc_inspection.team_stakeholder(user_id),
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,

  cost_bearer         TEXT        NOT NULL DEFAULT 'homes_r_us'
                      CHECK (cost_bearer IN ('homes_r_us', 'supplier')),
  notes               TEXT,
  created_by          UUID        NOT NULL REFERENCES qc_inspection.team_stakeholder(user_id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Jobs linked to an advice ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qc_inspection.ica_jobs (
  id          SERIAL  PRIMARY KEY,
  advice_id   UUID    NOT NULL REFERENCES qc_inspection.inspection_charges_advice(advice_id) ON DELETE CASCADE,
  job_id      UUID    NOT NULL REFERENCES qc_inspection.inspection_job(job_id),
  UNIQUE (advice_id, job_id)
);

-- ── Auto-generate advice_ref on insert ────────────────────────────────────────
CREATE OR REPLACE FUNCTION qc_inspection.set_advice_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.advice_ref IS NULL THEN
    NEW.advice_ref := 'ICA-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                      LPAD(nextval('qc_inspection.ica_ref_seq')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_advice_ref ON qc_inspection.inspection_charges_advice;
CREATE TRIGGER trg_set_advice_ref
BEFORE INSERT ON qc_inspection.inspection_charges_advice
FOR EACH ROW EXECUTE FUNCTION qc_inspection.set_advice_ref();
