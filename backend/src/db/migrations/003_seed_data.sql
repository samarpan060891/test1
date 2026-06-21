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
INSERT INTO qc_inspection.po_master (po_no, supplier_code, item_code, quantity, unit_price, order_date, status) VALUES
  ('PO-2026-001', 'SUP-001', 'ITM-001', 200,  18.50, '2026-03-10', 'in_inspection'),
  ('PO-2026-002', 'SUP-001', 'ITM-002', 150,  32.00, '2026-03-15', 'in_inspection'),
  ('PO-2026-003', 'SUP-002', 'ITM-005', 500,  12.75, '2026-03-20', 'open'),
  ('PO-2026-004', 'SUP-002', 'ITM-007', 300,  45.00, '2026-03-22', 'open'),
  ('PO-2026-005', 'SUP-003', 'ITM-009', 400,  27.50, '2026-04-01', 'open'),
  ('PO-2026-006', 'SUP-004', 'ITM-003', 100,  88.00, '2026-04-05', 'in_inspection'),
  ('PO-2026-007', 'SUP-004', 'ITM-008', 120,  55.00, '2026-04-08', 'open'),
  ('PO-2026-008', 'SUP-005', 'ITM-006', 250,  21.00, '2026-04-10', 'passed'),
  ('PO-2026-009', 'SUP-001', 'ITM-004', 180,  39.50, '2026-04-12', 'open'),
  ('PO-2026-010', 'SUP-003', 'ITM-010', 350,  16.00, '2026-04-15', 'open'),
  ('PO-2026-011', 'SUP-002', 'ITM-001', 220,  18.50, '2026-05-01', 'open'),
  ('PO-2026-012', 'SUP-005', 'ITM-002', 130,  32.00, '2026-05-05', 'open');

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
  ('Eva Bureau',      'eva.bureau@bureauveritas.com','$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'agency_user',  'AGC-001', NULL),
  ('James Tan',       'james.sgs@sgs.com',           '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'agency_user',  'AGC-002', NULL),
  ('Mei Lin',         'mei.lin@intertek.com',        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'agency_user',  'AGC-003', NULL),
  ('David Nguyen',    'david.qima@qima.com',         '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'agency_user',  'AGC-004', NULL),
  ('Sophie Weber',    'sophie.tuv@tuv.com',          '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'agency_user',  'AGC-005', NULL),

  -- Supplier users
  ('Iris Wang',       'iris.wang@shanghaifurniture.cn', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'supplier_user', NULL, 'SUP-001'),
  ('Minh Le',         'minh.le@vietnamhomegoods.vn',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'supplier_user', NULL, 'SUP-002'),
  ('Priya Sharma',    'priya.sharma@indiacrafts.in',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'supplier_user', NULL, 'SUP-003'),
  ('Ahmad Razak',     'ahmad.razak@mti.com.my',         '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'supplier_user', NULL, 'SUP-004'),
  ('Budi Santoso',    'budi.santoso@indonesiarattan.id','$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'supplier_user', NULL, 'SUP-005');

-- ============================================================
-- 6. CHECKLIST TEMPLATES
-- ============================================================
INSERT INTO qc_inspection.checklist_template (template_id, category, sub_category, name, version, status) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Furniture', 'Upholstered Seating',    'Upholstered Seating Inspection v1',    '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Furniture', 'Dining & Tables',        'Dining & Tables Inspection v1',        '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Furniture', 'Bedroom Furniture',      'Bedroom Furniture Inspection v1',      '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000004', 'Household', 'Tableware',              'Tableware Inspection v1',              '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Household', 'Cookware',               'Cookware Inspection v1',               '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Furniture', 'Seating',                'Seating Inspection v1',                '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Household', 'Soft Furnishings',       'Soft Furnishings Inspection v1',       '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Household', 'Storage & Organisation', 'Storage & Organisation Inspection v1', '1.0', 'active'),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Household', 'Lighting',               'Lighting Inspection v1',               '1.0', 'active');

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

-- ============================================================
-- 10. CHECKLIST ITEMS — Cookware template
-- ============================================================
INSERT INTO qc_inspection.checklist_item (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Visual & Finish',   'No scratches, dents or surface damage on body or lid',                  'major',    1),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Visual & Finish',   'Coating/non-stick finish uniform — no peeling, bubbling or bare patches','critical', 2),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Visual & Finish',   'Colour and finish matches approved sample',                              'major',    3),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Dimensions',        'Overall dimensions within tolerance (±2 mm)',                            'major',    4),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Dimensions',        'Lid fits flush with no visible gap around rim',                          'major',    5),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Material & Safety', 'Material confirmed food-grade — no toxic or restricted substances',      'critical', 6),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Material & Safety', 'Handle/knob firmly attached — no wobble or looseness',                  'critical', 7),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Material & Safety', 'No sharp edges or burrs on rim, handle or base',                        'critical', 8),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Functionality',     'Lid sits flush and forms proper seal when closed',                      'major',    9),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Functionality',     'Handles/knobs confirmed heat-resistant and correctly mounted',           'major',   10),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Packaging',         'Product packed without damage — no dents from packaging pressure',       'minor',   11),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Packaging',         'Correct label/barcode on packaging matches PO specification',            'minor',   12);

