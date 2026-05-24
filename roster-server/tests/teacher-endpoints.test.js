// teacher-endpoints.test.js — tests for GET /teacher/student/:studentId/profile,
// /grade, and /recent (Phase 1 of TEACHER_STUDENT_CONSOLE_SPEC.md).
// Teacher-gated (x-teacher-secret). Pure fake-db + http loopback; NO network/Supabase.
// Mirrors class.test.js harness verbatim (lines 1-80).

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

let realBkt;
beforeAll(async () => {
  await import('../bkt.js');
  realBkt = globalThis.BKT;
});

const TEACHER = 'teacher-secret-fixture';

const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'curriculum_render/data/curriculum.js (READ-ONLY)',
  answerKey: {
    'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1' },
    'U1-L1-Q02': { answerKey: 'C', type: 'multiple-choice', unit: '1' },
    'U2-L1-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '2' },
    'U1-PC-MCQ-A-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '1' },
  },
};

// Fake roster db.
// Exposes insertRoster, findByUsername, listRoster (used by /class/*),
// findByStudentId (single-student lookup), and getRoleByStudentId.
function createFakeRosterDb(roster, { error = null, roleMap = {} } = {}) {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async listRoster(section) {
      if (error) return { data: null, error };
      const rows = section ? roster.filter(r => r.section === section) : roster.slice();
      return { data: rows, error: null };
    },
    async findByStudentId(studentId) {
      if (error) return { data: null, error };
      const row = roster.find(r => r.student_id === studentId) || null;
      return { data: row, error: null };
    },
    async getRoleByStudentId(studentId) {
      if (roleMap[studentId] !== undefined) return roleMap[studentId];
      return 'student';
    },
  };
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
    async insertLedgerRow() { store._written = true; return { data: {}, error: null }; },
  };
}

function makeRow(studentId, itemId, response, { source = 'curriculum_quiz', score, unit, attempt = 1, recorded_at } = {}) {
  return {
    student_id: studentId, source, item_id: itemId, response,
    score: score === undefined ? null : score, unit, attempt,
    recorded_at: recorded_at || new Date().toISOString(),
  };
}

const fakeLoadManifest = async () => ({ generatedFrom: 'x', units: [] });
const okAnswerKey = async () => FIXTURE_ANSWER_KEY;
const okSkillMap = async () => ({
  'U1-L1-Q01': { skill: '1.A' },
  'U1-L1-Q02': { skill: '1.A' },
  'U2-L1-Q01': { skill: '2.B' },
  'U1-PC-MCQ-A-Q01': { skill: '1.C' },
});

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
}

async function startServer({
  roster = [], ledger = {},
  loadAnswerKey = okAnswerKey, loadSkillMap = okSkillMap, bkt,
  rosterOpts = {}, ledgerOpts = {},
} = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  process.env.NODE_ENV = 'test';
  const rosterDb = createFakeRosterDb(roster, rosterOpts);
  const ledgerDb = createFakeLedgerDb(ledger, ledgerOpts);
  const app = createApp(rosterDb, ledgerDb, fakeLoadManifest, loadAnswerKey, loadSkillMap, bkt === undefined ? realBkt : bkt);
  const server = new TestServer(app);
  await server.start();
  return { server, rosterDb, ledgerDb };
}

let srv;
afterEach(async () => {
  if (srv) { await srv.stop(); srv = null; }
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_TEACHER_SECRET;
});

// Fixture student
const FIXTURE_STUDENT = {
  student_id: 'stu_abc123',
  login_username: 'papaya-otter',
  real_name: 'Jane Doe',
  section: 'PeriodB',
};

// ── GET /teacher/student/:studentId/profile ───────────────────────────────────

describe('GET /teacher/student/:studentId/profile', () => {
  it('401 without teacher secret or token', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/profile');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 with valid teacher secret — correct envelope shape', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/profile', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.studentId).toBe('stu_abc123');
    expect(r.body.username).toBe('papaya-otter');
    expect(r.body.realName).toBe('Jane Doe');
    expect(r.body.section).toBe('PeriodB');
    expect(r.body.role).toBe('student');
  });

  it('404 when studentId is unknown', async () => {
    const ctx = await startServer({ roster: [] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/no-such-student/profile', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('student not found');
  });

  it("200 with role='student' by default", async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/profile', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe('student');
  });

  it("200 with role='teacher' when getRoleByStudentId returns 'teacher'", async () => {
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT],
      rosterOpts: { roleMap: { stu_abc123: 'teacher' } },
    });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/profile', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe('teacher');
  });

  it('500 when db.findByStudentId returns an error', async () => {
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT],
      rosterOpts: { error: { message: 'db down' } },
    });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/profile', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('Database error');
  });
});

// ── GET /teacher/student/:studentId/grade ─────────────────────────────────────

