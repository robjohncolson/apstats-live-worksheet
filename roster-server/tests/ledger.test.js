// ledger.test.js — tests for /ledger/record and /ledger/student/:id routes
// Injects a fake in-memory ledgerDb — NO network, NO real Supabase.
// Uses Node's built-in http + fetch (Node 18+) to test the Express app.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { generateKeyPairSync, randomBytes, sign } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { createLedgerDb, isMissingColumnError } from '../ledger-db.js';
import { getReceiptIssuer, initReceipts, verifyReviewGrant } from '../receipts.js';
import { publicKeyFromX, verifyRecord } from '../snapshot-verify.js';
import { latestPerItem, isCorrect } from '../scoring.js';
import { QUIZ_RETRIES_CLOSED_FROM } from '../grade-config.js';
import { quizRetriesClosedAt } from '../ledger.js';

// ── Fake in-memory roster db (minimal — only needed for createApp) ────────────

function createFakeRosterDb() {
  return {
    async insertRoster() { return { data: null, error: { message: 'not used in ledger tests' } }; },
    async findByUsername() { return { data: null, error: { message: 'not used in ledger tests' } }; },
    // Powers the teacher view-as path in GET /ledger/student/:id: a sid that
    // starts with 'uuid-teacher' is a teacher; everyone else is a student.
    async getRoleByStudentId(studentId) {
      return (typeof studentId === 'string' && studentId.startsWith('uuid-teacher'))
        ? 'teacher' : 'student';
    }
  };
}

// ── Fake in-memory ledger db ─────────────────────────────────────────────────

function createFakeLedgerDb() {
  // store keyed by "studentId|source|itemId|attempt"
  const store = new Map();

  function buildRow({ studentId, source, itemId, unit, topic, skill, response, score, evidenceTier, attempt, recordedAt, reasoning, receiptId, receiptCompact }) {
    return {
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
      recorded_at:   recordedAt || new Date().toISOString(),
      graded_at:     null,
      receipt_id:      receiptId || null,
      receipt_compact: receiptCompact || null,
      ...(reasoning ? { reasoning } : {})
    };
  }

  const fake = {
    store,
    // Test hooks: `readResult` overrides getLedgerByStudent's result (e.g. { data:null, error });
    // `beforeInsertIfAbsent` runs just before the first-write-wins insert (race simulation).
    readResult: null,
    beforeInsertIfAbsent: null,
    // Every write path signs inside the upsert; a separate receipt update is a regression.
    receiptUpdates: [],
    async updateLedgerReceipt(ledgerId, receipt) {
      fake.receiptUpdates.push({ ledgerId, ...receipt });
      return { error: null };
    },

    // First writer wins (mirrors the ignoreDuplicates upsert): never updates an existing row.
    async insertLedgerRowIfAbsent(opts) {
      if (typeof fake.beforeInsertIfAbsent === 'function') await fake.beforeInsertIfAbsent(opts);
      const key = `${opts.studentId}|${opts.source}|${opts.itemId}|${opts.attempt}`;
      if (store.has(key)) return { data: [], error: null, inserted: false };
      const row = buildRow(opts);
      store.set(key, row);
      return { data: [row], error: null, inserted: true };
    },

    async insertLedgerRow({ studentId, source, itemId, unit, topic, skill, response, score, evidenceTier, attempt, reasoning, receiptId, receiptCompact }) {
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
        graded_at:     null,
        receipt_id:      receiptId || null,
        receipt_compact: receiptCompact || null,
        ...(reasoning ? { reasoning } : {})
      };

      store.set(key, row);
      return { data: { ledger_id: row.ledger_id, evidence_tier: row.evidence_tier }, error: null };
    },

    async getLedgerByStudent(studentId, opts) {
      if (fake.readResult) return fake.readResult;
      const prefix = opts && opts.prefix;
      let rows = [...store.values()].filter(r => r.student_id === studentId);
      if (prefix) {
        rows = rows.filter(r => typeof r.item_id === 'string' && r.item_id.startsWith(prefix));
      }
      // Newest first — sort by recorded_at descending
      rows.sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || ''));
      return { data: rows, error: null };
    }
  };
  return fake;
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

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function canonicalize(payload) {
  const sorted = {};
  for (const key of Object.keys(payload).sort()) {
    if (payload[key] !== undefined) sorted[key] = payload[key];
  }
  return JSON.stringify(sorted);
}

