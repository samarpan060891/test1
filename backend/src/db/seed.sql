-- Seed data for QC Inspection App
-- Run after schema.sql

-- =====================
-- ITEM MASTER
-- =====================
INSERT INTO item_master (item_code, name, category, sub_category) VALUES
  ('ITM-001', 'Cotton T-Shirt Round Neck', 'Apparel', 'Knits'),
  ('ITM-002', 'Denim Jeans Straight Cut', 'Apparel', 'Wovens'),
  ('ITM-003', 'Polyester Windbreaker', 'Apparel', 'Outerwear'),
  ('ITM-004', 'Leather Belt Brown', 'Accessories', 'Belts'),
  ('ITM-005', 'Canvas Backpack 30L', 'Bags', 'Backpacks'),
  ('ITM-006', 'Running Shoes Mesh Upper', 'Footwear', 'Athletic'),
  ('ITM-007', 'Wool Sweater V-Neck', 'Apparel', 'Knits'),
  ('ITM-008', 'Silk Scarf Printed', 'Accessories', 'Scarves'),
  ('ITM-009', 'Baseball Cap Structured', 'Accessories', 'Headwear'),
  ('ITM-010', 'Yoga Pants Stretchy', 'Apparel', 'Activewear');

-- =====================
-- SUPPLIER MASTER
-- =====================
INSERT INTO supplier_master (supplier_code, name, contact_email) VALUES
  ('SUP-001', 'Shanghai Textiles Co. Ltd', 'procurement@shanghaitextiles.com'),
  ('SUP-002', 'Dhaka Garments Pvt Ltd', 'quality@dhakagarments.com'),
  ('SUP-003', 'Ho Chi Minh Apparel', 'ops@hcmapparel.vn'),
  ('SUP-004', 'Istanbul Fashion Group', 'export@istanbulifashion.tr'),
  ('SUP-005', 'Mumbai Leather Works', 'sales@mumbaileather.in');

-- =====================
-- PO MASTER
-- =====================
INSERT INTO po_master (po_no, supplier_code, item_code, quantity, status) VALUES
  ('PO-2024-001', 'SUP-001', 'ITM-001', 5000, 'open'),
  ('PO-2024-002', 'SUP-001', 'ITM-007', 2000, 'open'),
  ('PO-2024-003', 'SUP-002', 'ITM-002', 3000, 'open'),
  ('PO-2024-004', 'SUP-002', 'ITM-010', 4000, 'open'),
  ('PO-2024-005', 'SUP-003', 'ITM-003', 1500, 'open'),
  ('PO-2024-006', 'SUP-003', 'ITM-001', 6000, 'open'),
  ('PO-2024-007', 'SUP-004', 'ITM-008', 800, 'open'),
  ('PO-2024-008', 'SUP-004', 'ITM-009', 3500, 'open'),
  ('PO-2024-009', 'SUP-005', 'ITM-004', 1200, 'open'),
  ('PO-2024-010', 'SUP-001', 'ITM-001', 4500, 'closed'),
  ('PO-2024-011', 'SUP-002', 'ITM-002', 2500, 'closed'),
  ('PO-2024-012', 'SUP-003', 'ITM-005', 900, 'open');

-- =====================
-- QUALITY AGENCY MASTER
-- =====================
INSERT INTO quality_agency_master (agency_code, name, contact_emails) VALUES
  ('AGY-001', 'Bureau Veritas Inspection', ARRAY['ops@bureauveritas.com', 'reports@bureauveritas.com']),
  ('AGY-002', 'SGS Quality Services', ARRAY['textile@sgs.com', 'asia@sgs.com']),
  ('AGY-003', 'Intertek Testing Services', ARRAY['garments@intertek.com']),
  ('AGY-004', 'TUV Rheinland Group', ARRAY['textile.asia@tuv.com', 'quality@tuv.com']),
  ('AGY-005', 'QIMA Inspection Agency', ARRAY['booking@qima.com', 'reports@qima.com']);

