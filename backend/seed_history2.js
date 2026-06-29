require('dotenv').config();
const db = require('./src/db');
const fs = require('fs');

const LOG = (msg) => {
  fs.appendFileSync('/tmp/seed_out.txt', msg + '\n');
  console.log(msg);
};

const COMPLAINTS = [
  { complaint_ref: 'CMP-001', days_ago: 320, customer_name: 'Homebase UK', description: 'Product paint finish peeling off after 3 months of use', severity: 'high', status: 'resolved', resolution: 'Supplier updated coating process; new batch tested and confirmed pass' },
  { complaint_ref: 'CMP-002', days_ago: 280, customer_name: 'B&Q Retail', description: 'Packaging damaged in transit causing product scratches on 12% of units', severity: 'medium', status: 'resolved', resolution: 'Improved inner foam padding specification; added to packing checklist' },
  { complaint_ref: 'CMP-003', days_ago: 200, customer_name: 'Next Home', description: 'Assembly instructions unclear — missing step 4 diagram entirely', severity: 'low', status: 'closed', resolution: 'Instruction manual revised; digital version on QR code' },
  { complaint_ref: 'CMP-004', days_ago: 150, customer_name: 'Dunelm Ltd', description: 'Product dimensions 5mm shorter than stated spec on all units', severity: 'critical', status: 'resolved', resolution: 'Full recall; factory tooling corrected and re-validated' },
  { complaint_ref: 'CMP-005', days_ago: 90, customer_name: 'TK Maxx UK', description: 'Colour variation between units — inconsistent dye lot', severity: 'medium', status: 'investigating', resolution: null },
  { complaint_ref: 'CMP-006', days_ago: 45, customer_name: 'Wayfair EU', description: 'Label artwork wrong country of origin — states China instead of Vietnam', severity: 'high', status: 'open', resolution: null },
  { complaint_ref: 'CMP-007', days_ago: 20, customer_name: 'John Lewis', description: 'Two units per carton missing screws in accessory bag', severity: 'medium', status: 'open', resolution: null },
];

const CLAIMS = [
  { claim_ref: 'CLM-001', days_ago: 300, customer_name: 'Homebase UK', reason: 'Full return of defective batch — paint finish failure, 480 units', claim_amount: 14400.00, status: 'settled', resolution: 'Supplier credited 80%; 20% offset against replacement shipment' },
  { claim_ref: 'CLM-002', days_ago: 240, customer_name: 'B&Q Retail', reason: 'Markdown allowance for damaged packaging — 200 units sold at discount', claim_amount: 3200.00, status: 'approved', resolution: 'Credit note issued; agreed as one-time allowance' },
  { claim_ref: 'CLM-003', days_ago: 180, customer_name: 'Dunelm Ltd', reason: 'Recall logistics — returning undersized units from 6 stores', claim_amount: 8750.00, status: 'under_review', resolution: null },
  { claim_ref: 'CLM-004', days_ago: 120, customer_name: 'Next Home', reason: 'Labour cost for re-packing 1200 units with corrected instruction manuals', claim_amount: 2100.00, status: 'approved', resolution: 'Supplier agreed; credit applied to next PO' },
  { claim_ref: 'CLM-005', days_ago: 60, customer_name: 'TK Maxx UK', reason: 'Price reduction allowance on colour inconsistent stock', claim_amount: 5600.00, status: 'open', resolution: null },
  { claim_ref: 'CLM-006', days_ago: 30, customer_name: 'Wayfair EU', reason: 'Re-labelling cost for 800 units — wrong country of origin', claim_amount: 960.00, status: 'open', resolution: null },
];

function pick(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  try {
    fs.writeFileSync('/tmp/seed_out.txt', '');
    LOG('Connecting...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_inspection.customer_complaints (
        id SERIAL PRIMARY KEY, item_code TEXT NOT NULL, complaint_ref TEXT,
        complaint_date DATE, customer_name TEXT, description TEXT, severity TEXT,
        status TEXT DEFAULT 'open', resolution TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS qc_inspection.item_claims (
        id SERIAL PRIMARY KEY, item_code TEXT NOT NULL, claim_ref TEXT,
        claim_date DATE, customer_name TEXT, reason TEXT, claim_amount NUMERIC(12,2),
        status TEXT DEFAULT 'open', resolution TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    LOG('Tables ready.');

    await db.query(`DELETE FROM qc_inspection.customer_complaints`);
    await db.query(`DELETE FROM qc_inspection.item_claims`);
    LOG('Cleared existing data.');

    const items = await db.query(`SELECT item_code, name FROM qc_inspection.item_master ORDER BY item_code`);
    LOG(`Found ${items.rows.length} items.`);

    let tc = 0, tl = 0;
    for (const item of items.rows) {
      const nc = 2 + Math.floor(Math.random() * 4); // 2-5
      const nl = 1 + Math.floor(Math.random() * 4); // 1-4
      const complaints = pick(COMPLAINTS, nc);
      const claims = pick(CLAIMS, nl);

      for (const c of complaints) {
        await db.query(
          `INSERT INTO qc_inspection.customer_complaints (item_code,complaint_ref,complaint_date,customer_name,description,severity,status,resolution)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [item.item_code, `${c.complaint_ref}/${item.item_code}`, daysAgo(c.days_ago), c.customer_name, c.description, c.severity, c.status, c.resolution]
        );
        tc++;
      }
      for (const cl of claims) {
        await db.query(
          `INSERT INTO qc_inspection.item_claims (item_code,claim_ref,claim_date,customer_name,reason,claim_amount,status,resolution)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [item.item_code, `${cl.claim_ref}/${item.item_code}`, daysAgo(cl.days_ago), cl.customer_name, cl.reason, cl.claim_amount, cl.status, cl.resolution]
        );
        tl++;
      }
      LOG(`  ✓ ${item.item_code} — ${complaints.length} complaints, ${claims.length} claims`);
    }

    LOG(`\nDONE: ${tc} complaints, ${tl} claims across ${items.rows.length} items.`);
    process.exit(0);
  } catch (err) {
    LOG('ERROR: ' + err.message);
    process.exit(1);
  }
}

main();