function makeReviewGrant(overrides = {}) {
  const payload = {
    v: 1,
    t: 'review-grant',
    sid: validStudentId,
    item: 'U4-L3-Q01#rev',
    credit: 2 / 3,
    exp: Date.now() + 60_000,
    ts: Date.now(),
    n: randomBytes(4).toString('hex'),
    ...overrides
  };
  const bytes = Buffer.from(canonicalize(payload), 'utf8');
  const sig = sign(null, bytes, reviewGrantPrivateKey);
  return `${b64url(bytes)}.${b64url(sig)}`;
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
let teacherStudentId;
let teacherToken;
let reviewGrantPrivateKey;

beforeEach(async () => {
  teacherSecret = makeSecret('teacher');
  tokenSecret   = makeSecret('token');
  proctorSecret = makeSecret('proctor');

  process.env.ROSTER_TEACHER_SECRET  = teacherSecret;
  process.env.ROSTER_TOKEN_SECRET    = tokenSecret;
  process.env.ROSTER_PROCTOR_SECRET  = proctorSecret;
  process.env.NODE_ENV               = 'test';

  const reviewGrantKeys = generateKeyPairSync('ed25519');
  reviewGrantPrivateKey = reviewGrantKeys.privateKey;
  process.env.REVIEW_GRANT_PUBKEY = reviewGrantKeys.publicKey.export({ format: 'jwk' }).x;

  // A valid studentId + token for use in happy-path tests
  validStudentId = `uuid-student-${randomBytes(8).toString('hex')}`;
  validToken = signToken(validStudentId);

  // A teacher studentId + token (the fake rosterDb maps 'uuid-teacher*' -> teacher).
  teacherStudentId = `uuid-teacher-${randomBytes(8).toString('hex')}`;
  teacherToken = signToken(teacherStudentId);

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
  delete process.env.REVIEW_GRANT_PUBKEY;
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

  // ── FRQ durable floor (2026-08-19) ─────────────────────────────────────────
  // Drafts (score undefined) never null a stored grade; a weaker regrade never
  // lowers it; a stronger one raises it. Other sources are untouched.

  function frqRow() {
    const key = `${validStudentId}|frq|WS-U4L1-reflect1|1`;
    return ledgerDb.store.get(key);
  }

  it('FRQ floor: a draft save after a graded write keeps the stored score (text still updates)', async () => {
    let r = await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'first answer text', score: 1 });
    expect(r.status).toBe(200);
    r = await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'edited draft text', score: undefined });
    expect(r.status).toBe(200);
    expect(frqRow().score).toBe(1);
    expect(frqRow().response).toBe('edited draft text');
  });

  it('FRQ floor: a weaker regrade never lowers; a stronger one raises', async () => {
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'a', score: 0.5 });
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'b', score: 0 });
    expect(frqRow().score).toBe(0.5);
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'c', score: 1 });
    expect(frqRow().score).toBe(1);
  });

  // ── Quiz retry rule v2 (QUIZ_FIRST_ANSWER_SPEC v2 §2) ────────────────────
  // KEYED items: one answer; one explained retry only after a WRONG first answer; the retry
  // (attempt 2) is the graded row. UNKEYED items (free-response) keep unlimited revisions.
  const QUIZ_ITEM = 'U1-L7-Q03';           // key: B
  const QUIZ_NO_KEY_ITEM = 'U1-L7-Q99';    // absent from the key (an FRQ)
  const REASON = 'I misread the graph axis';

  function quizRow(attempt = 1, itemId = QUIZ_ITEM) {
    return ledgerDb.store.get(`${validStudentId}|curriculum_quiz|${itemId}|${attempt}`);
  }

  // Retries closed at 2026-10-27T04:00Z (QUIZ_RETRY_REMOVAL_SPEC.md rule 3) and re-opened
  // 2026-11-02 (QUIZ_RETRIES_CLOSED_FROM = null). The route reads Date.now(), so these tests pin
  // the clock: an hour before the old cutoff unless a test says `at`.
  // The token is re-signed under the pinned clock so it never reads as expired.
  const OLD_CUTOFF = Date.parse('2026-10-27T04:00:00Z');
  const BEFORE_OLD_CUTOFF = OLD_CUTOFF - 60 * 60 * 1000;

  async function withKeyedServer(fn, loadAnswerKey = async () => ({ answerKey: { [QUIZ_ITEM]: { answerKey: 'B' } } }), { at = BEFORE_OLD_CUTOFF } = {}) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at);
    validToken = signToken(validStudentId);
    const keyed = new TestServer(createApp(rosterDb, ledgerDb, undefined, loadAnswerKey));
    await keyed.start();
    try {
      const quiz = (body) => keyed.request('POST', '/ledger/record', {
        body: { token: validToken, source: 'curriculum_quiz', itemId: QUIZ_ITEM, ...body }
      });
      await fn(quiz);
    } finally {
      await keyed.stop();
      vi.useRealTimers();
    }
  }

  it('quiz attempt 1: a later attempt-1 write never replaces the first (response + score kept, client told)', async () => {
    await withKeyedServer(async (quiz) => {
      let r = await quiz({ response: 'C', score: 0 });
      expect(r.status).toBe(200);
      expect(r.body.firstAnswerKept).toBeUndefined();
      r = await quiz({ response: 'B', score: 1 });
      expect(r.status).toBe(200);
      expect(r.body.firstAnswerKept).toBe(true);
      expect(r.body.keptResponse).toBe('C');   // the quiz app turns the ignored letter into the retry
      expect(quizRow().response).toBe('C');
      expect(quizRow().score).toBe(0);
    });
  });

  it('quiz attempt 2: accepted after a wrong first answer with a 3+ word explanation (stored as a new row)', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ response: 'C', attempt: 1 });
      const r = await quiz({ response: 'B', attempt: 2, reasoning: REASON });
      expect(r.status).toBe(200);
      expect(r.body.ok).toBe(true);
      expect(r.body.ledgerId).toBe(quizRow(2).ledger_id);
      expect(r.body.evidenceTier).toBe('practice');
      expect(quizRow(1).response).toBe('C');
      expect(quizRow(2).response).toBe('B');
      expect(quizRow(2).reasoning).toBe(REASON);
    });
  });

  it('quiz retries are open: QUIZ_RETRIES_CLOSED_FROM is null since 2026-11-02 (teacher re-opened them)', () => {
    expect(QUIZ_RETRIES_CLOSED_FROM).toBeNull();
  });

  it('quiz attempt 2: accepted at, just after and a week after the old 2026-10-27 cutoff', async () => {
    for (const at of [OLD_CUTOFF, OLD_CUTOFF + 1, OLD_CUTOFF + 7 * 24 * 60 * 60 * 1000]) {
      ledgerDb.store.clear();
      await withKeyedServer(async (quiz) => {
        await quiz({ response: 'C', attempt: 1 });
        const r = await quiz({ response: 'B', attempt: 2, reasoning: REASON });
        expect(r.status).toBe(200);
        expect(r.body.ok).toBe(true);
        expect(quizRow(1).response).toBe('C');
        expect(quizRow(2).response).toBe('B');
        expect(quizRow(2).reasoning).toBe(REASON);
      }, undefined, { at });
    }
  });

  it('quiz attempt 2 is stamped with the instant it was checked, not a later one', async () => {
    const at = OLD_CUTOFF + 60 * 1000;
    await withKeyedServer(async (quiz) => {
      await quiz({ response: 'C', attempt: 1 });
      ledgerDb.beforeInsertIfAbsent = async () => { vi.setSystemTime(at + 5); };
      try {
        const r = await quiz({ response: 'B', attempt: 2, reasoning: REASON });
        expect(r.status).toBe(200);
        expect(quizRow(2).recorded_at).toBe(new Date(at).toISOString());
      } finally {
        ledgerDb.beforeInsertIfAbsent = null;
      }
    }, undefined, { at });
  });

  it('quizRetriesClosedAt: with a date set the guard still closes retries at and after it', () => {
    const closedFrom = '2026-10-27T04:00:00Z';
    const closedAt = Date.parse(closedFrom);
    expect(quizRetriesClosedAt(closedAt - 1, closedFrom)).toBe(false);
    expect(quizRetriesClosedAt(closedAt, closedFrom)).toBe(true);
    expect(quizRetriesClosedAt(closedAt + 7 * 24 * 60 * 60 * 1000, closedFrom)).toBe(true);
  });

  it('quizRetriesClosedAt: no date, or one that does not parse, leaves retries open', () => {
    const now = OLD_CUTOFF + 1;
    expect(quizRetriesClosedAt(now, null)).toBe(false);
    expect(quizRetriesClosedAt(now, undefined)).toBe(false);
    expect(quizRetriesClosedAt(now, '')).toBe(false);
    expect(quizRetriesClosedAt(now, 'not a date')).toBe(false);
  });

  it('quiz attempt 1 after the old cutoff: unchanged (recorded, and a later attempt-1 keeps the first)', async () => {
    await withKeyedServer(async (quiz) => {
      let r = await quiz({ response: 'C', attempt: 1 });
      expect(r.status).toBe(200);
      expect(r.body.firstAnswerKept).toBeUndefined();
      r = await quiz({ response: 'B', attempt: 1 });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ firstAnswerKept: true, keptResponse: 'C' });
      expect(quizRow(1).response).toBe('C');
    }, undefined, { at: OLD_CUTOFF + 1 });
  });

  it('quiz FRQ (no answer-key entry) after the old cutoff: later attempts still save', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ itemId: QUIZ_NO_KEY_ITEM, response: 'draft one', attempt: 1 });
      const r = await quiz({ itemId: QUIZ_NO_KEY_ITEM, response: 'draft two', attempt: 2 });
      expect(r.status).toBe(200);
      expect(quizRow(2, QUIZ_NO_KEY_ITEM).response).toBe('draft two');
    }, undefined, { at: OLD_CUTOFF + 1 });
  });

  it('quiz attempt 2: refused when the first answer was correct', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ response: 'b', attempt: 1 });
      const r = await quiz({ response: 'C', attempt: 2, reasoning: REASON });
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ ok: false, error: 'retry not allowed', reason: 'correct-first' });
      expect(quizRow(2)).toBeUndefined();
    });
  });

  it('quiz attempt 2: refused without an explanation (missing, under 3 words, or punctuation only)', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ response: 'C', attempt: 1 });
      for (const reasoning of [undefined, '  oops   sorry ', '. . .', '- ? !']) {
        const r = await quiz({ response: 'B', attempt: 2, reasoning });
        expect(r.status).toBe(409);
        expect(r.body.reason).toBe('explanation-required');
      }
      expect(quizRow(2)).toBeUndefined();
    });
  });

  it('quiz attempt 2: words are tokens with a letter or digit, in any script', async () => {
    for (const reasoning of ['porque cambié de idea', 'a, b. c!']) {
      ledgerDb.store.clear();
      await withKeyedServer(async (quiz) => {
        await quiz({ response: 'C', attempt: 1 });
        const r = await quiz({ response: 'B', attempt: 2, reasoning });
        expect(r.status).toBe(200);
        expect(quizRow(2).reasoning).toBe(reasoning);
      });
    }
  });

  it('quiz: a second retry and any third attempt are refused', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ response: 'C', attempt: 1 });
      expect((await quiz({ response: 'A', attempt: 2, reasoning: REASON })).status).toBe(200);
      let r = await quiz({ response: 'B', attempt: 2, reasoning: REASON });
      expect(r.status).toBe(409);
      expect(r.body.reason).toBe('already-retried');
      expect(quizRow(2).response).toBe('A');
      r = await quiz({ response: 'B', attempt: 3, reasoning: REASON });
      expect(r.status).toBe(409);
      expect(r.body.reason).toBe('no-more-attempts');
      expect(quizRow(3)).toBeUndefined();
    });
  });

  it('quiz attempt 2: refused with no first answer', async () => {
    await withKeyedServer(async (quiz) => {
      const r = await quiz({ response: 'B', attempt: 2, reasoning: REASON });
      expect(r.status).toBe(409);
      expect(r.body.reason).toBe('no-first-answer');
      expect(quizRow(2)).toBeUndefined();
    });
  });

  it('quiz: attempt must be 1 or 2 — 0, -1, "x", 2.5 refused; "2" behaves as 2 and is stored as the integer', async () => {
    await withKeyedServer(async (quiz) => {
      for (const attempt of [0, -1, 'x', 2.5, '', true, [1], [2], {}]) {
        const r = await quiz({ response: 'C', attempt });
        expect(r.status).toBe(409);
        expect(r.body).toMatchObject({ ok: false, error: 'retry not allowed', reason: 'invalid-attempt' });
      }
      expect(ledgerDb.store.size).toBe(0);
      await quiz({ response: 'C', attempt: '1' });
      expect(quizRow(1).attempt).toBe(1);
      const r = await quiz({ response: 'B', attempt: '2', reasoning: REASON });
      expect(r.status).toBe(200);
      expect(quizRow(2).attempt).toBe(2);
      expect([...ledgerDb.store.keys()].some((k) => k.endsWith('|"2"') || k.endsWith('|2.5'))).toBe(false);
    });
  });

  it('quiz attempt 2: a pre-existing retry is never updated (409 already-retried)', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ response: 'C', attempt: 1 });
      await ledgerDb.insertLedgerRowIfAbsent({
        studentId: validStudentId, source: 'curriculum_quiz', itemId: QUIZ_ITEM,
        response: 'A', evidenceTier: 'practice', attempt: 2, reasoning: 'the stored retry wins'
      });
      const r = await quiz({ response: 'B', attempt: 2, reasoning: REASON });
      expect(r.status).toBe(409);
      expect(r.body.reason).toBe('already-retried');
      expect(quizRow(2).response).toBe('A');
      expect(quizRow(2).reasoning).toBe('the stored retry wins');
    });
  });

  it('quiz attempt 2 race: two requests pass the checks before either write lands — first insert wins', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ response: 'C', attempt: 1 });
      // Hold both inserts until both requests have passed the "no earlier retry" read.
      let arrived = 0;
      let release;
      const bothArrived = new Promise((resolve) => { release = resolve; });
      ledgerDb.beforeInsertIfAbsent = async () => {
        arrived += 1;
        if (arrived === 2) release();
        await bothArrived;
      };
      const [a, b] = await Promise.all([
        quiz({ response: 'A', attempt: 2, reasoning: REASON }),
        quiz({ response: 'D', attempt: 2, reasoning: REASON }),
      ]);
      ledgerDb.beforeInsertIfAbsent = null;
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      const winner = a.status === 200 ? 'A' : 'D';
      expect(loser.body.reason).toBe('already-retried');
      expect(quizRow(2).response).toBe(winner);
    });
  });

  it('quiz attempt 2: a ledger read that returns { data:null, error } is a 500, not no-first-answer', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ response: 'C', attempt: 1 });
      ledgerDb.readResult = { data: null, error: { message: 'boom' } };
      const r = await quiz({ response: 'B', attempt: 2, reasoning: REASON });
      ledgerDb.readResult = null;
      expect(r.status).toBe(500);
      expect(quizRow(2)).toBeUndefined();
    });
  });

  it('quiz FRQ (no answer-key entry): repeated attempt-1 edits save (latest wins) and attempt 3 is accepted', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ itemId: QUIZ_NO_KEY_ITEM, response: 'draft one', attempt: 1 });
      const r = await quiz({ itemId: QUIZ_NO_KEY_ITEM, response: 'draft two', attempt: 1 });
      expect(r.status).toBe(200);
      expect(r.body.firstAnswerKept).toBeUndefined();
      expect(quizRow(1, QUIZ_NO_KEY_ITEM).response).toBe('draft two');
      const third = await quiz({ itemId: QUIZ_NO_KEY_ITEM, response: 'draft three', attempt: 3 });
      expect(third.status).toBe(200);
      expect(quizRow(3, QUIZ_NO_KEY_ITEM).response).toBe('draft three');
    });
  });

  it('quiz: an answer key that fails to load freezes nothing (treated as unkeyed)', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ response: 'C', attempt: 1 });
      const r = await quiz({ response: 'B', attempt: 1 });
      expect(r.status).toBe(200);
      expect(quizRow(1).response).toBe('B');
    }, async () => { throw new Error('answer key unreadable'); });
  });

  it('quiz: the engine scores the retry (attempt 2 is the latest row per item)', async () => {
    await withKeyedServer(async (quiz) => {
      await quiz({ response: 'C', attempt: 1 });
      await quiz({ response: 'B', attempt: 2, reasoning: REASON });
      const rows = [...ledgerDb.store.values()].filter((r) => r.item_id === QUIZ_ITEM);
      const [graded] = latestPerItem(rows);
      expect(graded.attempt).toBe(2);
      expect(isCorrect(graded.response, 'B')).toBe(true);
    });
  });

  // -- Receipts ride in the row upsert (2026-11-05) --------------------------------
  // The receipt is signed BEFORE the write and stored by the same statement, so a row and
  // its receipt can never disagree (a failed second update left stale receipts for weeks).
  const RECEIPT_KEY = 'MC4CAQAwBQYDK2VwBCIEIEtFFgiPZyvBY+Udt3F77ZOHGypDcMHVJV9ck+a6kToO';

  async function withIssuer(fn) {
    vi.stubEnv('RECEIPT_ISSUER_PRIVATE_KEY', RECEIPT_KEY);
    initReceipts();
    try {
      await fn();
    } finally {
      vi.unstubAllEnvs();
      initReceipts();
    }
  }

  function verifiesAgainstIssuer(row) {
    const rec = {
      studentId: row.student_id, itemId: row.item_id, source: row.source,
      score: row.score, attempt: row.attempt, response: row.response,
      receipt_compact: row.receipt_compact,
    };
    return verifyRecord(rec, publicKeyFromX(getReceiptIssuer().pubkey), row.student_id);
  }

  it('receipts: /ledger/record stores the receipt in the row write, with no second receipt update', async () => {
    await withIssuer(async () => {
      const r = await record({ itemId: 'WS-U4L1-Q1', response: 'first', score: 1 });
      expect(r.status).toBe(200);
      const row = ledgerDb.store.get(`${validStudentId}|worksheet|WS-U4L1-Q1|1`);
      expect(row.receipt_id).toBe(r.body.receipt.receiptId);
      expect(row.receipt_compact).toBe(r.body.receipt.compact);
      expect(ledgerDb.receiptUpdates).toEqual([]);
      expect(verifiesAgainstIssuer(row).ok).toBe(true);
    });
  });

  it('receipts: two fast re-answers leave the row signed for the LAST write (no reordering race)', async () => {
    await withIssuer(async () => {
      await Promise.all([
        record({ itemId: 'WS-U4L1-Q1', response: 'a', score: 0 }),
        record({ itemId: 'WS-U4L1-Q1', response: 'b', score: 1 }),
      ]);
      const row = ledgerDb.store.get(`${validStudentId}|worksheet|WS-U4L1-Q1|1`);
      expect(verifiesAgainstIssuer(row)).toMatchObject({ ok: true, breaks: [] });
      expect(ledgerDb.receiptUpdates).toEqual([]);
    });
  });

  it('receipts: the proctored tier is signed from the server-derived tier, before the write', async () => {
    await withIssuer(async () => {
      const r = await record({ itemId: 'WS-U4L1-Q1', response: 'p', score: 1 }, { 'x-proctor-secret': proctorSecret });
      const payload = JSON.parse(Buffer.from(r.body.receipt.compact.split('.')[0], 'base64url').toString('utf8'));
      expect(r.body.evidenceTier).toBe('proctored');
      expect(payload.e).toBe('proctored');
    });
  });

  it('receipts: the quiz retry (insert-if-absent) carries its receipt in the insert', async () => {
    await withIssuer(async () => {
      await withKeyedServer(async (quiz) => {
        await quiz({ response: 'C', attempt: 1 });
        const r = await quiz({ response: 'B', attempt: 2, reasoning: REASON });
        expect(r.status).toBe(200);
        expect(quizRow(2).receipt_compact).toBe(r.body.receipt.compact);
        expect(quizRow(2).receipt_id).toBe(r.body.receipt.receiptId);
        expect(verifiesAgainstIssuer(quizRow(2)).ok).toBe(true);
        expect(ledgerDb.receiptUpdates).toEqual([]);
      });
    });
  });

  it('receipts: issuer off writes the row with null receipt columns and no receipt in the body', async () => {
    const r = await record({ itemId: 'WS-U4L1-Q1', response: 'x', score: 1 });
    expect(r.status).toBe(200);
    expect(r.body.receipt).toBeUndefined();
    const row = ledgerDb.store.get(`${validStudentId}|worksheet|WS-U4L1-Q1|1`);
    expect(row.receipt_id).toBeNull();
    expect(row.receipt_compact).toBeNull();
  });

  it('quiz: other sources are untouched by the retry rule', async () => {
    await record({ source: 'worksheet', itemId: 'WS-U4L1-Q1', response: { answer: 'first' } });
    await record({ source: 'worksheet', itemId: 'WS-U4L1-Q1', response: { answer: 'second' } });
    expect(ledgerDb.store.get(`${validStudentId}|worksheet|WS-U4L1-Q1|1`).response).toEqual({ answer: 'second' });
  });

  it('FRQ floor: a first-ever null then a first grade records normally', async () => {
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'draft', score: undefined });
    expect(frqRow().score).toBeNull();
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'draft', score: 0 });
    expect(frqRow().score).toBe(0);
  });

  it('FRQ floor does not apply to worksheet answer rows (WS-…-Q: verbatim rescore semantics unchanged)', async () => {
    await record({ source: 'worksheet', itemId: 'WS-U4L1-Q9', response: { answer: 'x' }, score: 1 });
    await record({ source: 'worksheet', itemId: 'WS-U4L1-Q9', response: { answer: 'y' }, score: 0 });
    expect(ledgerDb.store.get(`${validStudentId}|worksheet|WS-U4L1-Q9|1`).score).toBe(0);
  });

  // ── Flashcard deck floor (FLASHCARD_DECK_SLICES_SPEC.md D3, 2026-11-07) ───────────
  // The timed deck's self-attest rows (source 'worksheet', BL-U{u}-L{key}-DESK_DONE or
  // -DESK_DAY) keep their best score: the clients may send every finished run, so a lower
  // re-run, or a run with no score, never replaces a higher stored one. DESK_DONE and
  // DESK_DAY are different items. Worksheet answer rows (WS-…-Q) still rescore verbatim.

  function deckRow(itemId) {
    return ledgerDb.store.get(`${validStudentId}|worksheet|${itemId}|1`);
  }

  // The body the Desk (_studentMarkSave) and the phone (_fcCommit) send for a finished deck.
  function recordDeck(itemId, score, response = { selfAttest: 'blooket' }) {
    return record({ source: 'worksheet', itemId, response, score, attempt: 1 });
  }

  function receiptScore(receipt) {
    const payload = JSON.parse(Buffer.from(receipt.compact.split('.')[0], 'base64url').toString('utf8'));
    return payload.sc;
  }

  it('deck floor: a lower DESK_DAY re-run never replaces a higher one (response updates, receipt signs the kept 100)', async () => {
    await withIssuer(async () => {
      let r = await recordDeck('BL-U4-L7-DESK_DAY', 100, { selfAttest: 'blooket', run: 1 });
      expect(r.status).toBe(200);
      r = await recordDeck('BL-U4-L7-DESK_DAY', 80, { selfAttest: 'blooket', run: 2 });
      expect(r.status).toBe(200);
      const row = deckRow('BL-U4-L7-DESK_DAY');
      expect(row.score).toBe(100);
      expect(row.response).toEqual({ selfAttest: 'blooket', run: 2 });
      expect(receiptScore(r.body.receipt)).toBe(100);
      expect(row.receipt_compact).toBe(r.body.receipt.compact);
      expect(verifiesAgainstIssuer(row).ok).toBe(true);

      await recordDeck('BL-U4-L7-DESK_DAY', 95);
      expect(deckRow('BL-U4-L7-DESK_DAY').score).toBe(100);
      await recordDeck('BL-U4-L7-DESK_DAY', 100.0);
      expect(deckRow('BL-U4-L7-DESK_DAY').score).toBe(100);
    });
  });

  it('deck floor: a combined-key DESK_DONE keeps its best (72.5, then 60 keeps 72.5, then 90 raises it)', async () => {
    await recordDeck('BL-U4-L7-8-DESK_DONE', 72.5);
    await recordDeck('BL-U4-L7-8-DESK_DONE', 60);
    expect(deckRow('BL-U4-L7-8-DESK_DONE').score).toBe(72.5);
    await recordDeck('BL-U4-L7-8-DESK_DONE', 90);
    expect(deckRow('BL-U4-L7-8-DESK_DONE').score).toBe(90);
  });

  it('deck floor: DESK_DONE and DESK_DAY of one topic are different items and never floor each other', async () => {
    await recordDeck('BL-U4-L7-DESK_DAY', 100);
    await recordDeck('BL-U4-L7-DESK_DONE', 60);
    expect(deckRow('BL-U4-L7-DESK_DONE').score).toBe(60);
    expect(deckRow('BL-U4-L7-DESK_DAY').score).toBe(100);

    await recordDeck('BL-U4-L8-DESK_DONE', 100);
    await recordDeck('BL-U4-L8-DESK_DAY', 55);
    expect(deckRow('BL-U4-L8-DESK_DAY').score).toBe(55);
    expect(deckRow('BL-U4-L8-DESK_DONE').score).toBe(100);
  });

  it('deck floor: a WS-…-Q worksheet answer row still rescores verbatim and never pays the floor read', async () => {
    const reads = vi.spyOn(ledgerDb, 'getLedgerByStudent');
    await record({ source: 'worksheet', itemId: 'WS-U4-L7-Q3', response: { answer: 'x' }, score: 1 });
    await record({ source: 'worksheet', itemId: 'WS-U4-L7-Q3', response: { answer: 'y' }, score: 0 });
    expect(ledgerDb.store.get(`${validStudentId}|worksheet|WS-U4-L7-Q3|1`).score).toBe(0);
    expect(reads).not.toHaveBeenCalled();

    // A deck row pays exactly one read, scoped to its own item id.
    await recordDeck('BL-U4-L7-DESK_DAY', 90);
    expect(reads).toHaveBeenCalledTimes(1);
    expect(reads).toHaveBeenCalledWith(validStudentId, { prefix: 'BL-U4-L7-DESK_DAY' });
  });

  it('deck floor: a null or missing score on a deck row keeps the stored number', async () => {
    await recordDeck('BL-U4-L7-DESK_DAY', 85);
    await recordDeck('BL-U4-L7-DESK_DAY', null);
    expect(deckRow('BL-U4-L7-DESK_DAY').score).toBe(85);
    await record({ source: 'worksheet', itemId: 'BL-U4-L7-DESK_DAY', response: { selfAttest: 'blooket' } });
    expect(deckRow('BL-U4-L7-DESK_DAY').score).toBe(85);
  });

  it('deck floor: a deck write whose stored score cannot be read is refused (500); an FRQ draft still saves', async () => {
    await recordDeck('BL-U4-L7-DESK_DAY', 100);

    ledgerDb.readResult = { data: null, error: { message: 'boom' } };
    let r = await recordDeck('BL-U4-L7-DESK_DAY', 40);
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
    expect(deckRow('BL-U4-L7-DESK_DAY').score).toBe(100);

    // FRQ stays best-effort: the draft text is saved even though the floor could not be read.
    r = await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'draft while the read fails', score: undefined });
    ledgerDb.readResult = null;
    expect(r.status).toBe(200);
    expect(frqRow().response).toBe('draft while the read fails');

    // A read that throws is refused the same way.
    vi.spyOn(ledgerDb, 'getLedgerByStudent').mockRejectedValueOnce(new Error('socket hang up'));
    r = await recordDeck('BL-U4-L7-DESK_DAY', 40);
    expect(r.status).toBe(500);
    expect(deckRow('BL-U4-L7-DESK_DAY').score).toBe(100);
  });

  // ── POST /ledger/frq-regrade (teacher-gated) ───────────────────────────────
  function regrade(body, headers = {}) {
    return srv.request('POST', '/ledger/frq-regrade', { body, headers });
  }
  const TEACHER = { 'x-teacher-secret': process.env.TEACHER_KEY || 'apteacher2627' };

  it('frq-regrade: 401 without teacher auth', async () => {
    const r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect1', score: 1 });
    expect(r.status).toBe(401);
  });

  it('frq-regrade: 404 when the row does not exist (never creates rows)', async () => {
    const r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect9', score: 1 }, TEACHER);
    expect(r.status).toBe(404);
    expect(ledgerDb.store.has(`${validStudentId}|frq|WS-U4L1-reflect9|1`)).toBe(false);
  });

  it('frq-regrade: grades a null row, keeps its response, floors a lower regrade, raises a higher one', async () => {
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'my reflection text', score: undefined });
    let r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect1', score: 0.5 }, TEACHER);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, applied: true, score: 0.5 });
    expect(frqRow().score).toBe(0.5);
    expect(frqRow().response).toBe('my reflection text');
    r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect1', score: 0 }, TEACHER);
    expect(r.body).toMatchObject({ ok: true, applied: false, score: 0.5 });
    expect(frqRow().score).toBe(0.5);
    r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect1', score: 1 }, TEACHER);
    expect(r.body).toMatchObject({ ok: true, applied: true, score: 1 });
    expect(frqRow().score).toBe(1);
  });

  it('frq-regrade: rejects scores outside {1, 0.5, 0}', async () => {
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'text', score: undefined });
    const r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect1', score: 0.7 }, TEACHER);
    expect(r.status).toBe(400);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('verifyReviewGrant accepts a grant signed by the configured quiz public key', () => {
    const compact = makeReviewGrant();
    const payload = verifyReviewGrant(compact);

    expect(payload).toMatchObject({
      v: 1,
      t: 'review-grant',
      sid: validStudentId,
      item: 'U4-L3-Q01#rev',
      credit: 2 / 3
    });
  });

  it('quiz_review requires a valid grant and records the grant credit', async () => {
    const grant = makeReviewGrant({ credit: 1 / 3 });
    const { status, body } = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      grant
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const rows = [...ledgerDb.store.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(1 / 3);
  });

  // quiz_review durable floor (QUIZ_AI_HALF_CREDIT_SPEC): the appeal and "Talk it through" share
  // the '#rev' item — a lower grant never replaces a higher stored credit; the text still updates.
  it('quiz_review floor: a later lower grant never lowers the stored credit; a higher one raises', async () => {
    const rev = () => [...ledgerDb.store.values()].find(r => r.source === 'quiz_review' && r.item_id === 'U4-L3-Q01#rev');
    let r = await record({ source: 'quiz_review', itemId: 'U4-L3-Q01#rev', response: 'appeal', grant: makeReviewGrant({ credit: 2 / 3 }) });
    expect(r.status).toBe(200);
    r = await record({ source: 'quiz_review', itemId: 'U4-L3-Q01#rev', response: 'talk', grant: makeReviewGrant({ credit: 0.5 }) });
    expect(r.status).toBe(200);
    expect(rev().score).toBe(2 / 3);
    expect(rev().response).toBe('talk');
    r = await record({ source: 'quiz_review', itemId: 'U4-L3-Q01#rev', response: 'flawed', grant: makeReviewGrant({ credit: 1 }) });
    expect(rev().score).toBe(1);
    r = await record({ source: 'quiz_review', itemId: 'U4-L3-Q01#rev', response: 'zero', grant: makeReviewGrant({ credit: 0 }) });
    expect(r.status).toBe(200);
    expect(rev().score).toBe(1);
  });

  it('quiz_review ignores a client-supplied score when a valid grant is present', async () => {
    const grant = makeReviewGrant({ credit: 2 / 3 });
    const { status } = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      score: 1,
      grant
    });

    expect(status).toBe(200);

    const rows = [...ledgerDb.store.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(2 / 3);
  });

  it('quiz_review without a grant returns 400', async () => {
    const { status, body } = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      score: 1
    });

    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'review grant required' });
    expect([...ledgerDb.store.values()]).toHaveLength(0);
  });

  it('quiz_review with an expired grant returns 400', async () => {
    const grant = makeReviewGrant({ exp: Date.now() - 1 });
    const { status, body } = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      grant
    });

    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'review grant required' });
    expect([...ledgerDb.store.values()]).toHaveLength(0);
  });

  it('quiz_review with sid or item mismatch returns 400', async () => {
    const sidMismatch = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      grant: makeReviewGrant({ sid: 'other-student' })
    });
    const itemMismatch = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      grant: makeReviewGrant({ item: 'U4-L3-Q02#rev' })
    });

    expect(sidMismatch.status).toBe(400);
    expect(sidMismatch.body).toEqual({ ok: false, error: 'review grant required' });
    expect(itemMismatch.status).toBe(400);
    expect(itemMismatch.body).toEqual({ ok: false, error: 'review grant required' });
    expect([...ledgerDb.store.values()]).toHaveLength(0);
  });

  it('quiz_exception also requires a valid review grant', async () => {
    const { status, body } = await record({
      source: 'quiz_exception',
      itemId: 'U4-L3-Q01#exc',
      response: { exception: true },
      score: 1
    });

    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'review grant required' });
    expect([...ledgerDb.store.values()]).toHaveLength(0);
  });

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

  // ── DB error mapping: pre-migration 503 vs generic 500 ─────────────────────

  it('23514 check_violation → 503 "source not provisioned" (not a silent 500)', async () => {
    // The source CHECK rejects a value its migration hasn't provisioned yet
    // (e.g. 'trainer' before 0016). Must surface as a friendly 503 — a generic
    // 500 is exactly how study_guide_diagnostic died silently for weeks.
    ledgerDb.insertLedgerRow = async () => ({
      data: null,
      error: { code: '23514', message: 'new row for relation "item_ledger" violates check constraint "item_ledger_source_check"' }
    });

    const { status, body } = await record({ source: 'trainer' });

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("source 'trainer' not provisioned (run the latest item_ledger migration)");
  });

  it('non-23514 db error still → 500 {ok:false, error:"Database error"}', async () => {
    ledgerDb.insertLedgerRow = async () => ({
      data: null,
      error: { code: 'XX000', message: 'internal error' }
    });

    const { status, body } = await record();

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Database error');
  });
});

