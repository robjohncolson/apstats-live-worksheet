// ledger.test.js — tests for /ledger/record and /ledger/student/:id routes
// Injects a fake in-memory ledgerDb — NO network, NO real Supabase.
// Uses Node's built-in http + fetch (Node 18+) to test the Express app.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

// ── Fake in-memory roster db (minimal — only needed for createApp) ────────────

function createFakeRosterDb() {
  return {
    async insertRoster() { return { data: null, error: { message: 'not used in ledger tests' } }; },
    async findByUsername() { return { data: null, error: { message: 'not used in ledger tests' } }; }
  };
}

// ── Fake in-memory ledger db ─────────────────────────────────────────────────

function createFakeLedgerDb() {
  // store keyed by "studentId|source|itemId|attempt"
  const store = new Map();

  return {
    store,

    async insertLedgerRow({ studentId, source, itemId, unit, topic, skill, response, score, evidenceTier, attempt }) {
      const key = `${studentId}|${source}|${itemId}|${attempt}`;

      const row = {
        ledger_id:     `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        student_id:    studentId,
        source,
        item_id:       itemId,
        unit:          unit   || null,
        topic:         topic  || null,
        skill:         skill  || null,
        response,
        score:         score  ?? null,
        evidence_tier: evidenceTier,
        attempt,
        recorded_at:   new Date().toISOString(),
        graded_at:     null
      };

      store.set(key, row);
      return { data: { ledger_id: row.ledger_id, evidence_tier: row.evidence_tier }, error: null };
    },

    async getLedgerByStudent(studentId) {
      const rows = [...store.values()].filter(r => r.student_id === studentId);
      return { data: rows, error: null };
    }
  };
}

// ── Lightweight test server ───────────────────────────────────────────────────

class TestServer {
  constructor(app) {
    this.server = http.createServer(app);
    this.baseUrl = null;
  }

  start() {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        this.baseUrl = `http://127.0.0.1:${this.server.address().port}`;
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  async request(method, path, { body, headers = {} } = {}) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const json = await res.json();
    return { status: res.status, body: json };
  }
}

// ── Constants / helpers ───────────────────────────────────────────────────────

function makeSecret(prefix) {
  return `${prefix}-${randomBytes(16).toString('hex')}`;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let rosterDb;
let ledgerDb;
let srv;
let teacherSecret;
let tokenSecret;
let proctorSecret;
let validStudentId;
let validToken;

beforeEach(async () => {
  teacherSecret = makeSecret('teacher');
  tokenSecret   = makeSecret('token');
  proctorSecret = makeSecret('proctor');

  process.env.ROSTER_TEACHER_SECRET  = teacherSecret;
  process.env.ROSTER_TOKEN_SECRET    = tokenSecret;
  process.env.ROSTER_PROCTOR_SECRET  = proctorSecret;
  process.env.NODE_ENV               = 'test';

  // A valid studentId + token for use in happy-path tests
  validStudentId = `uuid-student-${randomBytes(8).toString('hex')}`;
  validToken = signToken(validStudentId);

  rosterDb  = createFakeRosterDb();
  ledgerDb  = createFakeLedgerDb();
  const app = createApp(rosterDb, ledgerDb);
  srv       = new TestServer(app);
  await srv.start();
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_PROCTOR_SECRET;
});

// ── POST /ledger/record ───────────────────────────────────────────────────────

describe('POST /ledger/record', () => {

  function record(overrides = {}, headers = {}) {
    return srv.request('POST', '/ledger/record', {
      body: {
        token:    validToken,
        source:   'worksheet',
        itemId:   'WS-U4L1-Q1',
        response: { answer: 'random' },
        ...overrides
      },
      headers
    });
  }

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('happy path: returns ok:true, a ledgerId string, and default tier "practice"', async () => {
    const { status, body } = await record();

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.ledgerId).toBe('string');
    expect(body.ledgerId.length).toBeGreaterThan(0);
    expect(body.evidenceTier).toBe('practice');
  });

  it('resolves the token to the correct studentId before writing', async () => {
    await record();

    const rows = [...ledgerDb.store.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].student_id).toBe(validStudentId);
  });

  it('defaults attempt to 1 when not supplied', async () => {
    await record();

    const rows = [...ledgerDb.store.values()];
    expect(rows[0].attempt).toBe(1);
  });

  // ── Token auth (401) ────────────────────────────────────────────────────────

  it('missing token → 401 {ok:false, error:"invalid token"}', async () => {
    const { status, body } = await srv.request('POST', '/ledger/record', {
      body: { source: 'worksheet', itemId: 'Q1', response: {} }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid token');
  });

  it('invalid/garbage token → 401 {ok:false, error:"invalid token"}', async () => {
    const { status, body } = await record({ token: 'garbage.notavalidtoken' });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid token');
  });

  // ── Required field validation (400) ────────────────────────────────────────

  it('missing source → 400', async () => {
    const { status, body } = await record({ source: undefined });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('missing itemId → 400', async () => {
    const { status, body } = await record({ itemId: undefined });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('missing response → 400', async () => {
    // response omitted from body entirely
    const { status, body } = await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'Q1' }
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('explicit JSON null response is accepted', async () => {
    const { status, body } = await record({ response: null });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const rows = [...ledgerDb.store.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].response).toBeNull();
  });

  // ── Proctor secret → evidence_tier (decision L-C) ──────────────────────────

  it('correct x-proctor-secret header → evidenceTier:"proctored"', async () => {
    const { status, body } = await record({}, { 'x-proctor-secret': proctorSecret });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.evidenceTier).toBe('proctored');
  });

  it('wrong x-proctor-secret header → evidenceTier:"practice" (not proctored)', async () => {
    const { status, body } = await record({}, { 'x-proctor-secret': 'wrong-secret' });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.evidenceTier).toBe('practice');
  });

  it('absent x-proctor-secret header → evidenceTier:"practice"', async () => {
    const { status, body } = await record();

    expect(status).toBe(200);
    expect(body.evidenceTier).toBe('practice');
  });

  // ── Integrity: body evidenceTier is IGNORED (decision L-C) ─────────────────

  it('body evidenceTier:"proctored" WITHOUT the header is still stored as "practice"', async () => {
    // Client tries to self-certify as proctored in the body — must be ignored
    const { status, body } = await record({ evidenceTier: 'proctored' });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.evidenceTier).toBe('practice');

    // Verify what was actually written to the store
    const rows = [...ledgerDb.store.values()];
    expect(rows[0].evidence_tier).toBe('practice');
  });

  it('body evidence_tier:"proctored" WITHOUT the header is still stored as "practice"', async () => {
    // Snake-case variant — same integrity rule
    const { status, body } = await record({ evidence_tier: 'proctored' });

    expect(status).toBe(200);
    expect(body.evidenceTier).toBe('practice');

    const rows = [...ledgerDb.store.values()];
    expect(rows[0].evidence_tier).toBe('practice');
  });

  // ── Upsert on duplicate (student, source, itemId, attempt) ─────────────────

  it('duplicate (student, source, item, attempt) upserts — not duplicates', async () => {
    await record({ itemId: 'Q-DUPE', response: { answer: 'first' } });
    await record({ itemId: 'Q-DUPE', response: { answer: 'second' } });

    // The fake db overwrites on the same key
    const key = `${validStudentId}|worksheet|Q-DUPE|1`;
    const stored = ledgerDb.store.get(key);
    expect(stored).toBeDefined();
    expect(stored.response).toEqual({ answer: 'second' });

    // Only one row for that key
    expect(ledgerDb.store.size).toBe(1);
  });

  it('different attempt numbers are stored as separate rows', async () => {
    await record({ itemId: 'Q-ATT', attempt: 1 });
    await record({ itemId: 'Q-ATT', attempt: 2 });

    expect(ledgerDb.store.size).toBe(2);
  });
});

// ── GET /ledger/student/:studentId ────────────────────────────────────────────

describe('GET /ledger/student/:studentId', () => {

  function getStudent(studentId, headers = {}) {
    return srv.request('GET', `/ledger/student/${studentId}`, { headers });
  }

  it('valid teacher secret → 200 {ok:true, rows:[]}  (empty store)', async () => {
    const { status, body } = await getStudent(validStudentId, {
      'x-teacher-secret': teacherSecret
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows).toHaveLength(0);
  });

  it('returns rows written for that student', async () => {
    // Write one record first
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'Q1', response: { a: 1 } }
    });

    const { status, body } = await getStudent(validStudentId, {
      'x-teacher-secret': teacherSecret
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].item_id).toBe('Q1');
  });

  it('missing x-teacher-secret → 401 {ok:false, error:"forbidden"}', async () => {
    const { status, body } = await getStudent(validStudentId);

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
  });

  it('wrong x-teacher-secret → 401 {ok:false, error:"forbidden"}', async () => {
    const { status, body } = await getStudent(validStudentId, {
      'x-teacher-secret': 'wrong-secret'
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
  });
});
