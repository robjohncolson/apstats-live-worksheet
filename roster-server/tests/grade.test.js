// grade.test.js — tests for GET /grade (Gradebook Phase 3).
// Fake in-memory ledgerDb + inline fixture answer-key. NO network/Supabase.
// Mirrors rollup.test.js's harness.

import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { PHASE3_CONFIG, pcRawToP, quarterOfUnit, unitNumber } from '../grade-config.js';

// ── Fixture answer key (build-answer-key.mjs output shape) ────────────────────
const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'curriculum_render/data/curriculum.js (READ-ONLY)',
  answerKey: {
    // cr-quiz (feeder Q)
    'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1', topic: '1.1' },
    'U1-L1-Q02': { answerKey: 'C', type: 'multiple-choice', unit: '1', topic: '1.1' },
    'U2-L1-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '2', topic: '2.1' },
    // PC (feeder P) — answer-key.json carries 347 such *-PC-* MCQ keys
    'U1-PC-MCQ-A-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '1' },
    'U1-PC-MCQ-A-Q02': { answerKey: 'D', type: 'multiple-choice', unit: '1' },
    'U2-PC-MCQ-A-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '2' },
    'U1-PC-FRQ-Q01':   { answerKey: null, type: 'free-response', unit: '1' }, // ungradable
  },
};

function createFakeRosterDb() {
  return {
    async insertRoster() { return { data: null, error: { message: 'unused' } }; },
    async findByUsername() { return { data: null, error: { message: 'unused' } }; },
  };
}

function createFakeLedgerDb(rows, { error = null } = {}) {
  const store = [...rows];
  return {
    _store: store,
    async getLedgerByStudent(studentId) {
      if (error) return error === 'throw' ? Promise.reject(new Error('boom')) : { data: null, error };
      return { data: store.filter(r => r.student_id === studentId), error: null };
    },
    async insertLedgerRow() { store.push({ _written: true }); return { data: {}, error: null }; },
  };
}

function makeRow(itemId, response, { source = 'curriculum_quiz', unit, score, attempt = 1, recorded_at } = {}) {
  return {
    student_id: 'PLACEHOLDER',
    source, item_id: itemId, response, unit,
    score: score === undefined ? null : score,
    attempt,
    recorded_at: recorded_at || new Date().toISOString(),
  };
}

const fakeLoadManifest = async () => ({ generatedFrom: 'x', units: [] });
const okAnswerKey = async () => FIXTURE_ANSWER_KEY;

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
    return { status: res.status, body: await res.json() };
  }
}

async function startServer(rows = [], { loadAnswerKey = okAnswerKey, ledgerOpts = {} } = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.NODE_ENV = 'test';
  const studentId = `uuid-grade-${randomBytes(8).toString('hex')}`;
  const token = signToken(studentId);
  const ledgerDb = createFakeLedgerDb(rows.map(r => ({ ...r, student_id: studentId })), ledgerOpts);
  const app = createApp(createFakeRosterDb(), ledgerDb, fakeLoadManifest, loadAnswerKey);
  const server = new TestServer(app);
  await server.start();
  return { server, studentId, token, ledgerDb };
}

let srv;
afterEach(async () => { if (srv) { await srv.stop(); srv = null; } delete process.env.ROSTER_TOKEN_SECRET; });

