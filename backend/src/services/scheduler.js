const cron = require('node-cron');
const db = require('../db');
const { sendEmail, emailInspectionOverdueDigest } = require('./email');

// Runs daily at 08:00 server time (configurable via OVERDUE_REMINDER_CRON env var)
const CRON_SCHEDULE = process.env.OVERDUE_REMINDER_CRON || '0 8 * * *';

async function sendOverdueReminders() {
  console.log('[SCHEDULER] Running overdue inspection reminder check...');
  try {
    // Find all jobs that are still awaiting inspection but past their inspection_date
    const { rows: jobs } = await db.query(`
      SELECT
        j.job_id,
        j.job_ref,
        j.po_no,
        j.inspection_date,
        j.agency_code,
        j.supplier_code,
        i.name  AS item_name,
        s.name  AS supplier_name,
        a.name  AS agency_name
      FROM qc_inspection.inspection_job j
      JOIN qc_inspection.item_master    i ON i.item_code    = j.item_code
      JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
      LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
      WHERE j.status = 'mapped_awaiting_inspection'
        AND j.inspection_date < CURRENT_DATE
      ORDER BY j.inspection_date ASC
    `);

    if (jobs.length === 0) {
      console.log('[SCHEDULER] No overdue jobs found.');
      return;
    }

    console.log(`[SCHEDULER] Found ${jobs.length} overdue job(s).`);

    // Collect unique recipient emails: QA team + Buying team + agency contacts
    const { rows: staff } = await db.query(`
      SELECT DISTINCT email
      FROM qc_inspection.team_stakeholder
      WHERE role IN ('qa', 'buying', 'admin')
        AND email IS NOT NULL
        AND email <> ''
    `);

    // Also include agency users for any agency-assigned jobs
    const agencyCodes = [...new Set(jobs.map(j => j.agency_code).filter(Boolean))];
    let agencyEmails = [];
    if (agencyCodes.length > 0) {
      const { rows: agencyStaff } = await db.query(`
        SELECT DISTINCT email
        FROM qc_inspection.team_stakeholder
        WHERE role = 'agency_user'
          AND agency_code = ANY($1)
          AND email IS NOT NULL
          AND email <> ''
      `, [agencyCodes]);
      agencyEmails = agencyStaff.map(r => r.email);
    }

    let recipients = [
      ...staff.map(r => r.email),
      ...agencyEmails,
    ];

    // In test mode redirect all mail
    if (process.env.TEST_EMAIL_TO) {
      recipients = [process.env.TEST_EMAIL_TO];
    }

    if (recipients.length === 0) {
      console.log('[SCHEDULER] No recipient emails found — skipping send.');
      return;
    }

    const { subject, html } = emailInspectionOverdueDigest({ jobs });
    await sendEmail({ to: recipients, subject, html });

    console.log(`[SCHEDULER] Overdue reminder sent to ${recipients.length} recipient(s) for ${jobs.length} job(s).`);
  } catch (err) {
    console.error('[SCHEDULER] Overdue reminder failed:', err.message);
  }
}

function startScheduler() {
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[SCHEDULER] Invalid cron schedule: "${CRON_SCHEDULE}". Scheduler not started.`);
    return;
  }
  cron.schedule(CRON_SCHEDULE, sendOverdueReminders, { timezone: process.env.TZ || 'UTC' });
  console.log(`[SCHEDULER] Overdue inspection reminder scheduled: "${CRON_SCHEDULE}" (TZ: ${process.env.TZ || 'UTC'})`);
}

module.exports = { startScheduler, sendOverdueReminders };
