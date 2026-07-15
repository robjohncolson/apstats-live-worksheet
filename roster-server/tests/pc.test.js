// pc.test.js -- Progress-Check makeup delivery endpoints (PC_MAKEUP_DELIVERY_SPEC.md
// Phase 1). Asserts: unlocked student GET returns items with answers STRIPPED;
// locked -> 403; no token -> 401; teacher unlock upserts; non-teacher unlock -> 401.
// Mirrors blooket-endpoint.test.js's createApp + TestServer pattern. No Supabase.
//
// @vitest-environment node

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import http from 'http';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

let realBkt;
beforeAll(async () => { await import('../bkt.js'); realBkt = globalThis.BKT; });

const TEACHER = 'teacher-secret-fixture';
const SID = 'sid-fox';
const USERNAME = 'stu_fox';
process.env.ROSTER_TOKEN_SECRET = process.env.ROSTER_TOKEN_SECRET || 'test-token-secret';
const STUDENT_TOKEN = signToken(SID);

const fakeLoadManifest = async () => ({ generatedFrom: 'x', units: [] });
const okAnswerKey = async () => ({ answerKey: {} });
const okSkillMap = async () => ({});

function fakeRosterDb({ role = 'student' } = {}) {
  return {
    async findByStudentId(id) {
      return id === SID ? { data: { student_id: SID, login_username: USERNAME }, error: null } : { data: null, error: null };
    },
    async getRoleByStudentId() { return role; },
    async findByUsername() { return { data: null, error: null }; },
    async listRoster() { return { data: [], error: null }; },
    async insertRoster() { return { data: null, error: null }; },
  };
}

// A bank item that DELIBERATELY carries answer + rationaleCorrect + rubric, to
// prove the route strips every answer-bearing field before it reaches the client.
const BANK = {
  unit: 1, part: 'A',
  payload: { items: [{
    id: 'U1-PC26-MCQ-A-Q01', type: 'multiple-choice', n: 1,
    stem: 'Which is categorical?', choices: { A: 'age', B: 'color' },
    answer: 'B', rationaleCorrect: 'color is categorical', rubric: 'award 1 pt',
    visual: null,
  }] },
};

function mockPcDb({ unlocked = false } = {}) {
  const calls = { upsertUnlocks: [], unlockOne: [] };
  return {
    _calls: calls,
    async getBank() { return { data: BANK, error: null }; },
    async isUnlocked() { return { data: unlocked, error: null }; },
    async upsertUnlocks(a) { calls.upsertUnlocks.push(a); return { data: (a.studentUsernames || []).map((u) => ({ student_username: u })), error: null }; },
    async unlockOne(a) { calls.unlockOne.push(a); return { data: { student_username: a.studentUsername }, error: null }; },
    async listActiveForStudent() { return { data: [], error: null }; },
    async listActiveUnlocks() { return { data: [{ student_username: 'a', unit: 1, part: 'A', unlocked_by: 'teacher', unlocked_at: '2026-09-20T00:00:00Z' }], error: null }; },
  };
}

class TestServer {
  constructor(app) { this.server = http.createServer(app); this.baseUrl = null; }
  start() { return new Promise((r) => this.server.listen(0, '127.0.0.1', () => { this.baseUrl = `http://127.0.0.1:${this.server.address().port}`; r(); })); }
  stop() { return new Promise((r) => this.server.close(r)); }
  async req(method, path, { body, headers = {} } = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method, headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }
}

// Minimal in-memory ledgerDb: records insertLedgerRow calls + serves prior rows
// (for the best-wins floor read in POST /pc/:unit/:part/submit).
function fakeLedgerDb(seedRows = []) {
  const rows = seedRows.map((r) => ({ student_id: SID, ...r }));
  const writes = [];
  return {
    _rows: rows, _writes: writes,
    async getLedgerByStudent(sid) { return { data: rows.filter((r) => r.student_id === sid), error: null }; },
    async insertLedgerRow(a) {
      writes.push(a);
      rows.push({ student_id: a.studentId, source: a.source, item_id: a.itemId, response: a.response, score: a.score, evidence_tier: a.evidenceTier, attempt: a.attempt });
      return { data: { ledger_id: 'led-' + writes.length }, error: null };
    },
  };
}

// Fake figures signer: deterministic, no Supabase — attaches a signed URL for the
// BANK fixture item so the GET test proves figures ride the response.
function fakeFiguresSigner() {
  return {
    async signForItems(ids) {
      return (Array.isArray(ids) && ids.includes('U1-PC26-MCQ-A-Q01'))
        ? { 'U1-PC26-MCQ-A-Q01': { stems: ['https://signed/U1-PC26-MCQ-A-Q01_0.png'], choices: {} } }
        : {};
    },
  };
}

function buildApp(pcDb, rosterDb = fakeRosterDb(), ledgerDb = null, figuresSigner = fakeFiguresSigner()) {
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  return createApp(
    rosterDb, ledgerDb, fakeLoadManifest, okAnswerKey, okSkillMap, realBkt,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    pcDb, figuresSigner, // pcDbOverride (17th), figuresSignerOverride (18th)
  );
}

