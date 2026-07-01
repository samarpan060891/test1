const { Resend } = require('resend');

let resendClient = null;

function getResend() {
  if (resendClient) return resendClient;
  if (!process.env.RESEND_API_KEY) return null;
  resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

async function sendEmail({ to, subject, html }) {
  console.log(`📧 [EMAIL ATTEMPT] To: ${to} | Subject: ${subject}`);
  const client = getResend();
  if (!client) {
    console.log(`📧 [EMAIL SKIPPED — no RESEND_API_KEY]`);
    return;
  }

  const recipients = process.env.TEST_EMAIL_TO
    ? [process.env.TEST_EMAIL_TO]
    : (Array.isArray(to) ? to : [to]);

  const testBanner = process.env.TEST_EMAIL_TO
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:12px;color:#92400e;">
        <strong>🧪 TEST MODE</strong> — Original recipient: <code>${Array.isArray(to) ? to.join(', ') : to}</code>
       </div>`
    : '';

  try {
    const { data, error } = await client.emails.send({
      from: 'QC Inspection Portal <onboarding@resend.dev>',
      to: recipients,
      cc: ['samarpan01@gmail.com'],
      subject: process.env.TEST_EMAIL_TO ? `[TEST] ${subject}` : subject,
      html: testBanner + html,
    });
    if (error) {
      console.error(`📧 [EMAIL FAILED] ${subject} | Error: ${JSON.stringify(error)}`);
      throw new Error(error.message);
    }
    console.log(`📧 [EMAIL SENT] To: ${recipients.join(',')} | Subject: ${subject} | Id: ${data?.id}`);
    return data;
  } catch (err) {
    console.error(`📧 [EMAIL FAILED] ${subject} | ${err.message}`);
    throw err;
  }
}

// ─── Email templates ────────────────────────────────────────────────────────

function layout(title, body) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1C1208 0%,#2E1D0E 100%);padding:24px 32px;">
          <h1 style="margin:0;color:#E8470F;font-size:20px;font-weight:800;letter-spacing:-0.5px;">🏠 Homes R Us</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px;">Quality Inspection Portal</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 20px;color:#0f172a;font-size:18px;">${title}</h2>
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
            This is an automated message from the Homes R Us Quality Inspection Portal. Please do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function badge(text, color, bg) {
  return `<span style="background:${bg};color:${color};padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:700;text-transform:uppercase;">${text}</span>`;
}

function jobInfoTable(fields) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0;">
    ${fields.map(([k, v]) => `<tr>
      <td style="padding:10px 14px;background:#f8fafc;font-size:12px;font-weight:700;color:#64748b;width:140px;border-bottom:1px solid #e2e8f0;">${k}</td>
      <td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${v || '—'}</td>
    </tr>`).join('')}
  </table>`;
}

function ctaButton(text, url) {
  if (!url) return '';
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="background:#E8470F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">${text}</a>
  </div>`;
}

const APP_URL = process.env.APP_URL || 'https://your-app.up.railway.app';

// ─── Specific email templates ────────────────────────────────────────────────

function inspectionSubject(poNo, supplierName, itemName, agencyName, suffix) {
  const parts = [poNo, supplierName, itemName].filter(Boolean);
  const agency = agencyName && agencyName !== 'Self Inspection' ? ` - ${agencyName}` : '';
  return `${parts.join(' | ')} | Inspection Report${agency}${suffix ? ` | ${suffix}` : ''}`;
}

function chargesSubject(agencyName, adviceRef, suffix) {
  return `${agencyName || 'Agency'} | ${adviceRef} | Inspection Charges${suffix ? ` | ${suffix}` : ''}`;
}

function emailJobMapped({ jobRef, poNo, itemName, supplierName, agencyName, inspectionDate, stage, jobId }) {
  const jobUrl = jobId ? `${APP_URL}/jobs/${jobId}` : APP_URL;
  return {
    subject: inspectionSubject(poNo, supplierName, itemName, agencyName, 'New Job Mapped'),
    html: layout('New Inspection Job Assigned', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">A new inspection job has been mapped and assigned. Please review the details below.</p>
      ${jobInfoTable([
        ['Job Reference', `<strong style="color:#E8470F;">${jobRef}</strong>`],
        ['PO Number', poNo],
        ['Item', itemName],
        ['Supplier', supplierName],
        ['Agency', agencyName || 'Self Inspection'],
        ['Inspection Date', inspectionDate ? new Date(inspectionDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'],
        ['Stage', stage || '—'],
      ])}
      ${ctaButton('Open Portal →', jobUrl)}
    `),
  };
}