-- =====================
-- TEAM STAKEHOLDERS
-- (passwords are all "password123" bcrypt-hashed)
-- =====================
INSERT INTO team_stakeholders (user_id, name, email, role, agency_code, supplier_code, password_hash) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Alice Chen', 'alice.qa@company.com', 'qa', NULL, NULL, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000002', 'Bob Kumar', 'bob.qa@company.com', 'qa', NULL, NULL, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000003', 'Carol Smith', 'carol.buying@company.com', 'buying', NULL, NULL, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000004', 'David Lee', 'david.buying@company.com', 'buying', NULL, NULL, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000005', 'Eva Martinez', 'eva@bureauveritas.com', 'agency_user', 'AGY-001', NULL, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000006', 'Frank Wang', 'frank@sgs.com', 'agency_user', 'AGY-002', NULL, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000007', 'Grace Kim', 'grace@intertek.com', 'agency_user', 'AGY-003', NULL, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000008', 'Henry Zhou', 'henry@qima.com', 'agency_user', 'AGY-005', NULL, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000009', 'Iris Patel', 'iris@shanghaitextiles.com', 'supplier_user', NULL, 'SUP-001', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000010', 'James Rahman', 'james@dhakagarments.com', 'supplier_user', NULL, 'SUP-002', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000011', 'Karen Nguyen', 'karen@hcmapparel.vn', 'supplier_user', NULL, 'SUP-003', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  ('a0000001-0000-0000-0000-000000000012', 'Leo Yilmaz', 'leo@istanbulifashion.tr', 'supplier_user', NULL, 'SUP-004', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');

-- Note: all passwords are "password" (bcrypt hash of "password")
-- The hash above is the standard bcrypt hash for "password" with cost 10

-- =====================
-- CHECKLIST TEMPLATES (sample active ones)
-- =====================
INSERT INTO checklist_templates (template_id, category, sub_category, version, status) VALUES
  ('t0000001-0000-0000-0000-000000000001', 'Apparel', 'Knits', 1, 'active'),
  ('t0000001-0000-0000-0000-000000000002', 'Apparel', 'Wovens', 1, 'active'),
  ('t0000001-0000-0000-0000-000000000003', 'Apparel', 'Outerwear', 1, 'draft'),
  ('t0000001-0000-0000-0000-000000000004', 'Accessories', 'Belts', 1, 'active'),
  ('t0000001-0000-0000-0000-000000000005', 'Accessories', 'Headwear', 1, 'draft');

