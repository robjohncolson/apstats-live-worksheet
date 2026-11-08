// grade-closed-quarter.test.js — GET /grade carries quarters[Q].closed once the teacher has
// closed Q (QUARTER_LINE_BY_DUE_DATE_SPEC.md §2), so the Desk can show "Quarter 1 final".
// closed = { grade, pcAvg, workAvg, at, bonusApplied } from the student's first-close-wins
// quarter_grade_snapshot row (POST /class/quarter/close); grade is the number /class/grades
// reports as closedGrade (the applied banked bonus when there is one). null = not closed.
// Fake roster + ledger dbs, NO network.
//
// @vitest-environment node

import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

const ANSWER_KEY = {
  answerKey: { 'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1', topic: '1.1' } },
};

// A Q1 snapshot row as PostgREST sends it (numeric columns arrive as strings).
const Q1_SNAPSHOT = {
  student_id: 'set-per-test', quarter: 'Q1', frozen_grade: '91.4', frozen_pc_avg: '80',
  frozen_work_avg: '92.1', closed_by: 'teacher', frozen_at: '2026-11-12T23:10:00.000Z',
};

function rosterDb(studentId, reader) {
  const db = {
    async insertRoster() { return { data: null, error: { message: 'unused' } }; },
    async findByUsername() { return { data: null, error: { message: 'unused' } }; },
    async findByStudentId(id) {
      return { data: id === studentId ? { student_id: id, section: 'PeriodB' } : null, error: null };
    },
  };
  if (reader) db.listQuarterSnapshotsByStudent = reader;
  return db;
}

function ledgerDb(rows) {
  return {
    async getLedgerByStudent(studentId) {
      return { data: rows.map((row) => ({ ...row, student_id: studentId })), error: null };
    },
    async insertLedgerRow() { return { data: {}, error: null }; },
  };
}

let server = null;
afterEach(async () => {
  if (server) await new Promise((done) => server.close(done));
  server = null;
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_TEACHER_SECRET;
});

