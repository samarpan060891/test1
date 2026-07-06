const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, tokenFor, onQuery, reset } = require('./helpers');

beforeEach(reset);

const WH = '/api/warehouse-inspections/11111111-1111-4111-8111-111111111111';
const JOB = '/api/inspection-jobs/22222222-2222-4222-8222-222222222222';

const whRow = (over = {}) => ({
  wh_inspection_id: '11111111-1111-4111-8111-111111111111',
  po_no: 'PO-1', item_code: 'ITM-1', stage: 'inbound', status: 'submitted_for_qa',
  item_name: 'Item', supplier_name: 'Supp', po_buyer_id: null, po_buyer_email: null,
  deviation_reason: null, ...over,
});

const jobRow = (over = {}) => ({
  job_id: '22222222-2222-4222-8222-222222222222',
  po_no: 'PO-1', item_code: 'ITM-1', supplier_code: 'S1', agency_code: 'A1',
  status: 'submitted_pending_qa', supplier_name: 'Supp', agency_name: 'Agency',
  po_buyer_id: null, po_buyer_email: null, deviation_reason: null, job_ref: 'JOB-1', ...over,
});

// ── Authentication & role gates ──────────────────────────────────────────────

test('rejects requests without a token', async () => {
  const res = await request(app).get('/api/warehouse-inspections');
  assert.equal(res.status, 401);
});

test('rejects a garbage token', async () => {
  const res = await request(app).get('/api/warehouse-inspections')
    .set('Authorization', 'Bearer not-a-jwt');
  assert.equal(res.status, 401);
});

test('supplier cannot read warehouse inspections', async () => {
  const res = await request(app).get('/api/warehouse-inspections')
    .set('Authorization', `Bearer ${tokenFor('supplier_user')}`);
  assert.equal(res.status, 403);
});

test('agency cannot read a warehouse inspection detail', async () => {
  const res = await request(app).get(WH)
    .set('Authorization', `Bearer ${tokenFor('agency_user')}`);
  assert.equal(res.status, 403);
});

test('warehouse role can list warehouse inspections', async () => {
  onQuery(null, { rows: [] });
  const res = await request(app).get('/api/warehouse-inspections')
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`);
  assert.equal(res.status, 200);
});

test('admin-only route rejects qa', async () => {
  const res = await request(app).get('/api/admin/users')
    .set('Authorization', `Bearer ${tokenFor('qa')}`);
  assert.equal(res.status, 403);
});

// ── Warehouse: submit-for-qa transition guards ───────────────────────────────

test('warehouse submit-for-qa: only warehouse/admin may call', async () => {
  const res = await request(app).post(`${WH}/submit-for-qa`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`);
  assert.equal(res.status, 403);
});

test('warehouse submit-for-qa: rejected when already submitted', async () => {
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'submitted_for_qa' })] });
  const res = await request(app).post(`${WH}/submit-for-qa`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /in progress or completed/i);
});

test('warehouse submit-for-qa: rejected when checkpoints are unanswered', async () => {
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'in_progress' })] });
  onQuery(t => t.includes('result IS NULL'), { rows: [{ pending: 3 }] });
  const res = await request(app).post(`${WH}/submit-for-qa`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /3 checkpoint/);
});

test('warehouse submit-for-qa: rejected when a failed checkpoint has no remark', async () => {
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'fail' })] });
  onQuery(t => t.includes('result IS NULL'), { rows: [{ pending: 0 }] });
  onQuery(t => t.includes("btrim(remarks) = ''"), { rows: [{ missing: 2 }] });
  const res = await request(app).post(`${WH}/submit-for-qa`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /2 failed checkpoint.*missing remarks/i);
});

test('warehouse submit-for-qa: succeeds when complete and fully answered', async () => {
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'pass' })] });
  onQuery(t => t.includes('result IS NULL'), { rows: [{ pending: 0 }] });
  onQuery(t => t.includes("btrim(remarks) = ''"), { rows: [{ missing: 0 }] });
  onQuery(t => t.includes("wir.result = 'fail'"), { rows: [] });
  onQuery(t => t.includes("SET status = 'submitted_for_qa'"),
    { rows: [whRow({ status: 'submitted_for_qa' })] });
  const res = await request(app).post(`${WH}/submit-for-qa`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'submitted_for_qa');
});

