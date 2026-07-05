import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

async function fetchImageAsBase64(url) {
  try {
    const token = sessionStorage.getItem(`token_${window.name}`)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

const STATUS_LABEL = {
  pending_qa: 'Pending QA Review', pending_buying: 'Pending Buying',
  pending_imports: 'Pending Imports', pending_accounts: 'Pending Accounts',
  closed: 'Closed', settled: 'Settled', submitted: 'Submitted', withdrawn: 'Withdrawn',
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * One-pager landscape defect-claim report, print/share ready.
 * @param claim  full claim object (from getClaim)
 * @param attachments  [{ attachment_id, kind, file_name }]
 * @param money  (n) => formatted currency string
 * @param apiFileUrl (attachment_id) => relative URL for the file
 */
export async function generateClaimReport(claim, attachments = [], money = (n) => `$${Number(n || 0).toFixed(2)}`, apiFileUrl) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()   // 297
  const pageH = doc.internal.pageSize.getHeight()  // 210
  const M = 10
  const ORANGE = [232, 71, 15]
  const DARK = [28, 18, 8]
  const GREY = [100, 116, 139]

  // ── Header band ──
  doc.setFillColor(...DARK)
  doc.rect(0, 0, pageW, 20, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text('DEFECT CLAIM REPORT', M, 9)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.setTextColor(232, 71, 15)
  doc.text(`${claim.claim_ref || ''}`, M, 15)
  doc.setTextColor(200, 200, 200)
  doc.text('Homes R Us — Quality Inspection Portal', pageW - M, 9, { align: 'right' })
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(`Status: ${STATUS_LABEL[claim.status] || claim.status}`, pageW - M, 15, { align: 'right' })

  const defectQty = Number(claim.defect_qty || 0)
  const checkedQty = Number(claim.checked_qty || 0)
  const defectPct = checkedQty > 0 ? ((defectQty / checkedQty) * 100).toFixed(1) + '%' : '—'
  const poValue = Number(claim.po_value || 0)
  const defectValue = Number(claim.defect_value || 0)
  const total = Number(claim.claim_amount || 0) + Number(claim.penalty_amount || 0)

  // Column layout: left (identity), middle (QC stats + dates), right (images)
  const colGap = 5
  const leftW = 92
  const midW = 92
  const rightX = M + leftW + colGap + midW + colGap
  const rightW = pageW - M - rightX
  let topY = 25

  // ── Left column: Identity + description ──
  autoTable(doc, {
    startY: topY, margin: { left: M }, tableWidth: leftW,
    theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [226, 232, 240], textColor: [30, 41, 59] },
    headStyles: { fillColor: ORANGE, textColor: 255, fontSize: 8 },
    columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold', textColor: GREY }, 1: { cellWidth: leftW - 30 } },
    head: [[{ content: 'PO & SUPPLIER', colSpan: 2 }]],
    body: [
      ['PO No.', claim.po_no || '—'],
      ['Item', `${claim.item_name || claim.item_code || '—'}${claim.item_code ? ` (${claim.item_code})` : ''}`],
      ['Supplier', claim.supplier_name || claim.supplier_code || '—'],
      ['Country of Origin', claim.country_of_origin || claim.supplier_country || '—'],
      ['Trigger Point', claim.trigger_point || '—'],
    ],
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 2, margin: { left: M }, tableWidth: leftW,
    theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [226, 232, 240], textColor: [30, 41, 59] },
    headStyles: { fillColor: DARK, textColor: 255, fontSize: 8 },
    head: [['ISSUE DESCRIPTION']],
    body: [[claim.description || '—']],
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 2, margin: { left: M }, tableWidth: leftW,
    theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [226, 232, 240], textColor: [30, 41, 59] },
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 8 },
    columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold', textColor: GREY }, 1: { cellWidth: leftW - 30 } },
    head: [[{ content: 'ROOT CAUSE & ACTIONS', colSpan: 2 }]],
    body: [
      ['Root Cause', claim.root_cause || '—'],
      ['Corrective', claim.corrective_action || '—'],
      ['Preventive', claim.preventive_action || '—'],
      ['Rework Possible', claim.rework_possible === true ? 'Yes' : claim.rework_possible === false ? 'No' : '—'],
      ['Rework Scope', claim.rework_scope || '—'],
    ],
  })

  // ── Middle column: QC statistics + cost + dates ──
  const midX = M + leftW + colGap
  autoTable(doc, {
    startY: topY, margin: { left: midX }, tableWidth: midW,
    theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [226, 232, 240], textColor: [30, 41, 59] },
    headStyles: { fillColor: ORANGE, textColor: 255, fontSize: 8 },
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: GREY }, 1: { cellWidth: midW - 42, halign: 'right' } },
    head: [[{ content: 'QC STATISTICS', colSpan: 2 }]],
    body: [
      ['PO Qty', String(claim.po_qty ?? '—')],
      ['Checked Qty', String(claim.checked_qty ?? '—')],
      ['Defect Qty', String(claim.defect_qty ?? '—')],
      ['% Defect', defectPct],
      ['PO Value', money(poValue)],
      ['Defect Value', money(defectValue)],
    ],
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 2, margin: { left: midX }, tableWidth: midW,
    theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [226, 232, 240], textColor: [30, 41, 59] },
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 8 },
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: GREY }, 1: { cellWidth: midW - 42, halign: 'right' } },
    head: [[{ content: 'CLAIM & COST', colSpan: 2 }]],
    body: [
      ['Claim Amount', money(Number(claim.claim_amount || 0))],
      ['Penalty', money(Number(claim.penalty_amount || 0))],
      ['Rework Cost', claim.rework_cost != null ? money(Number(claim.rework_cost)) : '—'],
      ['Settlement Mode', claim.settlement_mode || '—'],
      ['Credit Note', claim.credit_note_no || '—'],
      [{ content: 'TOTAL CLAIM', styles: { fontStyle: 'bold', textColor: ORANGE } }, { content: money(total), styles: { fontStyle: 'bold', textColor: ORANGE } }],
    ],
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 2, margin: { left: midX }, tableWidth: midW,
    theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [226, 232, 240], textColor: [30, 41, 59] },
    headStyles: { fillColor: DARK, textColor: 255, fontSize: 8 },
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: GREY }, 1: { cellWidth: midW - 42, halign: 'right' } },
    head: [[{ content: 'KEY DATES', colSpan: 2 }]],
    body: [
      ['PO / GRN Date', fmtDate(claim.grn_date || claim.po_order_date)],
      ['Issue Trigger Date', fmtDate(claim.trigger_date)],
      ['QC Done Date', fmtDate(claim.qc_done_date)],
      ['Claim Raised', fmtDate(claim.raised_at)],
      ['Root Cause Identified', fmtDate(claim.root_cause_date || claim.qa_reviewed_at)],
      ['Closed / Settled', fmtDate(claim.accounts_closed_at || claim.settled_at)],
    ],
  })

  // ── Right column: defect images ──
  doc.setFillColor(...ORANGE)
  doc.rect(rightX, topY, rightW, 5, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text('DEFECT IMAGES', rightX + 1.5, topY + 3.6)

  const imgs = attachments.filter(a => a.kind === 'defect_image').slice(0, 4)
  let iy = topY + 7
  const imgCellW = rightW
  const imgCellH = 33
  if (imgs.length === 0) {
    doc.setDrawColor(226, 232, 240); doc.setFillColor(248, 250, 252)
    doc.rect(rightX, iy, rightW, 30, 'FD')
    doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text('No images attached', rightX + rightW / 2, iy + 16, { align: 'center' })
  } else {
    for (const a of imgs) {
      if (iy + imgCellH > pageH - 14) break
      const data = apiFileUrl ? await fetchImageAsBase64(apiFileUrl(a.attachment_id)) : null
      doc.setDrawColor(226, 232, 240)
      if (data) {
        try {
          const fmt = data.startsWith('data:image/png') ? 'PNG' : 'JPEG'
          doc.addImage(data, fmt, rightX, iy, imgCellW, imgCellH, undefined, 'MEDIUM')
        } catch {}
      } else {
        doc.setFillColor(248, 250, 252); doc.rect(rightX, iy, imgCellW, imgCellH, 'F')
      }
      doc.rect(rightX, iy, imgCellW, imgCellH)
      iy += imgCellH + 2
    }
  }

  // ── Footer ──
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2)
  doc.line(M, pageH - 11, pageW - M, pageH - 11)
  doc.setTextColor(...GREY); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
  doc.text(`Raised by: ${claim.raised_by_name || '—'}   |   QA: ${claim.qa_reviewed_by_name || '—'}   |   Buying: ${claim.buying_submitted_by_name || '—'}   |   Imports: ${claim.imports_reviewed_by_name || '—'}   |   Accounts: ${claim.accounts_closed_by_name || '—'}`, M, pageH - 7)
  doc.text(`Generated ${fmtDateTime(new Date())}`, pageW - M, pageH - 7, { align: 'right' })
  if (claim.deduction_remarks) {
    doc.setTextColor(21, 128, 61)
    doc.text(`Deduction: ${claim.deduction_remarks}`.slice(0, 140), M, pageH - 3.5)
  }

  doc.save(`${claim.claim_ref || 'claim'}_report.pdf`)
}
