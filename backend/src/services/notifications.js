const db = require('../db');
const {
  sendEmail,
  emailJobMapped,
  emailSubmittedForQA,
  emailQAApproved,
  emailQARejected,
  emailChargesSubmitted,
  emailChargesApproved,
  emailChargesRejected,
  emailRemarkPosted,
} = require('./email');

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

function buildEmailForEvent(eventType, extraMessage) {
  let data = {};
  try { data = JSON.parse(extraMessage); } catch {}

  switch (eventType) {
    case 'JOB_MAPPED':
      return emailJobMapped({
        jobRef: data.job_ref || data.jobRef || '—',
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        agencyName: data.agency_name,
        inspectionDate: data.date || data.inspection_date,
        stage: data.stages,
        jobId: data.job_id,
      });
    case 'SUBMITTED_FOR_QA':
      return emailSubmittedForQA({
        jobRef: data.job_ref || '—',
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        agencyName: data.agency_name,
        inspectionDate: data.inspection_date,
        jobId: data.job_id,
        failedCheckpoints: data.failed_checkpoints || [],
      });
    case 'QA_APPROVED':
      return emailQAApproved({
        jobRef: data.job_ref || '—',
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        agencyName: data.agency_name,
        reviewerName: data.reviewer_name,
        jobId: data.job_id,
        remarks: data.remarks,
      });
    case 'QA_REJECTED':
      return emailQARejected({
        jobRef: data.job_ref || '—',
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        agencyName: data.agency_name,
        reviewerName: data.reviewer_name,
        remarks: data.remarks,
        jobId: data.job_id,
      });
    case 'CHARGES_SUBMITTED':
      return emailChargesSubmitted({
        adviceRef: data.ref || '—',
        agencyName: data.agency || '—',
        totalCost: data.amt,
        currency: data.currency,
        jobCount: data.job_count,
        submittedBy: data.submitted_by,
      });
    case 'CHARGES_QA_APPROVED':
    case 'CHARGES_BUYING_APPROVED':
    case 'CHARGES_IMPORTS_APPROVED':
    case 'CHARGES_PAID':
      return emailChargesApproved({
        adviceRef: data.ref || '—',
        agencyName: data.agency || '—',
        totalCost: data.amt,
        currency: data.currency,
        approvedBy: data.approved_by,
        notes: data.notes,
        nextStep: eventType === 'CHARGES_QA_APPROVED' ? 'Pending Buying approval'
          : eventType === 'CHARGES_BUYING_APPROVED' ? 'Pending Imports approval'
          : eventType === 'CHARGES_IMPORTS_APPROVED' ? 'Pending Accounts payment'
          : 'Payment confirmed',
      });
    case 'CHARGES_REJECTED':
      return emailChargesRejected({
        adviceRef: data.ref || '—',
        agencyName: data.agency || '—',
        totalCost: data.amt,
        currency: data.currency,
        rejectedBy: data.rejected_by,
        reason: data.reason,
      });
    case 'REMARK_POSTED':
      return emailRemarkPosted({
        jobRef: data.job_ref || '—',
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        agencyName: data.agency_name,
        remarkText: data.remark || data.text || '—',
        postedBy: data.posted_by,
        postedByRole: data.role,
        jobId: data.job_id,
      });
    default:
      return {
        subject: `QC Portal — ${eventType.replace(/_/g, ' ')}`,
        html: `<p style="font-size:14px;color:#475569;">${EVENT_MESSAGES[eventType] || extraMessage || eventType}</p>`,
      };
  }
}

