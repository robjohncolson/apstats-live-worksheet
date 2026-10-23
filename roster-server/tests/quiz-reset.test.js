// POST /ledger/quiz-reset — the teacher gives a student their explained retry back
// on one keyed quiz item: only the attempt-2+ rows of (student, curriculum_quiz,
// item) go; the attempt-1 row stays the kept first answer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mountLedger } from '../ledger.js';

class TestServer {
  constructor(app) { this.server = http.createServer(app); }
  async start() {
    await new Promise((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.baseUrl = `http://127.0.0.1:${this.server.address().port}`;
  }
  async stop() { await new Promise((resolve) => this.server.close(resolve)); }
  async request(method, path, { body, headers = {} } = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
}

let server;
let deletes;
let ledgerDb;
let rosterDb;

const teacher = { 'x-teacher-secret': 'teacher-key' };
const reset = (body, headers = teacher) => server.request('POST', '/ledger/quiz-reset', { body, headers });

beforeEach(async () => {
  process.env.NODE_ENV = 'test';
  process.env.TEACHER_KEY = 'teacher-key';
  deletes = [];
  ledgerDb = {
    async insertLedgerRow() { return { data: { ledger_id: 'x' }, error: null }; },
    async getLedgerByStudent() { return { data: [], error: null }; },
    async deleteLedgerRows(args) {
      deletes.push(args);
      return { data: [{ ledger_id: 'row-2', attempt: 2, response: 'D' }], error: null };
    },
  };
  rosterDb = {
    async getRoleByStudentId() { return 'student'; },
    async findByUsername(username) {
      if (username === 'pumpkin_deer') return { data: { student_id: 'stu-damian' }, error: null };
      return { data: null, error: { code: 'PGRST116' } };
    },
  };
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  mountLedger(app, { db: ledgerDb, rosterDb, verifyToken: () => null });
  server = new TestServer(app);
  await server.start();
});

afterEach(async () => { await server.stop(); });

describe('POST /ledger/quiz-reset', () => {
  it('refuses without teacher auth', async () => {
    const result = await reset({ studentId: 'stu-damian', itemId: 'U2-L2-Q01' }, {});
    expect(result.status).toBe(401);
    expect(deletes).toEqual([]);
  });

  it('deletes only the retry rows of that one item for that one student', async () => {
    const result = await reset({ studentId: 'stu-damian', itemId: 'U2-L2-Q01' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, studentId: 'stu-damian', itemId: 'U2-L2-Q01', deleted: 1 });
    expect(result.body.rows).toEqual([{ ledger_id: 'row-2', attempt: 2, response: 'D' }]);
    expect(deletes).toEqual([{ studentId: 'stu-damian', source: 'curriculum_quiz', itemId: 'U2-L2-Q01', minAttempt: 2 }]);
  });

  it('resolves a login username through the roster', async () => {
    const result = await reset({ username: 'pumpkin_deer', itemId: 'U2-L2-Q01' });
    expect(result.status).toBe(200);
    expect(result.body.studentId).toBe('stu-damian');
    expect(deletes[0].studentId).toBe('stu-damian');
  });

  it('404s an unknown username without deleting anything', async () => {
    const result = await reset({ username: 'nobody_here', itemId: 'U2-L2-Q01' });
    expect(result.status).toBe(404);
    expect(deletes).toEqual([]);
  });

  it('400s a bad item id or a missing student', async () => {
    expect((await reset({ studentId: 'stu-damian', itemId: 'U2 L2 Q01' })).status).toBe(400);
    expect((await reset({ studentId: 'stu-damian' })).status).toBe(400);
    expect((await reset({ itemId: 'U2-L2-Q01' })).status).toBe(400);
    expect(deletes).toEqual([]);
  });

  it('reports deleted:0 when there was no retry to reset', async () => {
    ledgerDb.deleteLedgerRows = async () => ({ data: [], error: null });
    const result = await reset({ studentId: 'stu-damian', itemId: 'U2-L2-Q01' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, deleted: 0, rows: [] });
  });
});
