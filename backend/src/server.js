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
      WHEN 'PO-2026-001' THEN 18.50 WHEN 'PO-2026-002' THEN 32.00
      WHEN 'PO-2026-003' THEN 12.75 WHEN 'PO-2026-004' THEN 45.00
      WHEN 'PO-2026-005' THEN 27.50 WHEN 'PO-2026-006' THEN 88.00
      WHEN 'PO-2026-007' THEN 55.00 WHEN 'PO-2026-008' THEN 21.00
      WHEN 'PO-2026-009' THEN 39.50 WHEN 'PO-2026-010' THEN 16.00
      WHEN 'PO-2026-011' THEN 18.50 WHEN 'PO-2026-012' THEN 32.00
      ELSE ROUND((RANDOM() * 90 + 10)::NUMERIC, 2)
    END WHERE unit_price = 0`, 'unit_price seed');

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

  // Migrate old 'approved' rows to 'paid'
  await safeQuery(`UPDATE qc_inspection.inspection_charges_advice SET status = 'paid' WHERE status = 'approved'`, 'migrate approved→paid');

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
