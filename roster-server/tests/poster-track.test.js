// @vitest-environment node
// POSTER_WORK_TRACK_SPEC.md (teacher 2026-10-20): the unit poster is a Work track
// again. Teacher routes write POSTER-U{n} rows (score 90-115); the one-time
// conversion turns banked BONUS-POSTER-U{n} rows into them and empties the bank.
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mountClass } from '../class.js';
import { mountLedger } from '../ledger.js';
import { computeGrade, posterScoresByUnit } from '../grade.js';
import { buildGradebook } from '../gradebook-grid.js';
import { CONFIG, GRADE_OPTS, ANSWER_KEY, SCHEDULE } from './fixtures/sim-world.js';

const TEACHER = 'poster-test-secret';
const students = [
  { student_id: 's1', login_username: 'pear_cat', real_name: 'Pear Cat', section: 'PeriodB' },
  { student_id: 's2', login_username: 'kiwi_toad', real_name: 'Kiwi Toad', section: 'PeriodB' },
];
const bankedPoster = (studentId, grade) => ({ student_id: studentId, source: 'bonus', item_id: 'BONUS-POSTER-U1',
  score: { E: 5, P: 3, I: 1 }[grade], attempt: 1,
  response: JSON.stringify({ grade, quarter: 'Q1', title: 'Unit 1 Poster (Data, Graph, Sentence)' }) });
const dokSheet = { student_id: 's1', source: 'bonus', item_id: 'BONUS-screen-time', score: 5, attempt: 1,
  response: JSON.stringify({ grade: 'E', quarter: 'Q1', title: 'Screen Time' }) };

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
  vi.unstubAllEnvs();
});

