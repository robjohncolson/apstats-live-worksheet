import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import express from 'express';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { initReceipts } from '../receipts.js';

import { signToken } from '../token.js';
import { fiveNumberSummary, mountClassSnapshot, mergeSnapshots } from '../class-snapshot.js';
const TEACHER = 'teacher-secret-fixture';
const TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIIq2JsDpBMHpUzaFF6mPR0vUv1T2gzXGX7k/AQSYjyl0';

const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'curriculum_render/data/curriculum.js (READ-ONLY)',
  answerKey: {
    'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1' },
    'U1-L1-Q02': { answerKey: 'C', type: 'multiple-choice', unit: '1' },
    'U2-L1-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '2' },
    'U1-PC-MCQ-A-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '1' },
  },
};
const FIXTURE_SKILL_MAP = {
  'U1-L1-Q01': { skill: '1.A' },
  'U1-L1-Q02': { skill: '1.A' },
  'U2-L1-Q01': { skill: '2.B' },
  'U1-PC-MCQ-A-Q01': { skill: '1.C' },
};

// Fake roster db exposing listRoster (used by /class/* and /roster/list).
// uidMap (optional): when provided the db exposes getSchoologyUidMap so
// /class/grades can surface schoologyUid. When omitted the function is absent
// entirely -- exercising class.js's typeof-guard back-compat path.
function createFakeRosterDb(roster, { error = null, uidMap } = {}) {
  const db = {
    async findByStudentId(id) { return { data: roster.find(r => r.student_id === id), error: null }; },
    async getRoleByStudentId(id) { return roster.find(r => r.student_id === id)?.role || 'student'; },
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async listRoster(section) {
      if (error) return { data: null, error };
      const rows = section ? roster.filter(r => r.section === section) : roster.slice();
      return { data: rows, error: null };
    },
  };
  if (uidMap) {
    db.getSchoologyUidMap = async (studentIds) => {
      const out = {};
      for (const sid of studentIds || []) {
        if (uidMap[sid] != null) out[sid] = uidMap[sid];
      }
      return out;
    };
  }
  // In-memory quarter_grade_snapshot (migration 0030) for the freeze/delta tests:
  // idempotent (first close of a (student,quarter) wins).
  const snapStore = [];
  db._snapStore = snapStore;
  db.snapshotQuarter = async (rows) => {
    const inserted = [];
    for (const r of rows || []) {
      if (snapStore.some((s) => s.student_id === r.studentId && s.quarter === r.quarter)) continue;
      const row = {
        student_id: r.studentId, login_username: r.loginUsername ?? null, quarter: r.quarter,
        frozen_grade: r.frozenGrade ?? null, frozen_pc_avg: r.frozenPcAvg ?? null,
        frozen_work_avg: r.frozenWorkAvg ?? null, closed_by: r.closedBy ?? null,
        frozen_at: new Date().toISOString(),
      };
      snapStore.push(row); inserted.push(row);
    }
    return { data: inserted, error: null };
  };
  db.listQuarterSnapshot = async (quarter) => ({ data: snapStore.filter((s) => s.quarter === quarter), error: null });
  return db;
}

// Fake ledger db indexed by student_id.
function createFakeLedgerDb(rowsByStudent, { error = null, throwForStudentId = null } = {}) {
  const store = { ...rowsByStudent };
  return {
    _store: store,
    async getLedgerByStudent(studentId) {
      if (throwForStudentId === studentId) throw new Error('boom for ' + studentId);
      if (error) return { data: null, error };
      return { data: store[studentId] || [], error: null };
    },
    async updateLedgerReceipt(ledgerId, { receiptId, receiptCompact }) {
      for (const rows of Object.values(store)) {
        if (!Array.isArray(rows)) continue;
        const row = rows.find((entry) => entry.ledger_id === ledgerId);
        if (!row) continue;
        row.receipt_id = receiptId;
        row.receipt_compact = receiptCompact;
        return { error: null };
      }
      return { error: null };
    },
    async insertLedgerRow() { store._written = true; return { data: {}, error: null }; },
  };
}

function makeRow(studentId, itemId, response, { source = 'curriculum_quiz', score, unit, attempt = 1, recorded_at } = {}) {
  return {
    ledger_id: `${studentId}-${itemId}-${attempt}`,
    student_id: studentId, source, item_id: itemId, response,
    score: score === undefined ? null : score, unit, attempt,
    recorded_at: recorded_at || new Date().toISOString(),
  };
}

