const db = require('../db');

/**
 * Mock email/notification service (console-log based, no real SMTP).
 * In production replace with real nodemailer/SendGrid calls.
 */

const EVENT_MESSAGES = {
  JOB_MAPPED: 'A new inspection job has been mapped and assigned to your agency.',
  SUBMITTED_FOR_QA: 'An inspection checklist has been submitted and is pending your QA review.',
  QA_APPROVED: 'The inspection has been approved by QA.',
  QA_REJECTED: 'The inspection has been rejected by QA. Please review the remarks and re-inspect.',
  REMINDER: 'This is a reminder regarding your pending inspection job.',
};

/**
 * Log a notification event to DB and simulate sending email.
 *
 * @param {string} jobId
 * @param {string} eventType
 * @param {string} recipientRole
 * @param {string[]} recipientEmails
 * @returns {Promise<object>} The saved notification_event row
 */
async function sendNotification(jobId, eventType, recipientRole, recipientEmails = []) {
  const message = EVENT_MESSAGES[eventType] || `Notification: ${eventType}`;

  // Log to console (mock SMTP)
  console.log(`\n📧 [MOCK EMAIL NOTIFICATION]`);
  console.log(`  Event:      ${eventType}`);
  console.log(`  Job ID:     ${jobId}`);
  console.log(`  Role:       ${recipientRole}`);
  console.log(`  Recipients: ${recipientEmails.filter(Boolean).join(', ') || '(none)'}`);
  console.log(`  Message:    ${message}`);
  console.log(`  Sent at:    ${new Date().toISOString()}\n`);

  // Persist to notification_events
  try {
    const result = await db.query(
      `INSERT INTO notification_events (job_id, event_type, recipient_role, recipient_email)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        jobId,
        eventType,
        recipientRole,
        recipientEmails.filter(Boolean).join(',') || null,
      ]
    );
    return result.rows[0];
  } catch (err) {
    // Non-fatal: log error but don't crash the request
    console.error('Failed to persist notification event:', err.message);
    return null;
  }
}

module.exports = { sendNotification };
