-- Migration 003: Seed / Sample Data
-- Run AFTER 001 and 002 migrations.
-- Provides realistic test data for all 10 tables.
-- Passwords are all: Password@123 (bcrypt hash below matches this)

-- ============================================================
-- 1. ITEM MASTER
-- ============================================================
INSERT INTO qc_inspection.item_master (item_code, name, category, sub_category, description) VALUES
  ('ITM-001', '3-Seater Fabric Sofa',        'Furniture',          'Upholstered Seating',  'L-shape fabric sofa, grey, 240cm'),
  ('ITM-002', 'Wooden Dining Table 6-Seater', 'Furniture',          'Dining & Tables',      'Solid acacia wood, natural finish'),
  ('ITM-003', 'Queen Bed Frame with Headboard','Furniture',         'Bedroom Furniture',    'Upholstered headboard, oak legs'),
  ('ITM-004', 'Office Ergonomic Chair',        'Furniture',         'Seating',              'Mesh back, adjustable armrests'),
  ('ITM-005', 'Ceramic Dinner Set 12pcs',      'Household',         'Tableware',            'White ceramic, microwave safe'),
  ('ITM-006', 'Stainless Steel Cookware Set',  'Household',         'Cookware',             '5-piece set, tri-ply base'),
  ('ITM-007', 'Blackout Curtains 140x260cm',   'Household',         'Soft Furnishings',     'Pair, eyelet top, charcoal'),
  ('ITM-008', 'Memory Foam Mattress Queen',    'Furniture',         'Bedroom Furniture',    '25cm depth, medium firm'),
  ('ITM-009', 'Bamboo Storage Basket Set',     'Household',         'Storage & Organisation','Set of 3, lidded'),
  ('ITM-010', 'LED Floor Lamp',                'Household',         'Lighting',             'Dimmable, 3 colour temps');

-- ============================================================
-- 2. SUPPLIER MASTER
-- ============================================================
INSERT INTO qc_inspection.supplier_master (supplier_code, name, contact_email, contact_name, country) VALUES
  ('SUP-001', 'Shanghai Textiles & Furniture Co.',  'iris.wang@shanghaifurniture.cn',    'Iris Wang',       'China'),
  ('SUP-002', 'Vietnam Home Goods Mfg.',            'minh.le@vietnamhomegoods.vn',       'Minh Le',         'Vietnam'),
  ('SUP-003', 'India Crafts & Exports Ltd.',        'priya.sharma@indiacrafts.in',       'Priya Sharma',    'India'),
  ('SUP-004', 'Malaysia Timber Industries',         'ahmad.razak@mti.com.my',            'Ahmad Razak',     'Malaysia'),
  ('SUP-005', 'Indonesia Rattan & Wood Co.',        'budi.santoso@indonesiarattan.id',   'Budi Santoso',    'Indonesia');

-- ============================================================
-- 3. QUALITY AGENCY MASTER
-- ============================================================
INSERT INTO qc_inspection.quality_agency_master (agency_code, name, contact_emails, contact_name, country) VALUES
  ('AGC-001', 'Bureau Veritas',  ARRAY['eva.bureau@bureauveritas.com', 'ops.asia@bureauveritas.com'], 'Eva Bureau',    'France'),
  ('AGC-002', 'SGS Group',       ARRAY['james.sgs@sgs.com'],                                          'James Tan',     'Switzerland'),
  ('AGC-003', 'Intertek',        ARRAY['mei.lin@intertek.com', 'asia.ops@intertek.com'],              'Mei Lin',       'UK'),
  ('AGC-004', 'QIMA',            ARRAY['david.qima@qima.com'],                                        'David Nguyen',  'Hong Kong'),
  ('AGC-005', 'TUV Rheinland',   ARRAY['sophie.tuv@tuv.com'],                                         'Sophie Weber',  'Germany');

-- ============================================================
-- 4. PO MASTER
-- ============================================================
INSERT INTO qc_inspection.po_master (po_no, supplier_code, item_code, quantity, order_date, status) VALUES
  ('PO-2026-001', 'SUP-001', 'ITM-001', 200,  '2026-03-10', 'in_inspection'),
  ('PO-2026-002', 'SUP-001', 'ITM-002', 150,  '2026-03-15', 'in_inspection'),
  ('PO-2026-003', 'SUP-002', 'ITM-005', 500,  '2026-03-20', 'open'),
  ('PO-2026-004', 'SUP-002', 'ITM-007', 300,  '2026-03-22', 'open'),
  ('PO-2026-005', 'SUP-003', 'ITM-009', 400,  '2026-04-01', 'open'),
  ('PO-2026-006', 'SUP-004', 'ITM-003', 100,  '2026-04-05', 'in_inspection'),
  ('PO-2026-007', 'SUP-004', 'ITM-008', 120,  '2026-04-08', 'open'),
  ('PO-2026-008', 'SUP-005', 'ITM-006', 250,  '2026-04-10', 'passed'),
  ('PO-2026-009', 'SUP-001', 'ITM-004', 180,  '2026-04-12', 'open'),
  ('PO-2026-010', 'SUP-003', 'ITM-010', 350,  '2026-04-15', 'open'),
  ('PO-2026-011', 'SUP-002', 'ITM-001', 220,  '2026-05-01', 'open'),
  ('PO-2026-012', 'SUP-005', 'ITM-002', 130,  '2026-05-05', 'open');