const fakeLoadManifest = async () => ({ generatedFrom: 'x', units: [] });
const okAnswerKey = async () => FIXTURE_ANSWER_KEY;
const okSkillMap = async () => FIXTURE_SKILL_MAP;

class TestServer {
  constructor(app) { this.server = http.createServer(app); this.baseUrl = null; }
  start() {
    return new Promise(r => this.server.listen(0, '127.0.0.1', () => {
      this.baseUrl = `http://127.0.0.1:${this.server.address().port}`; r();
    }));
  }
  stop() { return new Promise(r => this.server.close(r)); }
  async get(path, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'GET', headers });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  }
  async post(path, headers = {}, body = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    let parsed = null;
    try { parsed = await res.json(); } catch { parsed = null; }
    return { status: res.status, body: parsed };
  }
}

async function startServer({
  roster = [], ledger = {},
  loadAnswerKey = okAnswerKey, loadSkillMap = okSkillMap, bkt,
  rosterOpts = {}, ledgerOpts = {},
  lessonSchedule,
} = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
  delete process.env.TEACHER_KEY;   // keep the simple-key default unset for 'wrong secret → 401'
  process.env.NODE_ENV = 'test';
  const rosterDb = createFakeRosterDb(roster, rosterOpts);
  const ledgerDb = createFakeLedgerDb(ledger, ledgerOpts);
  const app = createApp(rosterDb, ledgerDb, fakeLoadManifest, loadAnswerKey, loadSkillMap, bkt || null, null, lessonSchedule);
  const server = new TestServer(app);
  await server.start();
  return { server, rosterDb, ledgerDb };
}

let srv;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // UTC is the next day; asOf must still use New York's date.
  vi.setSystemTime(new Date('2026-09-27T02:00:00Z'));
});
afterEach(async () => {
  if (srv) { await srv.stop(); srv = null; }
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  delete process.env.TEACHER_KEY;
  process.env.NODE_ENV = 'test';
  vi.restoreAllMocks();
  vi.useRealTimers();
  initReceipts();
});

const teacher = { 'x-teacher-secret': TEACHER };
const roster = Array.from({ length: 6 }, (_, i) => ({
  student_id: `s${i}`, real_name: `Student ${i}`, login_username: `student_${i}`, section: 'PeriodB',
}));
const ledger = Object.fromEntries(roster.map((student, i) => [student.student_id, [
  makeRow(student.student_id, 'WS-U1L1-r1', 'answer', { source: 'frq', unit: 'U1', score: (i + 1) / 7 }),
  makeRow(student.student_id, 'WS-U2L1-r1', 'answer', { source: 'frq', unit: 'U2', score: 0 }),
]]));

function scanKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(['username', 'realName', 'studentId', 'student_id', 'login_username', 'real_name']).not.toContain(key);
    scanKeys(child);
  }
}

describe('fiveNumberSummary', () => {
  it('uses AP / TI-84 halves for the CED example', () => {
    expect(fiveNumberSummary([31,37,39,50,61,92,97,97,99,99,100,100,100,100,100]))
      .toEqual({ min: 31, q1: 50, median: 97, q3: 100, max: 100 });   // lower half [31,37,39,50,61,92,97] -> 50
  });
  it('averages the middle pair in even halves', () => {
    expect(fiveNumberSummary([1,2,3,4])).toEqual({ min: 1, q1: 1.5, median: 2.5, q3: 3.5, max: 4 });
  });
  it('handles a single value', () => {
    expect(fiveNumberSummary([5])).toEqual({ min: 5, q1: 5, median: 5, q3: 5, max: 5 });
  });
  it('handles no values', () => expect(fiveNumberSummary([])).toBeNull());
  it('sorts without mutating its input', () => {
    const values = [4, 1, 3, 2];
    expect(fiveNumberSummary(values).median).toBe(2.5);
    expect(values).toEqual([4, 1, 3, 2]);
  });
});