// ── Warehouse: QA review ─────────────────────────────────────────────────────

test('warehouse qa-review: warehouse role cannot review', async () => {
  const res = await request(app).post(`${WH}/qa-review`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`)
    .send({ action: 'approve' });
  assert.equal(res.status, 403);
});

test('warehouse qa-review: invalid action rejected', async () => {
  const res = await request(app).post(`${WH}/qa-review`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ action: 'maybe' });
  assert.equal(res.status, 400);
});

test('warehouse qa-review: rejected unless submitted or deviation-reviewed', async () => {
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'in_progress' })] });
  const res = await request(app).post(`${WH}/qa-review`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ action: 'approve' });
  assert.equal(res.status, 400);
});

test('warehouse qa-review: approves a deviation_reviewed inspection (final decision)', async () => {
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'deviation_reviewed' })] });
  onQuery(t => t.includes("SET status = $1"),
    { rows: [whRow({ status: 'qa_approved' })] });
  const res = await request(app).post(`${WH}/qa-review`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ action: 'approve', remarks: 'ok' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'qa_approved');
});

// ── Warehouse: deviation request + buyer decision ───────────────────────────

test('warehouse request-deviation: requires a reason', async () => {
  const res = await request(app).post(`${WH}/request-deviation`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ reason: '   ' });
  assert.equal(res.status, 400);
});

test('warehouse request-deviation: only from submitted_for_qa', async () => {
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'pass' })] });
  const res = await request(app).post(`${WH}/request-deviation`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ reason: 'need buyer sign-off' });
  assert.equal(res.status, 400);
});

test('warehouse request-deviation: happy path moves to deviation_requested', async () => {
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'submitted_for_qa' })] });
  onQuery(t => t.includes("SET status = 'deviation_requested'"),
    { rows: [whRow({ status: 'deviation_requested' })] });
  const res = await request(app).post(`${WH}/request-deviation`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ reason: 'minor cosmetic issue' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'deviation_requested');
});

test('warehouse buyer-deviation: qa cannot decide', async () => {
  const res = await request(app).post(`${WH}/buyer-deviation`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ action: 'approve' });
  assert.equal(res.status, 403);
});

test('warehouse buyer-deviation: wrong buyer is rejected', async () => {
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'deviation_requested', po_buyer_id: '99999999-9999-4999-8999-999999999999' })] });
  const res = await request(app).post(`${WH}/buyer-deviation`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ action: 'approve' });
  assert.equal(res.status, 403);
  assert.match(res.body.error, /different buyer/i);
});

test('warehouse buyer-deviation: assigned buyer approves → deviation_reviewed', async () => {
  const buyerId = '00000000-0000-4000-8000-000000000001';
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'deviation_requested', po_buyer_id: buyerId })] });
  onQuery(t => t.includes("SET status = 'deviation_reviewed'"),
    { rows: [whRow({ status: 'deviation_reviewed', buyer_decision: 'approved' })] });
  const res = await request(app).post(`${WH}/buyer-deviation`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ action: 'approve', remarks: 'acceptable' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'deviation_reviewed');
});

test('warehouse buyer-deviation: no pending request → 400', async () => {
  onQuery(t => t.includes('FROM qc_inspection.warehouse_inspection wi'),
    { rows: [whRow({ status: 'submitted_for_qa' })] });
  const res = await request(app).post(`${WH}/buyer-deviation`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ action: 'reject' });
  assert.equal(res.status, 400);
});

// ── Warehouse: reopen ────────────────────────────────────────────────────────

test('warehouse reopen: allowed from submitted_for_qa', async () => {
  onQuery(t => t.includes('SELECT status FROM'), { rows: [{ status: 'submitted_for_qa' }] });
  onQuery(t => t.includes("SET status = 'in_progress'"),
    { rows: [whRow({ status: 'in_progress' })] });
  const res = await request(app).patch(`${WH}/reopen`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'in_progress');
});

test('warehouse reopen: blocked once qa_approved', async () => {
  onQuery(t => t.includes('SELECT status FROM'), { rows: [{ status: 'qa_approved' }] });
  const res = await request(app).patch(`${WH}/reopen`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`);
  assert.equal(res.status, 400);
});

