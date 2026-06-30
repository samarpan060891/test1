const express = require('express');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { sendEmail, emailDocUploadRequired } = require('../services/email');

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
    SELECT p.*, b.name AS buyer_name, b.email AS buyer_email,
      COALESCE((
        SELECT json_agg(json_build_object(
          'item_code', pl.item_code,
          'item_name', im.name,
          'quantity', pl.quantity,
          'unit_price', pl.unit_price,
          'line_no', pl.line_no
        ) ORDER BY pl.line_no, pl.item_code)
        FROM qc_inspection.po_line_items pl
        JOIN qc_inspection.item_master im ON im.item_code = pl.item_code
        WHERE pl.po_no = p.po_no
      ), '[]'::json) AS line_items
    FROM qc_inspection.po_master p
    LEFT JOIN qc_inspection.team_stakeholder b ON b.user_id = p.buyer_id
    ORDER BY p.po_no
  `);
  res.json(r.rows);
});

router.post('/masters/po/single', async (req, res) => {
  const { po_no, supplier_code, item_code, quantity, unit_price, order_date, status, buyer_id, line_items } = req.body;
  if (!po_no || !supplier_code) return res.status(400).json({ error: 'po_no and supplier_code are required' });
  try {
    // Upsert PO header (keep item_code/quantity/unit_price from first line item for backward compat)
    const items = Array.isArray(line_items) && line_items.length > 0 ? line_items : (item_code ? [{ item_code, quantity, unit_price, line_no: 1 }] : []);
    const primary = items[0] || {};
    const r = await db.query(
      `INSERT INTO qc_inspection.po_master (po_no, supplier_code, item_code, quantity, unit_price, order_date, status, buyer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (po_no) DO UPDATE
       SET supplier_code=$2, item_code=COALESCE($3, qc_inspection.po_master.item_code),
           quantity=COALESCE($4, qc_inspection.po_master.quantity),
           unit_price=COALESCE($5, qc_inspection.po_master.unit_price),
           order_date=$6, status=$7, buyer_id=$8 RETURNING *`,
      [po_no, supplier_code, primary.item_code || null, primary.quantity || null, primary.unit_price || 0, order_date || null, status || 'open', buyer_id || null]
    );
    // Upsert line items
    for (let i = 0; i < items.length; i++) {
      const li = items[i];
      if (!li.item_code) continue;
      await db.query(
        `INSERT INTO qc_inspection.po_line_items (po_no, item_code, quantity, unit_price, line_no)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (po_no, item_code) DO UPDATE SET quantity=$3, unit_price=$4, line_no=$5`,
        [po_no, li.item_code, li.quantity || 1, li.unit_price || 0, li.line_no || (i + 1)]
      );
    }
    const createdPO = r.rows[0];

    // Fire background email to supplier listing all required document types
    (async () => {
      try {
        const supplierR = await db.query(
          'SELECT name, contact_email FROM qc_inspection.supplier_master WHERE supplier_code=$1',
          [supplier_code]
        );
        const supplierInfo = supplierR.rows[0];
        if (supplierInfo && supplierInfo.contact_email) {
          const itemCodes = items.map(i => i.item_code).filter(Boolean);
          let itemNames = itemCodes;
          if (itemCodes.length > 0) {
            const itemR = await db.query(
              `SELECT name FROM qc_inspection.item_master WHERE item_code = ANY($1)`,
              [itemCodes]
            );
            itemNames = itemR.rows.map(r => r.name);
          }
          const ALL_DOC_TYPES = [
            'product_image','bill_of_materials','msds','swatch_details','test_reports',
            'cb_reports','line_drawings','assembly_instruction_manual','user_care_manual',
            'barcode','carton_artwork_shipping_mark','hs_code','metrological_data',
          ];
          const { subject, html } = emailDocUploadRequired({
            supplierName: supplierInfo.name || supplier_code,
            poNo: po_no,
            itemNames: itemNames.length ? itemNames : itemCodes,
            docTypes: ALL_DOC_TYPES,
          });
          await sendEmail({ to: supplierInfo.contact_email, subject, html });
        }
      } catch (e) {
        console.error('PO creation doc email error:', e.message);
      }
    })();

    res.status(201).json({ ...createdPO, line_items: items });
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
    // Also sync po_line_items for each bulk row
    for (const row of rows) {
      try {
        await db.query(
          `INSERT INTO qc_inspection.po_line_items (po_no, item_code, quantity, unit_price, line_no)
           VALUES ($1,$2,$3,$4,1) ON CONFLICT (po_no, item_code) DO UPDATE SET quantity=$3, unit_price=$4`,
          [row.po_no, row.item_code, row.quantity || 1, row.unit_price || 0]
        );
      } catch (_) {}
    }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REMINDER SCHEDULES (multi-schedule) ──────────────────────────────────────

const ALLOWED_RECIPIENT_ROLES = ['qa', 'buying', 'imports', 'accounts', 'agency_user', 'supplier_user'];

// GET all schedules
router.get('/reminder-schedules', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*,
        (SELECT MAX(l.sent_at) FROM qc_inspection.overdue_reminder_log l WHERE l.schedule_id = s.schedule_id) AS last_sent_at
      FROM qc_inspection.reminder_schedules s
      ORDER BY s.created_at ASC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create schedule
router.post('/reminder-schedules', async (req, res) => {
  const { name, enabled, min_days_overdue, frequency_days, send_time, recipient_roles, timezone } = req.body;
  if ((frequency_days || 1) < 1 || (min_days_overdue || 1) < 1)
    return res.status(400).json({ error: 'Days values must be at least 1' });
  if (!/^\d{2}:\d{2}$/.test(send_time || ''))
    return res.status(400).json({ error: 'send_time must be HH:MM format' });
  const roles = Array.isArray(recipient_roles) ? recipient_roles.filter(r => ALLOWED_RECIPIENT_ROLES.includes(r)) : [];
  try {
    const { rows } = await db.query(`
      INSERT INTO qc_inspection.reminder_schedules
        (name, enabled, min_days_overdue, frequency_days, send_time, recipient_roles, timezone)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [name || 'Reminder', !!enabled, min_days_overdue || 1, frequency_days || 1, send_time, roles, timezone || 'UTC']);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update schedule