describe('GET /class/snapshot', () => {
  it('allows the teacher for any section, including an empty section', async () => {
    const ctx = await startServer({ roster, ledger }); srv = ctx.server;
    for (const section of ['PeriodB', 'PeriodE']) {
      const r = await srv.get(`/class/snapshot?section=${section}`, teacher);
      expect(r.status).toBe(200);
      expect(r.body.section).toBe(section);
    }
  });
  it('allows a roster teacher token for another section', async () => {
    const ctx = await startServer({ roster: [...roster, { student_id: 't', role: 'teacher', section: 'PeriodE' }], ledger }); srv = ctx.server;
    expect((await srv.get('/class/snapshot?section=PeriodB', { authorization: `Bearer ${signToken('t')}` })).status).toBe(200);
  });
  it('allows a student only for their own section', async () => {
    const ctx = await startServer({ roster, ledger }); srv = ctx.server;
    const headers = { authorization: `Bearer ${signToken('s0')}` };
    expect((await srv.get('/class/snapshot?section=PeriodB', headers)).status).toBe(200);
    expect(await srv.get('/class/snapshot?section=PeriodE', headers))
      .toEqual({ status: 401, body: { ok: false, error: 'forbidden' } });
  });
  it('rejects missing, invalid, expired, and unrostered student tokens', async () => {
    const ctx = await startServer({ roster, ledger }); srv = ctx.server;
    const expired = signToken('s0');
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    for (const token of ['', 'invalid', expired, signToken('unknown')]) {
      expect((await srv.get('/class/snapshot?section=PeriodB', { authorization: `Bearer ${token}` })).status).toBe(401);
    }
  });
  it.each(['', '?section=', '?section=%20', '?section[]=PeriodB', '?section=PeriodB&section=PeriodE', '?section=bad%2Fsection'])
    ('rejects a missing or invalid section: %s', async (query) => {
      const ctx = await startServer({ roster }); srv = ctx.server;
      expect((await srv.get(`/class/snapshot${query}`, teacher)).status).toBe(400);
    });
  it('matches class grades, rounds and sorts, excludes staff and missing grades, and exposes only anonymous fields', async () => {
    const ctx = await startServer({
      roster: [...roster.slice().reverse(), { student_id: 't', role: 'teacher', section: 'PeriodB' },
        { student_id: 'empty', section: 'PeriodB' }],
      ledger: { ...ledger, t: ledger.s0 },
    }); srv = ctx.server;
    const grades = await srv.get('/class/grades?section=PeriodB', teacher);
    expect(grades.body.students.map(s => s.studentId)).not.toContain('t');
    const raw = grades.body.students.map(s => s.quarters.Q1.quarterGrade).filter(Number.isFinite);
    expect(raw.some(value => value !== Math.round(value))).toBe(true);
    const values = raw.map(Math.round).sort((a, b) => a - b);
    const r = await srv.get('/class/snapshot?section=PeriodB&includeStaff=1&includeSavedWork=1', teacher);
    const fiveNumber = fiveNumberSummary(values);
    const iqr = fiveNumber.q3 - fiveNumber.q1;
    const fences = { low: fiveNumber.q1 - 1.5 * iqr, high: fiveNumber.q3 + 1.5 * iqr };
    expect(r).toEqual({ status: 200, body: {
      ok: true, section: 'PeriodB', quarter: 'Q1', asOf: '2026-09-26', n: 6,
      values, fiveNumber, iqr, fences, outliers: values.filter(v => v < fences.low || v > fences.high),
    } });
    scanKeys(r.body);
    expect(ctx.ledgerDb._store._written).toBeUndefined();
    expect(ctx.rosterDb._snapStore).toEqual([]);
    const student = await srv.get('/class/snapshot?section=PeriodB', { authorization: `Bearer ${signToken('s0')}` });
    expect(student.body).toEqual(r.body);
    scanKeys(student.body);
  });
  it.each([0, 1, 4])('suppresses grades below the privacy floor (n=%s)', async (n) => {
    const ctx = await startServer({ roster: roster.slice(0, n), ledger }); srv = ctx.server;
    const r = await srv.get('/class/snapshot?section=PeriodB', teacher);
    expect(r.body).toEqual({ ok: true, section: 'PeriodB', quarter: 'Q1', asOf: '2026-09-26', n,
      values: [], fiveNumber: null, iqr: null, fences: null, outliers: [] });
    scanKeys(r.body);
  });
  it.each(['roster', 'ledger', 'key', 'throw'])('returns 503 when %s computation fails', async (failure) => {
    const ctx = await startServer({ roster, ledger,
      rosterOpts: failure === 'roster' ? { error: { message: 'down' } } : {},
      ledgerOpts: failure === 'ledger' ? { throwForStudentId: 's0' } : {},
      loadAnswerKey: failure === 'key' ? async () => ({}) : failure === 'throw' ? async () => { throw new Error('down'); } : okAnswerKey,
    }); srv = ctx.server;
    expect(await srv.get('/class/snapshot?section=PeriodB', teacher))
      .toEqual({ status: 503, body: { ok: false, error: 'gradebook unavailable' } });
  });
  it('bypasses caching in test mode', async () => {
    const ctx = await startServer({ roster, ledger }); srv = ctx.server;
    const read = vi.spyOn(ctx.ledgerDb, 'getLedgerByStudent');
    await srv.get('/class/snapshot?section=PeriodB', teacher);
    await srv.get('/class/snapshot?section=PeriodB', teacher);
    expect(read).toHaveBeenCalledTimes(12);
  });
  it('caches per section for five minutes, shares concurrent work, and authenticates cache hits', async () => {
    const ctx = await startServer({ roster, ledger }); srv = ctx.server;
    process.env.NODE_ENV = 'production';
    const read = vi.spyOn(ctx.ledgerDb, 'getLedgerByStudent');
    const first = await Promise.all(Array.from({ length: 3 }, () => srv.get('/class/snapshot?section=PeriodB', teacher)));
    expect(first.every(r => r.status === 200)).toBe(true);
    expect(read).toHaveBeenCalledTimes(6);
    expect((await srv.get('/class/snapshot?section=PeriodB')).status).toBe(401);
    expect((await srv.get('/class/snapshot?section=PeriodE', teacher)).body.n).toBe(0);
    vi.setSystemTime(Date.now() + 299999);
    await srv.get('/class/snapshot?section=PeriodB', teacher);
    expect(read).toHaveBeenCalledTimes(6);
    vi.setSystemTime(Date.now() + 1);
    await srv.get('/class/snapshot?section=PeriodB', teacher);
    expect(read).toHaveBeenCalledTimes(12);
  });
  it('does not cache a failed computation', async () => {
    const ctx = await startServer({ roster, ledger }); srv = ctx.server;
    process.env.NODE_ENV = 'production';
    vi.spyOn(ctx.ledgerDb, 'getLedgerByStudent').mockRejectedValueOnce(new Error('temporary'));
    expect((await srv.get('/class/snapshot?section=PeriodB', teacher)).status).toBe(503);
    expect((await srv.get('/class/snapshot?section=PeriodB', teacher)).status).toBe(200);
  });
});

