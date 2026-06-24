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

  // 010: per-user notification dismissal
  await safeQuery(`
    CREATE TABLE IF NOT EXISTS qc_inspection.notification_dismissal (
      user_id      UUID NOT NULL REFERENCES qc_inspection.team_stakeholder(user_id) ON DELETE CASCADE,
      event_id     UUID NOT NULL REFERENCES qc_inspection.notification_event(event_id) ON DELETE CASCADE,
      dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, event_id)
    )`, 'notification_dismissal table');
  await safeQuery(
    `CREATE INDEX IF NOT EXISTS idx_notif_dismissal_user ON qc_inspection.notification_dismissal(user_id)`,
    'notification_dismissal index'
  );

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
