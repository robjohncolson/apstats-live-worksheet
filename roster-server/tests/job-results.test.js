// job-results.test.js - POST /admin/job-result + the `jobs` field of GET /health,
// and the teacher-only `orphanRows` field of GET /class/grades (never on GET /grade).
// Fake in-memory dbs, NO network.

import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { parseJobResult, KNOWN_JOBS, JOB_CODES } from '../job-results.js';

const TEACHER = 'teacher-secret-fixture';

const SCHEDULE = {
  '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2026-09-01', E: '2026-09-01' } },
};
const ANSWER_KEY = { answerKey: { 'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1' } } };

function createFakeRosterDb(roster) {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async findByStudentId(id) { return { data: roster.find((r) => r.student_id === id) || null, error: null }; },
    async listRoster(section) {
      const rows = section ? roster.filter((r) => r.section === section) : roster.slice();
      return { data: rows, error: null };
    },
  };
}

function createFakeLedgerDb(rowsByStudent) {
  return {
    async getLedgerByStudent(studentId) { return { data: rowsByStudent[studentId] || [], error: null }; },
    async insertLedgerRow() { return { data: {}, error: null }; },
  };
}

function row(studentId, itemId, { source = 'worksheet', score = 1 } = {}) {
  return {
    ledger_id: `${studentId}-${itemId}`, student_id: studentId, source, item_id: itemId,
    response: 'x', score, attempt: 1, recorded_at: '2026-09-02T14:00:00Z',
  };
}

