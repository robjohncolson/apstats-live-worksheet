import http from 'http';
import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server.js';
import { initReceipts, issueLedgerReceipt, receiptInternals } from '../receipts.js';

const TEACHER = 'teacher-secret-fixture';
const TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIIq2JsDpBMHpUzaFF6mPR0vUv1T2gzXGX7k/AQSYjyl0';

function makeRosterDb(roster) {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async listRoster(section) {
      return {
        data: section ? roster.filter((row) => row.section === section) : roster.slice(),
        error: null
      };
    }
  };
}

function makeLedgerDb(rowsByStudent) {
  return {
    rowsByStudent,
    async getLedgerByStudent(studentId) {
      return { data: rowsByStudent[studentId] || [], error: null };
    },
    async updateLedgerReceipt(ledgerId, { receiptId, receiptCompact }) {
      for (const rows of Object.values(rowsByStudent)) {
        const row = rows.find((entry) => entry.ledger_id === ledgerId);
        if (!row) continue;
        row.receipt_id = receiptId;
        row.receipt_compact = receiptCompact;
        return { error: null };
      }
      return { error: null };
    },
    async insertLedgerRow() { return { data: {}, error: null }; }
  };
}

function row(studentId, itemId, overrides = {}) {
  return {
    ledger_id: `${studentId}-${itemId}`,
    student_id: studentId,
    source: 'curriculum_quiz',
    item_id: itemId,
    response: 'A',
    score: null,
    evidence_tier: 'practice',
    attempt: 1,
    recorded_at: '2026-06-01T10:00:00.000Z',
    ...overrides
  };
}

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

  async post(path, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers });
    return { status: res.status, body: await res.json() };
  }
}

describe('POST /class/backfill-receipts', () => {
  let srv;

  afterEach(async () => {
    if (srv) await srv.stop();
    srv = null;
    delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    delete process.env.ROSTER_TEACHER_SECRET;
    initReceipts();
  });

  async function start(roster, rowsByStudent) {
    process.env.NODE_ENV = 'test';
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.ROSTER_TEACHER_SECRET = TEACHER;
    const ledgerDb = makeLedgerDb(rowsByStudent);
    const app = createApp(
      makeRosterDb(roster),
      ledgerDb,
      async () => ({ units: [] }),
      async () => ({ answerKey: {} }),
      null,
      null
    );
    srv = new TestServer(app);
    await srv.start();
    return ledgerDb;
  }

  it('requires teacher auth', async () => {
    await start([{ student_id: 's1', login_username: 'alpha', section: 'P1' }], {
      s1: [row('s1', 'U1-L1-Q01')]
    });

    expect((await srv.post('/class/backfill-receipts')).status).toBe(401);
  });

  it('backfills only receiptless rows and is idempotent on a second run', async () => {
    const existingReceipt = 'eyJ0IjoibGVkZ2VyIn0.signature';
    const ledgerDb = await start(
      [
        { student_id: 's1', login_username: 'alpha', section: 'P1' },
        { student_id: 's2', login_username: 'beta', section: 'P1' },
        { student_id: 's3', login_username: 'gamma', section: 'P2' }
      ],
      {
        s1: [
          row('s1', 'U1-L1-Q01'),
          row('s1', 'U1-L1-Q02', { receipt_id: 'existing', receipt_compact: existingReceipt })
        ],
        s2: [row('s2', 'U2-L1-Q01')],
        s3: [row('s3', 'U1-L1-Q01')]
      }
    );

    const first = await srv.post('/class/backfill-receipts?section=P1', { 'x-teacher-secret': TEACHER });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      ok: true,
      studentsProcessed: 2,
      receiptsBackfilled: 2,
      errors: []
    });
    expect(ledgerDb.rowsByStudent.s1[0].receipt_compact).toBeTruthy();
    expect(ledgerDb.rowsByStudent.s1[1].receipt_compact).toBe(existingReceipt);
    expect(ledgerDb.rowsByStudent.s2[0].receipt_compact).toBeTruthy();
    expect(ledgerDb.rowsByStudent.s3[0].receipt_compact).toBeUndefined();

    const second = await srv.post('/class/backfill-receipts?section=P1', { 'x-teacher-secret': TEACHER });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      ok: true,
      studentsProcessed: 2,
      receiptsBackfilled: 0,
      errors: []
    });
  });
});

