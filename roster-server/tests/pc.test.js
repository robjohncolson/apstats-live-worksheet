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

function buildApp(pcDb, rosterDb = fakeRosterDb()) {
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  return createApp(
    rosterDb, null, fakeLoadManifest, okAnswerKey, okSkillMap, realBkt,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    pcDb, // pcDbOverride (17th)
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
