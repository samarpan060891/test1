require('dotenv').config();
const app = require('./app');
const db = require('./db');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 4000;

async function runMigrations() {
  // 008: unit_price on po_master
  await db.query(`
    ALTER TABLE qc_inspection.po_master
      ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00
  `);
  await db.query(`
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
    END WHERE unit_price = 0
  `);

  // 009: imports and accounts roles + extended payment status workflow
  await db.query(`
    ALTER TABLE qc_inspection.team_stakeholder
      DROP CONSTRAINT IF EXISTS team_stakeholder_role_check
  `);
  await db.query(`
    ALTER TABLE qc_inspection.team_stakeholder
      ADD CONSTRAINT team_stakeholder_role_check
      CHECK (role IN ('qa','buying','agency_user','supplier_user','admin','imports','accounts'))
  `);
  await db.query(`
    ALTER TABLE qc_inspection.inspection_charges_advice
      DROP CONSTRAINT IF EXISTS inspection_charges_advice_status_check
  `);
  await db.query(`
    ALTER TABLE qc_inspection.inspection_charges_advice
      ADD CONSTRAINT inspection_charges_advice_status_check
      CHECK (status IN ('pending_qa','pending_buying','pending_imports','pending_accounts','paid','rejected'))
  `);
  await db.query(`
    ALTER TABLE qc_inspection.inspection_charges_advice
      ADD COLUMN IF NOT EXISTS imports_user_id     UUID REFERENCES qc_inspection.team_stakeholder(user_id),
      ADD COLUMN IF NOT EXISTS imports_approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS imports_notes       TEXT,
      ADD COLUMN IF NOT EXISTS accounts_user_id    UUID REFERENCES qc_inspection.team_stakeholder(user_id),
      ADD COLUMN IF NOT EXISTS accounts_approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS accounts_notes      TEXT
  `);
  // Migrate old 'approved' rows to 'paid' (buying was the final step before)
  await db.query(`
    UPDATE qc_inspection.inspection_charges_advice SET status = 'paid' WHERE status = 'approved'
  `);


  await db.query(`
    ALTER TABLE qc_inspection.inspection_job
      ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IN ('pass','fail','na'))
  `);

  // Ensure admin account exists with known password (Password@123)
  const adminHash = await bcrypt.hash('Password@123', 10);
  await db.query(
    `INSERT INTO qc_inspection.team_stakeholder (name, email, password_hash, role)
     VALUES ('Admin', 'admin@homesrus.com', $1, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1`,
    [adminHash]
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