-- ============================================================
-- 11. CHECKLIST ITEMS — Seating (Office/Other) template
-- ============================================================
INSERT INTO qc_inspection.checklist_item (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Structure',     'Chair base/frame is stable with no wobble under load',                 'critical', 1),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Structure',     'All screws, bolts and fixings are tight and correctly assembled',      'critical', 2),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Structure',     'Seat and back dimensions match approved specification',                'major',    3),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Ergonomics',    'Height adjustment mechanism operates smoothly and locks correctly',    'critical', 4),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Ergonomics',    'Armrests (if applicable) adjust and lock at correct heights',          'major',    5),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Ergonomics',    'Lumbar support positioned correctly and provides adequate support',    'major',    6),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Upholstery',    'Seat and back fabric/mesh colour matches approved sample',             'major',    7),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Upholstery',    'No pilling, snagging or loose threads on fabric surfaces',            'major',    8),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Upholstery',    'Cushion/padding is even with no lumps, flat spots or exposed foam',   'major',    9),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Finishing',     'No visible scratches or marks on frame, base or armrests',            'major',   10),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Finishing',     'Castors/glides fitted and move freely without snagging',              'minor',   11),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Packaging',     'Chair parts protected to prevent transit damage',                     'major',   12),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'Packaging',     'Assembly instructions and hardware pack included and complete',        'critical',13);

-- ============================================================
-- 12. CHECKLIST ITEMS — Soft Furnishings template
-- ============================================================
INSERT INTO qc_inspection.checklist_item (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Visual',        'Colour and pattern matches approved sample (no dye lot variation)',    'critical', 1),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Visual',        'No stains, marks, snags or pulls visible on fabric surface',          'major',    2),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Visual',        'Pattern repeat is aligned correctly across width and length',         'major',    3),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Dimensions',    'Overall dimensions (length x width) within tolerance (±1 cm)',        'major',    4),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Dimensions',    'Hem width is even and consistent on all edges',                       'major',    5),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Construction',  'Stitching is even, straight and without skipped stitches',            'major',    6),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Construction',  'Header tape/eyelets/hooks are firmly attached and evenly spaced',     'critical', 7),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Construction',  'Lining (if applicable) is correctly attached with no puckering',      'major',    8),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Functionality', 'Blackout/thermal lining verified to block light as per spec',         'critical', 9),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Finishing',     'Care label and country of origin label correctly attached',           'major',   10),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Packaging',     'Items folded neatly and packed without creasing or damage',           'minor',   11),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'Packaging',     'Correct barcode/SKU label on packaging matches PO specification',     'minor',   12);

-- ============================================================
-- 13. CHECKLIST ITEMS — Storage & Organisation template
-- ============================================================
INSERT INTO qc_inspection.checklist_item (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Visual & Finish',   'No visible defects — no cracks, splits, fraying or discolouration',  'major',    1),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Visual & Finish',   'Colour and finish matches approved sample',                           'major',    2),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Visual & Finish',   'Weave/construction is even with no loose strands or gaps',            'major',    3),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Dimensions',        'All pieces in set match specified dimensions within tolerance (±5mm)', 'major',    4),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Dimensions',        'Lids (if applicable) fit correctly with no excessive gap',             'major',    5),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Structure',         'Basket/container holds its shape under normal load without deforming', 'critical', 6),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Structure',         'Handles firmly attached with no looseness or risk of detachment',      'critical', 7),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Structure',         'Base is stable — unit does not tip when loaded to rated capacity',     'major',    8),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Safety',            'No sharp edges, splinters or protruding fixings',                      'critical', 9),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Finishing',         'Care/material label correctly attached',                               'minor',   10),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Packaging',         'Items nested/stacked securely to prevent transit damage',              'minor',   11),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'Packaging',         'Correct barcode/SKU label on packaging matches PO specification',      'minor',   12);

-- ============================================================
-- 14. CHECKLIST ITEMS — Lighting template
-- ============================================================
INSERT INTO qc_inspection.checklist_item (template_id, section, checkpoint_text, criticality, sort_order) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Visual & Finish',   'No scratches, dents or cracks on shade, body or base',                'major',    1),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Visual & Finish',   'Colour and finish matches approved sample',                           'major',    2),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Visual & Finish',   'Shade is even with no warping, creasing or discolouration',           'major',    3),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Electrical Safety', 'Wiring is correctly insulated with no exposed conductors',            'critical', 4),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Electrical Safety', 'Plug/connector is correctly fitted and meets destination market spec', 'critical', 5),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Electrical Safety', 'Earth/grounding connection verified (where applicable)',               'critical', 6),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Electrical Safety', 'Rated voltage and wattage label present and correct',                  'critical', 7),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Functionality',     'Lamp powers on correctly and produces consistent light output',        'critical', 8),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Functionality',     'Dimmer/colour temperature switch operates through all settings',       'major',    9),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Functionality',     'Base is stable — lamp does not tip when placed on flat surface',       'major',   10),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Finishing',         'All required certifications (CE, UKCA, etc.) marked on product',       'critical',11),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Packaging',         'Lamp fully protected — shade and bulb (if included) secured separately','major',  12),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'Packaging',         'Correct barcode/SKU label on packaging matches PO specification',      'minor',   13);
