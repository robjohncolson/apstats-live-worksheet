// poll-archive.test.js -- tests for the v2.1 /poll-archive routes.
// Injects fake pollArchiveDb + rosterDb. NO network.
// Uses Node's http + fetch (Node 18+) like the other roster-server suites.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

// ── Fakes ─────────────────────────────────────────────────────────────────────

function makeTableMissingError() {
  return { code: '42P01', message: 'relation "poll_archive" does not exist' };
}

function createFakePollArchiveDb({ tableMissing = false } = {}) {
  const store = new Map(); // id -> row
  const state = { tableMissing };

  function maybeMissing() {
    return state.tableMissing ? { data: null, error: makeTableMissingError() } : null;
  }

  return {
    store,
    state,

    async insertPollArchive({ pollId, section, pollDate, question, options, tally, blind }) {
      const miss = maybeMissing(); if (miss) return miss;

      // Simulate upsert + ON CONFLICT (poll_id) DO NOTHING / ignoreDuplicates:
      // a duplicate poll_id is silently skipped with NO error.
      if (pollId) {
        const existing = [...store.values()].find(r => r.poll_id === pollId);
        if (existing) {
          return { data: null, error: null };
        }
      }

      const id = `pa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const row = {
        id,
        poll_id:    pollId ?? null,
        section:    section,
        poll_date:  pollDate,
        question:   question,
        options:    Array.isArray(options) ? options : [],
        tally:      Array.isArray(tally) ? tally : [],
        blind:      !!blind,
        created_at: new Date().toISOString(),
      };
      store.set(id, row);
      return { data: row, error: null };
    },

    async listPollArchive(section, date) {
      const miss = maybeMissing(); if (miss) return miss;
      let rows = [...store.values()].filter(r => r.section === section);
      if (date) rows = rows.filter(r => r.poll_date === date);
      rows.sort((a, b) => {
        if (a.poll_date !== b.poll_date) return a.poll_date.localeCompare(b.poll_date);
        return (a.created_at || '').localeCompare(b.created_at || '');
      });
      return { data: rows, error: null };
    },

    async deletePollArchive(id) {
      const miss = maybeMissing(); if (miss) return miss;
      store.delete(id);
      return { data: null, error: null };
    },
  };
}

// Fake roster DB that includes findByStudentId (needed by GET /poll-archive).
function createFakeRosterDb() {
  const rows = new Map(); // studentId -> row
  return {
    async insertRoster() { return { data: null, error: { message: 'not used' } }; },
    async findByUsername() { return { data: null, error: { message: 'not used' } }; },
    async listRoster() { return { data: [], error: null }; },
    async updateStudent() { return { data: null, error: { message: 'not used' } }; },
    async updatePassword() { return { data: null, error: { message: 'not used' } }; },
    async updateSpriteHue() { return { data: null, error: { message: 'not used' } }; },
    async getRoleByStudentId(studentId) {
      const row = rows.get(studentId);
      return row ? row.role || 'student' : 'student';
    },
    async getSpriteHueByStudentId() { return null; },
    async findByStudentId(studentId) {
      const row = rows.get(studentId);
      if (!row) return { data: null, error: null };
      return { data: { student_id: studentId, section: row.section }, error: null };
    },
    seed(studentId, { section = 'SUMMER26', role = 'student' } = {}) {
      rows.set(studentId, { student_id: studentId, section, role });
    },
    seedTeacher(studentId, section = 'SUMMER26') {
      rows.set(studentId, { student_id: studentId, section, role: 'teacher' });
    },
  };
}

// ── Test server harness ───────────────────────────────────────────────────────

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
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { json = null; }
    return { status: res.status, body: json };
  }
}

function makeSecret(prefix) {
  return `${prefix}-${randomBytes(16).toString('hex')}`;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let rosterDb;
let pollArchiveDb;
let srv;
let teacherSecret;
let tokenSecret;
let studentId;
let studentToken;
let teacherId;
let teacherToken;

beforeEach(async () => {
  teacherSecret = makeSecret('teacher');
  tokenSecret   = makeSecret('token');
  process.env.ROSTER_TEACHER_SECRET = teacherSecret;
  process.env.ROSTER_TOKEN_SECRET   = tokenSecret;
  process.env.NODE_ENV              = 'test';

  studentId    = `uuid-student-${randomBytes(8).toString('hex')}`;
  studentToken = signToken(studentId);
  teacherId    = `uuid-teacher-${randomBytes(8).toString('hex')}`;
  teacherToken = signToken(teacherId);

  rosterDb = createFakeRosterDb();
  rosterDb.seed(studentId, { section: 'SUMMER26' });
  rosterDb.seedTeacher(teacherId, 'SUMMER26');

  pollArchiveDb = createFakePollArchiveDb();

  const app = createApp(
    rosterDb,
    null,   // ledgerDb -- not needed for these routes
    null,   // loadManifest
    null,   // loadAnswerKey
    null,   // loadSkillMap
    null,   // bkt
    null,   // remediationDb
    null,   // lessonSchedule
    null,   // configOverrides
    null,   // worksheetBlankCounts
    pollArchiveDb
  );
  srv = new TestServer(app);
  await srv.start();
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function validPostBody(overrides = {}) {
  return {
    pollId:   `poll-${randomBytes(4).toString('hex')}`,
    section:  'SUMMER26',
    pollDate: '2026-05-22',
    question: 'What is the p-value threshold?',
    options:  ['0.01', '0.05', '0.10'],
    tally:    [3, 12, 2],
    blind:    false,
    ...overrides,
  };
}

function teacherHeaders() {
  return { 'x-teacher-secret': teacherSecret };
}

function bearerHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

// ── POST /poll-archive ────────────────────────────────────────────────────────

describe('POST /poll-archive', () => {
  it('happy path: teacher secret, returns 200 ok:true', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody(),
      headers: teacherHeaders(),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('happy path via teacher bearer token', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody(),
      headers: bearerHeaders(teacherToken),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('missing teacher auth -> 401', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody(),
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('student token is not teacher -> 401', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody(),
      headers: bearerHeaders(studentToken),
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('missing pollId -> 400', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody({ pollId: undefined }),
      headers: teacherHeaders(),
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('missing section -> 400', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody({ section: undefined }),
      headers: teacherHeaders(),
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('missing pollDate -> 400', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody({ pollDate: undefined }),
      headers: teacherHeaders(),
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('pollDate wrong format -> 400', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody({ pollDate: '22-05-2026' }),
      headers: teacherHeaders(),
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('missing question -> 400', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody({ question: undefined }),
      headers: teacherHeaders(),
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('missing options -> 400', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody({ options: undefined }),
      headers: teacherHeaders(),
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('options length 1 (too short) -> 400', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody({ options: ['only-one'], tally: [5] }),
      headers: teacherHeaders(),
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('options length 9 (too long) -> 400', async () => {
    const opts = ['a','b','c','d','e','f','g','h','i'];
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody({ options: opts, tally: new Array(9).fill(1) }),
      headers: teacherHeaders(),
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('tally length mismatch -> 400', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody({ options: ['A', 'B'], tally: [1, 2, 3] }),
      headers: teacherHeaders(),
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('missing tally -> 400', async () => {
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody({ tally: undefined }),
      headers: teacherHeaders(),
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('idempotent re-POST with same pollId -> 200 ok:true (no error)', async () => {
    const body1 = validPostBody({ pollId: 'dup-poll-id' });
    const r1 = await srv.request('POST', '/poll-archive', { body: body1, headers: teacherHeaders() });
    expect(r1.status).toBe(200);
    expect(r1.body.ok).toBe(true);
    // Second POST with the same pollId -- must not 500 or 400.
    const r2 = await srv.request('POST', '/poll-archive', { body: body1, headers: teacherHeaders() });
    expect(r2.status).toBe(200);
    expect(r2.body.ok).toBe(true);
    // Only one row in the store (the conflict was silently skipped).
    const stored = [...pollArchiveDb.store.values()].filter(r => r.poll_id === 'dup-poll-id');
    expect(stored).toHaveLength(1);
  });

  it('table-missing -> 503 with poll_archive hint', async () => {
    pollArchiveDb.state.tableMissing = true;
    const { status, body } = await srv.request('POST', '/poll-archive', {
      body: validPostBody(),
      headers: teacherHeaders(),
    });
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('poll_archive not provisioned');
  });
});

// ── GET /poll-archive ─────────────────────────────────────────────────────────

describe('GET /poll-archive', () => {
  async function seedPoll(overrides = {}) {
    return pollArchiveDb.insertPollArchive({
      pollId:   `poll-${randomBytes(4).toString('hex')}`,
      section:  'SUMMER26',
      pollDate: '2026-05-22',
      question: 'Which test?',
      options:  ['t-test', 'z-test'],
      tally:    [8, 5],
      blind:    false,
      ...overrides,
    });
  }

  it('happy path: student token, returns polls array with camelCase keys', async () => {
    await seedPoll();
    const { status, body } = await srv.request('GET', '/poll-archive', {
      headers: bearerHeaders(studentToken),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.polls)).toBe(true);
    expect(body.polls).toHaveLength(1);
    const poll = body.polls[0];
    expect(typeof poll.id).toBe('string');
    expect(typeof poll.pollDate).toBe('string');
    expect(typeof poll.question).toBe('string');
    expect(Array.isArray(poll.options)).toBe(true);
    expect(Array.isArray(poll.tally)).toBe(true);
    expect(typeof poll.blind).toBe('boolean');
    expect(typeof poll.createdAt).toBe('string');
  });

  it('section scoping: only returns polls for the token student\'s section', async () => {
    // Seed student2 in a different section.
    const student2Id    = `uuid-s2-${randomBytes(8).toString('hex')}`;
    const student2Token = signToken(student2Id);
    rosterDb.seed(student2Id, { section: 'PERIOD-B' });

    await seedPoll({ section: 'SUMMER26' });
    await seedPoll({ section: 'PERIOD-B' });

    const { body: summer } = await srv.request('GET', '/poll-archive', {
      headers: bearerHeaders(studentToken),
    });
    expect(summer.polls).toHaveLength(1);
    expect(summer.polls[0].section || 'SUMMER26').toBe('SUMMER26');

    const { body: periodB } = await srv.request('GET', '/poll-archive', {
      headers: bearerHeaders(student2Token),
    });
    expect(periodB.polls).toHaveLength(1);
  });

  it('section is read from the token roster row -- section query param is ignored', async () => {
    await seedPoll({ section: 'SUMMER26' });
    // Even if the caller tries to inject ?section=OTHER, they still get their own.
    const { body } = await srv.request('GET', '/poll-archive?section=OTHER_SECTION', {
      headers: bearerHeaders(studentToken),
    });
    expect(body.ok).toBe(true);
    // The SUMMER26 poll should still come back (route ignored the query param).
    expect(body.polls).toHaveLength(1);
  });

  it('date filter: ?date= restricts to that day', async () => {
    await seedPoll({ pollDate: '2026-05-20' });
    await seedPoll({ pollDate: '2026-05-21' });
    await seedPoll({ pollDate: '2026-05-22' });

    const { body } = await srv.request('GET', '/poll-archive?date=2026-05-21', {
      headers: bearerHeaders(studentToken),
    });
    expect(body.ok).toBe(true);
    expect(body.polls).toHaveLength(1);
    expect(body.polls[0].pollDate).toBe('2026-05-21');
  });

  it('date filter malformed is ignored (no 400, returns all)', async () => {
    await seedPoll();
    const { body } = await srv.request('GET', '/poll-archive?date=not-a-date', {
      headers: bearerHeaders(studentToken),
    });
    expect(body.ok).toBe(true);
    // Malformed date is ignored; all section polls returned.
    expect(body.polls.length).toBeGreaterThanOrEqual(1);
  });

  it('empty result is valid: returns ok:true polls:[]', async () => {
    const { status, body } = await srv.request('GET', '/poll-archive', {
      headers: bearerHeaders(studentToken),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.polls).toEqual([]);
  });

  it('missing token -> 401', async () => {
    const { status, body } = await srv.request('GET', '/poll-archive');
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('garbage token -> 401', async () => {
    const { status } = await srv.request('GET', '/poll-archive', {
      headers: bearerHeaders('not-a-real-token'),
    });
    expect(status).toBe(401);
  });

  it('teacher token also works for GET (valid roster token)', async () => {
    await seedPoll({ section: 'SUMMER26' });
    const { status, body } = await srv.request('GET', '/poll-archive', {
      headers: bearerHeaders(teacherToken),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('table-missing -> 503 with poll_archive hint', async () => {
    pollArchiveDb.state.tableMissing = true;
    const { status, body } = await srv.request('GET', '/poll-archive', {
      headers: bearerHeaders(studentToken),
    });
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('poll_archive not provisioned');
  });
});

// ── DELETE /poll-archive/:id ──────────────────────────────────────────────────

describe('DELETE /poll-archive/:id', () => {
  async function seedPoll() {
    const { data } = await pollArchiveDb.insertPollArchive({
      pollId:   `poll-${randomBytes(4).toString('hex')}`,
      section:  'SUMMER26',
      pollDate: '2026-05-22',
      question: 'Delete test?',
      options:  ['yes', 'no'],
      tally:    [10, 3],
      blind:    false,
    });
    return data.id;
  }

  it('happy path: deletes the row, returns 200 ok:true', async () => {
    const id = await seedPoll();
    const { status, body } = await srv.request('DELETE', `/poll-archive/${id}`, {
      headers: teacherHeaders(),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(pollArchiveDb.store.has(id)).toBe(false);
  });

  it('idempotent: deleting a non-existent id returns 200 ok:true', async () => {
    const { status, body } = await srv.request('DELETE', '/poll-archive/no-such-id', {
      headers: teacherHeaders(),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('missing teacher auth -> 401', async () => {
    const id = await seedPoll();
    const { status, body } = await srv.request('DELETE', `/poll-archive/${id}`);
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('student token is not teacher -> 401', async () => {
    const id = await seedPoll();
    const { status, body } = await srv.request('DELETE', `/poll-archive/${id}`, {
      headers: bearerHeaders(studentToken),
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('table-missing -> 503 with poll_archive hint', async () => {
    pollArchiveDb.state.tableMissing = true;
    const { status, body } = await srv.request('DELETE', '/poll-archive/some-id', {
      headers: teacherHeaders(),
    });
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('poll_archive not provisioned');
  });
});

// ── No-regression guard ───────────────────────────────────────────────────────

describe('poll-archive mount is additive: prior routes survive', () => {
  it('GET /health still returns ok', async () => {
    const { status, body } = await srv.request('GET', '/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe('roster');
  });

  it('GET /poll-archive with no pollArchiveDb does not mount (createApp guard)', async () => {
    // Build a second app without pollArchiveDb -- the guard should prevent mount.
    const appNoPa = createApp(
      rosterDb,
      null, null, null, null, null, null, null, null, null,
      null  // no pollArchiveDb
    );
    const srv2 = new TestServer(appNoPa);
    await srv2.start();
    try {
      const { status } = await srv2.request('GET', '/poll-archive', {
        headers: bearerHeaders(studentToken),
      });
      // Route not mounted -> Express returns 404.
      expect(status).toBe(404);
    } finally {
      await srv2.stop();
    }
  });
});