// Deliberately inserted out of order; class grades put lessons in schedule order.
// The 13-day lag makes 9/12 count on asOf 9/26; 9/13 is still open that day.
const assignmentSchedule = {
  '1.2': { unit: 1, worksheetKey: '2', periods: { B: '2026-09-12', E: '2026-09-13' } },
  '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2026-09-12', E: '2026-09-14' } },
  '1.3': { unit: 1, worksheetKey: '3', periods: { B: '2026-09-14', E: '2026-09-14' } },
  '1.4': { unit: 1, worksheetKey: '4', periods: {} },
  '1.5': { unit: 1, worksheetKey: '5', periods: { E: '2026-09-12' } },
  '1.6': { unit: 1, periods: { B: '2026-09-12' } },
  '1.99': { unit: 1, worksheetKey: '99', periods: { B: '2026-09-12' } },
};
const assignmentLedger = Object.fromEntries(roster.slice(1).map((student, i) => [student.student_id, [
  makeRow(student.student_id, 'WS-U1L1-r1', 'answer', { source: 'frq', unit: 'U1', score: 1 }),
  makeRow(student.student_id, 'U1-L1-Q01', 'B'),
  makeRow(student.student_id, 'U1-L1-Q02', 'C'),
  makeRow(student.student_id, 'BLOOKET-U1L1', 'played', { source: 'blooket', score: (i + 2) / 7 }),
]]));

// Inject grade results directly so malformed numeric values reach serialization.
async function startSnapshotFixture(lessons) {
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  const app = express();
  mountClassSnapshot(app, {
    db: createFakeRosterDb(roster), verifyToken: () => null,
    config: { quarters: { Q1: { start: '2026-08-01', end: '2026-10-31' } } },
    computeClassGrades: async () => ({
      ok: true, students: roster.map(() => ({ quarters: { Q1: { quarterGrade: 80 } }, lessons })),
    }),
  });
  srv = new TestServer(app);
  await srv.start();
}

