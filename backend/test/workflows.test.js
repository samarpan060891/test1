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
