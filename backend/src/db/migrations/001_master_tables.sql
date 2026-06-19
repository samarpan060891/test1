-- Migration 001: Master Tables
-- Creates the 5 foundation tables in the qc_inspection schema.
-- Run this in Supabase SQL Editor before any other migration.

-- 1. ITEM MASTER
-- Stores every product the company buys/inspects.
CREATE TABLE qc_inspection.item_master (
  item_code       TEXT PRIMARY KEY,               -- e.g. "ITM-001"
  name            TEXT NOT NULL,                  -- e.g. "3-Seater Sofa"
  category        TEXT NOT NULL,                  -- e.g. "Furniture"
  sub_category    TEXT NOT NULL,                  -- e.g. "Upholstered Seating"
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. SUPPLIER MASTER
-- Every supplier the company works with.
CREATE TABLE qc_inspection.supplier_master (
  supplier_code   TEXT PRIMARY KEY,               -- e.g. "SUP-001"
  name            TEXT NOT NULL,                  -- e.g. "Shanghai Textiles Co."
  contact_email   TEXT NOT NULL,                  -- Primary contact email
  contact_name    TEXT,
  country         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PO MASTER
-- Every Purchase Order raised. Links a supplier to one or more items.
CREATE TABLE qc_inspection.po_master (
  po_no           TEXT PRIMARY KEY,               -- e.g. "PO-2026-001"
  supplier_code   TEXT NOT NULL REFERENCES qc_inspection.supplier_master(supplier_code),
  item_code       TEXT NOT NULL REFERENCES qc_inspection.item_master(item_code),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_inspection','passed','failed','closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. QUALITY AGENCY MASTER
-- The external inspection companies (e.g. Bureau Veritas, SGS, Intertek).
CREATE TABLE qc_inspection.quality_agency_master (
  agency_code     TEXT PRIMARY KEY,               -- e.g. "AGC-001"
  name            TEXT NOT NULL,                  -- e.g. "Bureau Veritas"
  contact_emails  TEXT[] NOT NULL DEFAULT '{}',   -- Array: can have multiple contacts
  contact_name    TEXT,
  country         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TEAM / STAKEHOLDER MASTER
-- Every user who can log in. One person = one role.
CREATE TABLE qc_inspection.team_stakeholder (
  user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL
                  CHECK (role IN ('qa','buying','agency','supplier')),
  -- Only filled in for agency/supplier users (links them to their org):
  agency_code     TEXT REFERENCES qc_inspection.quality_agency_master(agency_code),
  supplier_code   TEXT REFERENCES qc_inspection.supplier_master(supplier_code),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A user can only be linked to one org type at a time:
  CONSTRAINT chk_role_org CHECK (
    (role = 'agency'   AND agency_code IS NOT NULL AND supplier_code IS NULL) OR
    (role = 'supplier' AND supplier_code IS NOT NULL AND agency_code IS NULL) OR
    (role IN ('qa','buying') AND agency_code IS NULL AND supplier_code IS NULL)
  )
);

-- Indexes for common lookups
CREATE INDEX idx_po_master_supplier     ON qc_inspection.po_master(supplier_code);
CREATE INDEX idx_po_master_item         ON qc_inspection.po_master(item_code);
CREATE INDEX idx_team_stakeholder_email ON qc_inspection.team_stakeholder(email);
CREATE INDEX idx_team_stakeholder_role  ON qc_inspection.team_stakeholder(role);
