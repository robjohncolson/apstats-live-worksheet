import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { initReceipts } from '../receipts.js';

import { signToken } from '../token.js';
import { fiveNumberSummary } from '../class-snapshot.js';
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
} = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
  delete process.env.TEACHER_KEY;   // keep the simple-key default unset for 'wrong secret → 401'
  process.env.NODE_ENV = 'test';
  const rosterDb = createFakeRosterDb(roster, rosterOpts);
  const ledgerDb = createFakeLedgerDb(ledger, ledgerOpts);
  const app = createApp(rosterDb, ledgerDb, fakeLoadManifest, loadAnswerKey, loadSkillMap, bkt || null);
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