function buildReadableMessage(eventType, extraMessage) {
  let data = {};
  try { data = JSON.parse(extraMessage); } catch { return extraMessage || EVENT_MESSAGES[eventType] || eventType; }

  const jobRef = data.job_ref ? `Job ${data.job_ref}` : (data.po_no ? `PO ${data.po_no}` : '');
  const ref = data.ref || '';

  switch (eventType) {
    case 'JOB_MAPPED':
      return `New inspection job mapped${jobRef ? ` — ${jobRef}` : ''}. Item: ${data.item_name || '—'}. Agency: ${data.agency_name || 'Self Inspection'}.`;
    case 'SUBMITTED_FOR_QA':
      return `Checklist submitted for QA review${jobRef ? ` — ${jobRef}` : ''}. Item: ${data.item_name || '—'}.${data.failed_checkpoints?.length ? ` ⚠️ ${data.failed_checkpoints.length} checkpoint(s) failed.` : ''}`;
    case 'QA_APPROVED':
      return `Inspection approved by QA${jobRef ? ` — ${jobRef}` : ''}. Reviewed by ${data.reviewer_name || '—'}.`;
    case 'QA_REJECTED':
      return `Inspection rejected by QA${jobRef ? ` — ${jobRef}` : ''}. Reviewed by ${data.reviewer_name || '—'}.${data.remarks ? ` Remarks: ${data.remarks}` : ''}`;
    case 'REINSPECTION_TRIGGERED':
      return `Re-inspection triggered${jobRef ? ` — ${jobRef}` : ''}. New inspection date: ${data.inspection_date ? new Date(data.inspection_date).toLocaleDateString('en-GB') : '—'}.`;
    case 'CHARGES_SUBMITTED':
      return `Inspection charges submitted — ${ref}. Agency: ${data.agency || '—'}. Amount: ${data.currency || 'USD'} ${parseFloat(data.amt || 0).toFixed(2)}.`;
    case 'CHARGES_QA_APPROVED':
      return `Charges approved by QA — ${ref}. Amount: ${data.currency || 'USD'} ${parseFloat(data.amt || 0).toFixed(2)}. Pending Buying approval.`;
    case 'CHARGES_BUYING_APPROVED':
      return `Charges approved by Buying — ${ref}. Amount: ${data.currency || 'USD'} ${parseFloat(data.amt || 0).toFixed(2)}. Pending Imports approval.`;
    case 'CHARGES_IMPORTS_APPROVED':
      return `Charges approved by Imports — ${ref}. Amount: ${data.currency || 'USD'} ${parseFloat(data.amt || 0).toFixed(2)}. Pending Accounts payment.`;
    case 'CHARGES_PAID':
      return `Charges payment confirmed — ${ref}. Amount: ${data.currency || 'USD'} ${parseFloat(data.amt || 0).toFixed(2)}.`;
    case 'CHARGES_REJECTED':
      return `Charges rejected — ${ref}. Rejected by ${data.rejected_by || '—'}.${data.reason ? ` Reason: ${data.reason}` : ''}`;
    case 'REMARK_POSTED':
      return `New remark on ${jobRef || 'job'} by ${data.posted_by || '—'} (${data.role || ''}): "${(data.remark || '').slice(0, 120)}${(data.remark || '').length > 120 ? '…' : ''}"`;
    default:
      return EVENT_MESSAGES[eventType] || eventType;
  }
}

async function sendNotification(jobId, eventType, recipientRole, recipientEmails = [], extraMessage = null, adviceId = null, agencyCode = null) {
  const message = buildReadableMessage(eventType, extraMessage);

  console.log(`\n📧 [NOTIFICATION] ${eventType} → ${recipientRole}`);
  console.log(`   Emails: ${recipientEmails.filter(Boolean).join(', ') || 'none'}\n`);

  // 1. Save in-app notification
  try {
    await db.query(
      `INSERT INTO qc_inspection.notification_event
         (job_id, event_type, recipient_role, recipient_email, channel, message, advice_id, agency_code)
       VALUES ($1, $2, $3, $4, 'in_app', $5, $6, $7)`,
      [jobId || null, eventType, recipientRole, recipientEmails.filter(Boolean).join(',') || null, message, adviceId || null, agencyCode || null]
    );
  } catch {
    try {
      await db.query(
        `INSERT INTO qc_inspection.notification_event (job_id, event_type, recipient_role, recipient_email, channel)
         VALUES ($1, $2, $3, $4, 'in_app')`,
        [jobId || null, eventType, recipientRole, recipientEmails.filter(Boolean).join(',') || null]
      );
    } catch (fallbackErr) {
      console.error('Failed to persist notification:', fallbackErr.message);
    }
  }

  // 2. Send email — fire-and-forget, don't block API response
  let validEmails = recipientEmails.filter(e => e && typeof e === 'string' && e.includes('@'));
  // In test mode, always send to TEST_EMAIL_TO even if no recipients configured
  if (process.env.TEST_EMAIL_TO && !validEmails.includes(process.env.TEST_EMAIL_TO)) {
    validEmails = [...validEmails, process.env.TEST_EMAIL_TO];
  }
  if (validEmails.length > 0) {
    try {
      const { subject, html } = buildEmailForEvent(eventType, extraMessage);
      sendEmail({ to: validEmails, subject, html })
        .then(() => console.log(`[EMAIL SUCCESS] ${eventType} → ${recipientRole}`))
        .catch(err => console.error(`[EMAIL ERROR] ${eventType} → ${recipientRole}:`, err.message, err.code, err.response));
    } catch (err) {
      console.error(`[EMAIL BUILD ERROR] ${eventType}:`, err.message);
    }
  }
}

module.exports = { sendNotification };