let server;
afterEach(async () => { if (server) await server.stop(); server = null; delete process.env.ROSTER_TEACHER_SECRET; });

describe('GET /pc/:unit/:part', () => {
  it('unlocked student gets items with answers/rationale/rubric STRIPPED', async () => {
    server = new TestServer(buildApp(mockPcDb({ unlocked: true }))); await server.start();
    const { status, json } = await server.req('GET', '/pc/1/A', { headers: { authorization: `Bearer ${STUDENT_TOKEN}` } });
    expect(status).toBe(200);
    expect(json.items).toHaveLength(1);
    const item = json.items[0];
    expect(item.stem).toBeTruthy();
    expect(item.choices).toBeTruthy();
    // The security-critical assertion: nothing that reveals the answer ships.
    expect('answer' in item).toBe(false);
    expect('rationaleCorrect' in item).toBe(false);
    expect('rubric' in item).toBe(false);
    // D1-a: the server attaches signed figure URLs (never the service key/answers).
    expect(item.figures).toEqual({ stems: ['https://signed/U1-PC26-MCQ-A-Q01_0.png'], choices: {} });
  });

  it('locked student -> 403', async () => {
    server = new TestServer(buildApp(mockPcDb({ unlocked: false }))); await server.start();
    const { status } = await server.req('GET', '/pc/1/A', { headers: { authorization: `Bearer ${STUDENT_TOKEN}` } });
    expect(status).toBe(403);
  });

  it('no token -> 401', async () => {
    server = new TestServer(buildApp(mockPcDb({ unlocked: true }))); await server.start();
    const { status } = await server.req('GET', '/pc/1/A');
    expect(status).toBe(401);
  });

  it('bad part -> 400', async () => {
    server = new TestServer(buildApp(mockPcDb({ unlocked: true }))); await server.start();
    const { status } = await server.req('GET', '/pc/1/Z', { headers: { authorization: `Bearer ${STUDENT_TOKEN}` } });
    expect(status).toBe(400);
  });

  it('teacher previews WITHOUT unlock (bypass) -> 200, teacher:true, answers still stripped', async () => {
    server = new TestServer(buildApp(mockPcDb({ unlocked: false }))); await server.start();
    const { status, json } = await server.req('GET', '/pc/1/A', { headers: { 'x-teacher-secret': TEACHER } });
    expect(status).toBe(200);
    expect(json.teacher).toBe(true);
    expect(json.items).toHaveLength(1);
    expect('answer' in json.items[0]).toBe(false);
  });
});

describe('POST /pc/unlock', () => {
  it('teacher unlocks a list of present students', async () => {
    const pc = mockPcDb();
    server = new TestServer(buildApp(pc)); await server.start();
    const { status, json } = await server.req('POST', '/pc/unlock', {
      headers: { 'x-teacher-secret': TEACHER },
      body: { studentUsernames: ['a', 'b', 'c'], unit: 1, part: 'A' },
    });
    expect(status).toBe(200);
    expect(json.unlocked).toBe(3);
    expect(pc._calls.upsertUnlocks[0]).toMatchObject({ unit: 1, part: 'A' });
    expect(pc._calls.upsertUnlocks[0].studentUsernames).toEqual(['a', 'b', 'c']);
  });

  it('non-teacher -> 401', async () => {
    server = new TestServer(buildApp(mockPcDb())); await server.start();
    const { status } = await server.req('POST', '/pc/unlock', {
      headers: { authorization: `Bearer ${STUDENT_TOKEN}` },
      body: { studentUsernames: ['a'], unit: 1, part: 'A' },
    });
    expect(status).toBe(401);
  });
});