async function start({ ledger = [], insertError = null } = {}) {
  vi.stubEnv('ROSTER_TEACHER_SECRET', TEACHER);
  const stored = ledger.slice(), writes = [], deletes = [];
  const db = {
    async listRoster(section) { return { data: students.filter(s => !section || s.section === section) }; },
    async listQuarterSnapshot() { return { data: [] }; },
    async listReviewMarksByStudents() { return { data: [] }; },
    async getRoleByStudentId(id) { return id === 'teacher' ? 'teacher' : 'student'; },
  };
  const ledgerDb = {
    async getLedgerByStudent(id) { return { data: stored.filter(r => r.student_id === id) }; },
    async insertLedgerRow(row) {
      if (insertError) return { error: insertError };
      writes.push(row);
      const saved = { student_id: row.studentId, item_id: row.itemId, source: row.source,
        score: row.score, response: row.response, attempt: row.attempt };
      const index = stored.findIndex(r => r.student_id === saved.student_id && r.source === saved.source &&
        r.item_id === saved.item_id && r.attempt === saved.attempt);
      if (index < 0) stored.push(saved); else stored[index] = saved;
      return { data: { ledger_id: 'fixture' } };
    },
    async deleteLedgerRows({ studentId, source, itemId }) {
      deletes.push({ studentId, source, itemId });
      const before = stored.length;
      for (let i = stored.length - 1; i >= 0; i--) {
        const r = stored[i];
        if (r.student_id === studentId && r.source === source && r.item_id === itemId) stored.splice(i, 1);
      }
      return { data: Array.from({ length: before - stored.length }, () => ({ ledger_id: 'gone' })) };
    },
  };
  const app = express();
  app.use(express.json());
  mountClass(app, { db, ledgerDb, config: CONFIG, lessonSchedule: SCHEDULE,
    loadAnswerKey: async () => ({ answerKey: ANSWER_KEY }) });
  mountLedger(app, { db: ledgerDb, rosterDb: db, verifyToken: token => token === 'teacher-token' ? 'teacher' : 's1' });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  async function request(path, body, teacher = true) {
    const headers = { 'content-type': 'application/json' };
    if (teacher) headers['x-teacher-secret'] = TEACHER;
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  return { request, writes, deletes, stored };
}

describe('POST /class/poster', () => {
  it('writes one POSTER-U{n} row per student: a number as given, a letter through the flat map', async () => {
    const { request, writes } = await start();
    const res = await request('/class/poster', { unit: 1, quarter: 'Q1', title: 'Unit 1 Poster', section: 'PeriodB',
      entries: [{ username: 'pear_cat', score: 92 }, { username: 'kiwi_toad', grade: 'E' }] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, unit: 1, quarter: 'Q1', written: 2, errors: [] });
    expect(writes.map(w => [w.studentId, w.source, w.itemId, w.score])).toEqual([
      ['s1', 'poster', 'POSTER-U1', 92],
      ['s2', 'poster', 'POSTER-U1', 115],
    ]);
    // 92 reads as an I (below 100); the letter row keeps its letter.
    expect(JSON.parse(writes[0].response)).toMatchObject({ grade: 'I', quarter: 'Q1', unit: 1, title: 'Unit 1 Poster' });
    expect(JSON.parse(writes[1].response)).toMatchObject({ grade: 'E' });
  });

  it('rejects a score outside 90..115, a non-integer, an unknown letter, and an unknown student (nothing written for them)', async () => {
    const { request, writes } = await start();
    const res = await request('/class/poster', { unit: 1, quarter: 'Q1', title: 'Unit 1 Poster',
      entries: [{ username: 'pear_cat', score: 89 }, { username: 'pear_cat', score: 116 }, { username: 'pear_cat', score: 100.5 },
        { username: 'pear_cat', grade: 'X' }, { username: 'nobody', grade: 'E' }, { username: 'kiwi_toad', score: 115 }] });
    expect(res.status).toBe(200);
    expect(res.body.written).toBe(1);
    expect(res.body.errors.map(e => e.index)).toEqual([0, 1, 2, 3, 4]);
    expect(writes).toHaveLength(1);
  });

  it('400s a bad unit, quarter, or title; 401s without the teacher secret', async () => {
    const { request } = await start();
    expect((await request('/class/poster', { unit: 0, quarter: 'Q1', title: 'x', entries: [] })).status).toBe(400);
    expect((await request('/class/poster', { unit: 1, quarter: 'Q9', title: 'x', entries: [] })).status).toBe(400);
    expect((await request('/class/poster', { unit: 1, quarter: 'Q1', title: '', entries: [] })).status).toBe(400);
    expect((await request('/class/poster', { unit: 1, quarter: 'Q1', title: 'x', entries: [] }, false)).status).toBe(401);
  });

  it('503s with the migration hint when the poster source is not provisioned', async () => {
    const { request } = await start({ insertError: { code: '23514', message: 'violates check constraint "item_ledger_source_check"' } });
    const res = await request('/class/poster', { unit: 1, quarter: 'Q1', title: 'x', entries: [{ username: 'pear_cat', grade: 'P' }] });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/migration 0042/);
  });

  it('students cannot write a poster row through /ledger/record', async () => {
    const { request } = await start();
    const res = await request('/ledger/record', { token: 'student-token', source: 'poster', itemId: 'POSTER-U1', response: '{}', score: 115 }, false);
    expect(res.status).toBe(403);
  });
});

