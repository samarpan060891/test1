import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export async function generateInspectionReport(job, responses = [], logs = []) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 16
  let y = margin

  const blue = [30, 64, 175]
  const gray = [107, 114, 128]
  const dark = [17, 24, 39]

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...blue)
  doc.rect(0, 0, pageW, 26, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('QC Inspection', margin, 11)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Inspection Report', margin, 19)
  doc.setFontSize(9)
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - margin, 11, { align: 'right' })
  doc.text(`Report: ${job.job_ref || 'N/A'}`, pageW - margin, 19, { align: 'right' })
  y = 34

  // ── Status badge ────────────────────────────────────────────────────────────
  const statusLabel = {
    mapped_awaiting_inspection: 'Awaiting Inspection',
    submitted_pending_qa: 'Submitted — Pending QA',
    qa_approved: 'QA Approved',
    qa_rejected: 'QA Rejected',
  }
  const statusColors = {
    mapped_awaiting_inspection: [219, 234, 254],
    submitted_pending_qa: [254, 243, 199],
    qa_approved: [209, 250, 229],
    qa_rejected: [254, 226, 226],
  }
  const statusTextColors = {
    mapped_awaiting_inspection: [29, 78, 216],
    submitted_pending_qa: [146, 64, 14],
    qa_approved: [6, 95, 70],
    qa_rejected: [185, 28, 28],
  }
  const statusBg = statusColors[job.status] || [243, 244, 246]
  const statusTc = statusTextColors[job.status] || [55, 65, 81]
  doc.setFillColor(...statusBg)
  doc.roundedRect(margin, y - 5, 60, 8, 2, 2, 'F')
  doc.setTextColor(...statusTc)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(statusLabel[job.status] || job.status, margin + 4, y + 0.5)
  y += 10

  // ── Job Details section ─────────────────────────────────────────────────────
  doc.setTextColor(...dark)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Job Details', margin, y)
  y += 5

  const stageMap = { pre_production: 'Pre-Production', inline: 'Inline', final: 'Final', loading: 'Loading' }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: blue, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, textColor: gray }, 1: { textColor: dark } },
    body: [
      ['Job Reference', job.job_ref || '—'],
      ['PO Number', job.po_no || '—'],
      ['Item Code', job.item_code || '—'],
      ['Item Name', job.item_name || '—'],
      ['Supplier', job.supplier_name || job.supplier_code || '—'],
      ['Inspection Agency', job.agency_name || job.agency_code || '—'],
      ['Inspection Stage', stageMap[job.inspection_stage] || job.inspection_stage || '—'],
      ['Inspection Type', job.inspection_type === 'self' ? 'Self-Inspection' : 'Third-Party Agency'],
      ['Planned Date', job.inspection_date ? new Date(job.inspection_date).toLocaleDateString() : '—'],
      ['Actual Date', job.actual_inspection_date ? new Date(job.actual_inspection_date).toLocaleDateString() : '—'],
      ['Submitted At', job.submitted_at ? new Date(job.submitted_at).toLocaleString() : '—'],
      ['QA Decision At', job.decided_at ? new Date(job.decided_at).toLocaleString() : '—'],
    ],
  })
  y = doc.lastAutoTable.finalY + 8

  // ── QA Outcome ──────────────────────────────────────────────────────────────
  if (job.final_outcome || job.qa_remarks) {
    doc.setTextColor(...dark)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('QA Decision', margin, y)
    y += 5

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: blue, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, textColor: gray }, 1: { textColor: dark } },
      body: [
        ['Final Outcome', job.final_outcome ? job.final_outcome.toUpperCase() : '—'],
        ['QA Remarks', job.qa_remarks || '—'],
      ],
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Checklist Responses ─────────────────────────────────────────────────────
  if (responses.length > 0) {
    doc.setTextColor(...dark)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Checklist Responses', margin, y)
    y += 5

    const sections = {}
    responses.forEach(r => {
      const sec = r.section || 'General'
      if (!sections[sec]) sections[sec] = []
      sections[sec].push(r)
    })

    for (const [section, items] of Object.entries(sections)) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        head: [[{ content: section, colSpan: 4, styles: { fillColor: [239, 246, 255], textColor: blue, fontStyle: 'bold', fontSize: 9 } }],
               ['Checkpoint', 'Criticality', 'Result', 'Remarks']],
        headStyles: { fillColor: [248, 250, 252], textColor: gray, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [253, 253, 254] },
        columnStyles: {
          0: { cellWidth: 80, textColor: dark },
          1: { cellWidth: 25, textColor: gray },
          2: { cellWidth: 20, textColor: dark, fontStyle: 'bold' },
          3: { textColor: gray },
        },
        body: items.map(r => [
          r.checkpoint_text || '—',
          r.criticality || '—',
          (r.result || '—').toUpperCase(),
          r.remarks || '',
        ]),
        didParseCell(data) {
          if (data.column.index === 2 && data.section === 'body') {
            const v = data.cell.raw
            if (v === 'PASS') data.cell.styles.textColor = [6, 95, 70]
            else if (v === 'FAIL') data.cell.styles.textColor = [185, 28, 28]
            else data.cell.styles.textColor = [107, 114, 128]
          }
        },
      })
      y = doc.lastAutoTable.finalY + 4
    }
    y += 4
  }

  // ── Activity Log ─────────────────────────────────────────────────────────────
  if (logs.length > 0) {
    if (y > 220) { doc.addPage(); y = margin }
    doc.setTextColor(...dark)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Activity Log', margin, y)
    y += 5

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: blue, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 28 } },
      head: [['Date', 'Author', 'Message']],
      body: logs.map(l => [
        l.created_at ? new Date(l.created_at).toLocaleString() : '—',
        `${l.author_name || ''}${l.author_role ? ` (${l.author_role})` : ''}`,
        l.message || '',
      ]),
    })
  }

  // ── Footer on every page ─────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(...gray)
    doc.setFont('helvetica', 'normal')
    doc.text(`Page ${i} of ${pageCount}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
    doc.text('QC Inspection System — Confidential', margin, doc.internal.pageSize.getHeight() - 8)
  }

  doc.save(`Inspection-Report-${job.job_ref || job.job_id?.slice(0, 8)}.pdf`)
}
