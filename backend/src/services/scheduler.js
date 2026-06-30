const cron = require('node-cron');
const db = require('../db');
const { sendEmail, emailInspectionOverdueDigest, emailPaymentOverdueDigest } = require('./email');

const POLL_SCHEDULE = '* * * * *';

// Track which schedule+minute combos have already fired this minute
const firedThisMinute = new Map(); // key: `${scheduleId}-${HH:MM}`

function localTimeHHMM(tz) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  }).format(new Date()).slice(0, 5);
}

async function runAllSchedules() {
  let schedules;
  try {
    const { rows } = await db.query(
      `SELECT * FROM qc_inspection.reminder_schedules WHERE enabled = true`
    );
    schedules = rows;
  } catch (err) {
    console.error('[SCHEDULER] Failed to read reminder_schedules:', err.message);
    return;
  }

  for (const sched of schedules) {
    const tz = sched.timezone || 'UTC';
    const currentMinute = localTimeHHMM(tz);
    const configuredTime = (sched.send_time || '08:00').slice(0, 5);
    if (currentMinute !== configuredTime) continue;

    const fireKey = `${sched.schedule_id}-${currentMinute}`;
    if (firedThisMinute.get(fireKey)) continue;
    firedThisMinute.set(fireKey, true);
    // Clean up old keys after 2 minutes
    setTimeout(() => firedThisMinute.delete(fireKey), 120000);

    console.log(`[SCHEDULER] Schedule "${sched.name}" firing at ${currentMinute} (${tz})`);
    await runInspectionOverdue(sched);
    await runPaymentOverdue(sched);
  }
}

async function runInspectionOverdue(sched) {
  const minDays = sched.min_days_overdue || 1;
  const freqDays = sched.frequency_days || 1;
  const configuredRoles = (sched.recipient_roles || []).filter(r => r !== 'admin');

  try {
    const { rows: jobs } = await db.query(`
      SELECT
        j.job_id, j.job_ref, j.po_no, j.inspection_date, j.agency_code,
        i.name  AS item_name,
        s.name  AS supplier_name,
        a.name  AS agency_name,
        MAX(l.sent_at) AS last_reminded_at
      FROM qc_inspection.inspection_job j
      JOIN qc_inspection.item_master        i ON i.item_code     = j.item_code
      JOIN qc_inspection.supplier_master    s ON s.supplier_code = j.supplier_code
      LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
      LEFT JOIN qc_inspection.overdue_reminder_log  l ON l.job_id = j.job_id AND l.schedule_id = $3
      WHERE j.status = 'mapped_awaiting_inspection'
        AND j.inspection_date < CURRENT_DATE - ($1 - 1) * INTERVAL '1 day'
      GROUP BY j.job_id, j.job_ref, j.po_no, j.inspection_date, j.agency_code, i.name, s.name, a.name
      HAVING MAX(l.sent_at) IS NULL
          OR MAX(l.sent_at) < NOW() - $2 * INTERVAL '1 day'
      ORDER BY j.inspection_date ASC
    `, [minDays, freqDays, sched.schedule_id]);

    if (jobs.length === 0) return;

    const nonAgencyRoles = configuredRoles.filter(r => r !== 'agency_user');
    const includeAgency  = configuredRoles.includes('agency_user');

    let staffEmails = [];
    if (nonAgencyRoles.length > 0) {
      const { rows } = await db.query(
        `SELECT DISTINCT email FROM qc_inspection.team_stakeholder WHERE role = ANY($1) AND email IS NOT NULL AND email <> ''`,
        [nonAgencyRoles]
      );
      staffEmails = rows.map(r => r.email);
    }

    let agencyEmails = [];
    if (includeAgency) {
      const codes = [...new Set(jobs.map(j => j.agency_code).filter(Boolean))];
      if (codes.length > 0) {
        const { rows } = await db.query(
          `SELECT DISTINCT email FROM qc_inspection.team_stakeholder WHERE role = 'agency_user' AND agency_code = ANY($1) AND email IS NOT NULL AND email <> ''`,
          [codes]
        );
        agencyEmails = rows.map(r => r.email);
      }
    }

    let recipients = [...staffEmails, ...agencyEmails];
    if (process.env.TEST_EMAIL_TO) recipients = [process.env.TEST_EMAIL_TO];

    if (recipients.length > 0) {
      const { subject, html } = emailInspectionOverdueDigest({ jobs });
      await sendEmail({ to: recipients, subject, html });
      console.log(`[SCHEDULER] "${sched.name}" inspection reminder → ${recipients.length} recipient(s), ${jobs.length} job(s)`);
    }

    for (const job of jobs) {
      await db.query(
        `INSERT INTO qc_inspection.overdue_reminder_log (job_id, schedule_id) VALUES ($1, $2)`,
        [job.job_id, sched.schedule_id]
      ).catch(err => console.error('[SCHEDULER] Log insert failed:', err.message));
    }
  } catch (err) {
    console.error(`[SCHEDULER] Inspection overdue run failed for "${sched.name}":`, err.message);
  }
}

