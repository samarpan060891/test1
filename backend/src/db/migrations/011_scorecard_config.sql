-- Supplier Scorecard configuration table
-- Stores weighting percentages and grade thresholds, adjustable by admin

CREATE TABLE IF NOT EXISTS qc_inspection.scorecard_config (
  id                          SMALLINT PRIMARY KEY DEFAULT 1,
  -- Component weights (must sum to 100)
  weight_complaints           NUMERIC(5,2) NOT NULL DEFAULT 50,
  weight_claims               NUMERIC(5,2) NOT NULL DEFAULT 40,
  weight_failures             NUMERIC(5,2) NOT NULL DEFAULT 10,
  -- Grade thresholds (lower bound, inclusive)
  grade_excellent             NUMERIC(5,2) NOT NULL DEFAULT 85,
  grade_good                  NUMERIC(5,2) NOT NULL DEFAULT 70,
  grade_average               NUMERIC(5,2) NOT NULL DEFAULT 50,
  -- Complaint severity multipliers
  severity_critical           NUMERIC(4,2) NOT NULL DEFAULT 4,
  severity_high               NUMERIC(4,2) NOT NULL DEFAULT 2,
  severity_medium             NUMERIC(4,2) NOT NULL DEFAULT 1,
  severity_low                NUMERIC(4,2) NOT NULL DEFAULT 0.5,
  -- Resolved complaints/claims carry this fraction of penalty
  resolved_penalty_factor     NUMERIC(4,2) NOT NULL DEFAULT 0.5,
  -- Claims: % of PO value that triggers full claims deduction (e.g. 10 = 10%)
  claims_full_deduction_pct   NUMERIC(5,2) NOT NULL DEFAULT 10,
  -- Time decay: complaints/claims older than this many months get reduced weight
  time_decay_months           SMALLINT NOT NULL DEFAULT 12,
  time_decay_factor           NUMERIC(4,2) NOT NULL DEFAULT 0.5,
  -- Minimum inspections before a score is shown
  min_inspections             SMALLINT NOT NULL DEFAULT 3,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                  UUID REFERENCES qc_inspection.team_stakeholder(user_id)
);

-- Ensure only one config row exists
INSERT INTO qc_inspection.scorecard_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