function emailSubmittedForQA({ jobRef, poNo, itemName, supplierName, agencyName, inspectionDate, jobId, failedCheckpoints }) {
  const jobUrl = jobId ? `${APP_URL}/jobs/${jobId}` : APP_URL;

  const failedSection = failedCheckpoints && failedCheckpoints.length > 0
    ? `<div style="margin:20px 0;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#991b1b;">
          ⚠️ ${failedCheckpoints.length} Failed Checkpoint${failedCheckpoints.length > 1 ? 's' : ''}
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fca5a5;border-radius:8px;overflow:hidden;">
          <tr style="background:#fef2f2;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">Section</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">Checkpoint</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">Criticality</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">Remark</th>
          </tr>
          ${failedCheckpoints.map(cp => `
          <tr style="border-bottom:1px solid #fee2e2;">
            <td style="padding:9px 12px;font-size:12px;color:#374151;font-weight:600;">${cp.section || '—'}</td>
            <td style="padding:9px 12px;font-size:12px;color:#374151;">${cp.checkpoint_text || '—'}</td>
            <td style="padding:9px 12px;">
              <span style="background:${cp.criticality === 'critical' ? '#fee2e2' : cp.criticality === 'major' ? '#fef3c7' : '#dbeafe'};
                           color:${cp.criticality === 'critical' ? '#dc2626' : cp.criticality === 'major' ? '#d97706' : '#1d4ed8'};
                           padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;text-transform:uppercase;">
                ${cp.criticality}
              </span>
            </td>
            <td style="padding:9px 12px;font-size:12px;color:#6b7280;font-style:italic;">${cp.remark || '—'}</td>
          </tr>`).join('')}
        </table>
      </div>`
    : `<p style="color:#059669;font-size:13px;margin:16px 0;">✅ All checkpoints passed.</p>`;

  const failSuffix = failedCheckpoints && failedCheckpoints.length > 0
    ? `Submitted - ${failedCheckpoints.length} Failure${failedCheckpoints.length > 1 ? 's' : ''}`
    : 'Submitted for QA Review';
  return {
    subject: inspectionSubject(poNo, supplierName, itemName, agencyName, failSuffix),
    html: layout('Inspection Checklist Submitted', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">An inspection checklist has been submitted and is <strong>pending your QA review</strong>.</p>
      ${jobInfoTable([
        ['Job Reference', `<strong style="color:#E8470F;">${jobRef}</strong>`],
        ['PO Number', poNo],
        ['Item', itemName],
        ['Supplier', supplierName],
        ['Agency', agencyName || '—'],
        ['Inspection Date', inspectionDate ? new Date(inspectionDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'],
      ])}
      ${failedSection}
      ${ctaButton('Review Checklist →', jobUrl)}
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:8px;">
        The full inspection report with photos can be downloaded from the job page after logging in.
      </p>
    `),
  };
}

function emailQAApproved({ jobRef, poNo, itemName, supplierName, agencyName, reviewerName, jobId, remarks }) {
  const jobUrl = jobId ? `${APP_URL}/jobs/${jobId}` : APP_URL;
  return {
    subject: inspectionSubject(poNo, supplierName, itemName, agencyName, 'Approved'),
    html: layout('Inspection Approved by QA', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">
        The inspection has been ${badge('APPROVED', '#15803d', '#f0fdf4')} by QA.
      </p>
      ${jobInfoTable([
        ['Job Reference', `<strong style="color:#E8470F;">${jobRef}</strong>`],
        ['PO Number', poNo],
        ['Item', itemName],
        ['Supplier', supplierName],
        ['Reviewed By', reviewerName || '—'],
      ])}
      ${remarks ? `<div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#15803d;">QA Remarks:</p>
        <p style="margin:6px 0 0;font-size:13px;color:#0f172a;">${remarks}</p>
      </div>` : ''}
      ${ctaButton('View Job →', jobUrl)}
    `),
  };
}

function emailQARejected({ jobRef, poNo, itemName, supplierName, agencyName, reviewerName, remarks, jobId }) {
  const jobUrl = jobId ? `${APP_URL}/jobs/${jobId}` : APP_URL;
  return {
    subject: inspectionSubject(poNo, supplierName, itemName, agencyName, 'Rejected'),
    html: layout('Inspection Rejected by QA', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">
        The inspection has been ${badge('REJECTED', '#991b1b', '#fef2f2')} by QA. Please review the remarks and take necessary action.
      </p>
      ${jobInfoTable([
        ['Job Reference', `<strong style="color:#E8470F;">${jobRef}</strong>`],
        ['PO Number', poNo],
        ['Item', itemName],
        ['Supplier', supplierName],
        ['Reviewed By', reviewerName || '—'],
      ])}
      ${remarks ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#991b1b;">QA Remarks:</p>
        <p style="margin:6px 0 0;font-size:13px;color:#0f172a;">${remarks}</p>
      </div>` : ''}
      ${ctaButton('View Job →', jobUrl)}
    `),
  };
}

function emailChargesSubmitted({ adviceRef, agencyName, totalCost, currency, jobCount, submittedBy }) {
  return {
    subject: chargesSubject(agencyName, adviceRef, 'Submitted'),
    html: layout('Inspection Charges Advice Submitted', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">A new inspection charges advice has been submitted and is pending QA approval.</p>
      ${jobInfoTable([
        ['Advice Reference', `<strong style="color:#E8470F;">${adviceRef}</strong>`],
        ['Agency', agencyName],
        ['Total Amount', `<strong style="color:#E8470F;">${currency || 'USD'} ${parseFloat(totalCost || 0).toFixed(2)}</strong>`],
        ['Jobs Covered', jobCount || '—'],
        ['Submitted By', submittedBy || '—'],
      ])}
      ${ctaButton('Review Charges →', `${APP_URL}`)}
    `),
  };
}

function emailChargesApproved({ adviceRef, agencyName, totalCost, currency, approvedBy, nextStep, notes }) {
  return {
    subject: chargesSubject(agencyName, adviceRef, 'Approved'),
    html: layout('Inspection Charges Approved', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">
        Inspection charges advice has been ${badge('APPROVED', '#15803d', '#f0fdf4')}.
        ${nextStep ? `<br><br>Next step: <strong>${nextStep}</strong>` : ''}
      </p>
      ${jobInfoTable([
        ['Advice Reference', `<strong style="color:#E8470F;">${adviceRef}</strong>`],
        ['Agency', agencyName],
        ['Total Amount', `<strong>${currency || 'USD'} ${parseFloat(totalCost || 0).toFixed(2)}</strong>`],
        ['Approved By', approvedBy || '—'],
      ])}
      ${notes ? `<div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#15803d;">Remarks:</p>
        <p style="margin:6px 0 0;font-size:13px;color:#0f172a;">${notes}</p>
      </div>` : ''}
      ${ctaButton('View Charges →', `${APP_URL}`)}
    `),
  };
}

function emailChargesRejected({ adviceRef, agencyName, totalCost, currency, rejectedBy, reason }) {
  return {
    subject: chargesSubject(agencyName, adviceRef, 'Rejected'),
    html: layout('Inspection Charges Rejected', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">
        Inspection charges advice has been ${badge('REJECTED', '#991b1b', '#fef2f2')}.
      </p>
      ${jobInfoTable([
        ['Advice Reference', `<strong style="color:#E8470F;">${adviceRef}</strong>`],
        ['Agency', agencyName],
        ['Total Amount', `${currency || 'USD'} ${parseFloat(totalCost || 0).toFixed(2)}`],
        ['Rejected By', rejectedBy || '—'],
      ])}
      ${reason ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#991b1b;">Reason:</p>
        <p style="margin:6px 0 0;font-size:13px;color:#0f172a;">${reason}</p>
      </div>` : ''}
      ${ctaButton('View Charges →', `${APP_URL}`)}
    `),
  };
}

function emailRemarkPosted({ jobRef, poNo, itemName, supplierName, agencyName, remarkText, postedBy, postedByRole, jobId }) {
  const jobUrl = jobId ? `${APP_URL}/jobs/${jobId}` : APP_URL;
  return {
    subject: inspectionSubject(poNo, supplierName, itemName, agencyName, 'New Remark'),
    html: layout('New Remark Posted', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">A new remark has been posted on inspection job <strong>${jobRef}</strong>.</p>
      ${jobInfoTable([
        ['Job Reference', `<strong style="color:#E8470F;">${jobRef}</strong>`],
        ['PO Number', poNo],
        ['Posted By', `${postedBy || '—'} (${postedByRole || ''})`],
      ])}
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Remark</p>
        <p style="margin:8px 0 0;font-size:14px;color:#0f172a;line-height:1.5;">"${remarkText}"</p>
      </div>
      ${ctaButton('View Job →', jobUrl)}
    `),
  };
}

// ─── Document Control email templates ───────────────────────────────────────

const DOC_TYPE_LABELS = {
  product_image: 'Product Image',
  bill_of_materials: 'Bill of Materials',
  msds: 'Materials Safety Data Sheet',
  swatch_details: 'Swatch Details',
  test_reports: 'Test Reports',
  cb_reports: 'CB Reports',
  line_drawings: 'Line Drawings',
  assembly_instruction_manual: 'Assembly Instruction Manual',
  user_care_manual: 'User Care Manual',
  barcode: 'Barcode',
  carton_artwork_shipping_mark: 'Carton Artwork & Shipping Mark',
  hs_code: 'HS Code',
  metrological_data: 'Metrological Data (L×B×H & Net Weight)',
};

function emailDocUploadRequired({ supplierName, poNo, itemNames, docTypes }) {
  const itemList = Array.isArray(itemNames) ? itemNames : [itemNames];
  const docList = Array.isArray(docTypes) ? docTypes : Object.keys(DOC_TYPE_LABELS);
  return {
    subject: `Document Upload Required — PO ${poNo} | ${supplierName}`,
    html: layout('Document Upload Required', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">
        A new Purchase Order has been raised and requires you to upload the following documents for each item.
        Please log in to the supplier portal to upload the required documents.
      </p>
      ${jobInfoTable([
        ['PO Number', `<strong style="color:#E8470F;">${poNo}</strong>`],
        ['Supplier', supplierName],
        ['Items', itemList.join(', ')],
      ])}
      <div style="margin:20px 0;">
        <p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 10px;">Required Documents:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          ${docList.map((dt, i) => `
          <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'};">
            <td style="padding:9px 14px;font-size:12px;color:#374151;border-bottom:1px solid #e2e8f0;">
              ${i + 1}. ${DOC_TYPE_LABELS[dt] || dt}
            </td>
          </tr>`).join('')}
        </table>
      </div>
      ${ctaButton('Upload Documents →', APP_URL + '/documents')}
    `),
  };
}

function emailDocUploaded({ supplierName, itemName, docType, uploadedBy }) {
  const label = DOC_TYPE_LABELS[docType] || docType;
  return {
    subject: `Document Uploaded — ${label} | ${itemName} | ${supplierName}`,
    html: layout('Document Uploaded — Pending Review', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">
        A document has been uploaded and is ${badge('PENDING REVIEW', '#92400e', '#fef3c7')}.
        Please review and approve or reject the document.
      </p>
      ${jobInfoTable([
        ['Document Type', `<strong>${label}</strong>`],
        ['Item', itemName],
        ['Supplier', supplierName],
        ['Uploaded By', uploadedBy || '—'],
      ])}
      ${ctaButton('Review Document →', APP_URL + '/documents')}
    `),
  };
}

function emailDocReviewed({ supplierName, itemName, docType, action, remarks, reviewerName }) {
  const label = DOC_TYPE_LABELS[docType] || docType;
  const approved = action === 'approve';
  const statusBadge = approved
    ? badge('APPROVED', '#15803d', '#f0fdf4')
    : badge('REJECTED', '#991b1b', '#fef2f2');
  const remarksBlock = remarks
    ? `<div style="background:${approved ? '#f0fdf4' : '#fef2f2'};border-left:4px solid ${approved ? '#16a34a' : '#dc2626'};padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;">
        <p style="margin:0;font-size:13px;font-weight:700;color:${approved ? '#15803d' : '#991b1b'};">Remarks:</p>
        <p style="margin:6px 0 0;font-size:13px;color:#0f172a;">${remarks}</p>
      </div>`
    : '';
  return {
    subject: `Document ${approved ? 'Approved' : 'Rejected'} — ${label} | ${itemName} | ${supplierName}`,
    html: layout(`Document ${approved ? 'Approved' : 'Rejected'}`, `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">
        Your document has been ${statusBadge}.
      </p>
      ${jobInfoTable([
        ['Document Type', `<strong>${label}</strong>`],
        ['Item', itemName],
        ['Supplier', supplierName],
        ['Reviewed By', reviewerName || '—'],
      ])}
      ${remarksBlock}
      ${ctaButton('View Documents →', APP_URL + '/documents')}
    `),
  };
}

function emailWhSubmittedForQA({ poNo, itemName, supplierName, stage, failedCheckpoints, inspectionId }) {
  const url = inspectionId ? `${APP_URL}/warehouse-inspections/${inspectionId}` : `${APP_URL}/warehouse-inspections`;
  const stageLabel = stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : '—';
  const failedSection = failedCheckpoints && failedCheckpoints.length > 0
    ? `<div style="margin:16px 0;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#991b1b;">⚠️ ${failedCheckpoints.length} Failed Checkpoint${failedCheckpoints.length > 1 ? 's' : ''}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fca5a5;border-radius:8px;overflow:hidden;">
          <tr style="background:#fef2f2;">
            <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#991b1b;text-align:left;border-bottom:1px solid #fca5a5;">Section</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#991b1b;text-align:left;border-bottom:1px solid #fca5a5;">Checkpoint</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#991b1b;text-align:left;border-bottom:1px solid #fca5a5;">Criticality</th>
          </tr>
          ${failedCheckpoints.map(cp => `<tr style="border-bottom:1px solid #fee2e2;">
            <td style="padding:8px 12px;font-size:12px;color:#374151;font-weight:600;">${cp.section || '—'}</td>
            <td style="padding:8px 12px;font-size:12px;color:#374151;">${cp.checkpoint_text || '—'}</td>
            <td style="padding:8px 12px;"><span style="background:${cp.criticality === 'critical' ? '#fee2e2' : '#fef3c7'};color:${cp.criticality === 'critical' ? '#dc2626' : '#d97706'};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;">${cp.criticality}</span></td>
          </tr>`).join('')}
        </table>
      </div>`
    : `<p style="color:#059669;font-size:13px;margin:12px 0;">✅ All checkpoints passed.</p>`;
  return {
    subject: `Warehouse Inspection Submitted for QA Review — ${itemName || poNo} | ${stageLabel}`,
    html: layout('Warehouse Inspection Submitted for QA Review', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">A warehouse inspection has been submitted and is <strong>pending your QA review</strong>.</p>
      ${jobInfoTable([
        ['PO Number', poNo || '—'],
        ['Item', itemName || '—'],
        ['Supplier', supplierName || '—'],
        ['Stage', stageLabel],
      ])}
      ${failedSection}
      ${ctaButton('Review Inspection →', url)}
    `),
  };
}

function emailWhQAApproved({ poNo, itemName, supplierName, stage, reviewerName, remarks, inspectionId }) {
  const url = inspectionId ? `${APP_URL}/warehouse-inspections/${inspectionId}` : `${APP_URL}/warehouse-inspections`;
  return {
    subject: `Warehouse Inspection Approved — ${itemName || poNo} | ${stage || ''}`,
    html: layout('Warehouse Inspection Approved by QA', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">Your warehouse inspection has been ${badge('APPROVED', '#15803d', '#f0fdf4')} by QA.</p>
      ${jobInfoTable([
        ['PO Number', poNo || '—'],
        ['Item', itemName || '—'],
        ['Supplier', supplierName || '—'],
        ['Stage', stage || '—'],
        ['Reviewed By', reviewerName || '—'],
      ])}
      ${remarks ? `<div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#15803d;">QA Remarks:</p>
        <p style="margin:6px 0 0;font-size:13px;color:#0f172a;">${remarks}</p>
      </div>` : ''}
      ${ctaButton('View Inspection →', url)}
    `),
  };
}

function emailWhQARejected({ poNo, itemName, supplierName, stage, reviewerName, remarks, inspectionId }) {
  const url = inspectionId ? `${APP_URL}/warehouse-inspections/${inspectionId}` : `${APP_URL}/warehouse-inspections`;
  return {
    subject: `Warehouse Inspection Rejected — ${itemName || poNo} | ${stage || ''}`,
    html: layout('Warehouse Inspection Rejected by QA', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">Your warehouse inspection has been ${badge('REJECTED', '#991b1b', '#fef2f2')} by QA. Please review the remarks and take action.</p>
      ${jobInfoTable([
        ['PO Number', poNo || '—'],
        ['Item', itemName || '—'],
        ['Supplier', supplierName || '—'],
        ['Stage', stage || '—'],
        ['Reviewed By', reviewerName || '—'],
      ])}
      ${remarks ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#991b1b;">QA Remarks:</p>
        <p style="margin:6px 0 0;font-size:13px;color:#0f172a;">${remarks}</p>
      </div>` : ''}
      ${ctaButton('View Inspection →', url)}
    `),
  };
}

function emailInspectionOverdueDigest({ jobs }) {
  const rows = jobs.map(j => {
    const daysOverdue = Math.floor((Date.now() - new Date(j.inspection_date)) / (1000 * 60 * 60 * 24))
    const color = daysOverdue >= 7 ? '#dc2626' : '#d97706'
    const bg    = daysOverdue >= 7 ? '#fef2f2' : '#fef3c7'
    return `<tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#E8470F;">${j.job_ref}</td>
      <td style="padding:10px 14px;font-size:12px;color:#374151;">${j.po_no}</td>
      <td style="padding:10px 14px;font-size:12px;color:#374151;">${j.item_name || '—'}</td>
      <td style="padding:10px 14px;font-size:12px;color:#374151;">${j.supplier_name || '—'}</td>
      <td style="padding:10px 14px;font-size:12px;color:#374151;">${j.agency_name || 'Self'}</td>
      <td style="padding:10px 14px;font-size:12px;color:#374151;">${new Date(j.inspection_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</td>
      <td style="padding:10px 14px;">
        <span style="background:${bg};color:${color};padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:700;">${daysOverdue}d overdue</span>
      </td>
    </tr>`
  }).join('')

  return {
    subject: `⚠️ Overdue Inspection Alert — ${jobs.length} job${jobs.length > 1 ? 's' : ''} awaiting inspection`,
    html: layout(`⚠️ ${jobs.length} Overdue Inspection${jobs.length > 1 ? 's' : ''}`, `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">
        The following inspection job${jobs.length > 1 ? 's are' : ' is'} <strong style="color:#dc2626;">overdue</strong> —
        the scheduled inspection date has passed and the job is still awaiting inspection.
        Please take immediate action.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0;">
        <tr style="background:#fef2f2;">
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">Job Ref</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">PO No</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">Item</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">Supplier</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">Agency</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">Inspection Date</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;border-bottom:1px solid #fca5a5;">Overdue By</th>
        </tr>
        ${rows}
      </table>
      ${ctaButton('View All Jobs →', APP_URL)}
      <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:8px;">
        This reminder is sent daily until the inspection is completed or rescheduled.
      </p>
    `),
  }
}

function emailPaymentOverdueDigest({ advices, targetRole }) {
  const roleLabel = targetRole === 'imports' ? 'Imports Approval' : 'Accounts Payment'
  const accentColor = targetRole === 'imports' ? '#7e22ce' : '#0f766e'
  const accentBg    = targetRole === 'imports' ? '#faf5ff' : '#f0fdfa'
  const borderColor = targetRole === 'imports' ? '#c4b5fd' : '#99f6e4'

  const rows = advices.map(a => {
    const pendingSince = a.status === 'pending_imports' ? a.buying_approved_at : a.imports_approved_at
    const daysOverdue = pendingSince
      ? Math.floor((Date.now() - new Date(pendingSince)) / (1000 * 60 * 60 * 24))
      : null
    const color = daysOverdue >= 14 ? '#dc2626' : daysOverdue >= 7 ? '#d97706' : '#15803d'
    const bg    = daysOverdue >= 14 ? '#fef2f2' : daysOverdue >= 7 ? '#fef3c7' : '#dcfce7'
    return `<tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#E8470F;">${a.job_ref || '—'}</td>
      <td style="padding:10px 14px;font-size:12px;color:#374151;">${a.po_no || '—'}</td>
      <td style="padding:10px 14px;font-size:12px;color:#374151;">${a.item_name || '—'}</td>
      <td style="padding:10px 14px;font-size:12px;color:#374151;">${a.supplier_name || '—'}</td>
      <td style="padding:10px 14px;font-size:12px;color:#374151;">${a.agency_name || 'Self'}</td>
      <td style="padding:10px 14px;font-size:12px;color:#374151;">${pendingSince ? new Date(pendingSince).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'}</td>
      <td style="padding:10px 14px;">
        ${daysOverdue !== null ? `<span style="background:${bg};color:${color};padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:700;">${daysOverdue}d pending</span>` : '—'}
      </td>
    </tr>`
  }).join('')

  return {
    subject: `💰 Payment Action Required — ${advices.length} advice${advices.length > 1 ? 's' : ''} pending ${roleLabel}`,
    html: layout(`💰 ${advices.length} Advice${advices.length > 1 ? 's' : ''} Pending ${roleLabel}`, `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">
        The following inspection charge advice${advices.length > 1 ? 's are' : ' is'} awaiting
        <strong style="color:${accentColor};">${roleLabel}</strong>.
        Please review and take action.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0;">
        <tr style="background:${accentBg};">
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;border-bottom:1px solid ${borderColor};">Job Ref</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;border-bottom:1px solid ${borderColor};">PO No</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;border-bottom:1px solid ${borderColor};">Item</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;border-bottom:1px solid ${borderColor};">Supplier</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;border-bottom:1px solid ${borderColor};">Agency</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;border-bottom:1px solid ${borderColor};">Pending Since</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;border-bottom:1px solid ${borderColor};">Waiting</th>
        </tr>
        ${rows}
      </table>
      ${ctaButton('Review Pending Payments →', APP_URL + '/inspection-costs')}
      <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:8px;">
        This reminder is sent daily until the payment advice is processed.
      </p>
    `),
  }
}

module.exports = {
  sendEmail,
  emailWhSubmittedForQA,
  emailWhQAApproved,
  emailWhQARejected,
  emailJobMapped,
  emailSubmittedForQA,
  emailQAApproved,
  emailQARejected,
  emailChargesSubmitted,
  emailChargesApproved,
  emailChargesRejected,
  emailRemarkPosted,
  emailDocUploadRequired,
  emailDocUploaded,
  emailDocReviewed,
  emailInspectionOverdueDigest,
  emailPaymentOverdueDigest,
};
