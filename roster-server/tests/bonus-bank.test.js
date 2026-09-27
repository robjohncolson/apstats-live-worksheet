// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mountClass, bonusAudit } from '../class.js';
import { mountLedger } from '../ledger.js';
import { mountReview } from '../review.js';
import { createLedgerDb } from '../ledger-db.js';
import { computeEffort } from '../doge-econ.js';
import { initReceipts } from '../receipts.js';
import { backfillStudentReceipts } from '../backfill.js';
import { computeGrade } from '../grade.js';
import { computeLessonGrades } from '../lesson-grade.js';
import { masteryObservations } from '../mastery.js';
import { CONFIG, GRADE_OPTS, ANSWER_KEY, ARCHETYPES, materialize, SCHEDULE } from './fixtures/sim-world.js';

const TEACHER = 'bonus-test-secret';
const student = { student_id: 's1', login_username: 'pear_cat', real_name: 'Test Student', section: 'PeriodB' };
const bank = (quarter = 'Q1') => ({ student_id: 's1', source: 'bonus', item_id: 'BONUS-U1-screen-time', score: 5,
  attempt: 1, response: JSON.stringify({ grade: 'E', title: 'Screen Time', quarter }) });
const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
  vi.unstubAllEnvs();
  initReceipts();
});

async function start({ work = '35', pc = '90', frozen = '63', ledger = [bank()], insertError = null,
  roster = [student], snapshots = null, config = CONFIG, beforeInsert = null } = {}) {
  vi.stubEnv('ROSTER_TEACHER_SECRET', TEACHER);
  const stored = ledger.slice(), writes = [];
  const frozenRows = snapshots || [{ student_id: 's1', quarter: 'Q1', frozen_work_avg: work,
    frozen_pc_avg: pc, frozen_grade: frozen, frozen_at: '2026-09-23T12:00:00Z' }];
  const db = {
    async listRoster(section) { return { data: roster.filter(s => !section || s.section === section) }; },
    async listQuarterSnapshot(quarter) { return { data: frozenRows.filter(r => r.quarter === quarter) }; },
    async listReviewMarksByStudents() { return { data: [] }; },
    async getRoleByStudentId(id) { return id === 'teacher' ? 'teacher' : 'student'; },
  };
  const ledgerDb = {
    async getLedgerByStudent(id) { return { data: stored.filter(r => r.student_id === id) }; },
    async insertLedgerRowIfAbsent(row) {
      if (beforeInsert) await beforeInsert(row);
      if (stored.some(r => r.student_id === row.studentId && r.source === row.source &&
          r.item_id === row.itemId && r.attempt === row.attempt)) return { inserted: false };
      const result = await this.insertLedgerRow(row);
      return { ...result, inserted: !result.error };
    },
    async insertLedgerRow(row) {
      if (insertError) return { error: insertError };
      writes.push(row);
      const saved = { student_id: row.studentId, item_id: row.itemId, source: row.source,
        score: row.score, response: row.response, attempt: row.attempt };
      const index = stored.findIndex(r => r.student_id === saved.student_id && r.source === saved.source &&
        r.item_id === saved.item_id && r.attempt === saved.attempt);
      if (index < 0) stored.push(saved); else stored[index] = saved;
      return { data: { ledger_id: 'fixture' } };
    },
  };
  const app = express();
  app.use(express.json());
  mountClass(app, { db, ledgerDb, config, lessonSchedule: SCHEDULE,
    loadAnswerKey: async () => ({ answerKey: ANSWER_KEY }) });
  mountLedger(app, { db: ledgerDb, rosterDb: db, verifyToken: token => token === 'teacher-token' ? 'teacher' : 's1' });
  mountReview(app, { db, ledgerDb });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  async function request(path, body, teacher = true) {
    const headers = { 'content-type': 'application/json' };
    if (teacher) headers['x-teacher-secret'] = TEACHER;
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  return { request, writes, stored, frozenRows };
}

describe('bonus engine isolation', () => {
  it.each(Object.entries(ARCHETYPES))('%s output is byte-identical with bonus rows', (_, plan) => {
    const rows = materialize(plan());
    // Include lesson-shaped IDs: ignoring only the BONUS prefix is insufficient.
    const extra = ['bonus', 'bonus_applied'].flatMap(source => [
      { ...bank(), source }, { ...bank(), source, item_id: 'U1-L2-Q1', unit: 'U1' },
      { ...bank(), source, item_id: 'U1-L1-WS1', unit: 'U1' },
    ]);
    const grade = ledger => JSON.stringify(computeGrade(ledger, ANSWER_KEY, CONFIG, GRADE_OPTS));
    expect(grade([...rows, ...extra])).toBe(grade(rows));
    const lessons = ledger => JSON.stringify(computeLessonGrades(ledger, CONFIG.frqBand, ANSWER_KEY, SCHEDULE, GRADE_OPTS));
    expect(lessons([...rows, ...extra])).toBe(lessons(rows));
    expect(masteryObservations(extra, ANSWER_KEY, { 'U1-L2-Q1': { skill: '1.A' } })).toEqual([]);
  });
});

describe('teacher bonus routes', () => {
  it('collects unknown students and invalid grades, resolves username/id, and upserts a sheet', async () => {
    const { request, writes, stored } = await start({ ledger: [] });
    const body = { sheetId: 'U1-screen-time', title: 'Screen Time', quarter: 'Q1', section: 'PeriodB',
      entries: [{ username: 'pear_cat', grade: 'E' }, { username: 'missing', grade: 'P' },
        { studentId: 'unknown', grade: 'I' }, { studentId: 's1', grade: 'X' }] };
    const result = await request('/class/bonus', body);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, written: 1, sheetId: body.sheetId, quarter: 'Q1' });
    expect(result.body.errors).toHaveLength(3);
    expect(writes[0]).toMatchObject({ source: 'bonus', itemId: 'BONUS-U1-screen-time', score: 5, attempt: 1 });
    expect(JSON.parse(writes[0].response)).toEqual({ grade: 'E', quarter: 'Q1', title: 'Screen Time' });
    await request('/class/bonus', { ...body, entries: [{ studentId: 's1', grade: 'P' }] });
    expect(stored).toHaveLength(1);
    expect(stored[0].score).toBe(3);
  });
  it.each(['/class/bonus', '/class/quarter/apply-bonus', '/class/quarter/deltas?quarter=Q1'])
    ('requires teacher auth: %s', async path => {
      const { request } = await start();
      expect((await request(path, path.includes('deltas') ? undefined : {}, false)).status).toBe(401);
    });
  it.each(['bonus', 'bonus_applied'])('blocks student writes of %s', async source => {
    const { request, writes } = await start();
    expect((await request('/ledger/record', { token: 'student-token', source, itemId: 'fake', response: '{}' }, false)).status).toBe(403);
    expect(writes).toHaveLength(0);
  });
  it('defaults to dry run and flips the 40% floor with numeric strings', async () => {
    const { request, writes } = await start();
    const result = await request('/class/quarter/apply-bonus', { quarter: 'Q1' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, dryRun: true, applied: 0, rows: [{ studentId: 's1',
      frozenGrade: 63, points: 5, workBefore: 35, workAfter: 40, switched: true, adjustedGrade: 90,
      sheets: ['BONUS-U1-screen-time'] }] });
    expect(writes).toHaveLength(0);
  });
  it.each([
    { work: '98', pc: '90', frozen: '98', expected: 100 },
    { work: '35', pc: null, frozen: '35', expected: 40 },
    { work: '35', pc: '90', frozen: '95', expected: 100 },
  ])('applies the ceiling, missing PC, and never-lower guard: %j', async fixture => {
    const { request } = await start(fixture);
    const result = await request('/class/quarter/apply-bonus', { quarter: 'Q1' });
    expect(result.body.rows[0].adjustedGrade).toBe(fixture.expected);
    expect(result.body.rows[0].workAfter).toBeLessThanOrEqual(100);
  });
  it('uses configured gates', async () => {
    // Re-pinned for Bonus Bank v2 (was Work-only 65). Floor 0.5, ceiling 0.7; PC 90, Work 35, P 5.
    //   Work candidate: 40 < 50 → max(.7×.90, .7×.40, (.90+.40)/2) = max(.63, .28, .65) = .65 → 65
    //   PC candidate:   Work 35 < 50 → max(.7×.95, .7×.35, (.95+.35)/2) = max(.665, .245, .65) = .665 → 66.5
    //   66.5 > 65 → PC; PC was already ≥ 50, so no floor switch.
    const { request } = await start({ config: { ...CONFIG, v3Gates: { floor: 0.5, ceiling: 0.7 } } });
    const result = await request('/class/quarter/apply-bonus', { quarter: 'Q1' });
    expect(result.body.rows[0]).toMatchObject({ placement: 'pc', switched: false, adjustedGrade: 66.5, altGrade: 65 });
  });
  it('preserves early completion credit after adding Work points', async () => {
    const { request } = await start({ pc: '50', work: '60', frozen: '64' });
    const result = await request('/class/quarter/apply-bonus', { quarter: 'Q1' });
    expect(result.body.rows[0]).toMatchObject({ earlyBonus: 4, adjustedGrade: 69 });
  });
  it('treats null Work as zero and preserves the frozen grade residual', async () => {
    // Re-pinned for Bonus Bank v2 (was Work-only 90). PC 90, Work null→0, frozen 90, P 5.
    //   base = max(.63, 0, .45) = .63 → 63; residual = 90 − 63 = 27
    //   Work candidate: max(.63, .035, .475) = .63 → 63 + 27 = 90
    //   PC candidate:   max(.665, 0, .475) = .665 → 66.5 + 27 = 93.5 → PC
    const { request } = await start({ pc: '90', work: null, frozen: '90' });
    const result = await request('/class/quarter/apply-bonus', { quarter: 'Q1' });
    expect(result.body.rows[0]).toMatchObject({ workBefore: 0, workAfter: 5, earlyBonus: 27,
      placement: 'pc', pcBefore: 90, pcAfter: 95, adjustedGrade: 93.5, altGrade: 90 });
  });
  it('does not apply a Q2 bank against a Q1-only snapshot', async () => {
    const { request, writes } = await start({ ledger: [bank('Q2')] });
    const result = await request('/class/quarter/apply-bonus', { quarter: 'Q2', dryRun: false });
    expect(result.body).toMatchObject({ applied: 0, rows: [] });
    expect(writes).toEqual([]);
  });
  it('keeps the first audit when section and all-roster applications overlap', async () => {
    let releaseFirst, secondArrived;
    const firstBlocked = new Promise(resolve => { releaseFirst = resolve; });
    const bothArrived = new Promise(resolve => { secondArrived = resolve; });
    let calls = 0;
    const { request, writes } = await start({ beforeInsert: async () => {
      calls += 1;
      if (calls === 1) await firstBlocked;
      else { secondArrived(); await firstBlocked; }
    } });
    const first = request('/class/quarter/apply-bonus', { quarter: 'Q1', section: 'PeriodB', dryRun: false });
    const second = request('/class/quarter/apply-bonus', { quarter: 'Q1', dryRun: false });
    await bothArrived;
    releaseFirst();
    const results = await Promise.all([first, second]);
    expect(results.map(r => r.body.applied)).toEqual([1, 0]);
    expect(results[1].body.skipped).toMatchObject([{ reason: 'already applied' }]);
    expect(writes).toHaveLength(1);
  });
  it('flags a replaced snapshot in dry run and deltas without reapplying', async () => {
    const { request, writes, frozenRows } = await start();
    await request('/class/quarter/apply-bonus', { quarter: 'Q1', dryRun: false });
    expect(JSON.parse(writes[0].response).frozenAt).toBe(frozenRows[0].frozen_at);
    frozenRows[0] = { ...frozenRows[0], frozen_at: '2026-09-24T12:00:00Z' };
    const preview = await request('/class/quarter/apply-bonus', { quarter: 'Q1' });
    expect(preview.body.skipped[0].applied.stale).toBe(true);
    const deltas = await request('/class/quarter/deltas?quarter=Q1');
    expect(deltas.body.deltas[0]).toMatchObject({ closed: 90, bonus: { applied: { stale: true } } });
    expect((await request('/class/quarter/apply-bonus', { quarter: 'Q1', dryRun: false })).body.applied).toBe(0);
    expect(writes).toHaveLength(1);
  });
  it('exposes frozen and applied closed grades without changing live grades', async () => {
    const { request } = await start();
    const before = (await request('/class/grades')).body.students[0].quarters;
    expect(before.Q1).toMatchObject({ closedGrade: 63, bonusApplied: null });
    const unfrozen = await start({ snapshots: [] });
    const openQuarter = (await unfrozen.request('/class/grades')).body.students[0].quarters.Q1;
    expect(openQuarter).toMatchObject({ closedGrade: null, bonusApplied: null });
    expect((await request('/class/quarter/deltas?quarter=Q1')).body.deltas[0].closed).toBe(63);
    await request('/class/quarter/apply-bonus', { quarter: 'Q1', dryRun: false });
    const after = (await request('/class/grades')).body.students[0].quarters.Q1;
    expect(after).toMatchObject({ closedGrade: 90, quarterGrade: before.Q1.quarterGrade,
      bonusApplied: { adjustedGrade: 90, appliedAt: expect.any(String) } });
  });
  it('redacts student placement details and retains the teacher audit', async () => {
    const { request } = await start();
    await request('/class/quarter/apply-bonus', { quarter: 'Q1', dryRun: false });
    const publicRows = (await request('/ledger/student/s1?token=student-token', undefined, false)).body.rows;
    const publicDetail = JSON.parse(publicRows.find(r => r.source === 'bonus_applied').response);
    // Bonus Bank v2: the placement word is the one new thing a student may read.
    expect(publicDetail).toEqual({ adjustedGrade: 90, appliedAt: expect.any(String), placement: 'work' });
    for (const [path, secret] of [['/ledger/student/s1', true], ['/ledger/student/s1?token=teacher-token', false]]) {
      const result = await request(path, undefined, secret);
      const detail = JSON.parse(result.body.rows.find(r => r.source === 'bonus_applied').response);
      expect(detail).toMatchObject({ workBefore: 35, workAfter: 40, switched: true, earlyBonus: 0 });
    }
  });
  it.each(['bonus', 'bonus_applied'])('excludes fresh %s rows from both review queues', async source => {
    const { request } = await start({ ledger: [{ ...bank(), source, recorded_at: new Date().toISOString() }] });
    const students = await request('/class/review-queue');
    expect(students.body).toMatchObject({ unseenTotal: 0, students: [{ unseen: 0, items: [] }] });
    const items = await request('/class/review-by-item');
    expect(items.body).toMatchObject({ unseenTotal: 0, items: [] });
  });
  it('awards zero effort for signed and backfilled bonus receipts', async () => {
    vi.stubEnv('RECEIPT_ISSUER_PRIVATE_KEY', 'MC4CAQAwBQYDK2VwBCIEIEtFFgiPZyvBY+Udt3F77ZOHGypDcMHVJV9ck+a6kToO');
    initReceipts();
    const rows = ['bonus', 'bonus_applied'].map(source => ({ ...bank(), source }));
    expect((await backfillStudentReceipts(rows, null, student.login_username)).receiptsBackfilled).toBe(2);
    expect(rows.every(r => !!r.receipt_compact)).toBe(true);
    expect(computeEffort(rows)).toEqual({ points: 0, candy: 0 });
    expect((await backfillStudentReceipts(rows, null, student.login_username)).receiptsBackfilled).toBe(0);
    expect(computeEffort(rows)).toEqual({ points: 0, candy: 0 });
  });
  it('uses ignoreDuplicates and reports insertion from returned database rows', async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [{ ledger_id: 'first' }] }).mockResolvedValueOnce({ data: [] });
    const upsert = vi.fn(() => ({ select }));
    const db = createLedgerDb({ from: () => ({ upsert }) });
    const row = { studentId: 's1', source: 'bonus_applied', itemId: 'BONUS-APPLIED-Q1', response: '{}', score: 90 };
    expect((await db.insertLedgerRowIfAbsent(row)).inserted).toBe(true);
    expect((await db.insertLedgerRowIfAbsent(row)).inserted).toBe(false);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ student_id: 's1', attempt: 1 }),
      { onConflict: 'student_id,source,item_id,attempt', ignoreDuplicates: true });
    expect(select).toHaveBeenCalledWith('*');
  });
  it('writes an audit once, and reports already-applied students on the second call', async () => {
    const { request, writes } = await start();
    const first = await request('/class/quarter/apply-bonus', { quarter: 'Q1', dryRun: false });
    expect(first.body.applied).toBe(1);
    expect(writes[0]).toMatchObject({ source: 'bonus_applied', itemId: 'BONUS-APPLIED-Q1', score: 90, attempt: 1 });
    expect(JSON.parse(writes[0].response)).toMatchObject({ points: 5, workBefore: 35, workAfter: 40,
      frozenGrade: 63, adjustedGrade: 90, switched: true, appliedAt: expect.any(String), sheets: ['BONUS-U1-screen-time'] });
    const second = await request('/class/quarter/apply-bonus', { quarter: 'Q1', dryRun: false });
    expect(second.body).toMatchObject({ applied: 0, rows: [], skipped: [{ studentId: 's1', reason: 'already applied' }] });
    expect(writes).toHaveLength(1);
    const deltas = await request('/class/quarter/deltas?quarter=Q1');
    expect(deltas.body.deltas[0].bonus.applied).toEqual({ adjustedGrade: 90, appliedAt: JSON.parse(writes[0].response).appliedAt,
      placement: 'work' });
  });
  it('keeps banked students without positive deltas and ignores other-quarter bonus', async () => {
    const { request } = await start({ ledger: [bank(), { ...bank('Q2'), item_id: 'BONUS-other' }] });
    const result = await request('/class/quarter/deltas?quarter=Q1');
    expect(result.status).toBe(200);
    expect(result.body.deltas).toHaveLength(1);
    expect(result.body.deltas[0].bonus).toEqual({ points: 5, applied: null,
      sheets: [{ itemId: 'BONUS-U1-screen-time', title: 'Screen Time', grade: 'E', points: 5 }] });
    expect(result.body.deltas[0].delta).toBeLessThanOrEqual(0);
  });
  it('preserves positive-only delta semantics without bonus', async () => {
    const { request } = await start({ ledger: [] });
    expect((await request('/class/quarter/deltas?quarter=Q1')).body.deltas).toEqual([]);
  });
  it('scopes application to frozen students, quarter, and section', async () => {
    const { request, writes } = await start();
    expect((await request('/class/quarter/apply-bonus', { quarter: 'Q2', dryRun: false })).body.rows).toEqual([]);
    expect((await request('/class/quarter/apply-bonus', { quarter: 'Q1', section: 'PeriodE', dryRun: false })).body.rows).toEqual([]);
    expect(writes).toHaveLength(0);
    const unfrozen = await start({ snapshots: [] });
    expect((await unfrozen.request('/class/quarter/apply-bonus', { quarter: 'Q1' })).body.rows).toEqual([]);
  });
  it('deltas preview carries the placement fields for banked students', async () => {
    // Default fixture (PC 90, Work 35, frozen 63, P 5): Work 90 vs PC 66.5 → Work (see case c-style arithmetic).
    const { request } = await start();
    const row = (await request('/class/quarter/deltas?quarter=Q1')).body.deltas[0];
    expect(row).toMatchObject({ placement: 'work', pcBefore: 90, pcAfter: 95, altGrade: 66.5, bonusGrade: 90 });
  });
  it.each(['/class/bonus', '/class/quarter/apply-bonus'])('returns migration 0036 guidance on CHECK failure: %s', async path => {
    const { request } = await start({ insertError: { code: '23514', message: 'item_ledger_source_check' } });
    const result = await request(path, { sheetId: 'test', title: 'Test', quarter: 'Q1', dryRun: false,
      entries: [{ studentId: 's1', grade: 'E' }] });
    expect(result.status).toBe(503);
    expect(result.body.error).toContain('run migration 0036');
  });
});