describe('GET /class/snapshot?by=assignment', () => {
  it('omits bonus Blookets while retaining their worksheet', async () => {
    const ctx = await startServer({ roster, lessonSchedule: {
      '2.9': { unit: 2, worksheetKey: '9', periods: { B: '2026-09-12' } },
    } }); srv = ctx.server;
    const grades = await srv.get('/class/grades?section=PeriodB', teacher);
    expect(grades.body.students[0].lessons[0]).toMatchObject({ hasBlooket: true, blooketBonus: true });
    const r = await srv.get('/class/snapshot?section=PeriodB&by=assignment', teacher);
    expect(r.body.assignments.map(item => item.key)).toEqual(['2.9:worksheet']);
  });

  it('deduplicates combined worksheets and Blookets but keeps quizzes per lesson', async () => {
    const lessons = ['4.3', '4.4', '4.5'].map(lessonKey => ({
      lessonKey, unit: 4, worksheetKey: '3-5', zeroDate: { B: '2026-09-25' },
      hasBlooket: true, blooketBonus: false, quizTotal: 1,
      lessonGradeNoQuiz: 85, blooket: 70, Q: Number(lessonKey.slice(-1)) * 10,
    }));
    await startSnapshotFixture(lessons);
    const r = await srv.get('/class/snapshot?section=PeriodB&by=assignment', teacher);
    expect(r.body.assignments.map(item => [item.key, item.title])).toEqual([
      ['4.3:worksheet', '4.3 Follow-Along'], ['4.3:quiz', '4.3 Quiz'],
      ['4.3:blooket', '4.3 Blooket'], ['4.4:quiz', '4.4 Quiz'], ['4.5:quiz', '4.5 Quiz'],
    ]);
    expect(r.body.assignments.filter(item => item.track === 'quiz').map(item => item.values))
      .toEqual([Array(6).fill(30), Array(6).fill(40), Array(6).fill(50)]);
  });

  it('replaces non-finite scores with zero and preserves finite bonus scores', async () => {
    await startSnapshotFixture([{
      lessonKey: '1.1', unit: 1, worksheetKey: '1', zeroDate: { B: '2026-09-25' },
      hasBlooket: true, quizTotal: 1, lessonGradeNoQuiz: NaN, Cws: 90, Q: Infinity, blooket: -Infinity,
    }, {
      lessonKey: '1.2', unit: 1, worksheetKey: '2', zeroDate: { B: '2026-09-25' },
      lessonGradeNoQuiz: 104.6,
    }]);
    const r = await srv.get('/class/snapshot?section=PeriodB&by=assignment', teacher);
    expect(r.status).toBe(200);
    expect(r.body.assignments).toHaveLength(4);
    for (const item of r.body.assignments.slice(0, 3)) {
      expect(item.values).toEqual([0, 0, 0, 0, 0, 0]);
      expect(item.zeros).toBe(6);
    }
    expect(r.body.assignments[3].values).toEqual([105, 105, 105, 105, 105, 105]);
  });

  it('returns only due lesson tracks in schedule order and counts missing scores as zeros', async () => {
    const ctx = await startServer({
      roster: [...roster.slice().reverse(), { student_id: 't', role: 'teacher', section: 'PeriodB' }],
      ledger: assignmentLedger, lessonSchedule: assignmentSchedule,
    }); srv = ctx.server;
    const before = JSON.stringify(ctx.ledgerDb._store);
    const r = await srv.get('/class/snapshot?section=PeriodB&by=assignment&includeStaff=1', teacher);
    expect(r.status).toBe(200);
    expect(r.body.assignments.map(item => item.key)).toEqual([
      '1.1:worksheet', '1.1:quiz', '1.1:blooket',
      '1.2:worksheet', '1.2:blooket', '1.6:blooket', '1.99:worksheet',
    ]);
    expect(r.body.assignments[0]).toEqual({
      key: '1.1:worksheet', lessonKey: '1.1', track: 'worksheet', title: '1.1 Follow-Along',
      zeroDate: '2026-09-25', n: 6, values: [0, 100, 100, 100, 100, 100],
      fiveNumber: { min: 0, q1: 100, median: 100, q3: 100, max: 100 },
      iqr: 0, fences: { low: 100, high: 100 }, outliers: [0], zeros: 1,
    });
    expect(r.body.assignments[1]).toMatchObject({ title: '1.1 Quiz', values: [0, 100, 100, 100, 100, 100], zeros: 1 });
    expect(r.body.assignments[2]).toMatchObject({ title: '1.1 Blooket', values: [0, 29, 43, 57, 71, 86], zeros: 1 });
    expect(r.body.assignments[3]).toMatchObject({ values: [0, 0, 0, 0, 0, 0], zeros: 6, n: 6 });
    scanKeys(r.body);
    expect(JSON.stringify(ctx.ledgerDb._store)).toBe(before);
    expect(ctx.rosterDb._snapStore).toEqual([]);
    const student = await srv.get('/class/snapshot?section=PeriodB&by=assignment', { authorization: `Bearer ${signToken('s0')}` });
    expect(student.body).toEqual(r.body);
    scanKeys(student.body);
  });

  it('uses the requested period zero date and omits future and undated lessons', async () => {
    const ctx = await startServer({
      roster: roster.map(student => ({ ...student, section: 'PeriodE' })),
      ledger: assignmentLedger, lessonSchedule: assignmentSchedule,
    }); srv = ctx.server;
    const r = await srv.get('/class/snapshot?section=PeriodE&by=assignment', teacher);
    expect(r.body.assignments.map(item => item.key)).toEqual([
      '1.5:worksheet', '1.5:blooket',
    ]);
    expect(r.body.assignments.every(item => item.zeroDate === '2026-09-25')).toBe(true);
    vi.setSystemTime(new Date('2026-09-28T02:00:00Z'));
    const nextDay = await srv.get('/class/snapshot?section=PeriodE&by=assignment', teacher);
    expect(nextDay.body.asOf).toBe('2026-09-27');
    expect(nextDay.body.assignments.map(item => item.key)).toEqual([
      '1.2:worksheet', '1.2:blooket', '1.5:worksheet', '1.5:blooket',
    ]);
    expect(nextDay.body.assignments[0].zeroDate).toBe('2026-09-26');
  });

  it.each([1, 4, 5])('applies the privacy floor using the real roster count (n=%s)', async (n) => {
    const ctx = await startServer({
      roster: [...roster.slice(0, n), { student_id: 't', role: 'teacher', section: 'PeriodB' }],
      lessonSchedule: assignmentSchedule,
    }); srv = ctx.server;
    const r = await srv.get('/class/snapshot?section=PeriodB&by=assignment', teacher);
    expect(r.body.assignments).toHaveLength(7);
    for (const item of r.body.assignments) {
      expect(Object.keys(item).sort()).toEqual([
        'key', 'lessonKey', 'track', 'title', 'zeroDate', 'n', 'values',
        'fiveNumber', 'iqr', 'fences', 'outliers', 'zeros',
      ].sort());
      expect(Array.isArray(item.values)).toBe(true);
      expect(item.values.every(Number.isFinite)).toBe(true);
      expect(item).toMatchObject(n < 5
        ? { n, values: [], fiveNumber: null, iqr: null, fences: null, outliers: [], zeros: null }
        : { n, values: [0, 0, 0, 0, 0], fiveNumber: { min: 0, q1: 0, median: 0, q3: 0, max: 0 },
          iqr: 0, fences: { low: 0, high: 0 }, outliers: [], zeros: 5 });
    }
    scanKeys(r.body);
  });

  it('keeps the serialized Phase 1 payload unchanged without the flag', async () => {
    const ctx = await startServer({ roster, ledger: assignmentLedger, lessonSchedule: assignmentSchedule }); srv = ctx.server;
    const plain = await srv.get('/class/snapshot?section=PeriodB', teacher);
    const expanded = await srv.get('/class/snapshot?section=PeriodB&by=assignment', teacher);
    const { assignments, ...phase1 } = expanded.body;
    expect(assignments).toHaveLength(7);
    expect(JSON.stringify(phase1)).toBe(JSON.stringify(plain.body));
    expect(Object.keys(plain.body)).toEqual([
      'ok', 'section', 'quarter', 'asOf', 'n', 'values', 'fiveNumber', 'iqr', 'fences', 'outliers',
    ]);
  });

  it.each(['default', 'assignment'])('separates caches with %s requested first, shares work, and checks auth', async (firstMode) => {
    const ctx = await startServer({ roster, ledger: assignmentLedger, lessonSchedule: assignmentSchedule }); srv = ctx.server;
    process.env.NODE_ENV = 'production';
    const read = vi.spyOn(ctx.ledgerDb, 'getLedgerByStudent');
    const plainUrl = '/class/snapshot?section=PeriodB';
    const assignmentUrl = `${plainUrl}&by=assignment`;
    const urls = firstMode === 'default' ? [plainUrl, assignmentUrl] : [assignmentUrl, plainUrl];
    for (const url of urls) {
      const results = await Promise.all([srv.get(url, teacher), srv.get(url, teacher)]);
      expect(results[0]).toEqual(results[1]);
      expect(results[0].status).toBe(200);
      expect(Object.hasOwn(results[0].body, 'assignments')).toBe(url === assignmentUrl);
    }
    expect(read).toHaveBeenCalledTimes(12);
    await srv.get(plainUrl, teacher);
    await srv.get(assignmentUrl, teacher);
    expect(read).toHaveBeenCalledTimes(12);
    expect((await srv.get(assignmentUrl)).status).toBe(401);
    expect((await srv.get('/class/snapshot?section=PeriodE&by=assignment', {
      authorization: `Bearer ${signToken('s0')}`,
    })).status).toBe(401);
    vi.setSystemTime(Date.now() + 300000);
    await srv.get(assignmentUrl, teacher);
    expect(read).toHaveBeenCalledTimes(18);
  });

  it('returns 503 for incomplete grades and does not cache that failure', async () => {
    const ctx = await startServer({ roster, ledger: assignmentLedger, lessonSchedule: assignmentSchedule }); srv = ctx.server;
    process.env.NODE_ENV = 'production';
    vi.spyOn(ctx.ledgerDb, 'getLedgerByStudent').mockRejectedValueOnce(new Error('temporary'));
    const url = '/class/snapshot?section=PeriodB&by=assignment';
    expect(await srv.get(url, teacher)).toEqual({ status: 503, body: { ok: false, error: 'gradebook unavailable' } });
    expect((await srv.get(url, teacher)).body.assignments).toHaveLength(7);
  });
});