// ── Agency jobs: QA decision + deviation ────────────────────────────────────

test('job decision: only qa may decide', async () => {
  const res = await request(app).put(`${JOB}/decision`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ outcome: 'approved' });
  assert.equal(res.status, 403);
});

test('job decision: invalid outcome rejected', async () => {
  const res = await request(app).put(`${JOB}/decision`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ outcome: 'escalate' });
  assert.equal(res.status, 400);
});

test('job decision: blocked in mapped_awaiting_inspection', async () => {
  onQuery(t => t.includes('SELECT * FROM qc_inspection.inspection_job'),
    { rows: [jobRow({ status: 'mapped_awaiting_inspection' })] }, { sticky: true });
  const res = await request(app).put(`${JOB}/decision`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ outcome: 'approved' });
  assert.equal(res.status, 400);
});

test('job request-deviation: only from submitted_pending_qa', async () => {
  onQuery(t => t.includes('FROM qc_inspection.inspection_job j'),
    { rows: [jobRow({ status: 'qa_approved' })] });
  const res = await request(app).post(`${JOB}/request-deviation`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ reason: 'buyer call needed' });
  assert.equal(res.status, 400);
});

test('job request-deviation: happy path', async () => {
  onQuery(t => t.includes('FROM qc_inspection.inspection_job j'),
    { rows: [jobRow({ status: 'submitted_pending_qa' })] });
  onQuery(t => t.includes("SET status = 'deviation_requested'"),
    { rows: [jobRow({ status: 'deviation_requested' })] });
  const res = await request(app).post(`${JOB}/request-deviation`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ reason: 'sellable with minor defect' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'deviation_requested');
});

test('job buyer-deviation: wrong buyer rejected', async () => {
  onQuery(t => t.includes('FROM qc_inspection.inspection_job j'),
    { rows: [jobRow({ status: 'deviation_requested', po_buyer_id: '99999999-9999-4999-8999-999999999999' })] });
  const res = await request(app).post(`${JOB}/buyer-deviation`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ action: 'reject', remarks: 'not acceptable' });
  assert.equal(res.status, 403);
});

test('job buyer-deviation: assigned buyer decides → deviation_reviewed', async () => {
  const buyerId = '00000000-0000-4000-8000-000000000001';
  onQuery(t => t.includes('FROM qc_inspection.inspection_job j'),
    { rows: [jobRow({ status: 'deviation_requested', po_buyer_id: buyerId })] });
  onQuery(t => t.includes("SET status = 'deviation_reviewed'"),
    { rows: [jobRow({ status: 'deviation_reviewed', buyer_decision: 'rejected' })] });
  const res = await request(app).post(`${JOB}/buyer-deviation`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ action: 'reject', remarks: 'cannot accept' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'deviation_reviewed');
});

// ── Claims workflow ──────────────────────────────────────────────────────────

const CLAIM = '/api/claims/33333333-3333-4333-8333-333333333333';
const claimRow = (over = {}) => ({
  claim_id: '33333333-3333-4333-8333-333333333333', claim_ref: 'CLM-2026-0001',
  po_no: 'PO-1', item_code: 'ITM-1', supplier_code: 'S1', status: 'pending_qa',
  claim_amount: 100, penalty_amount: 0, item_name: 'Item', supplier_name: 'Supp',
  supplier_email: 's@x.y', po_buyer_id: null, po_buyer_email: null, ...over,
});

test('claims: supplier role cannot access', async () => {
  const res = await request(app).get('/api/claims')
    .set('Authorization', `Bearer ${tokenFor('supplier_user')}`);
  assert.equal(res.status, 403);
});

test('claims: only warehouse can raise', async () => {
  const res = await request(app).post('/api/claims')
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ po_no: 'PO-1', item_code: 'ITM-1', claim_amount: 10, description: 'broken' });
  assert.equal(res.status, 403);
});

