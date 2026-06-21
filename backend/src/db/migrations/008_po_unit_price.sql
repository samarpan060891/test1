-- Add unit_price to po_master for monetary PO value calculation
ALTER TABLE qc_inspection.po_master
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00;

-- Seed random unit prices for existing PO records
UPDATE qc_inspection.po_master SET unit_price = CASE po_no
  WHEN 'PO-2026-001' THEN 18.50
  WHEN 'PO-2026-002' THEN 32.00
  WHEN 'PO-2026-003' THEN 12.75
  WHEN 'PO-2026-004' THEN 45.00
  WHEN 'PO-2026-005' THEN 27.50
  WHEN 'PO-2026-006' THEN 88.00
  WHEN 'PO-2026-007' THEN 55.00
  WHEN 'PO-2026-008' THEN 21.00
  WHEN 'PO-2026-009' THEN 39.50
  WHEN 'PO-2026-010' THEN 16.00
  WHEN 'PO-2026-011' THEN 18.50
  WHEN 'PO-2026-012' THEN 32.00
  ELSE ROUND((RANDOM() * 90 + 10)::NUMERIC, 2)
END;
