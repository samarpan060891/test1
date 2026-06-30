import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const apiBase = import.meta.env.VITE_API_URL || ''

async function fetchImageAsBase64(url) {
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result) // data:image/...;base64,...
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

// Draw a grid of images (up to 4 per row). Returns new y after the grid.
function drawImageGrid(doc, images, startY, margin, pageW) {
  if (!images.length) return startY
  const pageH = doc.internal.pageSize.getHeight()
  const cols = Math.min(images.length, 4)
  const gap = 3
  const totalGap = gap * (cols - 1)
  const cellW = (pageW - margin * 2 - totalGap) / cols
  const cellH = cellW * 0.75 // 4:3 aspect

  let x = margin
  let y = startY

  images.forEach((img, i) => {
    if (i > 0 && i % cols === 0) {
      x = margin
      y += cellH + gap + 5 // row gap
    }
    // page break
    if (y + cellH > pageH - 16) {
      doc.addPage()
      y = 20
    }
    try {
      // Determine image format from data URL
      const fmt = img.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(img, fmt, x, y, cellW, cellH, undefined, 'MEDIUM')
    } catch {}
    // thin border
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.2)
    doc.rect(x, y, cellW, cellH)
    x += cellW + gap
  })

  return y + cellH + 6
}

export async function generateInspectionReport(job, responses = [], logs = [], jobId = null) {
  const resolvedJobId = jobId || job?.job_id || job?.id
  const token = localStorage.getItem('token')

  // Fetch images and video links in parallel
  let allImages = []
  let videoLinks = []
  if (resolvedJobId) {
    try {
      const [imgRes, vidRes] = await Promise.all([
        fetch(`${apiBase}/api/checklist-images/${resolvedJobId}/images`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiBase}/api/checklist-images/${resolvedJobId}/video-links`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      if (imgRes.ok) allImages = await imgRes.json()
      if (vidRes.ok) videoLinks = await vidRes.json()
    } catch {}
  }

  // Pre-load all images as base64 in parallel
  const base64Map = {}
  await Promise.all(
    allImages.map(async (img) => {
      const b64 = await fetchImageAsBase64(
        `${apiBase}/api/checklist-images/${resolvedJobId}/images/${img.image_id}/file`
      )
      if (b64) base64Map[img.image_id] = b64
    })
  )

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
  doc.text('Quality Inspection Portal', margin, 11)
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
          r.remark || r.remarks || '',
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

      // Section images — look for images whose section_key matches itemCode__section
      // We match by the section name portion (after the last __)
      const sectionImgs = allImages.filter(img => {
        const key = img.section_key || ''
        const parts = key.split('__')
        const sectionPart = parts.slice(1).join('__')
        return sectionPart === section && key !== '__defects__'
      })
      const sectionB64 = sectionImgs.map(img => base64Map[img.image_id]).filter(Boolean)

      if (sectionB64.length > 0) {
        if (y + 10 > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20 }
        doc.setFontSize(8)
        doc.setTextColor(...gray)
        doc.setFont('helvetica', 'bold')
        doc.text(`Photos — ${section} (${sectionB64.length})`, margin, y + 4)
        y += 8
        y = drawImageGrid(doc, sectionB64, y, margin, pageW)
        y += 4
      }
    }
    y += 4
  }

  // ── Defect Images ───────────────────────────────────────────────────────────
  const defectImgs = allImages.filter(img => img.section_key === '__defects__')
  const defectB64 = defectImgs.map(img => base64Map[img.image_id]).filter(Boolean)

  if (defectB64.length > 0) {
    if (y + 14 > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20 }
    doc.setFillColor(127, 29, 29)
    doc.rect(margin, y, pageW - margin * 2, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`Defect Images (${defectB64.length})`, margin + 4, y + 5.5)
    y += 12
    y = drawImageGrid(doc, defectB64, y, margin, pageW)
    y += 6
  }

  // ── Video Links ─────────────────────────────────────────────────────────────
  if (videoLinks.length > 0) {
    if (y + 14 > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20 }
    doc.setTextColor(...dark)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Video Links', margin, y)
    y += 5

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: blue, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 40, textColor: gray }, 1: { textColor: [29, 78, 216] } },
      head: [['Label', 'Link']],
      body: videoLinks.map(l => [l.label || '—', l.url]),
    })
    y = doc.lastAutoTable.finalY + 8
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
    doc.text('Quality Inspection Portal System — Confidential', margin, doc.internal.pageSize.getHeight() - 8)
  }

  doc.save(`Inspection-Report-${job.job_ref || job.job_id?.slice(0, 8)}.pdf`)
}