test('claims: raise requires a description', async () => {
  const res = await request(app).post('/api/claims')
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`)
    .send({ po_no: 'PO-1', item_code: 'ITM-1', claim_amount: 10 });
  assert.equal(res.status, 400);
});

test('claims: qa-submit requires root cause', async () => {
  const res = await request(app).post(`${CLAIM}/qa-submit`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ root_cause: ' ' });
  assert.equal(res.status, 400);
});

test('claims: qa-submit only from pending_qa', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'submitted' })] });
  const res = await request(app).post(`${CLAIM}/qa-submit`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ root_cause: 'supplier packing issue' });
  assert.equal(res.status, 400);
});

test('claims: qa-submit moves claim to pending_buying', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_qa' })] });
  onQuery(t => t.includes("SET status = 'pending_buying'"),
    { rows: [claimRow({ status: 'pending_buying' })] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying' })] });
  const res = await request(app).post(`${CLAIM}/qa-submit`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ root_cause: 'supplier packing issue' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'pending_buying');
});

test('claims: qa-submit requires rework type when reworkable', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_qa' })] });
  const res = await request(app).post(`${CLAIM}/qa-submit`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ root_cause: 'material defect', rework_possible: true });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /rework type/i);
});

test('claims: qa-submit partial rework requires replacement parts', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_qa' })] });
  const res = await request(app).post(`${CLAIM}/qa-submit`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ root_cause: 'material defect', rework_possible: true, rework_type: 'partial' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /replacement/i);
});

test('claims: qa-submit partial rework succeeds with replacement parts', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_qa' })] });
  onQuery(t => t.includes("SET status = 'pending_buying'"),
    { rows: [claimRow({ status: 'pending_buying', rework_possible: true, rework_type: 'partial' })] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying', rework_possible: true, rework_type: 'partial' })] });
  const res = await request(app).post(`${CLAIM}/qa-submit`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ root_cause: 'material defect', rework_possible: true, rework_type: 'partial', replacement_parts: '2x glass tops, 1x hardware carton' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'pending_buying');
});

test('claims: buying-submit requires reason when penalty added', async () => {
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ penalty_amount: 50, mode: 'refund', credit_note_no: 'CN-1' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /reason/i);
});

test('claims: buying-submit requires a settlement mode', async () => {
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ penalty_amount: 0 });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /replacement, rework or refund/);
});

test('claims: refund requires a credit note amount', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying' })] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'refund' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /credit note amount/i);
});

test('claims: refund requires an attached credit note file', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying' })] });
  onQuery(t => t.includes("kind = 'credit_note'"), { rows: [{ n: 0 }] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'refund', credit_note_amount: 500 });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /credit note must be attached/i);
});

test('claims: refund finalises to Imports with amount + attached credit note', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying' })] });
  onQuery(t => t.includes("kind = 'credit_note'"), { rows: [{ n: 1 }] });
  onQuery(t => t.includes("SET status = 'pending_imports'"),
    { rows: [claimRow({ status: 'pending_imports', settlement_mode: 'refund' })] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_imports', settlement_mode: 'refund' })] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'refund', credit_note_no: 'CN-9', credit_note_amount: 500 });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'pending_imports');
});

test('claims: replacement requires an expected landing date', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying' })] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'replacement' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /replacement landing date/i);
});

test('claims: replacement settles with a landing date', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying' })] });
  onQuery(t => t.includes("SET status = 'pending_imports'"),
    { rows: [claimRow({ status: 'pending_imports', settlement_mode: 'replacement' })] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_imports', settlement_mode: 'replacement' })] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'replacement', expected_replacement_date: '2026-08-01' });
  assert.equal(res.status, 200);
});

test('claims: rework settlement rejected when claim is not reworkable', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying', rework_possible: false })] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'rework', credit_note_no: 'CN-9' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /not reworkable/i);
});

test('claims: not-reworkable claim settles by refund without rework cost', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying', rework_possible: false })] });
  onQuery(t => t.includes("SET status = 'pending_imports'"),
    { rows: [claimRow({ status: 'pending_imports', rework_possible: false })] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_imports', rework_possible: false })] });
  onQuery(t => t.includes("kind = 'credit_note'"), { rows: [{ n: 1 }] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'refund', credit_note_no: 'CN-9', credit_note_amount: 500 });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'pending_imports');
});

test('claims: warehouse edit at pending_qa does not rewind', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'), { rows: [claimRow({ status: 'pending_qa' })] });
  onQuery(t => t.includes('UPDATE qc_inspection.defect_claim SET'), { rows: [{ claim_id: claimRow().claim_id }] });
  onQuery(t => t.includes('claim_edit_log'), { rows: [] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'), { rows: [claimRow({ status: 'pending_qa', defect_qty: 25 })] });
  const res = await request(app).post(`${CLAIM}/edit`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`)
    .send({ fields: { defect_qty: 25 } });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'pending_qa');
});