describe('GET /class/snapshot?section=all (both periods pooled)', () => {
  it('pools values across sections, keeps the earliest zero date, counts a lesson only where it is due, and lets any student read it', async () => {
    // 6 B students + 6 E students; 1.2 is due in B (9/12 → counts 9/25) and E (9/13 → not yet on 9/26).
    const both = [...roster, ...roster.map(st => ({ ...st, student_id: `e${st.student_id}`, login_username: `e_${st.login_username}`, section: 'PeriodE' }))];
    const ledger = Object.fromEntries(both.map(st => [st.student_id, assignmentLedger[st.student_id.replace(/^e/, '')] || []]));
    const ctx = await startServer({ roster: both, ledger, lessonSchedule: {
      '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2026-09-12', E: '2026-09-10' } },
      '1.2': { unit: 1, worksheetKey: '2', periods: { B: '2026-09-12', E: '2026-09-13' } },
      '1.3': { unit: 1, worksheetKey: '3', periods: { B: '2026-09-20', E: '2026-09-20' } },
    } }); srv = ctx.server;
    const r = await srv.get('/class/snapshot?section=all&by=assignment', teacher);
    expect(r.status).toBe(200);
    scanKeys(r.body);
    expect(r.body.section).toBe('all');
    expect(r.body.sections).toEqual(['PeriodB', 'PeriodE']);
    const byKey = Object.fromEntries(r.body.assignments.map(item => [item.key, item]));
    // 1.1 worksheet: due in both → 12 values, E's earlier date wins
    expect(byKey['1.1:worksheet']).toMatchObject({ n: 12, zeroDate: '2026-09-23', zeros: 2 });
    expect(byKey['1.1:worksheet'].values).toEqual([0, 0, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(byKey['1.1:worksheet'].fiveNumber).toEqual({ min: 0, q1: 100, median: 100, q3: 100, max: 100 });
    // 1.2 worksheet: due only in B today → B's 6 (all missing → 0); E has nothing recorded for 1.2,
    // so it lends no values and no zeros before its own date
    expect(byKey['1.2:worksheet']).toMatchObject({ n: 6, zeroDate: '2026-09-25', zeros: 6 });
    expect(byKey['1.1:quiz'].pending).toBe(false);
    expect(byKey['1.1:quiz'].zeroDates).toEqual({ PeriodB: '2026-09-25', PeriodE: '2026-09-23' });
    expect(byKey['1.2:worksheet'].zeroDates).toEqual({ PeriodB: '2026-09-25', PeriodE: '2026-09-26' });   // E taught it, not yet counting
    // 1.3: taught in both (class day 9/20) but counting nowhere yet → present as pending with the
    // soonest zero date, holding only recorded scores (none in this ledger)
    expect(byKey['1.3:worksheet']).toMatchObject({ pending: true, zeroDate: '2026-10-03', n: 0, values: [], zeros: null });
    // quarter picture pooled too
    expect(r.body.n).toBe(12);
    // an E student may read the pooled picture (their own section check does not apply)
    const student = await srv.get('/class/snapshot?section=all&by=assignment', { authorization: `Bearer ${signToken('es0')}` });
    expect(student.status).toBe(200);
    expect(student.body).toEqual(r.body);
    // but still not another single section
    expect((await srv.get('/class/snapshot?section=PeriodB&by=assignment', { authorization: `Bearer ${signToken('es0')}` })).status).toBe(401);
  });
  it('mergeSnapshots nulls the zero count when either side withheld it and re-summarizes the pool', () => {
    const a = { quarter: 'Q1', asOf: '2026-09-26', values: [50, 60, 70, 80, 90], assignments: [
      { key: '1.1:quiz', title: '1.1 Quiz', zeroDate: '2026-09-25', values: [0, 100, 100, 100, 100], zeros: 1 }] };
    const b = { quarter: 'Q1', asOf: '2026-09-26', values: [], assignments: [
      { key: '1.1:quiz', title: '1.1 Quiz', zeroDate: '2026-09-24', values: [], zeros: null },
      { key: '1.2:quiz', title: '1.2 Quiz', zeroDate: '2026-09-24', values: [], zeros: null }] };
    const m = mergeSnapshots([a, b], ['PeriodB', 'PeriodE']);
    expect(m.assignments[0]).toMatchObject({ key: '1.1:quiz', zeroDate: '2026-09-24', n: 5, zeros: 1 });
    expect(m.assignments[1]).toMatchObject({ key: '1.2:quiz', n: 0, zeros: null, values: [] });
    expect(m.n).toBe(5);
  });
});