-- =====================
-- CHECKLIST ITEMS for Knits template
-- =====================
INSERT INTO checklist_items (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  ('t0000001-0000-0000-0000-000000000001', 'Fabric Quality', 'GSM weight is within ±5% of spec', 'critical', 1),
  ('t0000001-0000-0000-0000-000000000001', 'Fabric Quality', 'No visible holes, runs or snags on fabric surface', 'critical', 2),
  ('t0000001-0000-0000-0000-000000000001', 'Fabric Quality', 'Colorfastness to washing meets ISO 105-C06 Grade 4 minimum', 'critical', 3),
  ('t0000001-0000-0000-0000-000000000001', 'Fabric Quality', 'Pilling resistance is Grade 3 or above', 'major', 4),
  ('t0000001-0000-0000-0000-000000000001', 'Stitching & Construction', 'Stitch density meets 8-10 SPI as per spec', 'major', 5),
  ('t0000001-0000-0000-0000-000000000001', 'Stitching & Construction', 'No skipped stitches or broken threads anywhere', 'critical', 6),
  ('t0000001-0000-0000-0000-000000000001', 'Stitching & Construction', 'Seam strength meets minimum 15kg pull test', 'critical', 7),
  ('t0000001-0000-0000-0000-000000000001', 'Stitching & Construction', 'Label is correctly positioned and securely attached', 'major', 8),
  ('t0000001-0000-0000-0000-000000000001', 'Measurements', 'Chest measurement within ±2cm of size chart', 'major', 9),
  ('t0000001-0000-0000-0000-000000000001', 'Measurements', 'Body length within ±1.5cm of size chart', 'major', 10),
  ('t0000001-0000-0000-0000-000000000001', 'Measurements', 'Sleeve length within ±1.5cm of size chart', 'major', 11),
  ('t0000001-0000-0000-0000-000000000001', 'Packaging', 'Correct size sticker on polybag', 'minor', 12),
  ('t0000001-0000-0000-0000-000000000001', 'Packaging', 'Hangtag attached with correct price and barcode', 'minor', 13),
  ('t0000001-0000-0000-0000-000000000001', 'Packaging', 'Carton marked with correct PO number and quantity', 'minor', 14);

-- CHECKLIST ITEMS for Wovens template
INSERT INTO checklist_items (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  ('t0000001-0000-0000-0000-000000000002', 'Fabric Quality', 'Fabric weight and weave structure matches approved sample', 'critical', 1),
  ('t0000001-0000-0000-0000-000000000002', 'Fabric Quality', 'No weaving defects (holes, broken warp/weft, slubs)', 'critical', 2),
  ('t0000001-0000-0000-0000-000000000002', 'Fabric Quality', 'Shrinkage after washing within 3% per AATCC 135', 'critical', 3),
  ('t0000001-0000-0000-0000-000000000002', 'Construction', 'All seams are flat-felled or French seam as per spec', 'major', 4),
  ('t0000001-0000-0000-0000-000000000002', 'Construction', 'Zip functions smoothly without snagging', 'major', 5),
  ('t0000001-0000-0000-0000-000000000002', 'Construction', 'Button attachment strength >5kg pull test', 'critical', 6),
  ('t0000001-0000-0000-0000-000000000002', 'Construction', 'Pocket alignment symmetrical within 3mm', 'minor', 7),
  ('t0000001-0000-0000-0000-000000000002', 'Measurements', 'Waist measurement within ±1cm of spec', 'major', 8),
  ('t0000001-0000-0000-0000-000000000002', 'Measurements', 'Inseam length within ±1cm of spec', 'major', 9),
  ('t0000001-0000-0000-0000-000000000002', 'Measurements', 'Hip measurement within ±1.5cm of spec', 'major', 10),
  ('t0000001-0000-0000-0000-000000000002', 'Packaging', 'Folded neatly and inserted into correct size polybag', 'minor', 11),
  ('t0000001-0000-0000-0000-000000000002', 'Packaging', 'All accessories (belt loops, spare buttons) present', 'minor', 12);

-- CHECKLIST ITEMS for Belts template
INSERT INTO checklist_items (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  ('t0000001-0000-0000-0000-000000000004', 'Material', 'Leather thickness meets 3.5-4mm spec', 'critical', 1),
  ('t0000001-0000-0000-0000-000000000004', 'Material', 'No blemishes, scratches or uneven surface on leather', 'major', 2),
  ('t0000001-0000-0000-0000-000000000004', 'Material', 'Color matches approved swatch within shade tolerance', 'major', 3),
  ('t0000001-0000-0000-0000-000000000004', 'Hardware', 'Buckle is correctly sized and functions smoothly', 'critical', 4),
  ('t0000001-0000-0000-0000-000000000004', 'Hardware', 'No sharp edges on buckle or holes', 'critical', 5),
  ('t0000001-0000-0000-0000-000000000004', 'Hardware', 'Nickel/finish matches spec (brushed/polished)', 'minor', 6),
  ('t0000001-0000-0000-0000-000000000004', 'Measurements', 'Belt length within ±5mm of spec per size', 'major', 7),
  ('t0000001-0000-0000-0000-000000000004', 'Measurements', 'Hole spacing uniform at 2.5cm intervals', 'minor', 8);
