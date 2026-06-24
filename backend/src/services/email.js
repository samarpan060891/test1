const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

/**
 * Send an email.
 * In test mode (TEST_EMAIL_TO set), all emails are redirected to that address.
 *
 * @param {{ to: string|string[], subject: string, html: string, text?: string }} opts
 */
async function sendEmail({ to, subject, html, text }) {
  console.log(`📧 [EMAIL ATTEMPT] To: ${to} | Subject: ${subject}`);
  console.log(`📧 [EMAIL ENV] GMAIL_USER=${process.env.GMAIL_USER || 'NOT SET'} | TEST_EMAIL_TO=${process.env.TEST_EMAIL_TO || 'NOT SET'} | APP_PASSWORD=${process.env.GMAIL_APP_PASSWORD ? 'SET' : 'NOT SET'}`);
  const transport = getTransporter();
  if (!transport) {
    console.log(`📧 [EMAIL SKIPPED — no credentials] To: ${to} | Subject: ${subject}`);
    return;
  }

  const recipient = process.env.TEST_EMAIL_TO || (Array.isArray(to) ? to.join(',') : to);
  const testBanner = process.env.TEST_EMAIL_TO
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:12px;color:#92400e;">
        <strong>🧪 TEST MODE</strong> — Original recipient: <code>${Array.isArray(to) ? to.join(', ') : to}</code>
       </div>`
    : '';

  let info;
  try {
    info = await transport.sendMail({
      from: `"QC Inspection Portal" <${process.env.GMAIL_USER}>`,
      to: recipient,
      subject: process.env.TEST_EMAIL_TO ? `[TEST] ${subject}` : subject,
      html: testBanner + html,
      text: text || '',
    });
    console.log(`📧 [EMAIL SENT] To: ${recipient} | Subject: ${subject} | MsgId: ${info.messageId}`);
  } catch (err) {
    console.error(`📧 [EMAIL FAILED] To: ${recipient} | Subject: ${subject}`);
    console.error(`📧 [EMAIL FAILED] Code: ${err.code} | Response: ${err.response} | Message: ${err.message}`);
    throw err;
  }
  return info;
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

function emailJobMapped({ jobRef, poNo, itemName, supplierName, agencyName, inspectionDate, stage }) {
  return {
    subject: `New Inspection Job Mapped — ${jobRef}`,
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
      ${ctaButton('View Job →', `${APP_URL}/jobs`)}
    `),
  };
}

function emailSubmittedForQA({ jobRef, poNo, itemName, supplierName, agencyName, inspectionDate }) {
  return {
    subject: `Checklist Submitted for QA Review — ${jobRef}`,
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
      ${ctaButton('Review Checklist →', `${APP_URL}/jobs`)}
    `),
  };
}

function emailQAApproved({ jobRef, poNo, itemName, supplierName, reviewerName }) {
  return {
    subject: `✅ Inspection Approved — ${jobRef}`,
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
      ${ctaButton('View Job →', `${APP_URL}/jobs`)}
    `),
  };
}

function emailQARejected({ jobRef, poNo, itemName, supplierName, reviewerName, remarks }) {
  return {
    subject: `❌ Inspection Rejected — ${jobRef}`,
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
      ${ctaButton('View Job →', `${APP_URL}/jobs`)}
    `),
  };
}

function emailChargesSubmitted({ adviceRef, agencyName, totalCost, currency, jobCount, submittedBy }) {
  return {
    subject: `Inspection Charges Submitted — ${adviceRef}`,
    html: layout('Inspection Charges Advice Submitted', `
      <p style="color:#475569;font-size:14px;margin:0 0 16px;">A new inspection charges advice has been submitted and is pending QA approval.</p>
      ${jobInfoTable([
        ['Advice Reference', `<strong style="color:#E8470F;">${adviceRef}</strong>`],
        ['Agency', agencyName],
        ['Total Amount', `<strong style="color:#E8470F;">${currency || 'USD'} ${parseFloat(totalCost || 0).toFixed(2)}</strong>`],
        ['Jobs Covered', jobCount || '—'],
        ['Submitted By', submittedBy || '—'],
      ])}
      ${ctaButton('Review Charges →', `${APP_URL}/inspection-costs`)}
    `),
  };
}

function emailChargesApproved({ adviceRef, agencyName, totalCost, currency, approvedBy, nextStep }) {
  return {
    subject: `Charges Approved — ${adviceRef}`,
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
      ${ctaButton('View Charges →', `${APP_URL}/inspection-costs`)}
    `),
  };
}

function emailChargesRejected({ adviceRef, agencyName, totalCost, currency, rejectedBy, reason }) {
  return {
    subject: `❌ Charges Rejected — ${adviceRef}`,
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
      ${ctaButton('View Charges →', `${APP_URL}/inspection-costs`)}
    `),
  };
}

function emailRemarkPosted({ jobRef, poNo, remarkText, postedBy, postedByRole }) {
  return {
    subject: `New Remark on Job ${jobRef}`,
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
      ${ctaButton('View Job →', `${APP_URL}/jobs`)}
    `),
  };
}

module.exports = {
  sendEmail,
  emailJobMapped,
  emailSubmittedForQA,
  emailQAApproved,
  emailQARejected,
  emailChargesSubmitted,
  emailChargesApproved,
  emailChargesRejected,
  emailRemarkPosted,
};
