const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/checklist-templates
 * Returns all templates. QA sees all; others see only active.
 */
router.get('/', async (req, res) => {
  try {
    let query = `
      SELECT t.*,
        COUNT(i.item_id) AS item_count
      FROM qc_inspection.checklist_template t
      LEFT JOIN qc_inspection.checklist_item i ON i.template_id = t.template_id
    `;
    const params = [];

    if (req.user.role !== 'qa') {
      query += ' WHERE t.status = $1';
      params.push('active');
    }

    query += ' GROUP BY t.template_id ORDER BY t.category, t.sub_category, t.version DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get templates error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/checklist-templates/:id
 * Returns template with its checklist items
 */
router.get('/:id', async (req, res) => {
  try {
    const templateResult = await db.query(
      'SELECT * FROM qc_inspection.checklist_template WHERE template_id = $1',
      [req.params.id]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateResult.rows[0];

    // Non-QA users can only see active templates
    if (req.user.role !== 'qa' && template.status !== 'active') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const itemsResult = await db.query(
      'SELECT * FROM qc_inspection.checklist_item WHERE template_id = $1 ORDER BY sort_order ASC',
      [req.params.id]
    );

    res.json({ ...template, items: itemsResult.rows });
  } catch (err) {
    console.error('Get template error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/checklist-templates
 * QA only. Create new template.
 * Body: { category, sub_category, version? }
 */
router.post('/', authorize('qa'), async (req, res) => {
  const { category, sub_category, version } = req.body;

  if (!category || !sub_category) {
    return res.status(400).json({ error: 'category and sub_category are required' });
  }

  try {
    // Determine version if not provided
    let ver = version;
    if (!ver) {
      const maxVer = await db.query(
        'SELECT COALESCE(MAX(version), 0) AS max_ver FROM qc_inspection.checklist_template WHERE category = $1 AND sub_category = $2',
        [category, sub_category]
      );
      ver = maxVer.rows[0].max_ver + 1;
    }

    const result = await db.query(
      `INSERT INTO qc_inspection.checklist_template (category, sub_category, version, status)
       VALUES ($1, $2, $3, 'draft')
       RETURNING *`,
      [category, sub_category, ver]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Template with this category/sub_category/version already exists' });
    }
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/checklist-templates/:id/activate
 * QA only. Activate a draft template (archives previous active for same category).
 */
router.put('/:id/activate', authorize('qa'), async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const templateResult = await client.query(
      'SELECT * FROM qc_inspection.checklist_template WHERE template_id = $1',
      [req.params.id]
    );

    if (templateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateResult.rows[0];

    if (template.status === 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Template is already active' });
    }

    if (template.status === 'archived') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot activate an archived template' });
    }

    // Check template has at least one item
    const itemCount = await client.query(
      'SELECT COUNT(*) AS cnt FROM qc_inspection.checklist_item WHERE template_id = $1',
      [req.params.id]
    );
    if (parseInt(itemCount.rows[0].cnt) === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot activate template with no checklist items' });
    }

    // Archive any currently active template for same category/sub_category
    await client.query(
      `UPDATE qc_inspection.checklist_template SET status = 'archived', updated_at = NOW()
       WHERE category = $1 AND sub_category = $2 AND status = 'active'`,
      [template.category, template.sub_category]
    );

    // Activate this template
    const updated = await client.query(
      `UPDATE qc_inspection.checklist_template SET status = 'active', updated_at = NOW()
       WHERE template_id = $1 RETURNING *`,
      [req.params.id]
    );

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Activate template error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/checklist-templates/:id
 * QA only. Update template metadata (only if draft).
 */
router.put('/:id', authorize('qa'), async (req, res) => {
  const { category, sub_category } = req.body;
  try {
    const existing = await db.query('SELECT * FROM qc_inspection.checklist_template WHERE template_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    if (existing.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Can only edit draft templates' });
    }

    const result = await db.query(
      `UPDATE qc_inspection.checklist_template SET category = COALESCE($1, category), sub_category = COALESCE($2, sub_category), updated_at = NOW()
       WHERE template_id = $3 RETURNING *`,
      [category, sub_category, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/checklist-templates/:id/items
 * QA only. Add a checklist item to a template.
 */
router.post('/:id/items', authorize('qa'), async (req, res) => {
  const { section, checkpoint_text, criticality, sort_order } = req.body;

  if (!section || !checkpoint_text) {
    return res.status(400).json({ error: 'section and checkpoint_text are required' });
  }

  const validCriticality = ['critical', 'major', 'minor'];
  if (criticality && !validCriticality.includes(criticality)) {
    return res.status(400).json({ error: 'criticality must be critical, major, or minor' });
  }

  try {
    const templateExists = await db.query(
      'SELECT template_id, status FROM qc_inspection.checklist_template WHERE template_id = $1',
      [req.params.id]
    );
    if (templateExists.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Determine sort_order if not provided
    let sortOrd = sort_order;
    if (!sortOrd) {
      const maxSort = await db.query(
        'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM qc_inspection.checklist_item WHERE template_id = $1',
        [req.params.id]
      );
      sortOrd = maxSort.rows[0].max_sort + 1;
    }

    const result = await db.query(
      `INSERT INTO qc_inspection.checklist_item (template_id, section, checkpoint_text, criticality, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, section, checkpoint_text, criticality || 'major', sortOrd]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Add item error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/checklist-templates/:id/items/:itemId
 * QA only. Update a checklist item.
 */
router.put('/:id/items/:itemId', authorize('qa'), async (req, res) => {
  const { section, checkpoint_text, criticality, sort_order } = req.body;
  try {
    const result = await db.query(
      `UPDATE qc_inspection.checklist_item
       SET section = COALESCE($1, section),
           checkpoint_text = COALESCE($2, checkpoint_text),
           criticality = COALESCE($3, criticality),
           sort_order = COALESCE($4, sort_order)
       WHERE item_id = $5 AND template_id = $6
       RETURNING *`,
      [section || null, checkpoint_text || null, criticality || null, sort_order ?? null, req.params.itemId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Checklist item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update item error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/checklist-templates/:id/items/:itemId
 * QA only. Remove a checklist item.
 */
router.delete('/:id/items/:itemId', authorize('qa'), async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM qc_inspection.checklist_item WHERE item_id = $1 AND template_id = $2 RETURNING item_id',
      [req.params.itemId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }
    res.json({ message: 'Item deleted', item_id: result.rows[0].item_id });
  } catch (err) {
    console.error('Delete item error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
