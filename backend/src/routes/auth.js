const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user: { user_id, name, email, role, agency_code, supplier_code } }
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await db.query(
      `SELECT user_id, name, email, role, agency_code, supplier_code, password_hash, language
       FROM qc_inspection.team_stakeholder
       WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokenPayload = {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      agency_code: user.agency_code,
      supplier_code: user.supplier_code,
      language: user.language || 'en',
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

    res.json({
      token,
      user: tokenPayload,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/auth/change-password
 * Authenticated. Any role can change their own password.
 */
router.put('/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'current_password and new_password are required' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });

  try {
    const result = await db.query(
      'SELECT password_hash FROM qc_inspection.team_stakeholder WHERE user_id = $1',
      [req.user.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.query(
      'UPDATE qc_inspection.team_stakeholder SET password_hash = $1 WHERE user_id = $2',
      [hash, req.user.user_id]
    );
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/auth/language
 * Save the user's preferred language.
 */
router.put('/language', authenticate, async (req, res) => {
  const { language } = req.body;
  const VALID_LANGS = ['en', 'zh', 'tr', 'ms', 'vi', 'id', 'th', 'fil'];
  if (!language || !VALID_LANGS.includes(language))
    return res.status(400).json({ error: 'Invalid language code' });
  try {
    await db.query(
      `UPDATE qc_inspection.team_stakeholder SET language = $1 WHERE user_id = $2`,
      [language, req.user.user_id]
    );
    res.json({ message: 'Language updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