// ── grade-config pure math ────────────────────────────────────────────────────
describe('grade-config — frozen knobs + curves', () => {
  it('C=85 flat, weights 1:2, FRQ band 100/70/35, θ=0.65', () => {
    expect(PHASE3_CONFIG.C).toBe(85);
    expect(PHASE3_CONFIG.feederWeights).toEqual({ W: 1, Q: 2 });
    expect(PHASE3_CONFIG.frqBand).toEqual({ E: 100, P: 70, I: 35 });
    expect(PHASE3_CONFIG.diagnosticTheta).toBe(0.65);
  });

  it('quarter bands Q1=U1-2 Q2=U3-5 Q3=U6-7 Q4=U8-9', () => {
    expect(quarterOfUnit(1)).toBe('Q1');
    expect(quarterOfUnit(2)).toBe('Q1');
    expect(quarterOfUnit(3)).toBe('Q2');
    expect(quarterOfUnit(5)).toBe('Q2');
    expect(quarterOfUnit(6)).toBe('Q3');
    expect(quarterOfUnit(7)).toBe('Q3');
    expect(quarterOfUnit(8)).toBe('Q4');
    expect(quarterOfUnit(9)).toBe('Q4');
    expect(quarterOfUnit(99)).toBe(null);
  });

  it('pcRawToP: piecewise linear, clamps, scales to 0 below p85', () => {
    const a = { p85: 40, p100: 60 };
    expect(pcRawToP(60, a)).toBe(100);   // ≥ p100 → earned the A
    expect(pcRawToP(80, a)).toBe(100);   // clamp ≤ 100
    expect(pcRawToP(40, a)).toBe(85);    // exactly the p85 anchor
    expect(pcRawToP(50, a)).toBe(92.5);  // halfway 40→60 → 85+7.5
    expect(pcRawToP(20, a)).toBe(42.5);  // below p85 → 20/40·85
    expect(pcRawToP(0, a)).toBe(0);
    expect(pcRawToP(null, a)).toBe(0);   // no PC ⇒ no lift
    expect(pcRawToP(undefined, a)).toBe(0);
  });

  it('unitNumber parses U-prefixed / bare / numeric', () => {
    expect(unitNumber('U4')).toBe(4);
    expect(unitNumber('4')).toBe(4);
    expect(unitNumber(7)).toBe(7);
    expect(unitNumber('garbage')).toBe(null);
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
describe('GET /grade — auth', () => {
  it('401 without a token', async () => {
    const ctx = await startServer(); srv = ctx.server;
    const { status, body } = await srv.get('/grade');
    expect(status).toBe(401); expect(body.ok).toBe(false);
  });
  it('401 with an invalid token', async () => {
    const ctx = await startServer(); srv = ctx.server;
    const { status } = await srv.get('/grade?token=garbage');
    expect(status).toBe(401);
  });
});

// ── The grade model ───────────────────────────────────────────────────────────
describe('GET /grade — model math', () => {
  it('B = (1·W + 2·Q)/3, cap at 85, P only-raises via max', async () => {
    const rows = [
      // Q(U1): 2 cr-quiz, 1 correct → 50
      makeRow('U1-L1-Q01', 'B'),
      makeRow('U1-L1-Q02', 'X'),
      // W(U1): frq E(1)→100, P(0.5)→70 → mean 85
      makeRow('WS-U1L1-r1', 'ans', { source: 'frq', unit: 'U1', score: 1 }),
      makeRow('WS-U1L1-r2', 'ans', { source: 'frq', unit: 'U1', score: 0.5 }),
      // PC(U1): 2 MCQ, 1 correct, 1 FRQ ungradable → raw 50 → P (Q1 40/60) = 92.5
      makeRow('U1-PC-MCQ-A-Q01', 'A', { source: 'pc' }),
      makeRow('U1-PC-MCQ-A-Q02', 'B', { source: 'pc' }),
      makeRow('U1-PC-FRQ-Q01', 'essay', { source: 'pc' }),
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { status, body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(200);
    const u1 = body.units.U1;
    expect(u1.W).toBe(85);
    expect(u1.Q).toBe(50);
    expect(u1.B).toBeCloseTo(61.7, 1);          // (85 + 100)/3
    expect(u1.banked).toBeCloseTo(61.7, 1);     // < 85, uncapped here
    expect(u1.pcRawPct).toBe(50);
    expect(u1.P).toBe(92.5);                     // PC uncaps above banked
    expect(u1.unitGrade).toBe(92.5);            // max(61.7, 92.5)
    expect(u1.graded).toBe(true);
  });

  it('grinder: B=100, no PC → banked capped 85, unitGrade 85 (spec §2)', async () => {
    const rows = [
      makeRow('U1-L1-Q01', 'B'),                                   // Q=100
      makeRow('WS-U1L1-r1', 'a', { source: 'frq', unit: 'U1', score: 1 }), // W=100
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.B).toBe(100);
    expect(body.units.U1.banked).toBe(85);       // completion caps
    expect(body.units.U1.P).toBe(0);             // no PC ⇒ no lift
    expect(body.units.U1.unitGrade).toBe(85);
  });

  it('genuine master: minimal work, perfect PC → 100 (PC uncaps regardless)', async () => {
    const rows = [
      makeRow('WS-U2L1-r1', 'weak', { source: 'frq', unit: 'U2', score: 0 }), // W=35, B=35
      makeRow('U2-PC-MCQ-A-Q01', 'A', { source: 'pc' }),                       // raw 100
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U2.B).toBe(35);
    expect(body.units.U2.banked).toBe(35);
    expect(body.units.U2.pcRawPct).toBe(100);
    expect(body.units.U2.P).toBe(100);           // Q1 anchor: 100 ≥ 60
    expect(body.units.U2.unitGrade).toBe(100);
  });

  it('strong worker, bad PC day → never punished (banked floor holds)', async () => {
    const rows = [
      // Q(U1)=100 (1/1) and W absent → B = Q = 100 → banked 85
      makeRow('U1-L1-Q01', 'B'),
      // PC: 1 of 2 wrong → raw 50 → P=92.5? No: make BOTH wrong → raw 0 → P=0
      makeRow('U1-PC-MCQ-A-Q01', 'Z', { source: 'pc' }),
      makeRow('U1-PC-MCQ-A-Q02', 'Z', { source: 'pc' }),
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.Q).toBe(100);
    expect(body.units.U1.W).toBe(null);
    expect(body.units.U1.B).toBe(100);           // Q-only feeder, renormalized
    expect(body.units.U1.banked).toBe(85);
    expect(body.units.U1.pcRawPct).toBe(0);
    expect(body.units.U1.P).toBe(0);
    expect(body.units.U1.unitGrade).toBe(85);    // max(85, 0) — bad PC never sinks it
  });

  it('missing-feeder reweighting: W-only → B=W; neither → ungraded (not 0)', async () => {
    const rows = [
      makeRow('WS-U1L1-r1', 'a', { source: 'frq', unit: 'U1', score: 1 }),  // W only
      makeRow('WS-U1L1-x',  'typed', { source: 'worksheet', unit: 'U1' }),   // no score → completion-only
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.W).toBe(100);
    expect(body.units.U1.Q).toBe(null);
    expect(body.units.U1.B).toBe(100);                    // W-only, renormalized
    expect(body.units.U1.banked).toBe(85);
    // worksheet fill-in is completion-only, NOT in W
    expect(body.completion.U1.worksheet).toBe(1);
    expect(body.completion.U1.frq).toBe(1);
  });

  it('quarter grade = mean of GRADED unit grades in the band (ungraded excluded)', async () => {
    const rows = [
      // U1 graded → unitGrade 85 (B=100→banked 85, no PC)
      makeRow('U1-L1-Q01', 'B'),
      // U2 has zero evidence → ungraded → excluded from Q1 mean
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.unitGrade).toBe(85);
    expect(body.units.U2).toBeUndefined();
    expect(body.quarters.Q1.units).toEqual([1, 2]);
    expect(body.quarters.Q1.unitGrades).toEqual({ U1: 85, U2: null });
    expect(body.quarters.Q1.quarterGrade).toBe(85);       // mean([85]) — not (85+0)/2
    expect(body.quarters.Q2.quarterGrade).toBe(null);     // no graded units
  });

  it('null/ungraded FRQ score is excluded from W (NOT scored as I), still completion', async () => {
    const rows = [
      makeRow('WS-U1L1-r1', 'graded',   { source: 'frq', unit: 'U1', score: 1 }),    // E → 100
      makeRow('WS-U1L1-r2', 'ungraded', { source: 'frq', unit: 'U1', score: null }), // excluded, NOT 35
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.W).toBe(100);            // only the graded one — not (100+35)/2
    expect(body.completion.U1.frq).toBe(2);       // both count toward completion
  });

  it('latest attempt wins (attempt 2 supersedes attempt 1)', async () => {
    const rows = [
      makeRow('U1-L1-Q01', 'X', { attempt: 1 }),  // wrong
      makeRow('U1-L1-Q01', 'B', { attempt: 2 }),  // right → wins → Q=100
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.Q).toBe(100);
  });

  it('empty ledger → empty units, all quarters null', async () => {
    const ctx = await startServer([]); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units).toEqual({});
    expect(body.quarters.Q1.quarterGrade).toBe(null);
    expect(body.config.C).toBe(85);
  });

  it('malformed rows tolerated (no throw / no 500)', async () => {
    const rows = [
      { student_id: 'x', source: 'curriculum_quiz' },        // no item_id
      makeRow('U1-L1-Q01', null),                            // null resp → wrong
      makeRow('WS-U1L1-r1', 'a', { source: 'frq', unit: 'U1', score: 'notanumber' }), // bad score → excluded
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { status } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(200);
  });
});

// ── Robustness ────────────────────────────────────────────────────────────────
describe('GET /grade — robustness', () => {
  it('ledger db error → 500', async () => {
    const ctx = await startServer([], { ledgerOpts: { error: { message: 'db down' } } });
    srv = ctx.server;
    const { status } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(500);
  });
  it('ledger db throw → 500', async () => {
    const ctx = await startServer([], { ledgerOpts: { error: 'throw' } });
    srv = ctx.server;
    const { status } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(500);
  });
  it('answer-key load failure → 500', async () => {
    const ctx = await startServer([], { loadAnswerKey: async () => { throw new Error('no key'); } });
    srv = ctx.server;
    const { status } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(500);
  });
  it('answer-key wrong shape → 500 (top-level AND corrupt per-entry, fail closed)', async () => {
    const bads = [
      null, {}, { answerKey: 'oops' }, { answerKey: ['a'] },
      { answerKey: { 'U1-L1-Q01': 42 } },                    // corrupt entry
      { answerKey: { 'U1-L1-Q01': { answerKey: { x: 1 } } } }, // answerKey not scalar|null
    ];
    for (const bad of bads) {
      const ctx = await startServer([makeRow('U1-L1-Q01', 'B')], { loadAnswerKey: async () => bad });
      srv = ctx.server;
      const { status } = await srv.get(`/grade?token=${ctx.token}`);
      expect(status).toBe(500);
      await srv.stop(); srv = null;
    }
  });
  it('read-only: /grade never writes to the ledger store', async () => {
    const rows = [makeRow('U1-L1-Q01', 'B')];
    const ctx = await startServer(rows); srv = ctx.server;
    const before = ctx.ledgerDb._store.length;
    await srv.get(`/grade?token=${ctx.token}`);
    expect(ctx.ledgerDb._store.length).toBe(before);
    expect(ctx.ledgerDb._store.some(r => r._written)).toBe(false);
  });
});