describe('pooled snapshot — a section before its zero date lends recorded scores only', () => {
  it('E students with a recorded score join the pool for a lesson due only in B; E students without one are not zeros', async () => {
    const es = roster.map(st => ({ ...st, student_id: `e${st.student_id}`, login_username: `e_${st.login_username}`, section: 'PeriodE' }));
    // B: 3 answered the quiz, 3 missing. E: 2 answered, 4 missing (E's date has not passed).
    const quiz = (sid) => [makeRow(sid, 'U1-L1-Q01', 'B'), makeRow(sid, 'U1-L1-Q02', 'C')];
    const ledger = {
      s0: quiz('s0'), s1: quiz('s1'), s2: quiz('s2'), s3: [], s4: [], s5: [],
      es0: quiz('es0'), es1: quiz('es1'), es2: [], es3: [], es4: [], es5: [],
    };
    const ctx = await startServer({ roster: [...roster, ...es], ledger, lessonSchedule: {
      '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2026-09-12', E: '2026-09-20' } },
    } }); srv = ctx.server;
    const r = await srv.get('/class/snapshot?section=all&by=assignment', teacher);
    const quizItem = r.body.assignments.find(item => item.key === '1.1:quiz');
    expect(quizItem).toMatchObject({ n: 8, zeros: 3, zeroDate: '2026-09-25' });
    expect(quizItem.values).toEqual([0, 0, 0, 100, 100, 100, 100, 100]);
    expect(quizItem.pending).toBe(false);
    // the single-section E view still hides it entirely (not due there)
    const e = await srv.get('/class/snapshot?section=PeriodE&by=assignment', teacher);
    expect(e.body.assignments.find(item => item.key === '1.1:quiz')).toBeUndefined();
  });
});