describe('createLedgerDb', () => {
  it('includes a fresh recorded_at timestamp in the upsert payload', async () => {
    let upsertRows = null;
    let upsertOpts = null;
    const client = {
      from(table) {
        expect(table).toBe('item_ledger');
        return {
          upsert(rows, opts) {
            upsertRows = rows;
            upsertOpts = opts;
            return {
              select(cols) {
                expect(cols).toBe('ledger_id, evidence_tier');
                return {
                  async single() {
                    return { data: { ledger_id: 'ledger-1', evidence_tier: 'practice' }, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };

    const db = createLedgerDb(client);
    await db.insertLedgerRow({
      studentId: 'stu-1',
      source: 'trainer',
      itemId: 'TI84-linreg',
      response: 'done',
      score: 1,
      evidenceTier: 'practice',
      attempt: 1,
    });

    expect(upsertOpts).toEqual({ onConflict: 'student_id,source,item_id,attempt' });
    expect(upsertRows).toHaveLength(1);
    expect(upsertRows[0].recorded_at).toEqual(expect.any(String));
    expect(new Date(upsertRows[0].recorded_at).toISOString()).toBe(upsertRows[0].recorded_at);
  });

  // An overwrite must never keep a receipt that signed the old score/response
  // (the snapshot verifier fails the whole snapshot on that).
  it('clears the receipt columns in the upsert payload', async () => {
    let upsertRow = null;
    const client = {
      from() {
        return {
          upsert(rows) {
            upsertRow = rows[0];
            return { select() { return { async single() { return { data: { ledger_id: 'L1', evidence_tier: 'practice' }, error: null }; } }; } };
          },
        };
      },
    };

    await createLedgerDb(client).insertLedgerRow({
      studentId: 'stu-1', source: 'worksheet', itemId: 'WS-U1L4-Q32', response: 'b', score: 1, evidenceTier: 'practice', attempt: 1,
    });

    expect(upsertRow).toHaveProperty('receipt_id', null);
    expect(upsertRow).toHaveProperty('receipt_compact', null);
  });

  it('writes a given receipt in the SAME upsert payload as the row', async () => {
    let upsertRow = null;
    const client = {
      from() {
        return {
          upsert(rows) {
            upsertRow = rows[0];
            return { select() { return { async single() { return { data: { ledger_id: 'L1', evidence_tier: 'practice' }, error: null }; } }; } };
          },
          update() { throw new Error('no separate receipt update expected'); },
        };
      },
    };

    await createLedgerDb(client).insertLedgerRow({
      studentId: 'stu-1', source: 'worksheet', itemId: 'WS-U1L4-Q32', response: 'b', score: 1, evidenceTier: 'practice', attempt: 1,
      receiptId: 'rid-1', receiptCompact: 'payload.sig',
    });

    expect(upsertRow).toMatchObject({ score: 1, response: 'b', receipt_id: 'rid-1', receipt_compact: 'payload.sig' });
  });
});

// ── GET /ledger/student/:studentId ────────────────────────────────────────────

describe('GET /ledger/student/:studentId', () => {

  function getStudent(studentId, headers = {}) {
    return srv.request('GET', `/ledger/student/${studentId}`, { headers });
  }

  // The shared-key tests below set or clear TEACHER_KEY; put the host's value back.
  let savedTeacherKey;
  beforeEach(() => {
    savedTeacherKey = process.env.TEACHER_KEY;
    delete process.env.TEACHER_KEY;
  });
  afterEach(() => {
    if (savedTeacherKey === undefined) delete process.env.TEACHER_KEY;
    else process.env.TEACHER_KEY = savedTeacherKey;
  });

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

  // ── The shared teacher key (what the nightly Schoology sync sends) ─────────
  // This route used to accept only the long ROSTER_TEACHER_SECRET, so every
  // nightly poster read was a 401. getTeacherKey() falls back to the published
  // default 'apteacher2627' when TEACHER_KEY is unset.

  it('shared teacher key (default apteacher2627, TEACHER_KEY unset) → 200 {ok:true, rows:[]}', async () => {
    const { status, body } = await getStudent(validStudentId, {
      'x-teacher-secret': 'apteacher2627'
    });

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, rows: [] });
  });

  it('custom TEACHER_KEY → 200, and the published default apteacher2627 is then 401', async () => {
    process.env.TEACHER_KEY = 'custom-key-for-test';

    const custom = await getStudent(validStudentId, { 'x-teacher-secret': 'custom-key-for-test' });
    expect(custom.status).toBe(200);
    expect(custom.body).toEqual({ ok: true, rows: [] });

    const published = await getStudent(validStudentId, { 'x-teacher-secret': 'apteacher2627' });
    expect(published.status).toBe(401);
    expect(published.body).toEqual({ ok: false, error: 'forbidden' });
  });

  it('the nightly poster read (shared key + ?prefix=POSTER-) → 200 with only the poster row', async () => {
    ledgerDb.store.set(`${validStudentId}|poster|POSTER-U1|1`, {
      student_id: validStudentId, source: 'poster', item_id: 'POSTER-U1',
      score: 115, attempt: 1, recorded_at: new Date().toISOString()
    });
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U1L2-Q1', response: 'a' }
    });

    const { status, body } = await srv.request('GET', `/ledger/student/${validStudentId}?prefix=POSTER-`, {
      headers: { 'x-teacher-secret': 'apteacher2627' }
    });

    expect(status).toBe(200);
    expect(body.rows.map(r => r.item_id)).toEqual(['POSTER-U1']);
  });
});

// ── GET /ledger/student/:studentId — token auth + prefix filter (P-A-B §3) ───

describe('GET /ledger/student/:studentId — token auth + prefix filter', () => {

  function getStudent(studentId, { headers = {}, query = '' } = {}) {
    const qs = query ? (query.startsWith('?') ? query : `?${query}`) : '';
    return srv.request('GET', `/ledger/student/${studentId}${qs}`, { headers });
  }

  // ── 1. No auth → 401 ───────────────────────────────────────────────────────
  it('no auth headers AND no token → 401 {ok:false, error:"forbidden"}', async () => {
    const { status, body } = await getStudent(validStudentId);
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
  });

  // ── 2. Teacher secret still works (unchanged behavior) ─────────────────────
  it('teacher secret → 200 (unchanged behavior)', async () => {
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret }
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  // ── 3. Student token where sid == :studentId → 200 (self-fetch) ────────────
  it('valid student token (Bearer) where sid == :studentId → 200', async () => {
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('valid student token via ?token= query where sid == :studentId → 200', async () => {
    const { status, body } = await getStudent(validStudentId, {
      query: `token=${encodeURIComponent(validToken)}`
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  // ── 4. Cross-student token → 403 (clearer than 401) ────────────────────────
  it('valid token but sid != :studentId → 403 {ok:false, error:"cross-student"}', async () => {
    const otherStudentId = `uuid-other-${randomBytes(8).toString('hex')}`;
    const { status, body } = await getStudent(otherStudentId, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('cross-student');
  });

  it('garbage token → 401 (verifyToken returns null, treat as no auth)', async () => {
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'Authorization': 'Bearer not.a.token' }
    });
    expect(status).toBe(401);
    expect(body.error).toBe('forbidden');
  });

  // ── 4b. Teacher token may read ANY student (view-as worksheets) ────────────
  it('a teacher token reading a DIFFERENT student → 200 with that student\'s rows', async () => {
    // Seed a row owned by validStudentId.
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U1L2-Q1', response: 'their answer' }
    });
    // Teacher (different sid) fetches that student's ledger with their OWN token.
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].item_id).toBe('WS-U1L2-Q1');
    expect(body.rows[0].response).toBe('their answer');
  });

  it('a teacher token honors the prefix filter when reading another student', async () => {
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U1L2-Q1', response: 'a' }
    });
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U9L1-Q1', response: 'b' }
    });
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'Authorization': `Bearer ${teacherToken}` },
      query: 'prefix=WS-U1L2'
    });
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].item_id).toBe('WS-U1L2-Q1');
  });

  it('a NON-teacher token reading a different student is still 403 (no widening)', async () => {
    const otherStudentId = `uuid-student-${randomBytes(8).toString('hex')}`;
    const { status, body } = await getStudent(otherStudentId, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('cross-student');
  });

  // ── 5. prefix filter narrows results ───────────────────────────────────────
  it('?prefix=WS-U4L1-2 returns only matching rows', async () => {
    // Seed three rows: one matching, two not.
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U4L1-2-Q1', response: 'a' }
    });
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U4L1-2-Q2', response: 'b' }
    });
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U5L1-Q1', response: 'c' }
    });

    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret },
      query: 'prefix=WS-U4L1-2'
    });
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(2);
    for (const r of body.rows) {
      expect(r.item_id.startsWith('WS-U4L1-2')).toBe(true);
    }
  });

  // ── 6. Bad prefix → 400 (rejects wildcards / injection attempts) ───────────
  it('?prefix=WS-U4L1-2% → 400 {ok:false, error:"bad prefix"}', async () => {
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret },
      query: 'prefix=WS-U4L1-2%25'      // encoded `%`
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('bad prefix');
  });

  it('?prefix=WS_FOO → 400 (underscore is a SQL LIKE wildcard, must be rejected)', async () => {
    // Supabase .like() treats `_` as a single-char wildcard. Allowing it in the
    // prefix would silently widen the filter (WS-U_ matching WS-U4, WS-U5...).
    // Real item_ids only use [A-Za-z0-9-], so the sanitizer rejects underscore
    // along with every other non-[A-Za-z0-9-] char. Pins the strict-prefix contract.
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret },
      query: 'prefix=WS_FOO'
    });
    expect(status).toBe(400);
    expect(body.error).toBe('bad prefix');
  });

  it('?prefix=WS$U4 → 400 (special char rejected)', async () => {
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret },
      query: 'prefix=WS%24U4'   // encoded `$`
    });
    expect(status).toBe(400);
    expect(body.error).toBe('bad prefix');
  });

  // ── 7. Most-recent-first ordering preserved ────────────────────────────────
  it('rows are returned newest-first by recorded_at', async () => {
    // Seed three rows with slight time offsets via separate inserts.
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U4L1-2-Qa', response: 'first' }
    });
    // Wait a hair so recorded_at differs (the fake stamps Date.now()-ish per call).
    await new Promise((r) => setTimeout(r, 5));
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U4L1-2-Qb', response: 'second' }
    });
    await new Promise((r) => setTimeout(r, 5));
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U4L1-2-Qc', response: 'third' }
    });

    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret },
      query: 'prefix=WS-U4L1-2'
    });
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(3);
    // Newest first
    const times = body.rows.map(r => r.recorded_at);
    const sortedDesc = [...times].sort().reverse();
    expect(times).toEqual(sortedDesc);
  });
});


