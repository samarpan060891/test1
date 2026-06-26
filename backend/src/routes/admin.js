const express = require('express');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(authorize('admin'));

// ── USER MANAGEMENT ──────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT user_id, name, email, role, agency_code, supplier_code, created_at
       FROM qc_inspection.team_stakeholder ORDER BY role, name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', async (req, res) => {
  const { name, email, password, role, agency_code, supplier_code } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: 'name, email, password and role are required' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO qc_inspection.team_stakeholder (name, email, password_hash, role, agency_code, supplier_code)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id, name, email, role, agency_code, supplier_code`,
      [name, email.toLowerCase().trim(), hash, role, agency_code || null, supplier_code || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', async (req, res) => {
  const { name, email, role, agency_code, supplier_code } = req.body;
  try {
    const result = await db.query(
      `UPDATE qc_inspection.team_stakeholder
       SET name = COALESCE($1, name), email = COALESCE($2, email),
           role = COALESCE($3, role), agency_code = $4, supplier_code = $5
       WHERE user_id = $6 RETURNING user_id, name, email, role, agency_code, supplier_code`,
      [name, email, role, agency_code || null, supplier_code || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM qc_inspection.team_stakeholder WHERE user_id = $1 RETURNING user_id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/reset-password', async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hash = await bcrypt.hash(new_password, 10);
    const result = await db.query(
      'UPDATE qc_inspection.team_stakeholder SET password_hash = $1 WHERE user_id = $2 RETURNING user_id',
      [hash, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MASTER DATA ───────────────────────────────────────────────────────────────

// Generic bulk insert helper — skips duplicates, does not overwrite
async function bulkUpsert(table, rows, conflictCol) {
  const results = { inserted: 0, skipped: 0, errors: [] };
  for (const row of rows) {
    try {
      const keys = Object.keys(row);
      const vals = Object.values(row);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const r = await db.query(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})
         ON CONFLICT (${conflictCol}) DO NOTHING`,
        vals
      );
      if (r.rowCount > 0) results.inserted++;
      else results.skipped++;
    } catch (err) {
      results.errors.push({ row, error: err.message });
    }
  }
  return results;
}

// Parse uploaded Excel/CSV buffer
function parseUpload(buffer, ext) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// ── SUPPLIERS ────────────────────────────────────────────────────────────────

router.get('/masters/suppliers', async (req, res) => {
  const r = await db.query('SELECT * FROM qc_inspection.supplier_master ORDER BY supplier_code');
  res.json(r.rows);
});