describe('pooled snapshot — a lesson taught but counting nowhere yet is a pending item', () => {
  it('appears with the soonest zero date and recorded scores only; an untaught lesson stays out', async () => {
    const quiz = (sid) => [makeRow(sid, 'U1-L1-Q01', 'B'), makeRow(sid, 'U1-L1-Q02', 'C')];
    const ledger = { s0: quiz('s0'), s1: quiz('s1'), s2: [], s3: [], s4: [], s5: [] };
    const ctx = await startServer({ roster, ledger, lessonSchedule: {
      '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2026-09-20', E: '2026-09-22' } },   // taught, counts 10/3
      '1.2': { unit: 1, worksheetKey: '2', periods: { B: '2026-10-05' } },                      // not taught yet
    } }); srv = ctx.server;
    const r = await srv.get('/class/snapshot?section=all&by=assignment', teacher);
    const keys = r.body.assignments.map(item => item.key);
    expect(keys).toEqual(['1.1:worksheet', '1.1:quiz', '1.1:blooket']);
    const quizItem = r.body.assignments.find(item => item.key === '1.1:quiz');
    expect(quizItem).toMatchObject({ pending: true, zeroDate: '2026-10-03', n: 2, values: [], zeros: null });   // n<5 floor still applies
    // the single-section view keeps ignoring pending lessons
    const b = await srv.get('/class/snapshot?section=PeriodB&by=assignment', teacher);
    expect(b.body.assignments).toEqual([]);
  });
});