// ── ledger-db.js: reasoning column fallback (migration 0037 not yet run) ─────

describe('createLedgerDb insertLedgerRow reasoning', () => {
  function fakeSupabase({ missingColumn }) {
    const upserts = [];
    return {
      upserts,
      from() {
        let payload;
        const chain = {
          upsert(rows) { payload = rows[0]; upserts.push(payload); return chain; },
          select() { return chain; },
          single() {
            if (missingColumn && 'reasoning' in payload) {
              return Promise.resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'reasoning' column of 'item_ledger' in the schema cache" } });
            }
            return Promise.resolve({ data: { ledger_id: 'L1', evidence_tier: 'practice' }, error: null });
          },
        };
        return chain;
      },
    };
  }

  const baseRow = { studentId: 's1', source: 'curriculum_quiz', itemId: 'U1-L7-Q03', response: 'B', evidenceTier: 'practice', attempt: 2 };

  // ignoreDuplicates upsert(...).select('*') chain; `existing` = keys already present.
  function fakeIfAbsentSupabase({ missingColumn, existing = new Set() }) {
    const upserts = [];
    return {
      upserts,
      from() {
        return {
          upsert(row, options) {
            upserts.push({ row, options });
            return {
              select() {
                if (missingColumn && 'reasoning' in row) {
                  return Promise.resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'reasoning' column of 'item_ledger' in the schema cache" } });
                }
                const key = `${row.student_id}|${row.item_id}|${row.attempt}`;
                if (existing.has(key)) return Promise.resolve({ data: [], error: null });
                existing.add(key);
                return Promise.resolve({ data: [{ ...row, ledger_id: 'L2' }], error: null });
              },
            };
          },
        };
      },
    };
  }

  it('insertLedgerRowIfAbsent stores reasoning, first write wins, and never updates', async () => {
    const client = fakeIfAbsentSupabase({ missingColumn: false });
    const db = createLedgerDb(client);
    const first = await db.insertLedgerRowIfAbsent({ ...baseRow, reasoning: 'changed my mind here' });
    expect(first.inserted).toBe(true);
    expect(first.data[0].ledger_id).toBe('L2');
    expect(client.upserts[0].row.reasoning).toBe('changed my mind here');
    expect(client.upserts[0].options).toMatchObject({ ignoreDuplicates: true });
    const second = await db.insertLedgerRowIfAbsent({ ...baseRow, response: 'C', reasoning: 'another reason here' });
    expect(second.inserted).toBe(false);
  });

  it('insertLedgerRowIfAbsent writes the receipt in the insert itself (nulls without one)', async () => {
    const client = fakeIfAbsentSupabase({ missingColumn: false });
    const db = createLedgerDb(client);
    await db.insertLedgerRowIfAbsent({ ...baseRow, receiptId: 'rid-2', receiptCompact: 'p.s' });
    await db.insertLedgerRowIfAbsent({ ...baseRow, itemId: 'U1-L7-Q04' });
    expect(client.upserts[0].row).toMatchObject({ receipt_id: 'rid-2', receipt_compact: 'p.s' });
    expect(client.upserts[1].row).toMatchObject({ receipt_id: null, receipt_compact: null });
  });

  it('the reasoning-column fallback keeps the receipt on the retried write', async () => {
    const client = fakeSupabase({ missingColumn: true });
    await createLedgerDb(client).insertLedgerRow({ ...baseRow, reasoning: 'changed my mind here', receiptId: 'rid-3', receiptCompact: 'p.s' });
    expect(client.upserts).toHaveLength(2);
    expect(client.upserts[1]).toMatchObject({ receipt_id: 'rid-3', receipt_compact: 'p.s' });
    expect('reasoning' in client.upserts[1]).toBe(false);
  });

  it('insertLedgerRowIfAbsent retries WITHOUT reasoning when the column does not exist yet', async () => {
    const client = fakeIfAbsentSupabase({ missingColumn: true });
    const result = await createLedgerDb(client).insertLedgerRowIfAbsent({ ...baseRow, reasoning: 'changed my mind here' });
    expect(result.inserted).toBe(true);
    expect(client.upserts).toHaveLength(2);
    expect('reasoning' in client.upserts[1].row).toBe(false);
  });

  it('isMissingColumnError matches the exact column only', () => {
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'reasoning' column of 'item_ledger' in the schema cache" }, 'reasoning')).toBe(true);
    expect(isMissingColumnError({ code: '42703', message: 'column "reasoning" of relation "item_ledger" does not exist' }, 'reasoning')).toBe(true);
    expect(isMissingColumnError({ code: '42703', message: 'column item_ledger.reasoning does not exist' }, 'reasoning')).toBe(true);
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'reasoning_extra' column of 'item_ledger' in the schema cache" }, 'reasoning')).toBe(false);
    expect(isMissingColumnError({ code: '42703', message: 'column item_ledger.reasoning_extra does not exist' }, 'reasoning')).toBe(false);
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key value; reasoning' }, 'reasoning')).toBe(false);
    expect(isMissingColumnError(null, 'reasoning')).toBe(false);
  });

  it('stores reasoning when the column exists', async () => {
    const client = fakeSupabase({ missingColumn: false });
    const result = await createLedgerDb(client).insertLedgerRow({ ...baseRow, reasoning: 'changed my mind here' });
    expect(result.error).toBeNull();
    expect(client.upserts).toHaveLength(1);
    expect(client.upserts[0].reasoning).toBe('changed my mind here');
  });

  it('omits reasoning when none is given', async () => {
    const client = fakeSupabase({ missingColumn: false });
    await createLedgerDb(client).insertLedgerRow(baseRow);
    expect(client.upserts).toHaveLength(1);
    expect('reasoning' in client.upserts[0]).toBe(false);
  });

  it('retries WITHOUT reasoning when the column does not exist yet', async () => {
    const client = fakeSupabase({ missingColumn: true });
    const result = await createLedgerDb(client).insertLedgerRow({ ...baseRow, reasoning: 'changed my mind here' });
    expect(result.error).toBeNull();
    expect(result.data.ledger_id).toBe('L1');
    expect(client.upserts).toHaveLength(2);
    expect(client.upserts[0].reasoning).toBe('changed my mind here');
    expect('reasoning' in client.upserts[1]).toBe(false);
    expect(client.upserts[1].response).toBe('B');
  });
});