describe('POST /class/poster/convert', () => {
  it('dry run lists every banked poster with its flat-map score and writes nothing', async () => {
    const { request, writes, deletes } = await start({ ledger: [bankedPoster('s1', 'E'), bankedPoster('s2', 'I'), dokSheet] });
    const res = await request('/class/poster/convert', { section: 'PeriodB' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, dryRun: true, deleted: 0, remainingBonusPosterRows: 2, errors: [] });
    expect(res.body.converted).toEqual([
      { studentId: 's1', username: 'pear_cat', unit: 1, grade: 'E', score: 115 },
      { studentId: 's2', username: 'kiwi_toad', unit: 1, grade: 'I', score: 90 },
    ]);
    expect(writes).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it('apply writes the POSTER-U{n} rows, deletes only the poster bonus rows, and leaves DOK sheets banked', async () => {
    const { request, writes, deletes, stored } = await start({ ledger: [bankedPoster('s1', 'P'), dokSheet] });
    const res = await request('/class/poster/convert', { dryRun: false });
    expect(res.body).toMatchObject({ ok: true, dryRun: false, deleted: 1, remainingBonusPosterRows: 0, errors: [] });
    expect(writes.map(w => [w.studentId, w.source, w.itemId, w.score])).toEqual([['s1', 'poster', 'POSTER-U1', 100]]);
    expect(JSON.parse(writes[0].response)).toMatchObject({ grade: 'P', quarter: 'Q1', unit: 1, convertedFrom: 'BONUS-POSTER-U1' });
    expect(deletes).toEqual([{ studentId: 's1', source: 'bonus', itemId: 'BONUS-POSTER-U1' }]);
    expect(stored.map(r => r.item_id).sort()).toEqual(['BONUS-screen-time', 'POSTER-U1']);
  });

  it('after the conversion the bank holds only the DOK sheet (a poster never counts twice)', async () => {
    const { request } = await start({ ledger: [bankedPoster('s1', 'E'), dokSheet] });
    const before = await request('/class/quarter/deltas?quarter=Q1');
    const row = before.body.rows ? before.body.rows.find(r => r.studentId === 's1') : null;
    if (row && row.bonus) {
      // Even BEFORE the conversion the bank skips BONUS-POSTER rows: 5 x 1.5 from the DOK sheet only.
      expect(row.bonus.sheets.map(s => s.title)).toEqual(['Screen Time']);
    }
    await request('/class/poster/convert', { dryRun: false });
    const after = await request('/class/quarter/deltas?quarter=Q1');
    const rowAfter = after.body.rows ? after.body.rows.find(r => r.studentId === 's1') : null;
    if (rowAfter && rowAfter.bonus) expect(rowAfter.bonus.sheets.map(s => s.title)).toEqual(['Screen Time']);
  });
});

describe('computeGrade reads POSTER-U{n} rows as the posters track', () => {
  const posterRow = (score, attempt = 1) => ({ student_id: 's1', source: 'poster', item_id: 'POSTER-U1', score, attempt,
    recorded_at: `2026-10-1${attempt}T12:00:00Z`, response: JSON.stringify({ grade: 'E', quarter: 'Q1', unit: 1 }) });

  it('posterScoresByUnit keeps the latest attempt per unit and skips malformed rows', () => {
    expect(posterScoresByUnit([posterRow(90, 1), posterRow(115, 2)])).toEqual({ 1: 115 });
    expect(posterScoresByUnit([{ source: 'poster', item_id: 'POSTER-U2', score: 'nope' }])).toEqual({});
    expect(posterScoresByUnit([{ source: 'poster', item_id: 'POSTER-X', score: 100 }])).toEqual({});
  });

  it('surfaces units[U1].posterPct and moves workAvg; without a row the track is absent (never 0)', () => {
    const base = computeGrade([], ANSWER_KEY, CONFIG, GRADE_OPTS);
    const withPoster = computeGrade([posterRow(115)], ANSWER_KEY, CONFIG, GRADE_OPTS);
    expect(withPoster.units.U1.posterPct).toBe(115);
    expect(base.units.U1 ? base.units.U1.posterPct : null).toBe(null);
    const q = Object.keys(withPoster.quarters).find(k => (withPoster.quarters[k].posterUnits || []).includes(1));
    expect(q).toBeTruthy();
    // The sim world's due lessons / quizzes / Blookets are missing (0 each), so with the
    // poster at 1.15: Work = (.30*0 + .30*0 + .30*1.15 + .10*0) / 1.00 = 0.345 -> 34.5.
    expect(withPoster.quarters[q].workTracks.posters).toBe(115);
    expect(withPoster.quarters[q].workAvg).toBe(34.5);
    expect(base.quarters[q].workAvg).toBe(0);
    expect(base.quarters[q].workTracks ? base.quarters[q].workTracks.posters : null).toBe(null);
    expect(buildGradebook(withPoster).quarters[q].cells['POSTER:U1']).toBe(115);
  });
});
