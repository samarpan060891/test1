const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendEmail } = require('../services/email');
const {
  emailDocUploadRequired,
  emailDocUploaded,
  emailDocReviewed,
} = require('../services/email');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = express.Router();
router.use(authenticate);

const ALL_DOC_TYPES = [
  'product_image', 'bill_of_materials', 'msds', 'swatch_details', 'test_reports',
  'cb_reports', 'line_drawings', 'assembly_instruction_manual', 'user_care_manual',
  'barcode', 'carton_artwork_shipping_mark', 'hs_code', 'metrological_data',
];

// ── GET / — list document sets visible to current user ──────────────────────
router.get('/', async (req, res) => {
  const { role, supplier_code, agency_code, user_id } = req.user;
  try {
    let rows;
    if (role === 'supplier_user') {
      const r = await db.query(
        `SELECT d.id, d.item_code, im.name AS item_name, d.supplier_code, sm.name AS supplier_name,
                d.doc_type, d.status, d.file_name, d.uploaded_at
         FROM qc_inspection.item_documents d
         JOIN qc_inspection.item_master im ON im.item_code = d.item_code
         JOIN qc_inspection.supplier_master sm ON sm.supplier_code = d.supplier_code
         WHERE d.supplier_code = $1
         ORDER BY im.name, d.doc_type`,
        [supplier_code]
      );
      rows = r.rows;
    } else if (role === 'agency_user') {
      // Agency sees only approved docs for items they have a job for
      const r = await db.query(
        `SELECT DISTINCT d.id, d.item_code, im.name AS item_name, d.supplier_code, sm.name AS supplier_name,
                d.doc_type, d.status, d.file_name, d.uploaded_at
         FROM qc_inspection.item_documents d
         JOIN qc_inspection.item_master im ON im.item_code = d.item_code
         JOIN qc_inspection.supplier_master sm ON sm.supplier_code = d.supplier_code
         WHERE d.status = 'approved'
           AND EXISTS (
             SELECT 1 FROM qc_inspection.inspection_job ij
             JOIN qc_inspection.po_master p ON p.po_no = ij.po_no
             WHERE p.item_code = d.item_code
               AND p.supplier_code = d.supplier_code
               AND ij.agency_code = $1
           )
         ORDER BY im.name, d.doc_type`,
        [agency_code]
      );
      rows = r.rows;
    } else if (role === 'buying') {
      const r = await db.query(
        `SELECT d.id, d.item_code, im.name AS item_name, d.supplier_code, sm.name AS supplier_name,
                d.doc_type, d.status, d.file_name, d.uploaded_at
         FROM qc_inspection.item_documents d
         JOIN qc_inspection.item_master im ON im.item_code = d.item_code
         JOIN qc_inspection.supplier_master sm ON sm.supplier_code = d.supplier_code
         WHERE d.item_code IN (
           SELECT DISTINCT item_code FROM qc_inspection.po_master WHERE buyer_id = $1
         )
         ORDER BY im.name, d.doc_type`,
        [user_id]
      );
      rows = r.rows;
    } else {
      // qa, admin, imports, accounts — all
      const r = await db.query(
        `SELECT d.id, d.item_code, im.name AS item_name, d.supplier_code, sm.name AS supplier_name,
                d.doc_type, d.status, d.file_name, d.uploaded_at
         FROM qc_inspection.item_documents d
         JOIN qc_inspection.item_master im ON im.item_code = d.item_code
         JOIN qc_inspection.supplier_master sm ON sm.supplier_code = d.supplier_code
         ORDER BY im.name, d.doc_type`
      );
      rows = r.rows;
    }

    // Group by item_code + supplier_code, ensuring all 13 doc types are represented
    const grouped = {};
    for (const row of rows) {
      const key = `${row.item_code}::${row.supplier_code}`;
      if (!grouped[key]) {
        grouped[key] = {
          item_code: row.item_code,
          item_name: row.item_name,
          supplier_code: row.supplier_code,
          supplier_name: row.supplier_name,
          docs: {},
        };
        // Pre-fill with pending_upload stubs for all doc types
        for (const dt of ALL_DOC_TYPES) {
          grouped[key].docs[dt] = { doc_type: dt, status: 'pending_upload', file_name: null, uploaded_at: null, id: null };
        }
      }
      grouped[key].docs[row.doc_type] = {
        doc_type: row.doc_type,
        status: row.status,
        file_name: row.file_name,
        uploaded_at: row.uploaded_at,
        id: row.id,
      };
    }

    const result = Object.values(grouped).map(g => ({
      ...g,
      docs: ALL_DOC_TYPES.map(dt => g.docs[dt]),
    }));

    res.json(result);
  } catch (err) {
    console.error('GET /documents error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /summary ─────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  const { role, supplier_code, user_id } = req.user;
  try {
    let where = '';
    let params = [];

    if (role === 'supplier_user') {
      where = 'WHERE d.supplier_code = $1';
      params = [supplier_code];
    } else if (role === 'buying') {
      where = `WHERE d.item_code IN (SELECT DISTINCT item_code FROM qc_inspection.po_master WHERE buyer_id = $1)`;
      params = [user_id];
    }

    const r = await db.query(
      `SELECT
         COUNT(DISTINCT (d.item_code, d.supplier_code)) AS total_items,
         COUNT(*) FILTER (WHERE d.status IN ('pending_approval','qa_approved')) AS docs_pending,
         COUNT(*) FILTER (WHERE d.status = 'approved') AS docs_approved
       FROM qc_inspection.item_documents d ${where}`,
      params
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /upload ─────────────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  const { role, supplier_code: userSupplierCode, user_id } = req.user;
  const { item_code, supplier_code, doc_type } = req.body;

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!item_code || !supplier_code || !doc_type)
    return res.status(400).json({ error: 'item_code, supplier_code, and doc_type are required' });

  if (!ALL_DOC_TYPES.includes(doc_type))
    return res.status(400).json({ error: 'Invalid doc_type' });

  // Access check
  if (role === 'supplier_user' && supplier_code !== userSupplierCode)
    return res.status(403).json({ error: 'Cannot upload for another supplier' });

  if (!['supplier_user', 'admin', 'qa', 'imports', 'accounts'].includes(role))
    return res.status(403).json({ error: 'Not authorized to upload documents' });

  try {
    const r = await db.query(
      `INSERT INTO qc_inspection.item_documents
         (item_code, supplier_code, doc_type, file_name, file_data, file_type, file_size, uploaded_by, uploaded_at, status, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),'pending_approval',1)
       ON CONFLICT (item_code, supplier_code, doc_type) DO UPDATE
         SET file_name=$4, file_data=$5, file_type=$6, file_size=$7,
             uploaded_by=$8, uploaded_at=NOW(), status='pending_approval',
             version = qc_inspection.item_documents.version + 1,
             qa_reviewed_by=NULL, qa_reviewed_at=NULL, qa_remarks=NULL,
             buying_reviewed_by=NULL, buying_reviewed_at=NULL, buying_remarks=NULL
       RETURNING *`,
      [item_code, supplier_code, doc_type,
       req.file.originalname, req.file.buffer, req.file.mimetype, req.file.size,
       user_id]
    );

    // Fire email in background
    (async () => {
      try {
        // Get item + supplier info
        const [itemR, supplierR, qaR, buyerR] = await Promise.all([
          db.query('SELECT name FROM qc_inspection.item_master WHERE item_code=$1', [item_code]),
          db.query('SELECT name FROM qc_inspection.supplier_master WHERE supplier_code=$1', [supplier_code]),
          db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role='qa' AND email IS NOT NULL"),
          db.query(
            `SELECT DISTINCT ts.email FROM qc_inspection.po_master p
             JOIN qc_inspection.team_stakeholder ts ON ts.user_id = p.buyer_id
             WHERE p.supplier_code=$1 AND p.item_code=$2 AND ts.email IS NOT NULL`,
            [supplier_code, item_code]
          ),
        ]);

        const itemName = itemR.rows[0]?.name || item_code;
        const supplierName = supplierR.rows[0]?.name || supplier_code;
        const uploaderName = req.user.name || req.user.email;
        const qaEmails = qaR.rows.map(r => r.email);
        const buyerEmails = buyerR.rows.map(r => r.email);
        const toEmails = [...new Set([...qaEmails, ...buyerEmails])].filter(Boolean);

        if (toEmails.length > 0) {
          const { subject, html } = emailDocUploaded({ supplierName, itemName, docType: doc_type, uploadedBy: uploaderName });
          await sendEmail({ to: toEmails, subject, html });
        }
      } catch (e) {
        console.error('Upload email error:', e.message);
      }
    })();

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('POST /documents/upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /:id/review ──────────────────────────────────────────────────────────
router.put('/:id/review', async (req, res) => {
  const { role, user_id } = req.user;
  const { action, remarks } = req.body;
  const { id } = req.params;

  if (!['approve', 'reject'].includes(action))
    return res.status(400).json({ error: 'action must be approve or reject' });

  const canQaReview = ['qa', 'admin', 'imports', 'accounts'].includes(role);
  const canBuyingReview = role === 'buying';

  if (!canQaReview && !canBuyingReview)
    return res.status(403).json({ error: 'Not authorized to review documents' });

  try {
    const docR = await db.query('SELECT * FROM qc_inspection.item_documents WHERE id=$1', [id]);
    if (!docR.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = docR.rows[0];

    let newStatus, updateSql, updateParams;

    if (canQaReview) {
      if (!['pending_approval', 'qa_approved', 'rejected'].includes(doc.status)) {
        // allow re-review
      }
      newStatus = action === 'approve' ? 'qa_approved' : 'rejected';
      updateSql = `UPDATE qc_inspection.item_documents
                   SET status=$1, qa_reviewed_by=$2, qa_reviewed_at=NOW(), qa_remarks=$3
                   WHERE id=$4 RETURNING *`;
      updateParams = [newStatus, user_id, remarks || null, id];
    } else {
      // buying — can only approve if qa_approved
      if (doc.status !== 'qa_approved')
        return res.status(400).json({ error: 'Document must be QA-approved before buying can review' });
      newStatus = action === 'approve' ? 'approved' : 'rejected';
      updateSql = `UPDATE qc_inspection.item_documents
                   SET status=$1, buying_reviewed_by=$2, buying_reviewed_at=NOW(), buying_remarks=$3
                   WHERE id=$4 RETURNING *`;
      updateParams = [newStatus, user_id, remarks || null, id];
    }

    const r = await db.query(updateSql, updateParams);
    const updated = r.rows[0];

    // Fire email in background
    (async () => {
      try {
        const [itemR, supplierR, buyerR, reviewerR] = await Promise.all([
          db.query('SELECT name FROM qc_inspection.item_master WHERE item_code=$1', [updated.item_code]),
          db.query('SELECT name, contact_email FROM qc_inspection.supplier_master WHERE supplier_code=$1', [updated.supplier_code]),
          db.query(
            `SELECT DISTINCT ts.email FROM qc_inspection.po_master p
             JOIN qc_inspection.team_stakeholder ts ON ts.user_id = p.buyer_id
             WHERE p.supplier_code=$1 AND p.item_code=$2 AND ts.email IS NOT NULL`,
            [updated.supplier_code, updated.item_code]
          ),
          db.query('SELECT name FROM qc_inspection.team_stakeholder WHERE user_id=$1', [user_id]),
        ]);

        const itemName = itemR.rows[0]?.name || updated.item_code;
        const supplierName = supplierR.rows[0]?.name || updated.supplier_code;
        const supplierEmail = supplierR.rows[0]?.contact_email;
        const buyerEmails = buyerR.rows.map(r => r.email);
        const reviewerName = reviewerR.rows[0]?.name || req.user.email;

        const toEmails = [supplierEmail, ...buyerEmails].filter(Boolean);
        if (toEmails.length > 0) {
          const { subject, html } = emailDocReviewed({
            supplierName, itemName,
            docType: updated.doc_type,
            action,
            remarks: remarks || '',
            reviewerName,
          });
          await sendEmail({ to: toEmails, subject, html });
        }
      } catch (e) {
        console.error('Review email error:', e.message);
      }
    })();

    res.json(updated);
  } catch (err) {
    console.error('PUT /documents/:id/review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id/file ─────────────────────────────────────────────────────────────
router.get('/:id/file', async (req, res) => {
  const { role, supplier_code: userSupplierCode, agency_code, user_id } = req.user;
  const { id } = req.params;

  try {
    const docR = await db.query('SELECT * FROM qc_inspection.item_documents WHERE id=$1', [id]);
    if (!docR.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = docR.rows[0];

    if (!doc.file_data) return res.status(404).json({ error: 'No file data' });

    // Access checks
    if (role === 'supplier_user' && doc.supplier_code !== userSupplierCode)
      return res.status(403).json({ error: 'Access denied' });

    if (role === 'agency_user') {
      if (doc.status !== 'approved') return res.status(403).json({ error: 'Document not approved' });
      const jobCheck = await db.query(
        `SELECT 1 FROM qc_inspection.inspection_job ij
         JOIN qc_inspection.po_master p ON p.po_no = ij.po_no
         WHERE p.item_code=$1 AND p.supplier_code=$2 AND ij.agency_code=$3 LIMIT 1`,
        [doc.item_code, doc.supplier_code, agency_code]
      );
      if (!jobCheck.rows.length) return res.status(403).json({ error: 'Access denied' });
    }

    res.set('Content-Type', doc.file_type || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${doc.file_name || 'document'}"`);
    res.send(Buffer.from(doc.file_data));
  } catch (err) {
    console.error('GET /documents/:id/file error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