test('claims: warehouse edit after later approvals rewinds to pending_qa', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'), { rows: [claimRow({ status: 'pending_accounts' })] });
  onQuery(t => t.includes('UPDATE qc_inspection.defect_claim SET'), { rows: [{ claim_id: claimRow().claim_id }] });
  onQuery(t => t.includes('claim_edit_log'), { rows: [] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'), { rows: [claimRow({ status: 'pending_qa' })] });
  const res = await request(app).post(`${CLAIM}/edit`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`)
    .send({ fields: { defect_qty: 30 } });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'pending_qa');
});

test('claims: a role cannot edit another stage\'s fields', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'), { rows: [claimRow({ status: 'pending_buying' })] });
  const res = await request(app).post(`${CLAIM}/edit`)
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ fields: { defect_qty: 5 } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /no editable fields/i);
});

test('claims: reworkable claim requires a rework cost at buying-submit', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying', rework_possible: true })] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'rework', credit_note_no: 'CN-9' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /rework cost/i);
});

test('claims: reworkable claim requires a cost sheet upload at buying-submit', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying', rework_possible: true })] });
  onQuery(t => t.includes("kind = 'cost_sheet'"), { rows: [{ n: 0 }] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'rework', credit_note_no: 'CN-9', rework_cost: 250 });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /cost sheet/i);
});

test('claims: reworkable claim submits with cost + cost sheet present', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying', rework_possible: true })] });
  onQuery(t => t.includes("kind = 'cost_sheet'"), { rows: [{ n: 1 }] });
  onQuery(t => t.includes("SET status = 'pending_imports'"),
    { rows: [claimRow({ status: 'pending_imports', rework_possible: true })] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_imports', rework_possible: true })] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'rework', credit_note_no: 'CN-9', rework_cost: 250 });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'pending_imports');
});

test('claims: wrong buyer cannot finalise', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_buying', po_buyer_id: '99999999-9999-4999-8999-999999999999' })] });
  const res = await request(app).post(`${CLAIM}/buying-submit`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ mode: 'replacement' });
  assert.equal(res.status, 403);
});

test('claims: imports-review requires remarks', async () => {
  const res = await request(app).post(`${CLAIM}/imports-review`)
    .set('Authorization', `Bearer ${tokenFor('imports')}`)
    .send({ remarks: '  ' });
  assert.equal(res.status, 400);
});

test('claims: buying cannot do imports step', async () => {
  const res = await request(app).post(`${CLAIM}/imports-review`)
    .set('Authorization', `Bearer ${tokenFor('buying')}`)
    .send({ remarks: 'ok' });
  assert.equal(res.status, 403);
});

test('claims: imports-review moves claim to pending_accounts', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_imports' })] });
  onQuery(t => t.includes("SET status = 'pending_accounts'"),
    { rows: [claimRow({ status: 'pending_accounts' })] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_accounts' })] });
  const res = await request(app).post(`${CLAIM}/imports-review`)
    .set('Authorization', `Bearer ${tokenFor('imports')}`)
    .send({ remarks: 'duty paid, docs attached' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'pending_accounts');
});

test('claims: accounts-close requires a deduction remark', async () => {
  const res = await request(app).post(`${CLAIM}/accounts-close`)
    .set('Authorization', `Bearer ${tokenFor('accounts')}`)
    .send({ deduction_remarks: '' });
  assert.equal(res.status, 400);
});

test('claims: accounts-close closes the claim', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_accounts' })] });
  onQuery(t => t.includes("SET status = 'closed'"),
    { rows: [claimRow({ status: 'closed' })] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'closed' })] });
  const res = await request(app).post(`${CLAIM}/accounts-close`)
    .set('Authorization', `Bearer ${tokenFor('accounts')}`)
    .send({ deduction_remarks: 'Deducted $150 against INV-2210 via CN-9' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'closed');
});

test('claims: details PATCH blocked on a closed claim', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'closed' })] });
  const res = await request(app).patch(`${CLAIM}/details`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`)
    .send({ trigger_point: 'Incoming Goods' });
  assert.equal(res.status, 400);
});

test('claims: details PATCH updates report fields on an open claim', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_qa' })] });
  onQuery(t => t.includes('UPDATE qc_inspection.defect_claim SET'),
    { rows: [{ claim_id: claimRow().claim_id }] });
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_qa', trigger_point: 'Incoming Goods' })] });
  const res = await request(app).patch(`${CLAIM}/details`)
    .set('Authorization', `Bearer ${tokenFor('warehouse')}`)
    .send({ trigger_point: 'Incoming Goods', checked_qty: 100 });
  assert.equal(res.status, 200);
});