describe('POST /class/backfill-receipts?resign=stale', () => {
  let srv;

  afterEach(async () => {
    if (srv) await srv.stop();
    srv = null;
    delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    delete process.env.ROSTER_TEACHER_SECRET;
    initReceipts();
  });

  function enableIssuer() {
    process.env.NODE_ENV = 'test';
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.ROSTER_TEACHER_SECRET = TEACHER;
    initReceipts();
  }

  // A row signed by our issuer for the content it holds right now.
  function signedRow(studentId, itemId, overrides = {}) {
    const base = row(studentId, itemId, { source: 'worksheet', response: 'b', score: 1, ...overrides });
    const issued = issueLedgerReceipt({
      studentId, source: base.source, itemId, score: base.score, attempt: base.attempt,
      evidenceTier: base.evidence_tier, response: base.response, ts: Date.parse(base.recorded_at)
    });
    return { ...base, receipt_id: issued.receiptId, receipt_compact: issued.compact };
  }

  // A well-formed ledger receipt from a key we do not trust.
  function foreignCompact(studentId, itemId) {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const signed = receiptInternals.signPayload(privateKey, {
      v: 1, t: 'ledger', sid: studentId, src: 'worksheet', i: itemId, a: 1, sc: 1, ts: 1, n: 'x'
    });
    return signed.compact;
  }

  async function start(rowsByStudent) {
    const ledgerDb = makeLedgerDb(rowsByStudent);
    const app = createApp(
      makeRosterDb([{ student_id: 's1', login_username: 'alpha', section: 'P1' }]),
      ledgerDb,
      async () => ({ units: [] }),
      async () => ({ answerKey: {} }),
      null,
      null
    );
    srv = new TestServer(app);
    await srv.start();
    return ledgerDb;
  }

  it('re-signs a stale row, leaves a good row, refuses a foreign signature', async () => {
    enableIssuer();
    // The 2026-09-14 shape: signed at score 0, then overwritten to score 1 in place.
    const stale = { ...signedRow('s1', 'WS-U1L4-Q32', { score: 0, response: 'a' }), score: 1, response: 'b' };
    const good = signedRow('s1', 'WS-U1L4-Q33');
    const foreign = { ...row('s1', 'WS-U1L4-Q34', { source: 'worksheet', score: 1 }), receipt_id: 'f', receipt_compact: foreignCompact('s1', 'WS-U1L4-Q34') };
    const goodCompact = good.receipt_compact;
    const foreignCompactValue = foreign.receipt_compact;
    const ledgerDb = await start({ s1: [stale, good, foreign] });

    const res = await srv.post('/class/backfill-receipts?section=P1&resign=stale', { 'x-teacher-secret': TEACHER });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, studentsProcessed: 1, receiptsBackfilled: 0, receiptsResigned: 1, errors: [] });
    expect(res.body.resigned).toEqual([
      expect.objectContaining({ studentId: 's1', itemId: 'WS-U1L4-Q32', kinds: expect.arrayContaining(['score-tampered', 'response-tampered']) })
    ]);
    expect(res.body.refused).toEqual([
      expect.objectContaining({ studentId: 's1', itemId: 'WS-U1L4-Q34', kinds: ['bad-signature'] })
    ]);

    const rows = ledgerDb.rowsByStudent.s1;
    const payload = JSON.parse(Buffer.from(rows[0].receipt_compact.split('.')[0], 'base64url').toString('utf8'));
    expect(payload.sc).toBe(1);
    expect(payload.u).toBe('alpha');
    expect(rows[1].receipt_compact).toBe(goodCompact);
    expect(rows[2].receipt_compact).toBe(foreignCompactValue);

    const again = await srv.post('/class/backfill-receipts?section=P1&resign=stale', { 'x-teacher-secret': TEACHER });
    expect(again.body.receiptsResigned).toBe(0);
  });

  it('re-signs an FRQ draft whose response changed under a score-less receipt', async () => {
    enableIssuer();
    const signed = signedRow('s1', 'WS-U3L2-reflect2', { source: 'frq', score: null, response: 'first draft' });
    const ledgerDb = await start({ s1: [{ ...signed, response: 'n' }] });

    const res = await srv.post('/class/backfill-receipts?section=P1&resign=stale', { 'x-teacher-secret': TEACHER });

    expect(res.body.receiptsResigned).toBe(1);
    expect(res.body.resigned[0].kinds).toEqual(['response-tampered']);
    const payload = JSON.parse(Buffer.from(ledgerDb.rowsByStudent.s1[0].receipt_compact.split('.')[0], 'base64url').toString('utf8'));
    expect('sc' in payload).toBe(false);
  });

  it('leaves the default response shape unchanged and never re-signs without resign=stale', async () => {
    enableIssuer();
    const stale = { ...signedRow('s1', 'WS-U1L4-Q32', { score: 0 }), score: 1 };
    const before = stale.receipt_compact;
    const ledgerDb = await start({ s1: [stale] });

    const res = await srv.post('/class/backfill-receipts?section=P1', { 'x-teacher-secret': TEACHER });

    expect(res.body).toEqual({ ok: true, studentsProcessed: 1, receiptsBackfilled: 0, errors: [] });
    expect(ledgerDb.rowsByStudent.s1[0].receipt_compact).toBe(before);
  });

  it('answers 503 when the issuer is off', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ROSTER_TEACHER_SECRET = TEACHER;
    delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    initReceipts();
    await start({ s1: [] });

    const res = await srv.post('/class/backfill-receipts?section=P1&resign=stale', { 'x-teacher-secret': TEACHER });
    expect(res.status).toBe(503);
  });
});
