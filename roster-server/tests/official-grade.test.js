// official-grade.test.js -- POST /class/official-grades + GET /official-grade
// (OFFICIAL_GRADE_SYNC_SPEC.md §4.3). Fake dbs + http loopback; no network/Supabase.
// Harness mirrors lesson-unlock-endpoints.test.js.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { validateGrades } from '../official-grade.js';

let realBkt;
beforeAll(async () => {
  await import('../bkt.js');
  realBkt = globalThis.BKT;
});

const TEACHER = 'teacher-secret-fixture';
const STUDENT = { student_id: 'stu_a', login_username: 'kiwi_toad', real_name: 'Ellen', section: 'PeriodB' };
const OTHER = { student_id: 'stu_b', login_username: 'grape_bear', real_name: 'Olivia', section: 'PeriodB' };
const TEACHER_ROW = { student_id: 'stu_t', login_username: 'date_tiger', real_name: 'Teacher', section: 'PeriodX' };

function fakeRosterDb(roster, roleMap = {}) {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async listRoster() { return { data: roster.slice(), error: null }; },
    async findByStudentId(id) { return { data: roster.find(r => r.student_id === id) || null, error: null }; },
    async getRoleByStudentId(id) { return roleMap[id] || 'student'; },
  };
}

function fakeLedgerDb() {
  return {
    async getLedgerByStudent() { return { data: [], error: null }; },
    async insertLedgerRow() { return { data: {}, error: null }; },
  };
}

function fakeOfficialDb({ missingTable = false } = {}) {
  const rows = new Map();
  return {
    rows,
    async upsertGrades(list) {
      if (missingTable) return { data: null, error: { code: '42P01' } };
      for (const r of list) {
        rows.set(r.studentId + '|' + r.quarter, {
          student_id: r.studentId, quarter: r.quarter, grade: r.grade, parts: r.parts, as_of: r.asOf,
        });
      }
      return { data: list.map(r => ({ student_id: r.studentId })), error: null };
    },
    async getForStudent(id, quarter) {
      if (missingTable) return { data: null, error: { code: '42P01' } };
      return { data: rows.get(id + '|' + quarter) || null, error: null };
    },
  };
}

class TestServer {
  constructor(app) { this.server = http.createServer(app); }
  start() {
    return new Promise(r => this.server.listen(0, '127.0.0.1', () => {
      this.baseUrl = `http://127.0.0.1:${this.server.address().port}`; r();
    }));
  }
  stop() { return new Promise(r => this.server.close(r)); }
  async call(method, path, body, headers = {}) {
    const res = await fetch(this.baseUrl + path, {
      method, headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, body: json };
  }
}

let srv;
async function start(officialDb) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  process.env.NODE_ENV = 'test';
  const db = fakeRosterDb([STUDENT, OTHER, TEACHER_ROW], { stu_t: 'teacher' });
  const noop = async () => ({ generatedFrom: 'x', units: [], answerKey: {} });
  const app = createApp(db, fakeLedgerDb(), noop, noop, async () => ({}), realBkt,
    null, null, null, null, null, null, null, null, undefined, undefined, null, null, null, officialDb);
  srv = new TestServer(app);
  await srv.start();
  return srv;
}

afterEach(async () => {
  if (srv) { await srv.stop(); srv = null; }
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_TEACHER_SECRET;
});

const NIGHT = {
  quarter: 'Q1', asOf: '2026-10-03T21:00:00Z',
  grades: [
    { studentId: 'stu_a', official: 96.74, work: 91.74, pc: 61.1, base: 91.74, line: 96.74, earlyBonus: 5, bankedBonus: 0, rule: 'work' },
    { studentId: 'stu_b', official: 100, work: 39.75, pc: 100, base: 100, line: 41.75, earlyBonus: 2, bankedBonus: 0, rule: 'PC', junk: 'x' },
  ],
};

describe('POST /class/official-grades', () => {
  it('teacher write saves one row per student, rounded to one decimal, parts whitelisted', async () => {
    const db = fakeOfficialDb();
    const s = await start(db);
    const r = await s.call('POST', '/class/official-grades', NIGHT, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, quarter: 'Q1', saved: 2 });
    expect(db.rows.get('stu_a|Q1').grade).toBe(96.7);
    expect(db.rows.get('stu_b|Q1').parts).toEqual({ work: 39.75, pc: 100, base: 100, line: 41.75, earlyBonus: 2, bankedBonus: 0, rule: 'PC' });
  });

  it('refuses a student token', async () => {
    const s = await start(fakeOfficialDb());
    const r = await s.call('POST', '/class/official-grades', NIGHT, { Authorization: 'Bearer ' + signToken('stu_a') });
    expect(r.status).toBe(401);
  });

  it('503 until migration 0038 is run', async () => {
    const s = await start(fakeOfficialDb({ missingTable: true }));
    const r = await s.call('POST', '/class/official-grades', NIGHT, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/0038/);
  });
});

describe('validateGrades', () => {
  it.each([
    [{ ...NIGHT, quarter: 'Q9' }, /quarter/],
    [{ ...NIGHT, asOf: 'not a date' }, /asOf/],
    [{ ...NIGHT, grades: [] }, /non-empty/],
    [{ ...NIGHT, grades: [{ studentId: 'stu_a', official: 101 }] }, /0\.\.100/],
    [{ ...NIGHT, grades: [{ official: 90 }] }, /studentId/],
  ])('rejects bad input %#', (body, message) => {
    expect(validateGrades(body).error).toMatch(message);
  });
});

describe('GET /official-grade', () => {
  async function seeded() {
    const db = fakeOfficialDb();
    const s = await start(db);
    await s.call('POST', '/class/official-grades', NIGHT, { 'x-teacher-secret': TEACHER });
    return s;
  }

  it('a student reads their own official grade', async () => {
    const s = await seeded();
    const r = await s.call('GET', '/official-grade?quarter=Q1&token=' + signToken('stu_b'));
    expect(r.status).toBe(200);
    expect(r.body.official).toMatchObject({ quarter: 'Q1', grade: 100, parts: { rule: 'PC' } });
  });

  it('a student cannot read someone else', async () => {
    const s = await seeded();
    const r = await s.call('GET', '/official-grade?quarter=Q1&studentId=stu_a&token=' + signToken('stu_b'));
    expect(r.status).toBe(401);
  });

  it('a teacher reads any student (view-as)', async () => {
    const s = await seeded();
    const r = await s.call('GET', '/official-grade?quarter=Q1&studentId=stu_a', null, { Authorization: 'Bearer ' + signToken('stu_t') });
    expect(r.status).toBe(200);
    expect(r.body.official.grade).toBe(96.7);
  });

  it('null when nothing has been published yet', async () => {
    const s = await start(fakeOfficialDb());
    const r = await s.call('GET', '/official-grade?quarter=Q1&token=' + signToken('stu_a'));
    expect(r.body).toMatchObject({ ok: true, official: null });
  });

  it('no token -> 401', async () => {
    const s = await seeded();
    expect((await s.call('GET', '/official-grade')).status).toBe(401);
  });
});