router.put('/reminder-schedules/:id', async (req, res) => {
  const { name, enabled, min_days_overdue, frequency_days, send_time, recipient_roles, timezone } = req.body;
  if ((frequency_days || 1) < 1 || (min_days_overdue || 1) < 1)
    return res.status(400).json({ error: 'Days values must be at least 1' });
  if (!/^\d{2}:\d{2}$/.test(send_time || ''))
    return res.status(400).json({ error: 'send_time must be HH:MM format' });
  const roles = Array.isArray(recipient_roles) ? recipient_roles.filter(r => ALLOWED_RECIPIENT_ROLES.includes(r)) : [];
  try {
    const { rows } = await db.query(`
      UPDATE qc_inspection.reminder_schedules
      SET name=$1, enabled=$2, min_days_overdue=$3, frequency_days=$4,
          send_time=$5, recipient_roles=$6, timezone=$7, updated_at=NOW()
      WHERE schedule_id=$8
      RETURNING *
    `, [name || 'Reminder', !!enabled, min_days_overdue || 1, frequency_days || 1, send_time, roles, timezone || 'UTC', req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Schedule not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH toggle enabled
router.patch('/reminder-schedules/:id/toggle', async (req, res) => {
  try {
    const { rows } = await db.query(`
      UPDATE qc_inspection.reminder_schedules
      SET enabled = NOT enabled, updated_at = NOW()
      WHERE schedule_id = $1 RETURNING *
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Schedule not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE schedule
router.delete('/reminder-schedules/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM qc_inspection.reminder_schedules WHERE schedule_id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET log for a schedule
router.get('/reminder-schedules/:id/log', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT l.log_id, l.job_id, l.sent_at,
             j.job_ref, j.inspection_date, j.po_no,
             s.name AS supplier_name
      FROM qc_inspection.overdue_reminder_log l
      JOIN qc_inspection.inspection_job j ON j.job_id = l.job_id
      JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
      WHERE l.schedule_id = $1
      ORDER BY l.sent_at DESC LIMIT 20
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LEGACY single-config endpoints (kept for backward compat) ─────────────────

router.get('/reminder-config', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM qc_inspection.overdue_reminder_config WHERE id = 1');
    res.json(rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/reminder-config', async (req, res) => {
  const { enabled, min_days_overdue, frequency_days, send_time, recipient_roles, timezone } = req.body;
  const roles = Array.isArray(recipient_roles) ? recipient_roles.filter(r => ALLOWED_RECIPIENT_ROLES.includes(r)) : [];
  try {
    const { rows } = await db.query(`
      UPDATE qc_inspection.overdue_reminder_config
      SET enabled=$1, min_days_overdue=$2, frequency_days=$3, send_time=$4,
          recipient_roles=$5, timezone=$6, updated_at=NOW()
      WHERE id=1 RETURNING *
    `, [!!enabled, min_days_overdue||1, frequency_days||1, send_time||'08:00', roles, timezone||'UTC']);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reminder-log', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT l.log_id, l.job_id, l.sent_at,
             j.job_ref, j.inspection_date, j.po_no,
             s.name AS supplier_name
      FROM qc_inspection.overdue_reminder_log l
      JOIN qc_inspection.inspection_job j ON j.job_id = l.job_id
      JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
      ORDER BY l.sent_at DESC LIMIT 200
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