router.post('/masters/suppliers/single', async (req, res) => {
  const { supplier_code, name, contact_email, contact_name, country } = req.body;
  if (!supplier_code || !name) return res.status(400).json({ error: 'supplier_code and name are required' });
  try {
    const r = await db.query(
      `INSERT INTO qc_inspection.supplier_master (supplier_code, name, contact_email, contact_name, country)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (supplier_code) DO UPDATE
       SET name=$2, contact_email=$3, contact_name=$4, country=$5 RETURNING *`,
      [supplier_code, name, contact_email || '', contact_name || null, country || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/masters/suppliers/bulk', async (req, res) => {
  try {
    const rows = (req.body.rows || []).map(r => ({
      supplier_code: r.supplier_code || r['Supplier Code'],
      name: r.name || r['Name'],
      contact_email: r.contact_email || r['Contact Email'] || null,
      contact_name: r.contact_name || r['Contact Name'] || null,
      country: r.country || r['Country'] || null,
    })).filter(r => r.supplier_code && r.name);
    const result = await bulkUpsert('qc_inspection.supplier_master', rows, 'supplier_code');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AGENCIES ─────────────────────────────────────────────────────────────────

router.get('/masters/agencies', async (req, res) => {
  const r = await db.query('SELECT * FROM qc_inspection.quality_agency_master ORDER BY agency_code');
  res.json(r.rows);
});

router.post('/masters/agencies/single', async (req, res) => {
  const { agency_code, name, contact_name, contact_emails, country } = req.body;
  if (!agency_code || !name) return res.status(400).json({ error: 'agency_code and name are required' });
  const emailsArray = contact_emails
    ? contact_emails.split(',').map(e => e.trim()).filter(Boolean)
    : null;
  try {
    const r = await db.query(
      `INSERT INTO qc_inspection.quality_agency_master (agency_code, name, contact_name, contact_emails, country)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (agency_code) DO UPDATE
       SET name=$2, contact_name=$3, contact_emails=$4, country=$5 RETURNING *`,
      [agency_code, name, contact_name || null, emailsArray, country || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/masters/agencies/bulk', async (req, res) => {
  try {
    const rows = (req.body.rows || []).map(r => ({
      agency_code: r.agency_code || r['Agency Code'] || r['agency_code'],
      name: r.name || r['Name'] || r['Agency Name'],
      contact_name: r.contact_name || r['Contact Name'] || null,
      contact_emails: (() => { const v = r.contact_emails || r['Contact Email(s)'] || r['Contact Emails'] || null; return v ? v.split(',').map(e => e.trim()).filter(Boolean) : null })(),
      country: r.country || r['Country'] || null,
    })).filter(r => r.agency_code && r.name);
    const result = await bulkUpsert('qc_inspection.quality_agency_master', rows, 'agency_code');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ITEMS ─────────────────────────────────────────────────────────────────────

router.get('/masters/items', async (req, res) => {
  const r = await db.query('SELECT * FROM qc_inspection.item_master ORDER BY item_code');
  res.json(r.rows);
});

router.post('/masters/items/single', async (req, res) => {
  const { item_code, name, category, sub_category, description } = req.body;
  if (!item_code || !name) return res.status(400).json({ error: 'item_code and name are required' });
  try {
    const r = await db.query(
      `INSERT INTO qc_inspection.item_master (item_code, name, category, sub_category, description)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (item_code) DO UPDATE
       SET name=$2, category=$3, sub_category=$4, description=$5 RETURNING *`,
      [item_code, name, category || null, sub_category || null, description || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/masters/items/bulk', async (req, res) => {
  try {
    const rows = (req.body.rows || []).map(r => ({
      item_code: r.item_code || r['Item Code'],
      name: r.name || r['Name'],
      category: r.category || r['Category'] || null,
      sub_category: r.sub_category || r['Sub Category'] || null,
      description: r.description || r['Description'] || null,
    })).filter(r => r.item_code && r.name);
    const result = await bulkUpsert('qc_inspection.item_master', rows, 'item_code');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── BUYERS LIST (public to authenticated users) ───────────────────────────────

router.get('/buyers', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT user_id, name, email FROM qc_inspection.team_stakeholder WHERE role = 'buying' ORDER BY name`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PO MASTER ─────────────────────────────────────────────────────────────────

router.get('/masters/po', async (req, res) => {
  const r = await db.query(`
    SELECT p.*, b.name AS buyer_name, b.email AS buyer_email
    FROM qc_inspection.po_master p
    LEFT JOIN qc_inspection.team_stakeholder b ON b.user_id = p.buyer_id
    ORDER BY p.po_no
  `);
  res.json(r.rows);
});

router.post('/masters/po/single', async (req, res) => {
  const { po_no, supplier_code, item_code, quantity, unit_price, order_date, status, buyer_id } = req.body;
  if (!po_no || !supplier_code || !item_code) return res.status(400).json({ error: 'po_no, supplier_code and item_code are required' });
  try {
    const r = await db.query(
      `INSERT INTO qc_inspection.po_master (po_no, supplier_code, item_code, quantity, unit_price, order_date, status, buyer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (po_no) DO UPDATE
       SET supplier_code=$2, item_code=$3, quantity=$4, unit_price=$5, order_date=$6, status=$7, buyer_id=$8 RETURNING *`,
      [po_no, supplier_code, item_code, quantity || null, unit_price || 0, order_date || null, status || 'open', buyer_id || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/masters/po/bulk', async (req, res) => {
  try {
    const rows = (req.body.rows || []).map(r => ({
      po_no: r.po_no || r['PO No'],
      supplier_code: r.supplier_code || r['Supplier Code'],
      item_code: r.item_code || r['Item Code'],
      quantity: parseInt(r.quantity || r['Quantity']) || null,
      unit_price: parseFloat(r.unit_price || r['Unit Price']) || 0,
      order_date: r.order_date || r['Order Date'] || null,
      status: r.status || r['Status'] || 'open',
      buyer_id: r.buyer_id || r['Buyer ID'] || null,
    })).filter(r => r.po_no && r.supplier_code && r.item_code);
    const result = await bulkUpsert('qc_inspection.po_master', rows, 'po_no');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
