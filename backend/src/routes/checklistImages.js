const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per image
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

const router = express.Router();
router.use(authenticate);

const ALLOWED_ROLES = ['agency_user', 'supplier_user'];
const MAX_PER_SECTION = 10;

async function verifyJobAccess(jobId, user, requireWrite = false) {
  const { rows } = await db.query('SELECT * FROM qc_inspection.inspection_job WHERE job_id = $1', [jobId]);
  if (!rows.length) return { error: 'Job not found', status: 404 };
  const job = rows[0];
  if (user.role === 'agency_user' && job.agency_code !== user.agency_code)
    return { error: 'Access denied', status: 403 };
  if (user.role === 'supplier_user' && job.supplier_code !== user.supplier_code)
    return { error: 'Access denied', status: 403 };
  if (requireWrite && !ALLOWED_ROLES.includes(user.role))
    return { error: 'Only agency or supplier users can upload images', status: 403 };
  if (requireWrite && job.status !== 'mapped_awaiting_inspection')
    return { error: 'Cannot modify a submitted or approved job', status: 400 };
  return { job };
}

// GET /:jobId/images — list all images for a job (metadata only)
router.get('/:jobId/images', async (req, res) => {
  try {
    const check = await verifyJobAccess(req.params.jobId, req.user);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { rows } = await db.query(
      `SELECT image_id, job_id, section_key, file_name, file_type, file_size, uploaded_at
       FROM qc_inspection.checklist_images
       WHERE job_id = $1
       ORDER BY section_key, uploaded_at ASC`,
      [req.params.jobId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /:jobId/images/:imageId/file — serve image binary
router.get('/:jobId/images/:imageId/file', async (req, res) => {
  try {
    const check = await verifyJobAccess(req.params.jobId, req.user);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { rows } = await db.query(
      `SELECT file_name, file_type, file_data FROM qc_inspection.checklist_images WHERE image_id = $1 AND job_id = $2`,
      [req.params.imageId, req.params.jobId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Image not found' });
    const img = rows[0];
    res.set('Content-Type', img.file_type);
    res.set('Content-Disposition', `inline; filename="${img.file_name}"`);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(img.file_data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /:jobId/images — upload one image for a section
router.post('/:jobId/images', upload.single('image'), async (req, res) => {
  try {
    const check = await verifyJobAccess(req.params.jobId, req.user, true);
    if (check.error) return res.status(check.status).json({ error: check.error });

    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const sectionKey = req.body.section_key || '__defects__';

    // Count existing images for this section
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM qc_inspection.checklist_images WHERE job_id = $1 AND section_key = $2`,
      [req.params.jobId, sectionKey]
    );
    if (parseInt(countRows[0].count) >= MAX_PER_SECTION) {
      return res.status(400).json({ error: `Maximum ${MAX_PER_SECTION} images allowed per section` });
    }

    const { rows } = await db.query(
      `INSERT INTO qc_inspection.checklist_images (job_id, section_key, file_name, file_type, file_size, file_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING image_id, job_id, section_key, file_name, file_type, file_size, uploaded_at`,
      [req.params.jobId, sectionKey, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /:jobId/images/:imageId — remove an image
router.delete('/:jobId/images/:imageId', async (req, res) => {
  try {
    const check = await verifyJobAccess(req.params.jobId, req.user, true);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { rowCount } = await db.query(
      `DELETE FROM qc_inspection.checklist_images WHERE image_id = $1 AND job_id = $2`,
      [req.params.imageId, req.params.jobId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Image not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /:jobId/video-links
router.get('/:jobId/video-links', async (req, res) => {
  try {
    const check = await verifyJobAccess(req.params.jobId, req.user);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { rows } = await db.query(
      `SELECT link_id, url, label, created_at FROM qc_inspection.checklist_video_links WHERE job_id = $1 ORDER BY created_at ASC`,
      [req.params.jobId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /:jobId/video-links
router.post('/:jobId/video-links', async (req, res) => {
  try {
    const check = await verifyJobAccess(req.params.jobId, req.user, true);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { url, label } = req.body;
    if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

    const { rows } = await db.query(
      `INSERT INTO qc_inspection.checklist_video_links (job_id, url, label) VALUES ($1, $2, $3)
       RETURNING link_id, url, label, created_at`,
      [req.params.jobId, url.trim(), label?.trim() || null]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /:jobId/video-links/:linkId
router.delete('/:jobId/video-links/:linkId', async (req, res) => {
  try {
    const check = await verifyJobAccess(req.params.jobId, req.user, true);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { rowCount } = await db.query(
      `DELETE FROM qc_inspection.checklist_video_links WHERE link_id = $1 AND job_id = $2`,
      [req.params.linkId, req.params.jobId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Link not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