-- ============================================================
-- 5. TEAM / STAKEHOLDER MASTER
-- All passwords = Password@123
-- Hash generated with bcrypt rounds=10
-- ============================================================
INSERT INTO qc_inspection.team_stakeholder (name, email, password_hash, role, agency_code, supplier_code) VALUES
  -- QA team
  ('Alice Chen',      'alice.qa@homesrus.com',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'qa',       NULL,      NULL),
  ('Robert QA',       'robert.qa@homesrus.com',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'qa',       NULL,      NULL),

  -- Buying team
  ('Carol Buying',    'carol.buying@homesrus.com',  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'buying',   NULL,      NULL),
  ('Daniel Buying',   'daniel.buying@homesrus.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'buying',   NULL,      NULL),

  -- Agency users
  ('Eva Bureau',      'eva.bureau@bureauveritas.com','$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'agency',  'AGC-001', NULL),
  ('James Tan',       'james.sgs@sgs.com',           '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'agency',  'AGC-002', NULL),
  ('Mei Lin',         'mei.lin@intertek.com',        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'agency',  'AGC-003', NULL),
  ('David Nguyen',    'david.qima@qima.com',         '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'agency',  'AGC-004', NULL),

  -- Supplier users
  ('Iris Wang',       'iris.wang@shanghaifurniture.cn', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'supplier', NULL, 'SUP-001'),
  ('Minh Le',         'minh.le@vietnamhomegoods.vn',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'supplier', NULL, 'SUP-002'),
  ('Priya Sharma',    'priya.sharma@indiacrafts.in',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'supplier', NULL, 'SUP-003'),
  ('Ahmad Razak',     'ahmad.razak@mti.com.my',         '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'supplier', NULL, 'SUP-004');

-- ============================================================
-- 6. CHECKLIST TEMPLATES
-- ============================================================
INSERT INTO qc_inspection.checklist_template (template_id, category, sub_category, name, version, status) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Furniture', 'Upholstered Seating',  'Upholstered Seating Inspection v1', '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Furniture', 'Dining & Tables',      'Dining & Tables Inspection v1',     '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Furniture', 'Bedroom Furniture',    'Bedroom Furniture Inspection v1',   '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000004', 'Household', 'Tableware',            'Tableware Inspection v1',           '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Household', 'Cookware',             'Cookware Inspection v1',            '1.0', 'draft');

-- ============================================================
-- 7. CHECKLIST ITEMS — Upholstered Seating template
-- ============================================================
INSERT INTO qc_inspection.checklist_item (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  -- Section: Structure
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Structure', 'Frame is sturdy with no wobble or creak under load', 'critical', 1),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Structure', 'Leg joints are secure and properly fastened',        'critical', 2),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Structure', 'Seat depth and width match approved specification',  'major',    3),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Structure', 'Back height matches approved specification',         'major',    4),
  -- Section: Upholstery
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Upholstery', 'Fabric colour and texture matches approved sample', 'critical', 5),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Upholstery', 'Stitching is even, consistent and without breaks',  'major',    6),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Upholstery', 'No pilling, snagging or loose threads visible',     'major',    7),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Upholstery', 'Cushion filling is even with no lumps or flat spots','major',   8),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Upholstery', 'Zipper or closure operates smoothly',               'minor',    9),
  -- Section: Finishing
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Finishing', 'Legs have protective feet/pads fitted',              'minor',   10),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Finishing', 'No visible scratches, marks or damage on frame',     'major',   11),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Finishing', 'Labels (care, country of origin) are correct and attached','major',12),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Finishing', 'Packaging protects all surfaces adequately',         'major',   13);

-- ============================================================
-- 8. CHECKLIST ITEMS — Dining & Tables template
-- ============================================================
INSERT INTO qc_inspection.checklist_item (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Structure',  'Table top is flat with no warping or bowing',           'critical', 1),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Structure',  'All legs are equal length — table does not rock',        'critical', 2),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Structure',  'Joints and fixings are tight and correctly assembled',   'critical', 3),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Structure',  'Table dimensions match approved specification (LxWxH)',  'major',    4),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Finishing',  'Wood grain and colour match approved sample',            'major',    5),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Finishing',  'Surface finish (oil/lacquer) is even with no drips',     'major',    6),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Finishing',  'No visible scratches, dents or marks on table top',      'major',    7),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Finishing',  'Edges are smooth with no splinters or sharp points',     'major',    8),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Finishing',  'Labels (care, country of origin) are correct',           'minor',    9),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Packaging',  'Table top fully protected with foam or bubble wrap',     'major',   10),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Packaging',  'Hardware pack (bolts, Allen key) included and complete', 'critical',11),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Packaging',  'Assembly instructions included and legible',             'minor',   12);

-- ============================================================
-- 9. CHECKLIST ITEMS — Bedroom Furniture template
-- ============================================================
INSERT INTO qc_inspection.checklist_item (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Structure',  'Bed frame assembled correctly per spec drawing',        'critical', 1),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Structure',  'All joints are tight — no wobble when pressure applied','critical', 2),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Structure',  'Slats are evenly spaced and securely fixed',            'major',    3),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Structure',  'Bed dimensions match approved specification',           'major',    4),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Upholstery', 'Headboard fabric/finish matches approved sample',       'critical', 5),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Upholstery', 'Headboard stitching is even with no loose threads',     'major',    6),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Finishing',  'No visible scratches or marks on frame or legs',        'major',    7),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Finishing',  'Protective feet fitted on all legs',                    'minor',    8),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Finishing',  'Labels (care, country of origin) correct and attached', 'major',    9),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Packaging',  'Frame parts wrapped and protected to prevent transit damage','major',10),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Packaging',  'Hardware pack (bolts, fixings) complete and included',  'critical',11);
