// pc-parts-status.test.js - GET /pc/parts and GET/POST /pc/status
// (PC_FOLLOWTHROUGH_SPEC.md section 2.2 / section 2.3). Mirrors pc.test.js's createApp +
// TestServer pattern. No Supabase, no network beyond the loopback test server.
//
// @vitest-environment node

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import http from 'http';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

let realBkt;
beforeAll(async () => { await import('../bkt.js'); realBkt = globalThis.BKT; });

const TEACHER = 'teacher-secret-fixture';
process.env.ROSTER_TOKEN_SECRET = process.env.ROSTER_TOKEN_SECRET || 'test-token-secret';
const STUDENT_TOKEN = signToken('sid-pear');

const ROSTER = [
  { student_id: 'sid-pear', login_username: 'pear_cat', role: 'student', section: 'PeriodE' },
  { student_id: 'sid-plum', login_username: 'plum_owl', role: 'student', section: 'PeriodE' },
  { student_id: 'sid-teach', login_username: 'teacher', role: 'teacher', section: 'PeriodE' },
];

function paperRow(sid, part, points, of) {
  return {
    student_id: sid, source: 'pc', item_id: `U1-PC-${part}-PAPER`, attempt: 1, score: points / of,
    response: JSON.stringify({ part, points, of, origin: 'apclassroom', postedAt: '2026-10-20T23:10:00Z' }),
    recorded_at: '2026-10-20T23:10:00Z',
  };
}

const LEDGER = [
  paperRow('sid-pear', 'A', 9, 18),
  paperRow('sid-pear', 'FRQ', 16, 16),
  { student_id: 'sid-pear', source: 'frq', item_id: 'WS-U1L1-FRQ1', score: 1, attempt: 1 },
];

function fakeRosterDb() {
  return {
    async findByStudentId(id) { return id === 'sid-pear' ? { data: { student_id: id, login_username: 'pear_cat' }, error: null } : { data: null, error: null }; },
    async getRoleByStudentId() { return 'student'; },
    async findByUsername() { return { data: null, error: null }; },
    async listRoster(section) { return { data: ROSTER.filter((r) => r.section === section), error: null }; },
    async insertRoster() { return { data: null, error: null }; },
  };
}

let failLedgerFor = null;
function fakeLedgerDb() {
  return {
    async getLedgerByStudent(sid) {
      if (sid === failLedgerFor) return { data: null, error: { message: 'boom' } };
      return { data: LEDGER.filter((r) => r.student_id === sid), error: null };
    },
    async insertLedgerRow() { return { data: null, error: null }; },
  };
}

function mockPcDb({ statusError = null } = {}) {
  const store = {};
  return {
    _store: store,
    async getBank() { return { data: null, error: null }; },
    async isUnlocked() { return { data: false, error: null }; },
    async upsertUnlocks() { return { data: [], error: null }; },
    async unlockOne() { return { data: null, error: null }; },
    async listActiveForStudent() { return { data: [], error: null }; },
    async listActiveUnlocks() { return { data: [], error: null }; },
    async getStatus(section, unit) {
      if (statusError) return { data: null, error: statusError };
      const row = store[section + '|' + unit];
      return { data: row || null, error: null };
    },
    async upsertStatus(section, unit, payload) {
      if (statusError) return { data: null, error: statusError };
      store[section + '|' + unit] = { payload, updated_at: '2026-10-20T23:15:00Z' };
      return { data: null, error: null };
    },
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

function buildApp(pcDb) {
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  return createApp(
    fakeRosterDb(), fakeLedgerDb(), async () => ({ generatedFrom: 'x', units: [] }), async () => ({ answerKey: {} }), async () => ({}), realBkt,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    pcDb, { async signForItems() { return {}; } },
  );
}

const T = { 'x-teacher-secret': TEACHER };
let server;
afterEach(async () => { if (server) await server.stop(); server = null; delete process.env.ROSTER_TEACHER_SECRET; });

async function start(pcDb = mockPcDb()) {
  server = new TestServer(buildApp(pcDb)); await server.start();
  return pcDb;
}

describe('GET /pc/parts', () => {
  it('lists every student in the section with parts + the blended pct (teacher skipped)', async () => {
    await start();
    const { status, json } = await server.req('GET', '/pc/parts?section=PeriodE&unit=1', { headers: T });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, section: 'PeriodE', unit: 1 });
    expect(json.students.map((s) => s.username)).toEqual(['pear_cat', 'plum_owl']);
    const pear = json.students[0];
    // 100 * (0.5 * 9/18 + 0.5 * 16/16) = 75
    expect(pear.pct).toBe(75);
    expect(pear.parts.FRQ).toMatchObject({ points: 16, of: 16, origin: 'apclassroom' });
    expect(json.students[1]).toEqual({ username: 'plum_owl', studentId: 'sid-plum', parts: {}, pct: null });
  });

  it('one failed ledger read -> 500 (never a silently missing student)', async () => {
    failLedgerFor = 'sid-plum';
    try {
      await start();
      const { status, json } = await server.req('GET', '/pc/parts?section=PeriodE&unit=1', { headers: T });
      expect(status).toBe(500);
      expect(json.ok).toBe(false);
    } finally {
      failLedgerFor = null;
    }
  });

  it('missing section or unit -> 400', async () => {
    await start();
    expect((await server.req('GET', '/pc/parts?unit=1', { headers: T })).status).toBe(400);
    expect((await server.req('GET', '/pc/parts?section=PeriodE', { headers: T })).status).toBe(400);
  });

  it('non-teacher -> 401', async () => {
    await start();
    const { status } = await server.req('GET', '/pc/parts?section=PeriodE&unit=1', { headers: { authorization: `Bearer ${STUDENT_TOKEN}` } });
    expect(status).toBe(401);
  });
});

