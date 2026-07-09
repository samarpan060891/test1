const db = require('../db');
const {
  sendEmail,
  emailWhSubmittedForQA,
  emailWhQAApproved,
  emailWhQARejected,
  emailWhDeviationRequested,
  emailWhDeviationDecided,
  emailWhDeviationNoBuyer,
  emailClaimPaymentHold,
  emailClaimReplacementDue,
  emailJobDeviationRequested,
  emailJobDeviationDecided,
  emailJobDeviationNoBuyer,
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
  WH_SUBMITTED_FOR_QA: 'A warehouse inspection has been submitted for QA review.',
  WH_QA_APPROVED:      'A warehouse inspection has been approved by QA.',
  WH_QA_REJECTED:      'A warehouse inspection has been rejected by QA. Please review the remarks.',
  WH_DEVIATION_REQUESTED: 'QA has requested a deviation approval from Buying for a warehouse inspection.',
  WH_DEVIATION_NO_BUYER:  'QA requested a deviation but no buyer is assigned to the PO. Please assign a buyer.',
  WH_DEVIATION_APPROVED:  'Buying has approved the deviation request. Awaiting final QA decision.',
  WH_DEVIATION_REJECTED:  'Buying has rejected the deviation request. Awaiting final QA decision.',
  JOB_DEVIATION_REQUESTED: 'QA has requested a deviation approval from Buying for an inspection job.',
  JOB_DEVIATION_NO_BUYER:  'QA requested a deviation but no buyer is assigned to the PO. Please assign a buyer.',
  JOB_DEVIATION_APPROVED:  'Buying has approved the deviation request. Awaiting final QA decision.',
  JOB_DEVIATION_REJECTED:  'Buying has rejected the deviation request. Awaiting final QA decision.',
  CLAIM_RAISED:              'A defect claim has been raised by the warehouse and is pending QA review.',
  CLAIM_SUBMITTED_TO_BUYING: 'QA has reviewed a defect claim and submitted it to Buying.',
  CLAIM_RETURNED:            'A defect claim has been returned. Please review the remarks.',
  CLAIM_FINAL_SUBMITTED:     'A final defect claim has been submitted to the supplier.',
  CLAIM_SUBMITTED_TO_IMPORTS: 'A defect claim has been finalised by Buying and is pending Imports processing.',
  CLAIM_SUBMITTED_TO_ACCOUNTS:'A defect claim has been processed by Imports and is pending Accounts deduction.',
  CLAIM_CLOSED:              'A defect claim has been closed by Accounts.',
  CLAIM_SETTLED:             'A defect claim has been settled.',
  CLAIM_PAYMENT_HOLD:        'Refund claim raised — hold immediate, ongoing and future payments to this supplier.',
  CLAIM_REPLACEMENT_DUE:     'A replacement is overdue — the expected landing date has passed.',
  CLAIM_EDITED:              'A defect claim was edited and needs your re-approval.',
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
    case 'WH_SUBMITTED_FOR_QA':
      return emailWhSubmittedForQA({
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        stage: data.stage,
        failedCheckpoints: data.failed_checkpoints || [],
        inspectionId: data.wh_inspection_id,
      });
    case 'WH_QA_APPROVED':
      return emailWhQAApproved({
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        stage: data.stage,
        reviewerName: data.reviewer_name,
        remarks: data.remarks,
        inspectionId: data.wh_inspection_id,
      });
    case 'WH_QA_REJECTED':
      return emailWhQARejected({
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        stage: data.stage,
        reviewerName: data.reviewer_name,
        remarks: data.remarks,
        inspectionId: data.wh_inspection_id,
      });
    case 'WH_DEVIATION_REQUESTED':
      return emailWhDeviationRequested({
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        stage: data.stage,
        requesterName: data.requester_name,
        reason: data.reason,
        inspectionId: data.wh_inspection_id,
      });
    case 'WH_DEVIATION_NO_BUYER':
      return emailWhDeviationNoBuyer({
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        stage: data.stage,
        requesterName: data.requester_name,
        reason: data.reason,
        inspectionId: data.wh_inspection_id,
      });
    case 'WH_DEVIATION_APPROVED':
    case 'WH_DEVIATION_REJECTED':
      return emailWhDeviationDecided({
        decision: eventType === 'WH_DEVIATION_APPROVED' ? 'approved' : 'rejected',
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        stage: data.stage,
        buyerName: data.buyer_name,
        deviationReason: data.deviation_reason,
        remarks: data.remarks,
        inspectionId: data.wh_inspection_id,
      });
    case 'JOB_DEVIATION_REQUESTED':
      return emailJobDeviationRequested({
        jobRef: data.job_ref || '—',
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        agencyName: data.agency_name,
        requesterName: data.requester_name,
        reason: data.reason,
        jobId: data.job_id,
      });
    case 'JOB_DEVIATION_NO_BUYER':
      return emailJobDeviationNoBuyer({
        jobRef: data.job_ref || '—',
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        agencyName: data.agency_name,
        requesterName: data.requester_name,
        reason: data.reason,
        jobId: data.job_id,
      });
    case 'JOB_DEVIATION_APPROVED':
    case 'JOB_DEVIATION_REJECTED':
      return emailJobDeviationDecided({
        decision: eventType === 'JOB_DEVIATION_APPROVED' ? 'approved' : 'rejected',
        jobRef: data.job_ref || '—',
        poNo: data.po_no || '—',
        itemName: data.item_name || '—',
        supplierName: data.supplier_name || '—',
        agencyName: data.agency_name,
        buyerName: data.buyer_name,
        deviationReason: data.deviation_reason,
        remarks: data.remarks,
        jobId: data.job_id,
      });
    case 'CLAIM_PAYMENT_HOLD':
      return emailClaimPaymentHold(data);
    case 'CLAIM_REPLACEMENT_DUE':
      return emailClaimReplacementDue(data);
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
    case 'WH_SUBMITTED_FOR_QA': {
      const stageLabel = data.stage ? data.stage.charAt(0).toUpperCase() + data.stage.slice(1) : '';
      return `Warehouse inspection submitted for QA review — PO ${data.po_no || '—'}, Item: ${data.item_name || '—'}${stageLabel ? ` (${stageLabel})` : ''}.${data.failed_checkpoints?.length ? ` ⚠️ ${data.failed_checkpoints.length} failed.` : ' ✅ All passed.'}`;
    }
    case 'WH_QA_APPROVED':
      return `Warehouse inspection approved by QA — PO ${data.po_no || '—'}, Item: ${data.item_name || '—'}. Reviewed by ${data.reviewer_name || '—'}.`;
    case 'WH_QA_REJECTED':
      return `Warehouse inspection rejected by QA — PO ${data.po_no || '—'}, Item: ${data.item_name || '—'}. Reviewed by ${data.reviewer_name || '—'}.${data.remarks ? ` Remarks: ${data.remarks}` : ''}`;
    case 'WH_DEVIATION_REQUESTED':
      return `Deviation approval requested by QA — PO ${data.po_no || '—'}, Item: ${data.item_name || '—'}. Requested by ${data.requester_name || '—'}.${data.reason ? ` Reason: ${data.reason}` : ''}`;
    case 'WH_DEVIATION_NO_BUYER':
      return `⚠️ Deviation requested but no buyer is assigned to PO ${data.po_no || '—'} (Item: ${data.item_name || '—'}). Please assign a buyer to the PO so they can review the deviation.`;
    case 'WH_DEVIATION_APPROVED':
      return `Deviation approved by Buying — PO ${data.po_no || '—'}, Item: ${data.item_name || '—'}. Decided by ${data.buyer_name || '—'}. Awaiting final QA decision.${data.remarks ? ` Remarks: ${data.remarks}` : ''}`;
    case 'WH_DEVIATION_REJECTED':
      return `Deviation rejected by Buying — PO ${data.po_no || '—'}, Item: ${data.item_name || '—'}. Decided by ${data.buyer_name || '—'}. Awaiting final QA decision.${data.remarks ? ` Remarks: ${data.remarks}` : ''}`;
    case 'JOB_DEVIATION_REQUESTED':
      return `Deviation approval requested by QA${jobRef ? ` — ${jobRef}` : ''}. Item: ${data.item_name || '—'}. Requested by ${data.requester_name || '—'}.${data.reason ? ` Reason: ${data.reason}` : ''}`;
    case 'JOB_DEVIATION_NO_BUYER':
      return `⚠️ Deviation requested but no buyer is assigned to PO ${data.po_no || '—'}${jobRef ? ` (${jobRef})` : ''}. Please assign a buyer to the PO so they can review the deviation.`;
    case 'CLAIM_RAISED':
      return `Defect claim ${data.claim_ref || ''} raised by ${data.raised_by || 'warehouse'} — PO ${data.po_no || '—'}, Item: ${data.item_name || '—'}. Amount: $${parseFloat(data.claim_amount || 0).toFixed(2)}. Pending QA root-cause review.`;
    case 'CLAIM_SUBMITTED_TO_BUYING':
      return `Defect claim ${data.claim_ref || ''} reviewed by QA (${data.qa_name || '—'}) — PO ${data.po_no || '—'}. Root cause: ${(data.root_cause || '').slice(0, 100)}. Pending Buying penalties & final submission.`;
    case 'CLAIM_RETURNED':
      return `Defect claim ${data.claim_ref || ''} returned to ${data.returned_to || '—'} by ${data.returned_by || '—'}. Remarks: ${data.remarks || '—'}`;
    case 'CLAIM_FINAL_SUBMITTED':
      return `Final defect claim ${data.claim_ref || ''} submitted to ${data.supplier_name || 'supplier'} — PO ${data.po_no || '—'}. Total: $${parseFloat(data.total_amount || 0).toFixed(2)}${parseFloat(data.penalty_amount || 0) > 0 ? ` (incl. $${parseFloat(data.penalty_amount).toFixed(2)} penalty)` : ''}.`;
    case 'CLAIM_SUBMITTED_TO_IMPORTS':
      return `Defect claim ${data.claim_ref || ''} finalised by Buying (${data.settlement_mode || '—'}) — PO ${data.po_no || '—'}. Total: $${parseFloat(data.total_amount || 0).toFixed(2)}. Pending Imports processing.`;
    case 'CLAIM_SUBMITTED_TO_ACCOUNTS':
      return `Defect claim ${data.claim_ref || ''} processed by Imports — PO ${data.po_no || '—'}. Imports note: ${(data.imports_remarks || '').slice(0, 100)}. Pending Accounts deduction.`;
    case 'CLAIM_CLOSED':
      return `Defect claim ${data.claim_ref || ''} closed by Accounts — PO ${data.po_no || '—'}. Total: $${parseFloat(data.total_amount || 0).toFixed(2)}. Deduction: ${(data.deduction_remarks || '').slice(0, 100)}`;
    case 'CLAIM_PAYMENT_HOLD':
      return `🛑 PAYMENT HOLD — Refund claim ${data.claim_ref || ''} raised against ${data.supplier_name || 'supplier'} (PO ${data.po_no || '—'}). Hold immediate, ongoing and future payments. Credit note received: $${parseFloat(data.credit_note_amount || 0).toFixed(2)} vs requested $${parseFloat(data.total_amount || 0).toFixed(2)}.`;
    case 'CLAIM_REPLACEMENT_DUE':
      return `⏰ Replacement overdue — claim ${data.claim_ref || ''} (PO ${data.po_no || '—'}, ${data.item_name || '—'}). Expected landing ${data.expected_replacement_date ? new Date(data.expected_replacement_date).toLocaleDateString('en-GB') : '—'} has passed. Revise the date or mark received.`;
    case 'CLAIM_SETTLED':
      return `Defect claim ${data.claim_ref || ''} settled by ${data.settlement_mode || '—'} — PO ${data.po_no || '—'}. Total: $${parseFloat(data.total_amount || 0).toFixed(2)}.${data.credit_note_no ? ` Credit note: ${data.credit_note_no}.` : ''}`;
    case 'CLAIM_EDITED':
      return `✏️ Claim ${data.claim_ref || ''} (PO ${data.po_no || '—'}) was edited by ${data.edited_by_role || 'a stakeholder'} — fields: ${data.fields_changed || '—'}. It has rewound to your stage and needs re-approval.`;
    case 'JOB_DEVIATION_APPROVED':
      return `Deviation approved by Buying${jobRef ? ` — ${jobRef}` : ''}. Decided by ${data.buyer_name || '—'}. Awaiting final QA decision.${data.remarks ? ` Remarks: ${data.remarks}` : ''}`;
    case 'JOB_DEVIATION_REJECTED':
      return `Deviation rejected by Buying${jobRef ? ` — ${jobRef}` : ''}. Decided by ${data.buyer_name || '—'}. Awaiting final QA decision.${data.remarks ? ` Remarks: ${data.remarks}` : ''}`;
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
      return `Charges payment confirmed — ${ref}. Amount: ${data.currency || 'USD'} ${parseFloat(data.amt || 0).toFixed(2)}.${data.payment_mode ? ` Mode: ${data.payment_mode}.` : ''}${data.payment_reference ? ` Ref: ${data.payment_reference}.` : ''}`;
    case 'CHARGES_REJECTED':
      return `Charges rejected — ${ref}. Rejected by ${data.rejected_by || '—'}.${data.reason ? ` Reason: ${data.reason}` : ''}`;
    case 'REMARK_POSTED':
      return `New remark on ${jobRef || 'job'} by ${data.posted_by || '—'} (${data.role || ''}): "${(data.remark || '').slice(0, 120)}${(data.remark || '').length > 120 ? '…' : ''}"`;
    default:
      return EVENT_MESSAGES[eventType] || eventType;
  }
}

async function sendNotification(jobId, eventType, recipientRole, recipientEmails = [], extraMessage = null, adviceId = null, agencyCode = null, supplierCode = null, buyerId = null) {
  const message = buildReadableMessage(eventType, extraMessage);

  console.log(`\n📧 [NOTIFICATION] ${eventType} → ${recipientRole}`);
  console.log(`   Emails: ${recipientEmails.filter(Boolean).join(', ') || 'none'}\n`);

  // 1. Save in-app notification
  try {
    await db.query(
      `INSERT INTO qc_inspection.notification_event
         (job_id, event_type, recipient_role, recipient_email, channel, message, advice_id, agency_code, supplier_code, buyer_id)
       VALUES ($1, $2, $3, $4, 'in_app', $5, $6, $7, $8, $9)`,
      [jobId || null, eventType, recipientRole, recipientEmails.filter(Boolean).join(',') || null, message, adviceId || null, agencyCode || null, supplierCode || null, buyerId || null]
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
