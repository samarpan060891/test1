require('dotenv').config();
const app = require('./app');
const db = require('./db');
const bcrypt = require('bcryptjs');
const { startScheduler } = require('./services/scheduler');

const PORT = process.env.PORT || 4000;

async function safeQuery(sql, label) {
  try {
    await db.query(sql);
  } catch (err) {
    console.warn(`⚠️  Migration step skipped (${label}): ${err.message}`);
  }
}

async function runMigrations() {
  // 008: unit_price on po_master
  await safeQuery(`ALTER TABLE qc_inspection.po_master ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00`, 'unit_price col');
  await safeQuery(`UPDATE qc_inspection.po_master SET unit_price = CASE po_no
      WHEN 'PO-2026-001' THEN 18.50  WHEN 'PO-2026-002' THEN 32.00
      WHEN 'PO-2026-003' THEN 12.75  WHEN 'PO-2026-004' THEN 45.00
      WHEN 'PO-2026-005' THEN 27.50  WHEN 'PO-2026-006' THEN 88.00
      WHEN 'PO-2026-007' THEN 55.00  WHEN 'PO-2026-008' THEN 21.00
      WHEN 'PO-2026-009' THEN 39.50  WHEN 'PO-2026-010' THEN 16.00
      WHEN 'PO-2026-011' THEN 18.50  WHEN 'PO-2026-012' THEN 32.00
      WHEN 'PO-2026-013' THEN 24.00  WHEN 'PO-2026-014' THEN 67.50
      WHEN 'PO-2026-015' THEN 42.00  WHEN 'PO-2026-016' THEN 15.75
      WHEN 'PO-2026-017' THEN 98.00  WHEN 'PO-2026-018' THEN 33.50
      WHEN 'PO-2026-019' THEN 51.00  WHEN 'PO-2026-020' THEN 29.00
      ELSE 35.00
    END WHERE unit_price = 0 OR unit_price IS NULL`, 'unit_price seed');

  // Also fix advices where po_value is 0 or null — recalculate from current PO data
  await safeQuery(`
    UPDATE qc_inspection.inspection_charges_advice a
    SET po_value = sub.recalc_po
    FROM (
      SELECT ij.advice_id,
             COALESCE(SUM(pm.quantity * pm.unit_price), 0) AS recalc_po
      FROM qc_inspection.ica_jobs ij
      JOIN qc_inspection.inspection_job j ON j.job_id = ij.job_id
      JOIN qc_inspection.po_master pm ON pm.po_no = j.po_no
      GROUP BY ij.advice_id
    ) sub
    WHERE a.advice_id = sub.advice_id
      AND (a.po_value IS NULL OR a.po_value = 0)
      AND sub.recalc_po > 0
  `, 'backfill po_value on advices');

  // result column on inspection_job
  await safeQuery(`ALTER TABLE qc_inspection.inspection_job ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IN ('pass','fail','na'))`, 'result col');

  // 009: drop old role/status check constraints by scanning pg_constraint, add new ones
  await safeQuery(`
    DO $$ DECLARE r RECORD; BEGIN
      FOR r IN SELECT conname FROM pg_constraint
        WHERE conrelid = 'qc_inspection.team_stakeholder'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%role%'
      LOOP EXECUTE 'ALTER TABLE qc_inspection.team_stakeholder DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname); END LOOP;
    END $$`, 'drop role constraint');

  await safeQuery(`
    DO $$ BEGIN
      ALTER TABLE qc_inspection.team_stakeholder ADD CONSTRAINT ts_role_check
        CHECK (role IN ('qa','buying','agency_user','supplier_user','admin','imports','accounts'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`, 'add role constraint');

  await safeQuery(`
    DO $$ DECLARE r RECORD; BEGIN
      FOR r IN SELECT conname FROM pg_constraint
        WHERE conrelid = 'qc_inspection.inspection_charges_advice'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
      LOOP EXECUTE 'ALTER TABLE qc_inspection.inspection_charges_advice DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname); END LOOP;
    END $$`, 'drop status constraint');

  await safeQuery(`
    DO $$ BEGIN
      ALTER TABLE qc_inspection.inspection_charges_advice ADD CONSTRAINT ica_status_check
        CHECK (status IN ('pending_qa','pending_buying','pending_imports','pending_accounts','paid','rejected'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`, 'add status constraint');

  // Add new columns individually
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS imports_user_id UUID REFERENCES qc_inspection.team_stakeholder(user_id)`, 'imports_user_id');
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS imports_approved_at TIMESTAMPTZ`, 'imports_approved_at');
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS imports_notes TEXT`, 'imports_notes');
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS accounts_user_id UUID REFERENCES qc_inspection.team_stakeholder(user_id)`, 'accounts_user_id');
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS accounts_approved_at TIMESTAMPTZ`, 'accounts_approved_at');
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS accounts_notes TEXT`, 'accounts_notes');

  // 010: invoice upload columns on inspection_charges_advice
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS invoice_file_name TEXT`, 'invoice_file_name');
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS invoice_file_data BYTEA`, 'invoice_file_data');
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS invoice_file_type TEXT`, 'invoice_file_type');
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS invoice_uploaded_at TIMESTAMPTZ`, 'invoice_uploaded_at');
  await safeQuery(`ALTER TABLE qc_inspection.inspection_charges_advice ADD COLUMN IF NOT EXISTS invoice_uploaded_by UUID REFERENCES qc_inspection.team_stakeholder(user_id)`, 'invoice_uploaded_by');
  await safeQuery(`ALTER TABLE qc_inspection.inspection_job ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES qc_inspection.agency_contract(contract_id)`, 'job contract_id');
  await safeQuery(`ALTER TABLE qc_inspection.notification_event ADD COLUMN IF NOT EXISTS agency_code TEXT`, 'notification agency_code');
  await safeQuery(`ALTER TABLE qc_inspection.notification_event ADD COLUMN IF NOT EXISTS supplier_code TEXT`, 'notification supplier_code');
  await safeQuery(`ALTER TABLE qc_inspection.notification_event ADD COLUMN IF NOT EXISTS buyer_id UUID`, 'notification buyer_id');
  await safeQuery(`ALTER TABLE qc_inspection.po_master ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES qc_inspection.team_stakeholder(user_id)`, 'po buyer_id');

  // Assign buyers randomly to POs that have none
  await safeQuery(`
    UPDATE qc_inspection.po_master p
    SET buyer_id = (
      SELECT user_id FROM qc_inspection.team_stakeholder
      WHERE role = 'buying'
      ORDER BY md5(p.po_no || user_id::text)
      LIMIT 1
    )
    WHERE p.buyer_id IS NULL
      AND EXISTS (SELECT 1 FROM qc_inspection.team_stakeholder WHERE role = 'buying')
  `, 'seed buyer_id on POs');


  await safeQuery(`UPDATE qc_inspection.inspection_charges_advice SET status = 'pending_imports' WHERE status = 'approved'`, 'migrate approved→pending_imports');
  // Also fix any rows that were incorrectly set to 'paid' by a previous migration run
  await safeQuery(`UPDATE qc_inspection.inspection_charges_advice SET status = 'pending_imports' WHERE status = 'paid' AND imports_user_id IS NULL`, 'fix paid→pending_imports');

  // Ensure default accounts exist
  const defaultUsers = [
    { name: 'Admin',    email: 'admin@homesrus.com',    role: 'admin' },
    { name: 'Imports',  email: 'imports@homesrus.com',  role: 'imports' },
    { name: 'Accounts', email: 'accounts@homesrus.com', role: 'accounts' },
  ];
  for (const u of defaultUsers) {
    try {
      const hash = await bcrypt.hash('Password@123', 10);
      await db.query(
        `INSERT INTO qc_inspection.team_stakeholder (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET password_hash = $3, role = $4`,
        [u.name, u.email, hash, u.role]
      );
    } catch (err) {
      console.warn(`⚠️  Could not upsert user ${u.email}: ${err.message}`);
    }
  }

  // 010: per-user notification dismissal — store dismissed_by as UUID array on the event row
  await safeQuery(
    `ALTER TABLE qc_inspection.notification_event ADD COLUMN IF NOT EXISTS dismissed_by UUID[] DEFAULT '{}'`,
    'notification_event dismissed_by col'
  );

  // 011a: nuclear clean of the 4 new templates then re-insert — runs only once via version guard
  await safeQuery(`
    CREATE TABLE IF NOT EXISTS qc_inspection._migration_flags (flag TEXT PRIMARY KEY)
  `, 'migration flags table');

  try {
    const flagged = await db.query(
      `SELECT 1 FROM qc_inspection._migration_flags WHERE flag = 'dedup_new_templates_v2'`
    );
    if (flagged.rows.length === 0) {
      await db.query(`
        DELETE FROM qc_inspection.checklist_item
        WHERE template_id IN (
          'aaaaaaaa-0001-0001-0001-000000000010'::uuid,
          'aaaaaaaa-0001-0001-0001-000000000011'::uuid,
          'aaaaaaaa-0001-0001-0001-000000000012'::uuid,
          'aaaaaaaa-0001-0001-0001-000000000013'::uuid,
          'aaaaaaaa-0001-0001-0001-000000000014'::uuid
        )
      `);
      await db.query(`INSERT INTO qc_inspection._migration_flags VALUES ('dedup_new_templates_v2')`);
      console.log('✅ [MIGRATION] Cleared duplicate checklist items for new templates');
    }
  } catch (err) {
    console.error('⚠️  [MIGRATION] dedup_new_templates_v2 failed:', err.message);
  }

  // 011: checklist templates for new item categories
  await safeQuery(`
    INSERT INTO qc_inspection.checklist_template (template_id, category, sub_category, name, version, status) VALUES
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Furniture',  'Living Room', 'Living Room Furniture Inspection v1', '1.0', 'active'),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Household',  'Décor',       'Décor Items Inspection v1',           '1.0', 'active'),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Furniture',  'Outdoor',     'Outdoor Furniture Inspection v1',     '1.0', 'active'),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Household',  'Bathroom',    'Bathroom Accessories Inspection v1',  '1.0', 'active'),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Furniture',  'Storage & Organisation', 'Storage & Organisation Inspection v1', '1.0', 'active')
    ON CONFLICT (template_id) DO NOTHING
  `, 'new checklist templates for Living Room, Decor, Outdoor, Bathroom');

  await safeQuery(`
    INSERT INTO qc_inspection.checklist_item (template_id, section, checkpoint_text, criticality, sort_order)
    SELECT v.template_id::uuid, v.section, v.checkpoint_text, v.criticality, v.sort_order::int
    FROM (VALUES
      -- Living Room Furniture (Rattan Coffee Table, Velvet Accent Chair, Woven Storage Ottoman)
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Structure',   'Frame/base is sturdy with no wobble or flex under load',             'critical', 1),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Structure',   'All joints, fixings and welds are tight and correctly assembled',    'critical', 2),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Structure',   'Dimensions (L x W x H) match approved specification',               'major',    3),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Material',    'Material type and finish matches approved sample (rattan/fabric/seagrass)', 'critical', 4),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Material',    'Weave/upholstery is even with no loose strands or gaps',             'major',    5),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Material',    'Colour and texture match approved reference',                        'major',    6),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Finishing',   'No visible scratches, marks or damage on any surface',               'major',    7),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Finishing',   'Protective feet/pads fitted on all legs or base contacts',           'minor',    8),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Finishing',   'Hinged lids (if any) open and close smoothly without sticking',      'major',    9),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Finishing',   'Care and country of origin labels correctly attached',               'major',   10),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Packaging',   'All surfaces protected adequately for transit',                      'major',   11),
      ('aaaaaaaa-0001-0001-0001-000000000010', 'Packaging',   'Correct barcode/SKU on packaging matches PO specification',          'minor',   12),

      -- Décor Items (Ceramic Vase Set)
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Visual',      'Colour, glaze and finish match approved sample on all pieces',       'critical', 1),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Visual',      'No chips, cracks, crazing or glaze defects on any surface',          'critical', 2),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Visual',      'No visible mould lines, bubbles or firing marks',                    'major',    3),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Dimensions',  'Heights and diameters of each piece within tolerance (±3 mm)',       'major',    4),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Dimensions',  'Set contains correct number of pieces per specification',            'critical', 5),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Construction','Base is flat and stable — item does not rock on flat surface',        'major',    6),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Construction','Interior is smooth with no sharp ceramic edges',                     'major',    7),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Finishing',   'Country of origin label correctly affixed (not obscuring design)',   'minor',    8),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Packaging',   'Each piece individually wrapped to prevent contact damage',          'critical', 9),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Packaging',   'Outer carton is rigid with adequate void fill to prevent movement',  'major',   10),
      ('aaaaaaaa-0001-0001-0001-000000000011', 'Packaging',   'Fragile marking present on all outer cartons',                       'minor',   11),

      -- Outdoor Furniture (Outdoor Garden Chair)
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Structure',   'Frame is rigid and stable with no wobble under full load',           'critical', 1),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Structure',   'All welds, bolts and rivets are secure and correctly finished',      'critical', 2),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Structure',   'Dimensions (seat height, width, depth) match specification',         'major',    3),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Material',    'Powder coating is even with no bare patches, bubbling or peeling',   'critical', 4),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Material',    'Colour matches approved sample',                                     'major',    5),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Material',    'Steel/aluminium gauge meets specification for outdoor use',          'critical', 6),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Durability',  'No rust, corrosion or oxidation visible on any surface',             'critical', 7),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Durability',  'All joints show no signs of stress cracking or deformation',         'major',    8),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Stackability','Chair stacks correctly and stably to minimum 6 units',               'major',    9),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Finishing',   'No sharp edges or burrs on any cut or welded surface',               'critical',10),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Finishing',   'Protective end caps/feet fitted on all leg bases',                   'minor',   11),
      ('aaaaaaaa-0001-0001-0001-000000000012', 'Packaging',   'Corners and frame protected to prevent transit scratches',           'major',   12),

      -- Bathroom Accessories (Bathroom Accessory Set 5pcs)
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Visual',      'Colour and finish (matte black) match approved sample on all pieces','critical', 1),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Visual',      'No scratches, chips, pitting or coating defects on any piece',       'critical', 2),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Visual',      'Finish is consistent across all 5 pieces in the set',               'major',    3),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Construction','Set contains all 5 correct pieces per specification',                'critical', 4),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Construction','Soap dispenser pump operates smoothly and dispenses correctly',      'critical', 5),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Construction','All pieces are stable on flat surface with no rocking',              'major',    6),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Construction','Tumbler/toothbrush holder has smooth interior with no sharp edges',  'major',    7),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Material',    'Material is rust-resistant and suitable for bathroom environment',   'critical', 8),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Material',    'No toxic or restricted substances used in coating or material',      'critical', 9),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Finishing',   'Country of origin and care labels correctly attached',              'minor',   10),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Packaging',   'Each piece individually protected to prevent scratching in transit', 'major',   11),
      ('aaaaaaaa-0001-0001-0001-000000000013', 'Packaging',   'Correct barcode/SKU on packaging matches PO specification',          'minor',   12),

      -- Storage & Organisation Furniture (Wooden Wall Shelf 3-tier)
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Structure',   'All shelf brackets/fixings are correctly installed and load-bearing', 'critical', 1),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Structure',   'Shelves are level, flat and do not bow or deflect under load',        'critical', 2),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Structure',   'Dimensions (W x D x H per tier) match approved specification',        'major',    3),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Material',    'Wood species/grade and finish match approved sample',                 'critical', 4),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Material',    'No warping, cracking or knots that compromise structural integrity',  'critical', 5),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Material',    'Colour and grain are consistent across all shelf tiers',              'major',    6),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Hardware',    'All wall anchors, screws, dowels and fixings are included in pack',   'critical', 7),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Hardware',    'Metal hardware (brackets/rods) show no rust or surface defects',      'major',    8),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Finishing',   'All surfaces sanded smooth with no splinters or rough edges',         'critical', 9),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Finishing',   'Paint/lacquer/oil coating is even with no drips, bare spots or runs', 'major',   10),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Finishing',   'Care, weight-limit and country of origin labels correctly attached',  'major',   11),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Packaging',   'All components present and accounted for (shelves, hardware, manual)','critical',12),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Packaging',   'Shelf surfaces protected with foam/wrap to prevent transit scratches','major',   13),
      ('aaaaaaaa-0001-0001-0001-000000000014', 'Packaging',   'Correct barcode/SKU on outer carton matches PO specification',        'minor',   14)
    ) AS v(template_id, section, checkpoint_text, criticality, sort_order)
    WHERE NOT EXISTS (
      SELECT 1 FROM qc_inspection.checklist_item ci WHERE ci.template_id = v.template_id::uuid AND ci.sort_order = v.sort_order
    )
  `, 'checklist items for Living Room, Decor, Outdoor, Bathroom templates');

  // 011: new items and POs for testing
  await safeQuery(`
    INSERT INTO qc_inspection.item_master (item_code, name, category, sub_category, description) VALUES
      ('ITM-011', 'Rattan Coffee Table',          'Furniture',  'Living Room',          'Natural rattan, round, 90cm diameter'),
      ('ITM-012', 'Velvet Accent Chair',           'Furniture',  'Upholstered Seating',  'Teal velvet, gold legs, single seater'),
      ('ITM-013', 'Ceramic Vase Set 3pcs',         'Household',  'Décor',                'Matte white, varying heights'),
      ('ITM-014', 'Linen Bed Sheet Set King',      'Household',  'Soft Furnishings',     '100% linen, stone wash, king size'),
      ('ITM-015', 'Wooden Wall Shelf 3-tier',      'Furniture',  'Storage & Organisation','Pine wood, floating, 120cm wide'),
      ('ITM-016', 'Glass Pendant Light',           'Household',  'Lighting',             'Amber glass shade, E27 fitting'),
      ('ITM-017', 'Outdoor Garden Chair',          'Furniture',  'Outdoor',              'Powder coated steel, stackable'),
      ('ITM-018', 'Woven Storage Ottoman',         'Furniture',  'Living Room',          'Seagrass weave, hinged lid, grey'),
      ('ITM-019', 'Non-stick Frying Pan Set',      'Household',  'Cookware',             '3-piece, granite coating, induction safe'),
      ('ITM-020', 'Bathroom Accessory Set 5pcs',   'Household',  'Bathroom',             'Matte black, soap dispenser, tumbler, etc')
    ON CONFLICT (item_code) DO NOTHING
  `, 'new items ITM-011 to ITM-020');

  await safeQuery(`
    INSERT INTO qc_inspection.po_master (po_no, supplier_code, item_code, quantity, unit_price, order_date, status) VALUES
      ('PO-2026-021', 'SUP-005', 'ITM-011', 180,  42.00, '2026-06-01', 'open'),
      ('PO-2026-022', 'SUP-001', 'ITM-012', 120,  78.50, '2026-06-02', 'open'),
      ('PO-2026-023', 'SUP-003', 'ITM-013', 600,  14.00, '2026-06-03', 'open'),
      ('PO-2026-024', 'SUP-002', 'ITM-014', 400,  29.90, '2026-06-04', 'open'),
      ('PO-2026-025', 'SUP-004', 'ITM-015', 200,  36.00, '2026-06-05', 'open'),
      ('PO-2026-026', 'SUP-001', 'ITM-016', 300,  55.00, '2026-06-06', 'open'),
      ('PO-2026-027', 'SUP-005', 'ITM-017', 250,  48.00, '2026-06-07', 'open'),
      ('PO-2026-028', 'SUP-003', 'ITM-018', 350,  33.50, '2026-06-08', 'open'),
      ('PO-2026-029', 'SUP-002', 'ITM-019', 500,  22.00, '2026-06-09', 'open'),
      ('PO-2026-030', 'SUP-004', 'ITM-020', 280,  19.75, '2026-06-10', 'open')
    ON CONFLICT (po_no) DO NOTHING
  `, 'new POs PO-2026-021 to PO-2026-030');

  // 012: po_line_items — multiple items per PO
  await safeQuery(`
    CREATE TABLE IF NOT EXISTS qc_inspection.po_line_items (
      line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      po_no TEXT NOT NULL REFERENCES qc_inspection.po_master(po_no) ON DELETE CASCADE,
      item_code TEXT NOT NULL REFERENCES qc_inspection.item_master(item_code),
      quantity NUMERIC NOT NULL DEFAULT 1,
      unit_price NUMERIC NOT NULL DEFAULT 0,
      line_no INT NOT NULL DEFAULT 1,
      UNIQUE(po_no, item_code)
    )
  `, 'po_line_items table');
  await safeQuery(`
    INSERT INTO qc_inspection.po_line_items(po_no, item_code, quantity, unit_price, line_no)
    SELECT po_no, item_code, COALESCE(quantity, 1), COALESCE(unit_price, 0), 1
    FROM qc_inspection.po_master
    WHERE item_code IS NOT NULL
    ON CONFLICT (po_no, item_code) DO NOTHING
  `, 'migrate po items to po_line_items');

  // 013: job_items — multiple items per inspection job
  await safeQuery(`
    CREATE TABLE IF NOT EXISTS qc_inspection.job_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES qc_inspection.inspection_job(job_id) ON DELETE CASCADE,
      item_code TEXT NOT NULL REFERENCES qc_inspection.item_master(item_code),
      checklist_template_id UUID REFERENCES qc_inspection.checklist_template(template_id),
      sort_order INT NOT NULL DEFAULT 0,
      UNIQUE(job_id, item_code)
    )
  `, 'job_items table');
  await safeQuery(`
    INSERT INTO qc_inspection.job_items(job_id, item_code, checklist_template_id, sort_order)
    SELECT job_id, item_code, checklist_template_id, 0
    FROM qc_inspection.inspection_job
    WHERE item_code IS NOT NULL
    ON CONFLICT (job_id, item_code) DO NOTHING
  `, 'migrate job items to job_items');

  // 014: 20 dummy multi-item POs for testing (2-3 items each, all with active checklists)
  await safeQuery(`
    INSERT INTO qc_inspection.po_master (po_no, supplier_code, item_code, quantity, unit_price, order_date, status) VALUES
      ('PO-2026-031','SUP-001','ITM-001', 3000, 18.50,'2026-06-15','open'),
      ('PO-2026-032','SUP-001','ITM-001', 2500, 18.50,'2026-06-15','open'),
      ('PO-2026-033','SUP-002','ITM-002', 1800, 32.00,'2026-06-16','open'),
      ('PO-2026-034','SUP-002','ITM-007', 1200, 45.00,'2026-06-16','open'),
      ('PO-2026-035','SUP-003','ITM-001', 4000, 16.00,'2026-06-17','open'),
      ('PO-2026-036','SUP-004','ITM-002', 1500, 35.00,'2026-06-17','open'),
      ('PO-2026-037','SUP-005','ITM-004',  800, 28.00,'2026-06-18','open'),
      ('PO-2026-038','SUP-001','ITM-011',  200, 42.00,'2026-06-18','open'),
      ('PO-2026-039','SUP-003','ITM-011',  150, 44.00,'2026-06-19','open'),
      ('PO-2026-040','SUP-005','ITM-017',  300, 48.00,'2026-06-19','open'),
      ('PO-2026-041','SUP-002','ITM-013',  600, 14.00,'2026-06-20','open'),
      ('PO-2026-042','SUP-004','ITM-015',  180, 36.00,'2026-06-20','open'),
      ('PO-2026-043','SUP-001','ITM-018',  250, 33.50,'2026-06-21','open'),
      ('PO-2026-044','SUP-003','ITM-011',  120, 44.00,'2026-06-21','open'),
      ('PO-2026-045','SUP-002','ITM-017',  220, 48.00,'2026-06-22','open'),
      ('PO-2026-046','SUP-005','ITM-015',  160, 36.00,'2026-06-22','open'),
      ('PO-2026-047','SUP-004','ITM-001', 2000, 18.50,'2026-06-23','open'),
      ('PO-2026-048','SUP-001','ITM-013',  400, 14.00,'2026-06-23','open'),
      ('PO-2026-049','SUP-003','ITM-007', 1400, 45.00,'2026-06-24','open'),
      ('PO-2026-050','SUP-002','ITM-011',  180, 42.00,'2026-06-24','open')
    ON CONFLICT (po_no) DO NOTHING
  `, 'dummy POs PO-2026-031 to PO-2026-050');

  await safeQuery(`
    INSERT INTO qc_inspection.po_line_items (po_no, item_code, quantity, unit_price, line_no) VALUES
      -- PO-031: Knits x2 (Cotton T-Shirt + Wool Sweater)
      ('PO-2026-031','ITM-001',3000,18.50,1),
      ('PO-2026-031','ITM-007',1500,45.00,2),
      -- PO-032: Knits + Wovens (Cotton T-Shirt + Denim Jeans)
      ('PO-2026-032','ITM-001',2500,18.50,1),
      ('PO-2026-032','ITM-002', 800,32.00,2),
      -- PO-033: Wovens + Knits (Denim Jeans + Wool Sweater)
      ('PO-2026-033','ITM-002',1800,32.00,1),
      ('PO-2026-033','ITM-007', 600,45.00,2),
      -- PO-034: Knits + Wovens (Wool Sweater + Denim Jeans)
      ('PO-2026-034','ITM-007',1200,45.00,1),
      ('PO-2026-034','ITM-002', 900,32.00,2),
      -- PO-035: Knits x2 + Wovens (3 items)
      ('PO-2026-035','ITM-001',4000,16.00,1),
      ('PO-2026-035','ITM-007',1000,45.00,2),
      ('PO-2026-035','ITM-002', 500,32.00,3),
      -- PO-036: Wovens + Belts (Denim Jeans + Leather Belt)
      ('PO-2026-036','ITM-002',1500,35.00,1),
      ('PO-2026-036','ITM-004', 400,28.00,2),
      -- PO-037: Belts + Knits (Leather Belt + Cotton T-Shirt)
      ('PO-2026-037','ITM-004', 800,28.00,1),
      ('PO-2026-037','ITM-001',1200,18.50,2),
      -- PO-038: Living Room x2 (Rattan Coffee Table + Woven Storage Ottoman)
      ('PO-2026-038','ITM-011', 200,42.00,1),
      ('PO-2026-038','ITM-018', 180,33.50,2),
      -- PO-039: Furniture mix (Rattan Coffee Table + Outdoor Garden Chair)
      ('PO-2026-039','ITM-011', 150,44.00,1),
      ('PO-2026-039','ITM-017', 200,48.00,2),
      -- PO-040: Furniture mix (Outdoor Garden Chair + Wooden Wall Shelf)
      ('PO-2026-040','ITM-017', 300,48.00,1),
      ('PO-2026-040','ITM-015', 120,36.00,2),
      -- PO-041: Household mix (Ceramic Vase Set + Bathroom Accessory Set)
      ('PO-2026-041','ITM-013', 600,14.00,1),
      ('PO-2026-041','ITM-020', 300,19.75,2),
      -- PO-042: Furniture mix (Wooden Wall Shelf + Rattan Coffee Table)
      ('PO-2026-042','ITM-015', 180,36.00,1),
      ('PO-2026-042','ITM-011', 100,42.00,2),
      -- PO-043: Furniture + Household (Woven Ottoman + Ceramic Vase Set)
      ('PO-2026-043','ITM-018', 250,33.50,1),
      ('PO-2026-043','ITM-013', 400,14.00,2),
      -- PO-044: Furniture + Household x2 (3 items)
      ('PO-2026-044','ITM-011', 120,44.00,1),
      ('PO-2026-044','ITM-013', 350,14.00,2),
      ('PO-2026-044','ITM-020', 200,19.75,3),
      -- PO-045: Furniture mix (Outdoor Chair + Woven Ottoman)
      ('PO-2026-045','ITM-017', 220,48.00,1),
      ('PO-2026-045','ITM-018', 160,33.50,2),
      -- PO-046: Furniture + Household (Wooden Wall Shelf + Bathroom Accessory Set)
      ('PO-2026-046','ITM-015', 160,36.00,1),
      ('PO-2026-046','ITM-020', 240,19.75,2),
      -- PO-047: Apparel set (Cotton T-Shirt + Denim Jeans + Leather Belt)
      ('PO-2026-047','ITM-001',2000,18.50,1),
      ('PO-2026-047','ITM-002', 600,35.00,2),
      ('PO-2026-047','ITM-004', 300,28.00,3),
      -- PO-048: Household mix (Ceramic Vase Set + Wooden Wall Shelf)
      ('PO-2026-048','ITM-013', 400,14.00,1),
      ('PO-2026-048','ITM-015', 140,36.00,2),
      -- PO-049: Knits + Wovens (Wool Sweater + Denim Jeans)
      ('PO-2026-049','ITM-007',1400,45.00,1),
      ('PO-2026-049','ITM-002', 700,32.00,2),
      -- PO-050: Furniture x3 (Rattan Coffee Table + Wooden Wall Shelf + Outdoor Garden Chair)
      ('PO-2026-050','ITM-011', 180,42.00,1),
      ('PO-2026-050','ITM-015', 100,36.00,2),
      ('PO-2026-050','ITM-017', 150,48.00,3)
    ON CONFLICT (po_no, item_code) DO NOTHING
  `, 'dummy PO line items for multi-item testing');

  // 015: remove all non-Furniture/Household items and their POs — keep only Furniture & Household Accessories
  const APPAREL_ITEMS = ['ITM-001','ITM-002','ITM-003','ITM-004','ITM-005','ITM-006','ITM-007','ITM-008','ITM-009','ITM-010'];
  const apparel_placeholders = APPAREL_ITEMS.map((_, i) => `$${i + 1}`).join(',');

  // Remove apparel line items from all POs
  await safeQuery(`
    DELETE FROM qc_inspection.po_line_items
    WHERE item_code IN (${APPAREL_ITEMS.map(c => `'${c}'`).join(',')})
  `, 'delete apparel po_line_items');

  // Delete POs that have no remaining line items AND no linked inspection jobs
  await safeQuery(`
    DELETE FROM qc_inspection.po_master p
    WHERE p.item_code IN (${APPAREL_ITEMS.map(c => `'${c}'`).join(',')})
      AND NOT EXISTS (SELECT 1 FROM qc_inspection.po_line_items pl WHERE pl.po_no = p.po_no)
      AND NOT EXISTS (SELECT 1 FROM qc_inspection.inspection_job ij WHERE ij.po_no = p.po_no)
  `, 'delete apparel-only po_master rows');

  // Delete apparel item_master rows not referenced by any inspection job
  await safeQuery(`
    DELETE FROM qc_inspection.item_master
    WHERE item_code IN (${APPAREL_ITEMS.map(c => `'${c}'`).join(',')})
      AND NOT EXISTS (SELECT 1 FROM qc_inspection.inspection_job ij WHERE ij.item_code = item_code)
      AND NOT EXISTS (SELECT 1 FROM qc_inspection.job_items ji WHERE ji.item_code = item_code)
  `, 'delete apparel item_master rows');

  // Also delete apparel checklist templates (Apparel and Accessories categories) not tied to any job
  await safeQuery(`
    DELETE FROM qc_inspection.checklist_template
    WHERE category IN ('Apparel','Accessories','Bags','Footwear')
      AND NOT EXISTS (
        SELECT 1 FROM qc_inspection.inspection_job ij WHERE ij.checklist_template_id = template_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM qc_inspection.job_items ji WHERE ji.checklist_template_id = template_id
      )
  `, 'delete apparel checklist templates');

  // 016: Document Control — item_documents table
  await safeQuery(`
    CREATE TABLE IF NOT EXISTS qc_inspection.item_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_code TEXT NOT NULL REFERENCES qc_inspection.item_master(item_code) ON DELETE CASCADE,
      supplier_code TEXT NOT NULL REFERENCES qc_inspection.supplier_master(supplier_code),
      doc_type TEXT NOT NULL CHECK (doc_type IN ('product_image','bill_of_materials','msds','swatch_details','test_reports','cb_reports','line_drawings','assembly_instruction_manual','user_care_manual','barcode','carton_artwork_shipping_mark','hs_code','metrological_data')),
      file_name TEXT,
      file_data BYTEA,
      file_type TEXT,
      file_size INT,
      uploaded_by UUID REFERENCES qc_inspection.team_stakeholder(user_id),
      uploaded_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending_upload' CHECK (status IN ('pending_upload','pending_approval','qa_approved','approved','rejected')),
      qa_reviewed_by UUID REFERENCES qc_inspection.team_stakeholder(user_id),
      qa_reviewed_at TIMESTAMPTZ,
      qa_remarks TEXT,
      buying_reviewed_by UUID REFERENCES qc_inspection.team_stakeholder(user_id),
      buying_reviewed_at TIMESTAMPTZ,
      buying_remarks TEXT,
      version INT NOT NULL DEFAULT 1,
      UNIQUE(item_code, supplier_code, doc_type)
    )
  `, 'item_documents table');

  // 017: Add not_applicable to item_documents status check
  await safeQuery(`
    ALTER TABLE qc_inspection.item_documents DROP CONSTRAINT IF EXISTS item_documents_status_check
  `, 'drop old status check');
  await safeQuery(`
    ALTER TABLE qc_inspection.item_documents ADD CONSTRAINT item_documents_status_check
      CHECK (status IN ('pending_upload','pending_approval','qa_approved','approved','rejected','not_applicable'))
  `, 'add not_applicable status');

  // 018: Supplier Scorecard config table
  await safeQuery(`
    CREATE TABLE IF NOT EXISTS qc_inspection.scorecard_config (
      id                          SMALLINT PRIMARY KEY DEFAULT 1,
      weight_complaints           NUMERIC(5,2) NOT NULL DEFAULT 50,
      weight_claims               NUMERIC(5,2) NOT NULL DEFAULT 40,
      weight_failures             NUMERIC(5,2) NOT NULL DEFAULT 10,
      grade_excellent             NUMERIC(5,2) NOT NULL DEFAULT 85,
      grade_good                  NUMERIC(5,2) NOT NULL DEFAULT 70,
      grade_average               NUMERIC(5,2) NOT NULL DEFAULT 50,
      severity_critical           NUMERIC(4,2) NOT NULL DEFAULT 4,
      severity_high               NUMERIC(4,2) NOT NULL DEFAULT 2,
      severity_medium             NUMERIC(4,2) NOT NULL DEFAULT 1,
      severity_low                NUMERIC(4,2) NOT NULL DEFAULT 0.5,
      resolved_penalty_factor     NUMERIC(4,2) NOT NULL DEFAULT 0.5,
      claims_full_deduction_pct   NUMERIC(5,2) NOT NULL DEFAULT 10,
      time_decay_months           SMALLINT NOT NULL DEFAULT 12,
      time_decay_factor           NUMERIC(4,2) NOT NULL DEFAULT 0.5,
      min_inspections             SMALLINT NOT NULL DEFAULT 3,
      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by                  UUID REFERENCES qc_inspection.team_stakeholder(user_id)
    )
  `, 'scorecard_config table');

  await safeQuery(`
    INSERT INTO qc_inspection.scorecard_config (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `, 'scorecard_config seed row');

  // 019: status_updated_at on inspection_job — tracks when status last changed
  await safeQuery(
    `ALTER TABLE qc_inspection.inspection_job ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ`,
    'status_updated_at col'
  );
  // Backfill: use submitted_at for submitted jobs, updated_at otherwise
  await safeQuery(`
    UPDATE qc_inspection.inspection_job
    SET status_updated_at = COALESCE(submitted_at, updated_at, created_at)
    WHERE status_updated_at IS NULL
  `, 'backfill status_updated_at');

  // 020: overdue reminder config + log tables
  await safeQuery(`
    CREATE TABLE IF NOT EXISTS qc_inspection.overdue_reminder_config (
      id              INT PRIMARY KEY DEFAULT 1,
      enabled         BOOLEAN NOT NULL DEFAULT false,
      min_days_overdue INT NOT NULL DEFAULT 1,
      frequency_days  INT NOT NULL DEFAULT 1,
      send_time       TIME NOT NULL DEFAULT '08:00:00',
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT single_row CHECK (id = 1)
    )
  `, 'overdue_reminder_config table');

  await safeQuery(`
    INSERT INTO qc_inspection.overdue_reminder_config (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `, 'overdue_reminder_config seed row');

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS qc_inspection.overdue_reminder_log (
      log_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id     UUID NOT NULL,
      sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, 'overdue_reminder_log table');

  console.log('✅ Migrations applied');
}

async function startServer() {
  try {
    // Test DB connection
    await db.query('SELECT 1');
    console.log('✅ Database connection established');

    await runMigrations();

    app.listen(PORT, () => {
      console.log(`🚀 QC Inspection API server running on http://localhost:${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health check: http://localhost:${PORT}/api/health`);
    });

    startScheduler();
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();