class TestServer {
  constructor(app) { this.server = http.createServer(app); this.baseUrl = null; }
  start() {
    return new Promise((r) => this.server.listen(0, '127.0.0.1', () => {
      this.baseUrl = `http://127.0.0.1:${this.server.address().port}`; r();
    }));
  }
  stop() { return new Promise((r) => this.server.close(r)); }
  async request(method, path, { headers = {}, body } = {}) {
    const opts = { method, headers: { 'content-type': 'application/json', ...headers } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    return { status: res.status, body: await res.json() };
  }
}

async function startServer({ roster = [], ledger = {} } = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  delete process.env.TEACHER_KEY;
  process.env.NODE_ENV = 'test';
  const app = createApp(
    createFakeRosterDb(roster), createFakeLedgerDb(ledger), async () => ({ units: [] }),
    async () => ANSWER_KEY, undefined, undefined, undefined, SCHEDULE,
  );
  const server = new TestServer(app);
  await server.start();
  return server;
}

let srv;
afterEach(async () => {
  if (srv) { await srv.stop(); srv = null; }
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_TEACHER_SECRET;
});

const asTeacher = { 'x-teacher-secret': TEACHER };

describe('parseJobResult', () => {
  const NOW = '2026-11-05T12:00:00.000Z';

  it('maps an allowlisted code to a server-generated message; ok comes from the code', () => {
    const body = { job: 'snapshot', code: 'breaks', breaks: 3, at: '2026-11-05T03:00:00Z' };
    expect(parseJobResult(body, NOW)).toEqual({
      job: 'snapshot',
      result: { ok: false, code: 'breaks', message: 'verification found breaks', breaks: 3, at: '2026-11-05T03:00:00.000Z', receivedAt: NOW },
    });
    expect(parseJobResult({ job: 'pcReconcileB', code: 'ok' }, NOW).result).toMatchObject({ ok: true, message: 'reconciled' });
    expect(parseJobResult({ job: 'pcReconcileE', code: 'sign-in-needed' }, NOW).result).toMatchObject({ ok: false, message: 'SIGN IN NEEDED' });
  });

  it('every job lists its codes, each with a boolean ok and a message', () => {
    expect(KNOWN_JOBS).toEqual(['snapshot', 'pcReconcileB', 'pcReconcileE']);
    for (const job of KNOWN_JOBS) {
      for (const outcome of Object.values(JOB_CODES[job])) {
        expect(typeof outcome.ok).toBe('boolean');
        expect(typeof outcome.message).toBe('string');
      }
    }
  });

  it('rejects an unknown job, a code from another job, a missing code and a non-object body', () => {
    expect(parseJobResult({ job: 'nope', code: 'ok' }).error).toMatch(/unknown job/);
    expect(parseJobResult({ job: 'snapshot', code: 'ok' }).error).toMatch(/unknown code for snapshot/);
    expect(parseJobResult({ job: 'pcReconcileB' }).error).toMatch(/unknown code/);
    expect(parseJobResult({ job: 'snapshot', code: 'toString' }).error).toMatch(/unknown code/);
    expect(parseJobResult(null).error).toMatch(/JSON object/);
  });

  it('a bad `at` or `breaks` falls back to now / null', () => {
    const parsed = parseJobResult({ job: 'snapshot', code: 'verified', at: 'never', breaks: -1 }, NOW);
    expect(parsed.result.at).toBe(NOW);
    expect(parsed.result.breaks).toBe(null);
  });

  it('free text in the body (detail, names) is never stored', () => {
    const parsed = parseJobResult({ job: 'snapshot', code: 'verified', detail: 'Alice Smith score 4/16', name: 'Bob' }, NOW);
    expect(JSON.stringify(parsed)).not.toMatch(/Alice|Smith|Bob|4\/16/);
    expect(Object.keys(parsed.result).sort()).toEqual(['at', 'breaks', 'code', 'message', 'ok', 'receivedAt']);
  });
});

describe('POST /admin/job-result + GET /health jobs', () => {
  it('/health lists every known job as null before any report', async () => {
    srv = await startServer();
    const { body } = await srv.request('GET', '/health');
    expect(body.ok).toBe(true);
    expect(Object.keys(body.jobs)).toEqual(KNOWN_JOBS);
    for (const job of KNOWN_JOBS) expect(body.jobs[job]).toBe(null);
  });

  it('401 without the teacher secret; nothing is recorded', async () => {
    srv = await startServer();
    const res = await srv.request('POST', '/admin/job-result', { body: { job: 'snapshot', code: 'verified' } });
    expect(res.status).toBe(401);
    expect((await srv.request('GET', '/health')).body.jobs.snapshot).toBe(null);
  });

  it('400 on a bad body', async () => {
    srv = await startServer();
    const res = await srv.request('POST', '/admin/job-result', { headers: asTeacher, body: { job: 'snapshot', detail: 'verified' } });
    expect(res.status).toBe(400);
  });

  it('a teacher report shows up on /health, latest per job', async () => {
    srv = await startServer();
    const post = (body) => srv.request('POST', '/admin/job-result', { headers: asTeacher, body });
    await post({ job: 'pcReconcileE', code: 'sign-in-needed' });
    await post({ job: 'snapshot', code: 'verified', breaks: 0, at: '2026-11-05T03:00:00Z' });
    const res = await post({ job: 'snapshot', code: 'breaks', breaks: 2, at: '2026-11-05T04:00:00Z' });
    expect(res.status).toBe(200);
    const { jobs } = (await srv.request('GET', '/health')).body;
    expect(jobs.snapshot).toMatchObject({ ok: false, code: 'breaks', message: 'verification found breaks', breaks: 2, at: '2026-11-05T04:00:00.000Z' });
    expect(jobs.pcReconcileE).toMatchObject({ ok: false, code: 'sign-in-needed', message: 'SIGN IN NEEDED' });
    expect(jobs.pcReconcileB).toBe(null);
  });

  it('a student name or a secret sent in `detail` never appears in /health', async () => {
    srv = await startServer();
    const leaks = ['Alice Smith score 4/16', 'sk-live-ABCDEF1234567890', TEACHER];
    for (const detail of leaks) {
      const res = await srv.request('POST', '/admin/job-result', {
        headers: asTeacher,
        body: { job: 'pcReconcileB', code: 'failed', detail, name: detail, message: detail },
      });
      expect(res.status).toBe(200);
    }
    const raw = JSON.stringify((await srv.request('GET', '/health')).body);
    for (const text of ['Alice', 'Smith', '4/16', 'sk-live-ABCDEF1234567890', TEACHER]) {
      expect(raw).not.toContain(text);
    }
    expect((await srv.request('GET', '/health')).body.jobs.pcReconcileB.message).toBe('failed (see the reconcile log)');
  });
});

describe('orphanRows: teacher /class/grades only', () => {
  const roster = [
    { student_id: 's1', real_name: 'Alice', login_username: 'alpha', section: 'PeriodB' },
    { student_id: 's2', real_name: 'Bob', login_username: 'beta', section: 'PeriodB' },
  ];
  // WS-U1L9-* names lesson 1.9, which this schedule does not have.
  const ledger = {
    s1: [row('s1', 'WS-U1L1-Q1'), row('s1', 'WS-U1L9-Q1'), row('s1', 'WS-U1L9-Q2')],
    s2: [row('s2', 'WS-U1L1-Q1')],
  };

  it('/class/grades carries { count, samples } for a student with unscheduled rows, nothing otherwise', async () => {
    srv = await startServer({ roster, ledger });
    const { status, body } = await srv.request('GET', '/class/grades', { headers: asTeacher });
    expect(status).toBe(200);
    const alice = body.students.find((s) => s.studentId === 's1');
    const bob = body.students.find((s) => s.studentId === 's2');
    expect(alice.orphanRows).toEqual({ count: 2, samples: ['WS-U1L9-Q1', 'WS-U1L9-Q2'] });
    expect(bob.orphanRows).toBeUndefined();
  });

  it('GET /grade (the student) never carries orphanRows', async () => {
    srv = await startServer({ roster, ledger });
    const token = signToken('s1');
    const { status, body } = await srv.request('GET', '/grade', { headers: { authorization: `Bearer ${token}` } });
    expect(status).toBe(200);
    expect(body.orphanRows).toBeUndefined();
  });
});
