const cron = require('node-cron');
const db = require('../db');
const { sendEmail, emailInspectionOverdueDigest } = require('./email');

// Run every minute; actual send is gated by the configured send_time from DB
const POLL_SCHEDULE = '* * * * *';

let lastRunMinute = -1; // avoid double-fire within same minute

async function sendOverdueReminders() {
  let config;
  try {
    const { rows } = await db.query('SELECT * FROM qc_inspection.overdue_reminder_config WHERE id = 1');
    config = rows[0];
  } catch (err) {
    console.error('[SCHEDULER] Failed to read reminder config:', err.message);
    return;
  }

  if (!config || !config.enabled) return;

  // Check if current time matches configured send_time (HH:MM)
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentMinute = `${hh}:${mm}`;
  const configuredTime = (config.send_time || '08:00').slice(0, 5); // trim seconds if present

  if (currentMinute !== configuredTime) return;
  if (lastRunMinute === currentMinute) return; // already fired this minute
  lastRunMinute = currentMinute;

  console.log(`[SCHEDULER] Overdue reminder check triggered at ${currentMinute}`);

  const minDays = config.min_days_overdue || 1;
  const freqDays = config.frequency_days || 1;

  try {
    // Find overdue jobs that meet frequency criteria:
    // - Past inspection_date by at least min_days_overdue
    // - Either never reminded, OR last reminder was at least frequency_days ago
    const { rows: jobs } = await db.query(`
      SELECT
        j.job_id,
        j.job_ref,
        j.po_no,
        j.inspection_date,
        j.agency_code,
        i.name  AS item_name,
        s.name  AS supplier_name,
        a.name  AS agency_name,
        MAX(l.sent_at) AS last_reminded_at
      FROM qc_inspection.inspection_job j
      JOIN qc_inspection.item_master        i ON i.item_code     = j.item_code
      JOIN qc_inspection.supplier_master    s ON s.supplier_code = j.supplier_code
      LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
      LEFT JOIN qc_inspection.overdue_reminder_log  l ON l.job_id = j.job_id
      WHERE j.status = 'mapped_awaiting_inspection'
        AND j.inspection_date < CURRENT_DATE - ($1 - 1) * INTERVAL '1 day'
      GROUP BY j.job_id, j.job_ref, j.po_no, j.inspection_date, j.agency_code,
               i.name, s.name, a.name
      HAVING MAX(l.sent_at) IS NULL
          OR MAX(l.sent_at) < NOW() - $2 * INTERVAL '1 day'
      ORDER BY j.inspection_date ASC
    `, [minDays, freqDays]);

    if (jobs.length === 0) {
      console.log('[SCHEDULER] No jobs due for overdue reminder.');
      return;
    }

    console.log(`[SCHEDULER] ${jobs.length} job(s) due for overdue reminder.`);

    // Collect recipients using admin-configured roles (admin is never included)
    const configuredRoles = (config.recipient_roles || []).filter(r => r !== 'admin')
    if (configuredRoles.length === 0) {
      console.log('[SCHEDULER] No recipient roles configured — skipping send.');
      return;
    }

    // For agency_user: only those assigned to the overdue jobs; for all others: all users with that role
    const nonAgencyRoles = configuredRoles.filter(r => r !== 'agency_user')
    const includeAgency  = configuredRoles.includes('agency_user')

    let staffEmails = []
    if (nonAgencyRoles.length > 0) {
      const { rows: staff } = await db.query(`
        SELECT DISTINCT email FROM qc_inspection.team_stakeholder
        WHERE role = ANY($1) AND email IS NOT NULL AND email <> ''
      `, [nonAgencyRoles]);
      staffEmails = staff.map(r => r.email)
    }

    let agencyEmails = []
    if (includeAgency) {
      const agencyCodes = [...new Set(jobs.map(j => j.agency_code).filter(Boolean))]
      if (agencyCodes.length > 0) {
        const { rows: agencyStaff } = await db.query(`
          SELECT DISTINCT email FROM qc_inspection.team_stakeholder
          WHERE role = 'agency_user' AND agency_code = ANY($1) AND email IS NOT NULL AND email <> ''
        `, [agencyCodes]);
        agencyEmails = agencyStaff.map(r => r.email)
      }
    }

    let recipients = [...staffEmails, ...agencyEmails];
    if (process.env.TEST_EMAIL_TO) recipients = [process.env.TEST_EMAIL_TO];

    if (recipients.length > 0) {
      const { subject, html } = emailInspectionOverdueDigest({ jobs });
      await sendEmail({ to: recipients, subject, html });
      console.log(`[SCHEDULER] Reminder sent to ${recipients.length} recipient(s).`);
    } else {
      console.log('[SCHEDULER] No recipients — skipping send.');
    }

    // Log each job that was included in this reminder
    for (const job of jobs) {
      await db.query(
        `INSERT INTO qc_inspection.overdue_reminder_log (job_id) VALUES ($1)`,
        [job.job_id]
      ).catch(err => console.error('[SCHEDULER] Log insert failed:', err.message));
    }
  } catch (err) {
    console.error('[SCHEDULER] Overdue reminder run failed:', err.message);
  }
}

function startScheduler() {
  cron.schedule(POLL_SCHEDULE, sendOverdueReminders);
  console.log('[SCHEDULER] Overdue reminder scheduler started (polls every minute, fires at configured send_time)');
}

module.exports = { startScheduler, sendOverdueReminders };