describe('GET /teacher/student/:studentId/grade', () => {
  it('401 without teacher auth', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/grade');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 → envelope shape with quarters/units/completion populated for fixture ledger', async () => {
    const ledger = {
      stu_abc123: [
        makeRow('stu_abc123', 'U1-L1-Q01', 'B'),
        makeRow('stu_abc123', 'U1-L1-Q02', 'X'),
        makeRow('stu_abc123', 'WS-U1L1-r1', 'good answer', { source: 'frq', unit: 'U1', score: 1 }),
      ],
    };
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/grade', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.studentId).toBe('stu_abc123');
    expect(r.body.username).toBe('papaya-otter');
    expect(r.body.realName).toBe('Jane Doe');
    expect(r.body.section).toBe('PeriodB');
    expect(r.body.asOf).toBeDefined();
    expect(r.body.quarters).toBeDefined();
    expect(r.body.units).toBeDefined();
    expect(r.body.completion).toBeDefined();
    expect(r.body.config).toBeDefined();
    expect(r.body.config.C).toBe(85);
    expect(r.body.config.feederWeights).toBeDefined();
    expect(r.body.config.frqBand).toBeDefined();
    expect(r.body.config.quarters).toBeDefined();
    // Units should have U1 data from the fixture ledger
    expect(r.body.units.U1).toBeDefined();
    expect(r.body.units.U1.Q).toBe(50); // 1 correct out of 2
  });

  it('404 when studentId is unknown', async () => {
    const ctx = await startServer({ roster: [] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/unknown-id/grade', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('student not found');
  });

  it('200 with empty ledger → quarters/units present but zero-valued', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: {} });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/grade', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.units).toEqual({});
    expect(r.body.quarters).toBeDefined();
  });

  it('lessonSchedule + section are threaded to computeGrade (section from roster)', async () => {
    // A fake lesson schedule — format matches what grade.js expects.
    const fakeSchedule = {
      lessons: {
        'u1.l1': { unit: 1, lessonKey: 'l1', dueDates: { PeriodB: '2020-01-01' } },
      },
    };
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: {} });
    // Re-create with a lessonSchedule injected (need to rebuild the server manually).
    await ctx.server.stop();

    process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
    process.env.ROSTER_TEACHER_SECRET = TEACHER;
    process.env.NODE_ENV = 'test';
    const rosterDb = createFakeRosterDb([FIXTURE_STUDENT]);
    const ledgerDb = createFakeLedgerDb({});
    const { createApp: ca } = await import('../server.js');
    const app = ca(rosterDb, ledgerDb, fakeLoadManifest, okAnswerKey, okSkillMap, realBkt, undefined, fakeSchedule);
    const server = new TestServer(app);
    await server.start();
    srv = server;

    const r = await server.get('/teacher/student/stu_abc123/grade', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    // section from roster row is threaded through (PeriodB)
    expect(r.body.section).toBe('PeriodB');
    expect(r.body.quarters).toBeDefined();
  });
});

// ── GET /teacher/student/:studentId/recent ────────────────────────────────────

describe('GET /teacher/student/:studentId/recent', () => {
  function makeTimestampedRow(studentId, itemId, recorded_at) {
    return makeRow(studentId, itemId, 'X', { source: 'curriculum_quiz', score: 0, unit: 'U1', recorded_at });
  }

  it('401 without teacher auth', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 with default limit=20 → at most 20 submissions', async () => {
    // Build 30 rows with distinct timestamps
    const rows = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
      return makeTimestampedRow('stu_abc123', `U1-L1-Q${String(i + 1).padStart(2, '0')}`, d);
    });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { stu_abc123: rows } });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.submissions.length).toBeLessThanOrEqual(20);
    expect(r.body.submissions).toHaveLength(20);
  });

  it('200 with limit=5 → at most 5 submissions ordered by recordedAt desc', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
      return makeTimestampedRow('stu_abc123', `U1-L1-Q${String(i + 1).padStart(2, '0')}`, d);
    });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { stu_abc123: rows } });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent?limit=5', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions).toHaveLength(5);
    // Newest first
    const dates = r.body.submissions.map(s => s.recordedAt);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("200 with limit='banana' → falls back to 20", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
      return makeTimestampedRow('stu_abc123', `U1-L1-Q${String(i + 1).padStart(2, '0')}`, d);
    });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { stu_abc123: rows } });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent?limit=banana', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions).toHaveLength(20);
  });

  it('200 with limit=999 → clamped to 100', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
      return makeTimestampedRow('stu_abc123', `U1-L1-Q${String(i + 1).padStart(2, '0')}`, d);
    });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { stu_abc123: rows } });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent?limit=999', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions).toHaveLength(100);
  });

  it('404 when studentId is unknown', async () => {
    const ctx = await startServer({ roster: [] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/no-such/recent', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('student not found');
  });

  it('each submission object has the camelCase keys per BUILD §2.2.3', async () => {
    const recorded_at = '2026-05-22T14:01:00.000Z';
    const rows = [
      {
        student_id: 'stu_abc123',
        source: 'worksheet',
        item_id: 'U6-L3-Q05',
        response: '0.45',
        score: 1,
        unit: '6',
        attempt: 1,
        recorded_at,
      },
    ];
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { stu_abc123: rows } });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions).toHaveLength(1);
    const sub = r.body.submissions[0];
    expect(sub.recordedAt).toBe(recorded_at);
    expect(sub.itemId).toBe('U6-L3-Q05');
    expect(sub.source).toBe('worksheet');
    expect(sub.response).toBe('0.45');
    expect(sub.score).toBe(1);
    expect(sub.unit).toBe('6');
    expect(sub.attempt).toBe(1);
    // No snake_case keys on the submission object
    expect(sub.recorded_at).toBeUndefined();
    expect(sub.item_id).toBeUndefined();
  });

  it('200 with studentId and username in the response envelope', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: {} });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.studentId).toBe('stu_abc123');
    expect(r.body.username).toBe('papaya-otter');
    expect(r.body.realName).toBe('Jane Doe');
    expect(r.body.section).toBe('PeriodB');
    expect(r.body.submissions).toEqual([]);
  });
});