// GET /grade for one fresh student; `reader(studentId)` plays db.listQuarterSnapshotsByStudent
// (omit it for a db without the reader).
async function getGrade({ reader = null, rows = [] } = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.NODE_ENV = 'test';
  const studentId = `uuid-closed-${randomBytes(8).toString('hex')}`;
  const calls = [];
  const wrapped = reader ? async (id) => { calls.push(id); return reader(id); } : null;
  const app = createApp(rosterDb(studentId, wrapped), ledgerDb(rows), async () => ({ units: [] }), async () => ANSWER_KEY);
  server = http.createServer(app);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/grade`, {
    headers: { authorization: `Bearer ${signToken(studentId)}` },
  });
  return { status: res.status, body: await res.json(), calls, studentId };
}

describe('GET /grade quarters[Q].closed', () => {
  it('no snapshot row: every quarter reads closed null, and the reader gets the token\'s student', async () => {
    const { status, body, calls, studentId } = await getGrade({ reader: async () => ({ data: [], error: null }) });
    expect(status).toBe(200);
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) expect(body.quarters[q].closed, q).toBeNull();
    expect(calls).toEqual([studentId]);
  });

  it('a Q1 snapshot: the frozen numbers (as numbers), the close time, no bonus; Q2 stays open', async () => {
    const { body } = await getGrade({ reader: async (id) => ({ data: [{ ...Q1_SNAPSHOT, student_id: id }], error: null }) });
    expect(body.quarters.Q1.closed).toEqual({
      grade: 91.4, pcAvg: 80, workAvg: 92.1, at: '2026-11-12T23:10:00.000Z', bonusApplied: null,
    });
    expect(body.quarters.Q2.closed).toBeNull();
  });

  it('an applied banked bonus wins: grade is its adjusted grade, as /class/grades closedGrade', async () => {
    const applied = {
      source: 'bonus_applied', item_id: 'BONUS-APPLIED-Q1', score: 94.2, attempt: 1,
      response: JSON.stringify({ appliedAt: '2026-11-12T23:20:00.000Z', placement: 'work', frozenAt: Q1_SNAPSHOT.frozen_at }),
      recorded_at: '2026-11-12T23:20:00.000Z',
    };
    const reader = async (id) => ({ data: [{ ...Q1_SNAPSHOT, student_id: id }], error: null });
    const { body } = await getGrade({ reader, rows: [applied] });
    expect(body.quarters.Q1.closed.grade).toBe(94.2);
    expect(body.quarters.Q1.closed.bonusApplied).toEqual({
      adjustedGrade: 94.2, appliedAt: '2026-11-12T23:20:00.000Z', placement: 'work',
    });
    // The frozen averages stay the snapshot's.
    expect(body.quarters.Q1.closed.workAvg).toBe(92.1);
    // An applied row for a quarter that is not closed does not invent a close.
    expect(body.quarters.Q2.closed).toBeNull();
  });

  it('a failed read means "not closed" and never fails /grade', async () => {
    const missing = await getGrade({ reader: async () => ({ data: null, error: { code: '42P01', message: 'relation "quarter_grade_snapshot" does not exist' } }) });
    expect(missing.status).toBe(200);
    expect(missing.body.quarters.Q1.closed).toBeNull();
    const thrown = await getGrade({ reader: async () => { throw new Error('boom'); } });
    expect(thrown.status).toBe(200);
    expect(thrown.body.quarters.Q1.closed).toBeNull();
  });

  it('a db without the reader leaves the quarters as they were (no closed field)', async () => {
    const { status, body } = await getGrade();
    expect(status).toBe(200);
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) expect('closed' in body.quarters[q], q).toBe(false);
  });
});

// Teacher view-as (GET /teacher/student/:id/grade, which the Desk's view-as reads) adds the
// same field, so the teacher sees the student's "Quarter 1 final" too (fixer finding C4).
async function getViewAs({ reader = null, rows = [] } = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = `teach-${randomBytes(16).toString('hex')}`;
  process.env.NODE_ENV = 'test';
  const studentId = `uuid-viewas-${randomBytes(8).toString('hex')}`;
  const calls = [];
  const wrapped = reader ? async (id) => { calls.push(id); return reader(id); } : null;
  const app = createApp(rosterDb(studentId, wrapped), ledgerDb(rows), async () => ({ units: [] }), async () => ANSWER_KEY);
  server = http.createServer(app);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/teacher/student/${studentId}/grade`, {
    headers: { 'x-teacher-secret': process.env.ROSTER_TEACHER_SECRET },
  });
  return { status: res.status, body: await res.json(), calls, studentId };
}

describe('GET /teacher/student/:id/grade (view-as) quarters[Q].closed', () => {
  it('a Q1 snapshot: the same closed field as the student\'s /grade, read for that student', async () => {
    const reader = async (id) => ({ data: [{ ...Q1_SNAPSHOT, student_id: id }], error: null });
    const { status, body, calls, studentId } = await getViewAs({ reader });
    expect(status).toBe(200);
    expect(body.quarters.Q1.closed).toEqual({
      grade: 91.4, pcAvg: 80, workAvg: 92.1, at: '2026-11-12T23:10:00.000Z', bonusApplied: null,
    });
    expect(body.quarters.Q2.closed).toBeNull();
    expect(calls).toEqual([studentId]);
  });

  it('an applied banked bonus wins here too', async () => {
    const applied = {
      source: 'bonus_applied', item_id: 'BONUS-APPLIED-Q1', score: 94.2, attempt: 1,
      response: JSON.stringify({ appliedAt: '2026-11-12T23:20:00.000Z', placement: 'work' }),
      recorded_at: '2026-11-12T23:20:00.000Z',
    };
    const reader = async (id) => ({ data: [{ ...Q1_SNAPSHOT, student_id: id }], error: null });
    const { body } = await getViewAs({ reader, rows: [applied] });
    expect(body.quarters.Q1.closed.grade).toBe(94.2);
  });

  it('a failed read means "not closed" and never fails view-as; no reader leaves the shape as it was', async () => {
    const thrown = await getViewAs({ reader: async () => { throw new Error('boom'); } });
    expect(thrown.status).toBe(200);
    expect(thrown.body.quarters.Q1.closed).toBeNull();
    await new Promise((done) => server.close(done));
    server = null;
    const plain = await getViewAs();
    expect(plain.status).toBe(200);
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) expect('closed' in plain.body.quarters[q], q).toBe(false);
  });
});