// ── Bonus Bank v2: placed on the higher track (BONUS_HIGHER_TRACK_SPEC.md §4) ──
// Gates 0.40 / 0.70. combineV3 both ≥ .40 → max(pc, work); otherwise
// max(.7·pc, .7·work, (pc + work)/2). Every expected number below is worked by hand.
describe('bonus placement on the higher track', () => {
  const GATES = { floor: 0.40, ceiling: 0.70 };
  const who = { student_id: 's1', login_username: 'pear_cat', real_name: 'Test Student' };
  const snap = (pc, work, frozen) => ({ frozen_pc_avg: pc == null ? null : String(pc),
    frozen_work_avg: String(work), frozen_grade: String(frozen), frozen_at: '2026-09-23T12:00:00Z' });
  const banked = points => ({ points, sheets: [] });
  const audit = (pc, work, frozen, points) => bonusAudit(who, snap(pc, work, frozen), banked(points), GATES);

  it('(a) both ≥ 40, PC higher → placed on PC, adjusted = pc + P', () => {
    // PC 85, Work 60, P 5. Frozen: both ≥ .40 → max(.85, .60) = .85 → 85; residual 0.
    //   Work candidate: max(.85, .65) = .85 → 85
    //   PC candidate:   max(.90, .60) = .90 → 90 = 85 + 5 → PC
    expect(audit(85, 60, 85, 5)).toMatchObject({ placement: 'pc', adjustedGrade: 90, altGrade: 85,
      pcBefore: 85, pcAfter: 90, workBefore: 60, workAfter: 65, switched: false, earlyBonus: 0 });
  });

  it('(b) both ≥ 40, Work higher → placed on Work', () => {
    // PC 60, Work 85, P 5. Frozen max(.60, .85) = 85.
    //   Work candidate: max(.60, .90) = .90 → 90
    //   PC candidate:   max(.65, .85) = .85 → 85 → Work
    expect(audit(60, 85, 85, 5)).toMatchObject({ placement: 'work', adjustedGrade: 90, altGrade: 85,
      pcBefore: 60, pcAfter: 65, workBefore: 85, workAfter: 90, switched: false });
  });

  it('(c) Work 37 < 40, PC 90, P 5 lifts Work to 42 → both candidates compared', () => {
    // Frozen: Work .37 < .40 → max(.7×.90, .7×.37, (.90+.37)/2) = max(.63, .259, .635) = .635 → 63.5; residual 0.
    //   Work candidate: Work .42 ≥ .40 and PC .90 ≥ .40 → max(.90, .42) = .90 → 90
    //   PC candidate:   Work .37 < .40 → max(.7×.95, .7×.37, (.95+.37)/2) = max(.665, .259, .66) = .665 → 66.5
    //   90 > 66.5 → Work, and the floor is crossed on Work (37 → 42).
    expect(audit(90, 37, 63.5, 5)).toMatchObject({ placement: 'work', adjustedGrade: 90, altGrade: 66.5,
      workBefore: 37, workAfter: 42, pcBefore: 90, pcAfter: 95, switched: true, earlyBonus: 0 });
  });

  it('(d) PC null → Work only, pcAfter null', () => {
    // combineV3(null, w) = w. Work 35 + 5 = 40 → 40; floor crossed on Work (35 → 40). No PC candidate.
    expect(audit(null, 35, 35, 5)).toMatchObject({ placement: 'work', adjustedGrade: 40, altGrade: null,
      pcBefore: null, pcAfter: null, switched: true });
  });

  it('(e) tie → the track with the higher frozen average, then Work', () => {
    // PC 98, Work 97, P 5: Work cand max(.98, 1.00) = 100; PC cand max(1.00, .97) = 100 → tie; PC 98 > Work 97 → PC.
    expect(audit(98, 97, 98, 5)).toMatchObject({ placement: 'pc', adjustedGrade: 100, altGrade: 100 });
    // PC 97, Work 98, P 5: both candidates 100 → tie; Work 98 > PC 97 → Work.
    expect(audit(97, 98, 98, 5)).toMatchObject({ placement: 'work', adjustedGrade: 100, altGrade: 100 });
    // PC 70, Work 70, P 5: both candidates max(.75, .70) = 75 → tie; averages tie too → Work.
    expect(audit(70, 70, 70, 5)).toMatchObject({ placement: 'work', adjustedGrade: 75, altGrade: 75 });
  });

  it('(f) monotone: for P = 0..35 the adjusted grade never drops and stays ≥ frozen', () => {
    // Hand-worked anchor points for PC 90, Work 30 (frozen max(.63, .21, .60) = .63 → 63):
    //   P 0:  both candidates 63 → tie → PC (90 > 30)                         → 63
    //   P 1:  Work max(.63, .217, .605) = 63; PC max(.7×.91=.637, .21, .605) → 63.7 (PC)
    //   P 9:  Work max(.63, .273, .645) = 64.5; PC .7×.99 = .693            → 69.3 (PC)
    //   P 10: Work .40 reaches the floor → max(.90, .40) = 90; PC .7×1.00 = 70 → 90 (Work, switched)
    //   P 35: Work max(.90, .65) = 90; PC max(.70, .21, .65) = 70            → 90 (Work)
    const anchors = { 0: [63, 'pc'], 1: [63.7, 'pc'], 9: [69.3, 'pc'], 10: [90, 'work'], 35: [90, 'work'] };
    for (const [p, [grade, placement]] of Object.entries(anchors)) {
      expect(audit(90, 30, 63, Number(p))).toMatchObject({ adjustedGrade: grade, placement });
    }
    expect(audit(90, 30, 63, 10).switched).toBe(true);
    const fixtures = [[90, 30, 63], [85, 60, 85], [60, 85, 85], [90, 37, 63.5], [null, 35, 35], [50, 60, 64], [20, 20, 20]];
    for (const [pc, work, frozen] of fixtures) {
      let last = -Infinity;
      for (let p = 0; p <= 35; p++) {
        const row = audit(pc, work, frozen, p);
        expect(row.adjustedGrade).toBeGreaterThanOrEqual(last);
        expect(row.adjustedGrade).toBeGreaterThanOrEqual(frozen);
        expect(row.adjustedGrade).toBeLessThanOrEqual(100);
        last = row.adjustedGrade;
      }
    }
  });

  it('(g) bonus_applied response carries placement; a student read shows the placement word and nothing else new', async () => {
    // PC 85, Work 60, frozen 85, one E sheet (P 5) → case (a): PC, 90.
    const { request, writes } = await start({ pc: '85', work: '60', frozen: '85' });
    const applied = await request('/class/quarter/apply-bonus', { quarter: 'Q1', dryRun: false });
    expect(applied.body.rows[0]).toMatchObject({ placement: 'pc', pcBefore: 85, pcAfter: 90, altGrade: 85, adjustedGrade: 90 });
    expect(JSON.parse(writes[0].response)).toMatchObject({ placement: 'pc', pcBefore: 85, pcAfter: 90, altGrade: 85,
      workBefore: 60, workAfter: 65, adjustedGrade: 90 });
    expect(writes[0].score).toBe(90);
    const publicRows = (await request('/ledger/student/s1?token=student-token', undefined, false)).body.rows;
    const publicDetail = JSON.parse(publicRows.find(r => r.source === 'bonus_applied').response);
    expect(publicDetail).toEqual({ adjustedGrade: 90, appliedAt: expect.any(String), placement: 'pc' });
  });
});
