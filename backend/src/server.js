require('dotenv').config();
const app = require('./app');
const db = require('./db');
const bcrypt = require('bcryptjs');

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
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();