// ── Token-based teacher auth (Codex MAJOR fold) ────────────────────────────
// Proves requireTeacher Path B (Authorization: Bearer <token> whose role
// resolves to 'teacher') grants access to all three endpoints, and that a
// student-role token is rejected.

describe('Token-based teacher auth (Authorization: Bearer)', () => {
  const TEACHER_ROW = {
    student_id: 'stu_teacher',
    login_username: 'apple-fox',
    real_name: 'Mr. Colson',
    section: 'PeriodB',
  };

  for (const endpoint of ['profile', 'grade', 'recent']) {
    it(`200 with valid teacher token on /${endpoint}`, async () => {
      const ctx = await startServer({
        roster: [FIXTURE_STUDENT, TEACHER_ROW],
        rosterOpts: { roleMap: { stu_teacher: 'teacher' } },
      });
      srv = ctx.server;
      const token = signToken('stu_teacher');
      const r = await srv.get(`/teacher/student/stu_abc123/${endpoint}`, {
        'Authorization': `Bearer ${token}`,
      });
      expect(r.status).toBe(200);
      expect(r.body.ok).toBe(true);
    });

    it(`401 with student-role token on /${endpoint}`, async () => {
      const ctx = await startServer({
        roster: [FIXTURE_STUDENT, TEACHER_ROW],
        rosterOpts: { roleMap: { stu_teacher: 'teacher' } },
        // stu_abc123 has no roleMap entry -> defaults to 'student'.
      });
      srv = ctx.server;
      const token = signToken('stu_abc123');
      const r = await srv.get(`/teacher/student/stu_abc123/${endpoint}`, {
        'Authorization': `Bearer ${token}`,
      });
      expect(r.status).toBe(401);
      expect(r.body.ok).toBe(false);
      expect(r.body.error).toBe('forbidden');
    });
  }
});

// ── Edge cases (Codex MINOR fold) ──────────────────────────────────────────
// limit=Infinity used to fall through to the default 20; now clamps to 100.
// Equal recorded_at timestamps used to swap unpredictably (comparator returned
// 1 on equality); now preserves relative order via V8 stable sort.

describe('Edge cases on /recent (Codex MINOR fold)', () => {
  it('limit=Infinity clamps to 100 (not falls to default 20)', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => makeRow('stu_abc123', `Q${i}`, 'A', {
      recorded_at: new Date(Date.now() - i * 1000).toISOString(),
    }));
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT],
      ledger: { stu_abc123: rows },
    });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent?limit=Infinity', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions.length).toBe(100);
  });

  it('equal recorded_at preserves relative order (stable sort)', async () => {
    const sameTs = '2026-05-22T14:00:00Z';
    const rows = [
      makeRow('stu_abc123', 'Q1', 'A', { recorded_at: sameTs }),
      makeRow('stu_abc123', 'Q2', 'A', { recorded_at: sameTs }),
      makeRow('stu_abc123', 'Q3', 'A', { recorded_at: sameTs }),
    ];
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT],
      ledger: { stu_abc123: rows },
    });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions.length).toBe(3);
    // V8 stable sort + comparator returning 0 on equality keeps input order.
    expect(r.body.submissions.map(s => s.itemId)).toEqual(['Q1', 'Q2', 'Q3']);
  });
});
