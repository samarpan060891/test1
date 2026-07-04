const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const checklistTemplateRoutes = require('./routes/checklistTemplates');
const inspectionJobRoutes = require('./routes/inspectionJobs');
const inspectionResponseRoutes = require('./routes/inspectionResponses');
const logEntryRoutes = require('./routes/logEntries');
const notificationRoutes = require('./routes/notifications');
const mastersRoutes = require('./routes/masters');
const reportsRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const inspectionCostRoutes = require('./routes/inspectionCosts');
const documentRoutes = require('./routes/documents');
const itemHistoryRoutes = require('./routes/itemHistory');
const scorecardRoutes = require('./routes/scorecard');
const checklistImagesRoutes = require('./routes/checklistImages');
const warehouseInspectionRoutes = require('./routes/warehouseInspections');

const app = express();
app.set('trust proxy', 1); // behind Railway's proxy — needed for correct client IPs in rate limiting

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet({
  // API serves JSON + image blobs consumed by a separate frontend origin
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Brute-force protection on login: 20 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});
app.use('/api/auth/login', loginLimiter);

// General API limiter — generous ceiling to stop runaway clients, not normal use
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    allowed.push('http://localhost:5173');
    if (!origin || allowed.some(o => origin === o || origin.endsWith('.railway.app'))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger (development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/checklist-templates', checklistTemplateRoutes);
app.use('/api/inspection-jobs', inspectionJobRoutes);
app.use('/api/inspection-responses', inspectionResponseRoutes);
app.use('/api/log-entries', logEntryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/masters', mastersRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/inspection-costs', inspectionCostRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/item-history', itemHistoryRoutes);
app.use('/api/scorecard', scorecardRoutes);
app.use('/api/checklist-images', checklistImagesRoutes);
app.use('/api/warehouse-inspections', warehouseInspectionRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' ? { detail: err.message } : {}),
  });
});

module.exports = app;
