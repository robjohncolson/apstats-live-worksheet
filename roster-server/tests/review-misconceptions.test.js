import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mountReview } from '../review.js';
import { getTeacherKey } from '../teacher-auth.js';

it('adds the same persistent misconception computation to the by-item review window', async () => {
  const routes = {};
  const now = Date.now();
  const db = {
    listRoster: async () => ({ data: [{ student_id: 'one', login_username: 'one', section: 'PeriodE' }] }),
    listReviewMarksByStudents: async () => ({ data: [] }),
  };
  const ledgerDb = { getLedgerByStudent: async () => ({ data: [
    { student_id: 'one', source: 'quiz', item_id: 'U4-L3-Q03', response: 'D', recorded_at: new Date(now - 6 * 86400000).toISOString() },
    { student_id: 'one', source: 'quiz', item_id: 'U4-L8-Q04', response: 'A', recorded_at: new Date(now - 86400000).toISOString() },
  ] }) };
  mountReview({ get: (path, handler) => { routes[path] = handler; }, post() {} }, {
    db, ledgerDb, loadAnswerKey: async () => JSON.parse(readFileSync('data/answer-key.json', 'utf8')),
  });
  let payload;
  await routes['/class/review-by-item']({ headers: { 'x-teacher-secret': getTeacherKey() }, query: { section: 'PeriodE', days: '14' } },
    { json: value => { payload = value; }, status() { return this; } });
  expect(payload.ok).toBe(true);
  expect(payload.topMisconceptions).toEqual([{ key: 'expected-guaranteed',
    label: 'Treats a long-run expected value as a guaranteed outcome', students: 1 }]);
});
