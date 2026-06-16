// class.test.js — tests for GET /class/grades + /class/mastery (Phase 4a).
// Teacher-gated (x-teacher-secret); fans out computeGrade/computeMastery over
// a fake in-memory roster. NO network/Supabase. Mirrors rollup.test.js harness.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { initReceipts } from '../receipts.js';

let realBkt;
beforeAll(async () => {
  await import('../bkt.js');
  realBkt = globalThis.BKT;
});

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
  delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  delete process.env.TEACHER_KEY;
  initReceipts();
});

// ── Auth ──────────────────────────────────────────────────────────────────────
describe('GET /class/grades — auth', () => {
  it('401 without x-teacher-secret', async () => {
    const ctx = await startServer({ roster: [{ student_id: 's1', real_name: 'A', login_username: 'a', section: 'P1' }] });
    srv = ctx.server;
    expect((await srv.get('/class/grades')).status).toBe(401);
  });
  it('401 with a wrong secret', async () => {
    const ctx = await startServer({ roster: [] }); srv = ctx.server;
    expect((await srv.get('/class/grades', { 'x-teacher-secret': 'bogus' })).status).toBe(401);
  });
});

// ── Fan-out math ──────────────────────────────────────────────────────────────
describe('GET /class/grades — fan-out', () => {
  it('per-student computeGrade across the roster, plus the section filter', async () => {
    const roster = [
      { student_id: 's1', real_name: 'Alice',  login_username: 'alpha_fox',  section: 'P1' },
      { student_id: 's2', real_name: 'Bob',    login_username: 'beta_owl',   section: 'P1' },
      { student_id: 's3', real_name: 'Carmen', login_username: 'gamma_bear', section: 'P2' },
    ];
    const ledger = {
      s1: [
        makeRow('s1', 'U1-L1-Q01', 'B'),                // Q correct
        makeRow('s1', 'U1-L1-Q02', 'X'),                // Q wrong
        makeRow('s1', 'WS-U1L1-r1', 'a', { source: 'frq', unit: 'U1', score: 1 }),
      ],
      s2: [makeRow('s2', 'U1-L1-Q01', 'B')],            // single correct → Q=100, B=Q, banked 85
      s3: [],                                            // ungraded
    };
    const ctx = await startServer({ roster, ledger }); srv = ctx.server;

    // No section filter → all 3
    let r = await srv.get('/class/grades', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.students).toHaveLength(3);
    const byId = Object.fromEntries(r.body.students.map(s => [s.studentId, s]));
    expect(byId.s1.units.U1.Q).toBe(50);
    expect(byId.s1.units.U1.W).toBe(100);
    expect(byId.s1.units.U1.banked).toBeCloseTo(66.7, 1);
    expect(byId.s2.units.U1.banked).toBe(85);
    expect(byId.s3.units).toEqual({});
    expect(r.body.config.C).toBe(85);

    // section=P1 → only Alice + Bob
    r = await srv.get('/class/grades?section=P1', { 'x-teacher-secret': TEACHER });
    expect(r.body.students.map(s => s.studentId).sort()).toEqual(['s1', 's2']);
    expect(r.body.section).toBe('P1');
  });

  it('excludes role=teacher rows from the class fan-out (a self-signup teacher is not a student)', async () => {
    const roster = [
      { student_id: 's1', real_name: 'Alice', login_username: 'alpha_fox', section: 'P1' },
      { student_id: 't1', real_name: 'Ms Teacher', login_username: 'teach_owl', section: 'P1', role: 'teacher' },
    ];
    const ctx = await startServer({ roster, ledger: { s1: [], t1: [] } }); srv = ctx.server;
    const r = await srv.get('/class/grades', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.students.map(s => s.studentId)).toEqual(['s1']);   // teacher row excluded
    expect(r.body.students[0].role).toBe('student');                 // role surfaced (defaults to student)
  });

  it('includeStaff=1 keeps teacher rows (pacing-overview opt-in) tagged with role', async () => {
    const roster = [
      { student_id: 's1', real_name: 'Alice', login_username: 'alpha_fox', section: 'P1' },
      { student_id: 't1', real_name: 'Ms Teacher', login_username: 'teach_owl', section: 'P1', role: 'teacher' },
    ];
    const ctx = await startServer({ roster, ledger: { s1: [], t1: [] } }); srv = ctx.server;
    const r = await srv.get('/class/grades?includeStaff=1', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    const byId = Object.fromEntries(r.body.students.map(s => [s.studentId, s]));
    expect(Object.keys(byId).sort()).toEqual(['s1', 't1']);          // teacher INCLUDED
    expect(byId.t1.role).toBe('teacher');
    expect(byId.s1.role).toBe('student');
  });

  it('surfaces per-student effort points → candy (DOGE wallet), matching the wallet', async () => {
    const rc = (row) => ({ ...row, receipt_compact: 'rc' });   // only receipt rows count
    const roster = [{ student_id: 's1', real_name: 'Alice', login_username: 'a', section: 'P1' }];
    const ledger = {
      s1: [
        rc(makeRow('s1', 'WS-1', 'a', { source: 'worksheet' })),       // 3
        rc(makeRow('s1', 'BL-1', 'b', { source: 'blooket' })),         // 4
        rc(makeRow('s1', 'Q-1', 'c', { source: 'curriculum_quiz' })),  // 10
        rc(makeRow('s1', 'FRQ-1', 'd', { source: 'frq' })),            // 5
        rc(makeRow('s1', 'PC-1', 'e', { source: 'pc' })),              // 10
        rc(makeRow('s1', 'BL-X-DESK_DONE', 'f', { source: 'blooket', attempt: 2 })), // 4 (desk-done id)
        makeRow('s1', 'WS-2', 'g', { source: 'worksheet' }),           // NO receipt → 0
        rc(makeRow('s1', 'WS-1', 'a', { source: 'worksheet', attempt: 3 })), // dup source|item → 0
      ],
    };
    const ctx = await startServer({ roster, ledger }); srv = ctx.server;
    const r = await srv.get('/class/grades', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    const s1 = r.body.students.find((s) => s.studentId === 's1');
    expect(s1.effort.points).toBe(36);                 // 3+4+10+5+10+4, dup + no-receipt excluded
    expect(s1.effort.candy).toBeCloseTo(1, 6);         // 36 / 36 pts-per-candy
  });

  it('per-student ledger throw is tolerated (one bad student does not 500 the class)', async () => {
    const roster = [
      { student_id: 'ok',  real_name: 'OK', login_username: 'a', section: 'P1' },
      { student_id: 'bad', real_name: 'X',  login_username: 'b', section: 'P1' },
    ];
    const ctx = await startServer({
      roster,
      ledger: { ok: [makeRow('ok', 'U1-L1-Q01', 'B')] },
      ledgerOpts: { throwForStudentId: 'bad' },
    });
    srv = ctx.server;
    const r = await srv.get('/class/grades', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.students.find(s => s.studentId === 'ok').units.U1).toBeDefined();
    // bad student appears with empty units (graceful degrade, not 500)
    expect(r.body.students.find(s => s.studentId === 'bad').units).toEqual({});
  });

  it('adds a trainer summary from already-fetched ledger rows', async () => {
    const roster = [
      { student_id: 's1', real_name: 'Alice', login_username: 'alpha_fox', section: 'P1' },
      { student_id: 's2', real_name: 'Bob', login_username: 'beta_owl', section: 'P1' },
    ];
    const ledger = {
      s1: [
        makeRow('s1', 'TI84-linreg', 'done', {
          source: 'trainer',
          score: 0.5,
          recorded_at: '2026-06-01T10:00:00.000Z',
        }),
        makeRow('s1', 'TI84-linreg', 'done', {
          source: 'trainer',
          score: 1,
          recorded_at: '2026-06-03T10:00:00.000Z',
        }),
        makeRow('s1', 'TI84-1varstats', 'done', {
          source: 'trainer',
          score: 0.75,
          recorded_at: '2026-06-02T10:00:00.000Z',
        }),
        makeRow('s1', 'U1-L1-Q01', 'B'),
      ],
      s2: [makeRow('s2', 'U1-L1-Q01', 'B')],
    };
    const ctx = await startServer({ roster, ledger }); srv = ctx.server;

    const r = await srv.get('/class/grades', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    const byId = Object.fromEntries(r.body.students.map(s => [s.studentId, s]));
    expect(byId.s1.trainer).toEqual({
      procedures: 2,
      avgScore: 0.75,
      lastAt: '2026-06-03T10:00:00.000Z',
    });
    expect(byId.s2.trainer).toBeNull();
  });

  it('roster db error → 500', async () => {
    const ctx = await startServer({ roster: [], rosterOpts: { error: { message: 'down' } } });
    srv = ctx.server;
    expect((await srv.get('/class/grades', { 'x-teacher-secret': TEACHER })).status).toBe(500);
  });

  it('answer-key malformed → 500', async () => {
    const ctx = await startServer({ roster: [], loadAnswerKey: async () => ({ answerKey: 'oops' }) });
    srv = ctx.server;
    expect((await srv.get('/class/grades', { 'x-teacher-secret': TEACHER })).status).toBe(500);
  });
});

// ── P4b: schoologyUid bridge surfaced on /class/grades ─────────────────────────
describe('GET /class/grades — schoologyUid bridge', () => {
  const roster = [
    { student_id: 's1', real_name: 'Alice', login_username: 'a', section: 'P1' },
    { student_id: 's2', real_name: 'Bob',   login_username: 'b', section: 'P1' },
  ];

  it('carries schoologyUid when the db maps the student, null when unmapped', async () => {
    const ctx = await startServer({
      roster,
      ledger: { s1: [makeRow('s1', 'U1-L1-Q01', 'B')] },
      rosterOpts: { uidMap: { s1: '8405518810' } },  // s2 unmapped
    });
    srv = ctx.server;

    const r = await srv.get('/class/grades', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    const byId = Object.fromEntries(r.body.students.map(s => [s.studentId, s]));
    expect(byId.s1.schoologyUid).toBe('8405518810');
    expect(byId.s2.schoologyUid).toBeNull();
  });

  it('every student carries schoologyUid:null when the db lacks getSchoologyUidMap (typeof-guard back-compat)', async () => {
    const ctx = await startServer({
      roster,
      ledger: { s1: [makeRow('s1', 'U1-L1-Q01', 'B')] },
      // no uidMap -> createFakeRosterDb omits getSchoologyUidMap entirely
    });
    srv = ctx.server;

    const r = await srv.get('/class/grades', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    for (const s of r.body.students) {
      expect(Object.prototype.hasOwnProperty.call(s, 'schoologyUid')).toBe(true);
      expect(s.schoologyUid).toBeNull();
    }
  });
});

// ── /class/mastery + the class skill heatmap ──────────────────────────────────
describe('GET /class/mastery — heatmap', () => {
  it('per-student mastery + heatmap pctWeak across the section', async () => {
    const roster = [
      { student_id: 's1', real_name: 'A', login_username: 'a', section: 'P1' },
      { student_id: 's2', real_name: 'B', login_username: 'b', section: 'P1' },
      { student_id: 's3', real_name: 'C', login_username: 'c', section: 'P1' },
    ];
    // s1 + s2 = one correct in 1.A → folded pKnow ≈0.607 < θ=0.65 → BOTH weak in 1.A.
    // s3 = 3 corrects in 1.A → folded pKnow well above θ → NOT weak.
    // s1 also has 2.B (wrong) → weak in 2.B (and only s1 has any 2.B evidence).
    const ledger = {
      s1: [makeRow('s1', 'U1-L1-Q01', 'B'), makeRow('s1', 'U2-L1-Q01', 'X')],
      s2: [makeRow('s2', 'U1-L1-Q01', 'B')],
      s3: [makeRow('s3', 'U1-L1-Q01', 'B'), makeRow('s3', 'U1-L1-Q02', 'C'), makeRow('s3', 'U1-PC-MCQ-A-Q01', 'A', { source: 'pc' })],
    };
    const ctx = await startServer({ roster, ledger }); srv = ctx.server;
    const r = await srv.get('/class/mastery', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.theta).toBe(0.65);
    expect(r.body.students).toHaveLength(3);
    // Heatmap: 1.A → 3 students with obs, 2 weak → pctWeak ≈ 66.7
    expect(r.body.heatmap['1.A']).toMatchObject({ total: 3, weak: 2, pctWeak: 66.7 });
    // 2.B → only s1 has obs, weak → 1/1 = 100
    expect(r.body.heatmap['2.B']).toMatchObject({ total: 1, weak: 1, pctWeak: 100 });
    // 1.C → only s3 has obs (1 correct) → pKnow ≈0.607 < θ=0.65 → weak;
    // BKT is skeptical of a single correct (could be a guess) — same property
    // as mastery.test.js's "one correct alone stays below θ".
    expect(r.body.heatmap['1.C']).toMatchObject({ total: 1, weak: 1, pctWeak: 100 });
  });

  it('401 without x-teacher-secret', async () => {
    const ctx = await startServer({ roster: [] }); srv = ctx.server;
    expect((await srv.get('/class/mastery')).status).toBe(401);
  });

  it('/class/mastery NOT mounted when bkt missing → 404', async () => {
    const ctx = await startServer({ roster: [], bkt: null }); srv = ctx.server;
    expect((await srv.get('/class/mastery', { 'x-teacher-secret': TEACHER })).status).toBe(404);
  });

  it('/class/mastery NOT mounted when loadSkillMap missing → 404 (Codex MINOR coverage)', async () => {
    // null (not undefined) — undefined would trigger the destructuring default
    // back to okSkillMap. null genuinely disables it through createApp's guard.
    const ctx = await startServer({ roster: [], loadSkillMap: null });
    srv = ctx.server;
    expect((await srv.get('/class/mastery', { 'x-teacher-secret': TEACHER })).status).toBe(404);
    // /class/grades must STILL be mounted (only /class/mastery is conditional).
    expect((await srv.get('/class/grades', { 'x-teacher-secret': TEACHER })).status).toBe(200);
  });

  it('skill-map malformed → 500', async () => {
    const ctx = await startServer({ roster: [], loadSkillMap: async () => ({}) });
    srv = ctx.server;
    expect((await srv.get('/class/mastery', { 'x-teacher-secret': TEACHER })).status).toBe(500);
  });
});

// ── Read-only ────────────────────────────────────────────────────────────────
describe('class endpoints — read-only', () => {
  it('neither /class/grades nor /class/mastery writes to the ledger store', async () => {
    const ctx = await startServer({
      roster: [{ student_id: 's1', real_name: 'A', login_username: 'a', section: 'P1' }],
      ledger: { s1: [makeRow('s1', 'U1-L1-Q01', 'B')] },
    });
    srv = ctx.server;
    await srv.get('/class/grades', { 'x-teacher-secret': TEACHER });
    await srv.get('/class/mastery', { 'x-teacher-secret': TEACHER });
    expect(ctx.ledgerDb._store._written).toBeUndefined();
  });
});