async function runPaymentOverdue(sched) {
  const freqDays = sched.frequency_days || 1;
  const configuredRoles = (sched.recipient_roles || []).filter(r => r !== 'admin');
  const wantsImports  = configuredRoles.includes('imports');
  const wantsAccounts = configuredRoles.includes('accounts');
  if (!wantsImports && !wantsAccounts) return;

  try {
    if (wantsImports) {
      const { rows: advices } = await db.query(`
        SELECT ca.advice_id, ca.status, ca.buying_approved_at, ca.imports_approved_at,
               j.job_ref, j.po_no, i.name AS item_name, s.name AS supplier_name, a.name AS agency_name,
               MAX(l.sent_at) AS last_reminded_at
        FROM qc_inspection.inspection_charges_advice ca
        JOIN qc_inspection.ica_jobs ij ON ij.advice_id = ca.advice_id
        JOIN qc_inspection.inspection_job j ON j.job_id = ij.job_id
        JOIN qc_inspection.item_master i ON i.item_code = j.item_code
        JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
        LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
        LEFT JOIN qc_inspection.payment_overdue_reminder_log l ON l.advice_id = ca.advice_id AND l.target_role = 'imports'
        WHERE ca.status = 'pending_imports' AND ca.buying_approved_at IS NOT NULL
        GROUP BY ca.advice_id, j.job_ref, j.po_no, i.name, s.name, a.name
        HAVING MAX(l.sent_at) IS NULL OR MAX(l.sent_at) < NOW() - $1 * INTERVAL '1 day'
      `, [freqDays]);

      if (advices.length > 0) {
        const { rows: staff } = await db.query(
          `SELECT DISTINCT email FROM qc_inspection.team_stakeholder WHERE role = 'imports' AND email IS NOT NULL AND email <> ''`
        );
        let recipients = staff.map(r => r.email);
        if (process.env.TEST_EMAIL_TO) recipients = [process.env.TEST_EMAIL_TO];
        if (recipients.length > 0) {
          const { subject, html } = emailPaymentOverdueDigest({ advices, targetRole: 'imports' });
          await sendEmail({ to: recipients, subject, html });
        }
        for (const a of advices) {
          await db.query(
            `INSERT INTO qc_inspection.payment_overdue_reminder_log (advice_id, target_role) VALUES ($1, 'imports')`,
            [a.advice_id]
          ).catch(() => {});
        }
      }
    }

    if (wantsAccounts) {
      const { rows: advices } = await db.query(`
        SELECT ca.advice_id, ca.status, ca.buying_approved_at, ca.imports_approved_at,
               j.job_ref, j.po_no, i.name AS item_name, s.name AS supplier_name, a.name AS agency_name,
               MAX(l.sent_at) AS last_reminded_at
        FROM qc_inspection.inspection_charges_advice ca
        JOIN qc_inspection.ica_jobs ij ON ij.advice_id = ca.advice_id
        JOIN qc_inspection.inspection_job j ON j.job_id = ij.job_id
        JOIN qc_inspection.item_master i ON i.item_code = j.item_code
        JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
        LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
        LEFT JOIN qc_inspection.payment_overdue_reminder_log l ON l.advice_id = ca.advice_id AND l.target_role = 'accounts'
        WHERE ca.status = 'pending_accounts' AND ca.imports_approved_at IS NOT NULL
        GROUP BY ca.advice_id, j.job_ref, j.po_no, i.name, s.name, a.name
        HAVING MAX(l.sent_at) IS NULL OR MAX(l.sent_at) < NOW() - $1 * INTERVAL '1 day'
      `, [freqDays]);

      if (advices.length > 0) {
        const { rows: staff } = await db.query(
          `SELECT DISTINCT email FROM qc_inspection.team_stakeholder WHERE role = 'accounts' AND email IS NOT NULL AND email <> ''`
        );
        let recipients = staff.map(r => r.email);
        if (process.env.TEST_EMAIL_TO) recipients = [process.env.TEST_EMAIL_TO];
        if (recipients.length > 0) {
          const { subject, html } = emailPaymentOverdueDigest({ advices, targetRole: 'accounts' });
          await sendEmail({ to: recipients, subject, html });
        }
        for (const a of advices) {
          await db.query(
            `INSERT INTO qc_inspection.payment_overdue_reminder_log (advice_id, target_role) VALUES ($1, 'accounts')`,
            [a.advice_id]
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error(`[SCHEDULER] Payment overdue run failed for "${sched.name}":`, err.message);
  }
}

// Legacy single-config function kept for backward compat
async function sendOverdueReminders() {}
async function sendPaymentOverdueReminders() {}

function startScheduler() {
  cron.schedule(POLL_SCHEDULE, runAllSchedules);
  console.log('[SCHEDULER] Multi-schedule reminder system started (polls every minute)');
}

module.exports = { startScheduler, sendOverdueReminders, sendPaymentOverdueReminders };
