// APSTAT_PARK_TRAINER_ABSORB_SPEC §6: the park relay asks roster-server which quarter is open
// before banking the solo door's bonus point (it never computes dates itself).
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mountClass } from '../class.js';
import { PHASE3_CONFIG, quarterOfDate } from '../grade-config.js';
import { todayInTz } from '../lesson-grade.js';

const TEACHER = 'quarter-test-secret';
const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
  vi.unstubAllEnvs();
});

async function start() {
  vi.stubEnv('ROSTER_TEACHER_SECRET', TEACHER);
  const app = express();
  app.use(express.json());
  mountClass(app, { db: { async listRoster() { return { data: [] }; }, async getRoleByStudentId() { return 'student'; } },
    ledgerDb: {}, config: PHASE3_CONFIG, lessonSchedule: null, loadAnswerKey: async () => ({ answerKey: {} }) });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return async (teacher = true) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/class/quarter/current`,
      { headers: teacher ? { 'x-teacher-secret': TEACHER } : {} });
    return { status: response.status, body: await response.json() };
  };
}

describe('GET /class/quarter/current', () => {
  it('is a teacher route', async () => {
    const request = await start();
    expect((await request(false)).status).toBe(401);
  });

  it('names the open quarter for today in New York, with the date it was judged on', async () => {
    const request = await start();
    const { status, body } = await request();
    expect(status).toBe(200);
    const today = todayInTz('America/New_York');
    expect(body).toEqual({ ok: true, quarter: quarterOfDate(today, PHASE3_CONFIG) || 'Q1', asOf: today, open: !!quarterOfDate(today, PHASE3_CONFIG) });
    expect(body.quarter).toMatch(/^Q[1-4]$/);
  });
});