test('claims: attachment upload rejected for supplier role', async () => {
  const res = await request(app).post(`${CLAIM}/attachments`)
    .set('Authorization', `Bearer ${tokenFor('supplier_user')}`);
  assert.equal(res.status, 403);
});

test('claims: imports-review only from pending_imports', async () => {
  onQuery(t => t.includes('FROM qc_inspection.defect_claim c'),
    { rows: [claimRow({ status: 'pending_qa' })] });
  const res = await request(app).post(`${CLAIM}/imports-review`)
    .set('Authorization', `Bearer ${tokenFor('imports')}`)
    .send({ remarks: 'x' });
  assert.equal(res.status, 400);
});

// ── Supplier scorecard config ────────────────────────────────────────────────

test('scorecard config: non-admin cannot update', async () => {
  const res = await request(app).put('/api/scorecard/config')
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ weight_complaints: 50, weight_claims: 40, weight_failures: 10 });
  assert.equal(res.status, 403);
});

test('scorecard config: rejects weights not summing to 100', async () => {
  const res = await request(app).put('/api/scorecard/config')
    .set('Authorization', `Bearer ${tokenFor('admin')}`)
    .send({ weight_complaints: 50, weight_claims: 40, weight_failures: 20, grade_excellent: 85, grade_good: 70, grade_average: 50, min_inspections: 3 });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /sum to 100/);
});

test('scorecard config: saves stamped with the updater user_id (not undefined)', async () => {
  let captured = null;
  onQuery(t => t.includes('UPDATE qc_inspection.scorecard_config'), (t, params) => { captured = params; return { rows: [{ id: 1 }] }; });
  const res = await request(app).put('/api/scorecard/config')
    .set('Authorization', `Bearer ${tokenFor('admin', { n: '7' })}`)
    .send({ weight_complaints: 50, weight_claims: 40, weight_failures: 10, grade_excellent: 85, grade_good: 70, grade_average: 50, min_inspections: 3 });
  assert.equal(res.status, 200);
  // last bound param is updated_by — must be the real user_id, not undefined (the old req.user.userId bug)
  assert.ok(captured && captured[captured.length - 1], 'updated_by should be the user_id');
});

test('scorecard: supplier_user is scoped by their own supplier (user_id passed through)', async () => {
  onQuery(t => t.includes('FROM qc_inspection.scorecard_config'),
    { rows: [{ weight_complaints: 50, weight_claims: 40, weight_failures: 10, grade_excellent: 85, grade_good: 70, grade_average: 50, min_inspections: 3 }] });
  let lookupParams = null;
  onQuery(t => t.includes('SELECT supplier_code FROM qc_inspection.team_stakeholder'),
    (t, p) => { lookupParams = p; return { rows: [{ supplier_code: 'SUP-9' }] }; });
  const res = await request(app).get('/api/scorecard/suppliers')
    .set('Authorization', `Bearer ${tokenFor('supplier_user', { n: '5' })}`);
  assert.equal(res.status, 200);
  assert.ok(lookupParams && lookupParams[0], 'supplier lookup must receive the user_id, not undefined');
});

// ── Auth basics ──────────────────────────────────────────────────────────────

test('login requires email and password', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'x@y.z' });
  assert.equal(res.status, 400);
});

test('change-password enforces 8-char minimum', async () => {
  const res = await request(app).put('/api/auth/change-password')
    .set('Authorization', `Bearer ${tokenFor('qa')}`)
    .send({ current_password: 'old', new_password: 'short' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /8 characters/);
});

test('health endpoint responds', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});
