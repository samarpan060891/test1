const db = require('../db');

const EVENT_MESSAGES = {
  JOB_MAPPED:              'A new inspection job has been mapped and assigned.',
  SUBMITTED_FOR_QA:        'An inspection checklist has been submitted and is pending QA review.',
  QA_APPROVED:             'The inspection has been approved by QA.',
  QA_REJECTED:             'The inspection has been rejected by QA. Please review the remarks.',
  REINSPECTION_TRIGGERED:  'A re-inspection has been triggered for this job.',
  CHARGES_SUBMITTED:       'A new inspection charges advice has been submitted.',
  CHARGES_QA_APPROVED:     'Inspection charges advice has been approved by QA.',
  CHARGES_APPROVED:        'Inspection charges advice has been fully approved.',
  CHARGES_REJECTED:        'Inspection charges advice has been rejected.',
};

/**
 * @param {string|null} jobId
 * @param {string} eventType
 * @param {string} recipientRole
 * @param {string[]} recipientEmails
 * @param {string|null} extraMessage
 * @param {string|null} adviceId  - for charge notifications that have no single job
 */
async function sendNotification(jobId, eventType, recipientRole, recipientEmails = [], extraMessage = null, adviceId = null) {
  const message = extraMessage || EVENT_MESSAGES[eventType] || `Notification: ${eventType}`;

  console.log(`\n📧 [NOTIFICATION] ${eventType} → ${recipientRole}`);
  console.log(`   Message: ${message}\n`);

  try {
    await db.query(
      `INSERT INTO qc_inspection.notification_event
         (job_id, event_type, recipient_role, recipient_email, channel, message, advice_id)
       VALUES ($1, $2, $3, $4, 'in_app', $5, $6)`,
      [
        jobId || null,
        eventType,
        recipientRole,
        recipientEmails.filter(Boolean).join(',') || null,
        message,
        adviceId || null,
      ]
    );
  } catch (err) {
    // Try fallback without new columns in case migration hasn't been run yet
    try {
      await db.query(
        `INSERT INTO qc_inspection.notification_event
           (job_id, event_type, recipient_role, recipient_email, channel)
         VALUES ($1, $2, $3, $4, 'in_app')`,
        [
          jobId || null,
          eventType,
          recipientRole,
          recipientEmails.filter(Boolean).join(',') || null,
        ]
      );
    } catch (fallbackErr) {
      console.error('Failed to persist notification:', fallbackErr.message);
    }
  }
}

module.exports = { sendNotification };
