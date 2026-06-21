const db = require('../db');

const EVENT_MESSAGES = {
  JOB_MAPPED:              'A new inspection job has been mapped and assigned.',
  SUBMITTED_FOR_QA:        'An inspection checklist has been submitted and is pending QA review.',
  QA_APPROVED:             'The inspection has been approved by QA.',
  QA_REJECTED:             'The inspection has been rejected by QA. Please review the remarks.',
  REINSPECTION_TRIGGERED:  'A re-inspection has been triggered for this job.',
};

async function sendNotification(jobId, eventType, recipientRole, recipientEmails = [], extraMessage = null) {
  const message = extraMessage || EVENT_MESSAGES[eventType] || `Notification: ${eventType}`;

  console.log(`\n📧 [NOTIFICATION] ${eventType} → ${recipientRole} | Job: ${jobId}`);
  console.log(`   Message: ${message}`);
  console.log(`   Recipients: ${recipientEmails.filter(Boolean).join(', ') || '(none)'}\n`);

  try {
    await db.query(
      `INSERT INTO qc_inspection.notification_event
         (job_id, event_type, recipient_role, recipient_email, channel, message)
       VALUES ($1, $2, $3, $4, 'in_app', $5)`,
      [
        jobId,
        eventType,
        recipientRole,
        recipientEmails.filter(Boolean).join(',') || null,
        message,
      ]
    );
  } catch (err) {
    console.error('Failed to persist notification:', err.message);
  }
}

module.exports = { sendNotification };