describe('POST + GET /pc/status', () => {
  const payload = {
    fetchedAt: '2026-10-20T23:00:00Z', assignments: { B: '81743327' }, closeDate: '2026-10-24',
    unmatched: 1, excluded: 1, students: { pear_cat: { B: { status: 'scored', points: 12, of: 14 } } },
  };

  it('stores the snapshot and reads it back', async () => {
    const pcDb = await start();
    const post = await server.req('POST', '/pc/status', { headers: T, body: { section: 'PeriodE', unit: 1, payload } });
    expect(post.status).toBe(200);
    expect(pcDb._store['PeriodE|1'].payload).toEqual(payload);
    const get = await server.req('GET', '/pc/status?section=PeriodE&unit=1', { headers: T });
    expect(get.status).toBe(200);
    expect(get.json).toMatchObject({ ok: true, status: payload, updatedAt: '2026-10-20T23:15:00Z' });
  });

  it('a body with only `reminders` merges that key into the stored snapshot', async () => {
    const pcDb = await start();
    await server.req('POST', '/pc/status', { headers: T, body: { section: 'PeriodE', unit: 1,
      payload: { ...payload, reminders: { draftedAt: '2026-10-22T20:00:00Z', count: 2, sent: false } } } });
    const sent = { draftedAt: '2026-10-22T20:00:00Z', count: 2, sent: true, sentAt: '2026-10-22T21:00:00Z' };
    const res = await server.req('POST', '/pc/status', { headers: T, body: { section: 'PeriodE', unit: 1, reminders: sent } });
    expect(res.status).toBe(200);
    expect(pcDb._store['PeriodE|1'].payload).toEqual({ ...payload, reminders: sent });
  });

  it('reminders-only before any snapshot -> 404; reminders not an object -> 400', async () => {
    await start();
    const none = await server.req('POST', '/pc/status', { headers: T, body: { section: 'PeriodE', unit: 1, reminders: { sent: true } } });
    expect(none.status).toBe(404);
    const bad = await server.req('POST', '/pc/status', { headers: T, body: { section: 'PeriodE', unit: 1, reminders: [1] } });
    expect(bad.status).toBe(400);
  });

  it('GET before any snapshot -> status null', async () => {
    await start();
    const { json } = await server.req('GET', '/pc/status?section=PeriodB&unit=1', { headers: T });
    expect(json).toMatchObject({ ok: true, status: null });
  });

  it('bad body -> 400', async () => {
    await start();
    for (const body of [{ unit: 1, payload }, { section: 'PeriodE', payload }, { section: 'PeriodE', unit: 1 }, { section: 'PeriodE', unit: 1, payload: [1] }]) {
      expect((await server.req('POST', '/pc/status', { headers: T, body })).status).toBe(400);
    }
  });

  it('table missing (42P01) -> 503 run migration 0043, both verbs', async () => {
    await start(mockPcDb({ statusError: { code: '42P01' } }));
    const get = await server.req('GET', '/pc/status?section=PeriodE&unit=1', { headers: T });
    expect(get.status).toBe(503);
    expect(get.json.error).toBe('run migration 0043');
    const post = await server.req('POST', '/pc/status', { headers: T, body: { section: 'PeriodE', unit: 1, payload } });
    expect(post.status).toBe(503);
  });

  it('non-teacher -> 401', async () => {
    await start();
    const auth = { authorization: `Bearer ${STUDENT_TOKEN}` };
    expect((await server.req('GET', '/pc/status?section=PeriodE&unit=1', { headers: auth })).status).toBe(401);
    expect((await server.req('POST', '/pc/status', { headers: auth, body: { section: 'PeriodE', unit: 1, payload } })).status).toBe(401);
  });
});