describe('POST /pc/:unit/:part/submit', () => {
  it('unlocked student: MCQ scored server-side; pc row written; answer NOT echoed', async () => {
    const led = fakeLedgerDb();
    server = new TestServer(buildApp(mockPcDb({ unlocked: true }), fakeRosterDb(), led)); await server.start();
    const { status, json } = await server.req('POST', '/pc/1/A/submit', {
      headers: { authorization: `Bearer ${STUDENT_TOKEN}` },
      body: { responses: [{ itemId: 'U1-PC26-MCQ-A-Q01', response: 'B' }] }, // B is correct
    });
    expect(status).toBe(200);
    expect(json.scored).toEqual([{ itemId: 'U1-PC26-MCQ-A-Q01', score: 1 }]);
    // security: no answer/rationale/rubric leaks back through the scoring path
    const blob = JSON.stringify(json);
    expect(blob).not.toContain('rationale');
    expect(blob).not.toContain('rubric');
    expect(led._writes[0]).toMatchObject({ source: 'pc', itemId: 'U1-PC26-MCQ-A-Q01', score: 1, evidenceTier: 'practice', unit: 'U1' });
  });

  it('wrong answer -> score 0', async () => {
    const led = fakeLedgerDb();
    server = new TestServer(buildApp(mockPcDb({ unlocked: true }), fakeRosterDb(), led)); await server.start();
    const { json } = await server.req('POST', '/pc/1/A/submit', {
      headers: { authorization: `Bearer ${STUDENT_TOKEN}` },
      body: { responses: [{ itemId: 'U1-PC26-MCQ-A-Q01', response: 'A' }] },
    });
    expect(json.scored[0].score).toBe(0);
    expect(led._writes[0].score).toBe(0);
  });

  it('best-wins: a later WRONG retake never lowers a prior correct score', async () => {
    const led = fakeLedgerDb([{ source: 'pc', item_id: 'U1-PC26-MCQ-A-Q01', score: 1, attempt: 1 }]);
    server = new TestServer(buildApp(mockPcDb({ unlocked: true }), fakeRosterDb(), led)); await server.start();
    await server.req('POST', '/pc/1/A/submit', {
      headers: { authorization: `Bearer ${STUDENT_TOKEN}` },
      body: { responses: [{ itemId: 'U1-PC26-MCQ-A-Q01', response: 'A' }] }, // wrong now
    });
    expect(led._writes[0].score).toBe(1); // floor held: max(0, prior 1)
  });

  it('locked -> 403', async () => {
    const led = fakeLedgerDb();
    server = new TestServer(buildApp(mockPcDb({ unlocked: false }), fakeRosterDb(), led)); await server.start();
    const { status } = await server.req('POST', '/pc/1/A/submit', {
      headers: { authorization: `Bearer ${STUDENT_TOKEN}` },
      body: { responses: [{ itemId: 'U1-PC26-MCQ-A-Q01', response: 'B' }] },
    });
    expect(status).toBe(403);
  });

  it('no token -> 401', async () => {
    const led = fakeLedgerDb();
    server = new TestServer(buildApp(mockPcDb({ unlocked: true }), fakeRosterDb(), led)); await server.start();
    const { status } = await server.req('POST', '/pc/1/A/submit', { body: { responses: [] } });
    expect(status).toBe(401);
  });
});

describe('POST /pc/grade (teacher paper entry)', () => {
  function rosterWithStudent() {
    const base = fakeRosterDb();
    base.findByUsername = async (u) => (u === USERNAME
      ? { data: { student_id: SID, login_username: USERNAME }, error: null }
      : { data: null, error: null });
    return base;
  }

  it('teacher writes a proctored -PAPER pc row', async () => {
    const led = fakeLedgerDb();
    server = new TestServer(buildApp(mockPcDb(), rosterWithStudent(), led)); await server.start();
    const { status, json } = await server.req('POST', '/pc/grade', {
      headers: { 'x-teacher-secret': TEACHER },
      body: { studentUsername: USERNAME, unit: 1, part: 'A', score: 0.9 },
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(led._writes[0]).toMatchObject({ source: 'pc', itemId: 'U1-PC-A-PAPER', score: 0.9, evidenceTier: 'proctored', unit: 'U1' });
  });

  it('non-teacher -> 401', async () => {
    const led = fakeLedgerDb();
    server = new TestServer(buildApp(mockPcDb(), rosterWithStudent(), led)); await server.start();
    const { status } = await server.req('POST', '/pc/grade', {
      headers: { authorization: `Bearer ${STUDENT_TOKEN}` },
      body: { studentUsername: USERNAME, unit: 1, part: 'A', score: 0.9 },
    });
    expect(status).toBe(401);
  });

  it('score out of range -> 400', async () => {
    const led = fakeLedgerDb();
    server = new TestServer(buildApp(mockPcDb(), rosterWithStudent(), led)); await server.start();
    const { status } = await server.req('POST', '/pc/grade', {
      headers: { 'x-teacher-secret': TEACHER },
      body: { studentUsername: USERNAME, unit: 1, part: 'A', score: 5 },
    });
    expect(status).toBe(400);
  });

  it('unknown student -> 404', async () => {
    const led = fakeLedgerDb();
    server = new TestServer(buildApp(mockPcDb(), rosterWithStudent(), led)); await server.start();
    const { status } = await server.req('POST', '/pc/grade', {
      headers: { 'x-teacher-secret': TEACHER },
      body: { studentUsername: 'ghost', unit: 1, part: 'A', score: 0.5 },
    });
    expect(status).toBe(404);
  });
});

describe('GET /pc/unlock/class (teacher makeup board)', () => {
  it('teacher gets every active unlock across the class', async () => {
    server = new TestServer(buildApp(mockPcDb())); await server.start();
    const { status, json } = await server.req('GET', '/pc/unlock/class', { headers: { 'x-teacher-secret': TEACHER } });
    expect(status).toBe(200);
    expect(json.unlocks).toHaveLength(1);
    expect(json.unlocks[0]).toMatchObject({ student_username: 'a', unit: 1, part: 'A' });
  });

  it('non-teacher -> 401', async () => {
    server = new TestServer(buildApp(mockPcDb())); await server.start();
    const { status } = await server.req('GET', '/pc/unlock/class', { headers: { authorization: `Bearer ${STUDENT_TOKEN}` } });
    expect(status).toBe(401);
  });
});
