require('dotenv').config();
const app = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // Test DB connection
    await db.query('SELECT 1');
    console.log('✅ Database connection established');

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
