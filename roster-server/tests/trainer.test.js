// trainer.test.js — tests for the /trainer/* routes (Desk Roster Alignment §2.2)
// Injects a fake in-memory trainerDb + rosterDb — NO network, NO real Supabase.
// Uses Node's built-in http + fetch (Node 18+) to test the Express app.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

// ── Fake in-memory roster db ──────────────────────────────────────────────────
// Needs listRoster (leaderboard/summary join) and getRoleByStudentId
// (requireTeacher path B). Rows mirror db.js listRoster's projection.

function createFakeRosterDb(rows = [], roles = {}) {
  return {
    rows,
    async insertRoster() { return { data: null, error: { message: 'not used in trainer tests' } }; },
    async findByUsername() { return { data: null, error: { message: 'not used in trainer tests' } }; },
    async listRoster(section) {
      const data = section ? rows.filter(r => r.section === section) : rows;
      return { data, error: null };
    },
    async getRoleByStudentId(studentId) {
      return roles[studentId] === 'teacher' ? 'teacher' : 'student';
    }
  };
}

// ── Fake in-memory trainer db ─────────────────────────────────────────────────
// Mirrors trainer-db.js's contract exactly: getState / getStamp / insertState /
// updateStateIf / upsertState / getLbByStudents, each returning { data, error }.

function createFakeTrainerDb() {
  // store keyed by "studentId|deckId" → { state, updated_at }
  const store = new Map();
  const key = (sid, deckId) => `${sid}|${deckId}`;

  // Strictly-increasing stamps: real Postgres has µs precision, so two writes
  // in the same JS millisecond must still produce distinct updated_at values.
  let lastMs = 0;
  function stamp() {
    lastMs = Math.max(lastMs + 1, Date.now());
    return new Date(lastMs).toISOString();
  }

  return {
    store,

    async getState(studentId, deckId) {
      const row = store.get(key(studentId, deckId));
      if (!row) return { data: null, error: null };
      return { data: { state: row.state, updated_at: row.updated_at }, error: null };
    },

    // Stamp-only read (PUT pre-check) — never returns the state blob.
    async getStamp(studentId, deckId) {
      const row = store.get(key(studentId, deckId));
      if (!row) return { data: null, error: null };
      return { data: { updated_at: row.updated_at }, error: null };
    },

    // Plain insert: existing row → unique_violation, like Postgres 23505.
    async insertState({ studentId, deckId, state }) {
      const k = key(studentId, deckId);
      if (store.has(k)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      }
      const updated_at = stamp();
      store.set(k, { state, updated_at });
      return { data: { updated_at }, error: null };
    },

    // Conditional update: writes only if updated_at still equals baseUpdatedAt.
    // Zero rows matched → { data: null, error: null } (PostgREST maybeSingle).
    async updateStateIf({ studentId, deckId, state, baseUpdatedAt }) {
      const k = key(studentId, deckId);
      const row = store.get(k);
      if (!row || row.updated_at !== baseUpdatedAt) return { data: null, error: null };
      const updated_at = stamp();
      store.set(k, { state, updated_at });
      return { data: { updated_at }, error: null };
    },

    async upsertState({ studentId, deckId, state }) {
      const updated_at = stamp();
      store.set(key(studentId, deckId), { state, updated_at });
      return { data: { updated_at }, error: null };
    },

    async getLbByStudents(studentIds, deckId) {
      const data = [];
      for (const sid of studentIds) {
        const row = store.get(`${sid}|${deckId}`);
        if (!row) continue;
        data.push({
          student_id: sid,
          updated_at: row.updated_at,
          lb: (row.state && row.state.lb !== undefined) ? row.state.lb : null
        });
      }
      return { data, error: null };
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
    return { status: res.status, body: json, headers: res.headers };
  }
}

// ── Constants / helpers ───────────────────────────────────────────────────────

const DECK = 'ap-stats-formulas';
const SECTION = 'PeriodX';

function makeSecret(prefix) {
  return `${prefix}-${randomBytes(16).toString('hex')}`;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let rosterDb;
let trainerDb;
let srv;
let teacherSecret;
let studentId;       // in SECTION, role student
let studentToken;
let otherStudentId;  // in SECTION, no trainer state
let teacherId;       // role teacher
let teacherToken;

beforeEach(async () => {
  teacherSecret = makeSecret('teacher');
  process.env.ROSTER_TEACHER_SECRET = teacherSecret;
  process.env.ROSTER_TOKEN_SECRET   = makeSecret('token');
  process.env.NODE_ENV              = 'test';

  studentId      = `uuid-student-${randomBytes(8).toString('hex')}`;
  otherStudentId = `uuid-other-${randomBytes(8).toString('hex')}`;
  teacherId      = `uuid-teacher-${randomBytes(8).toString('hex')}`;
  studentToken   = signToken(studentId);
  teacherToken   = signToken(teacherId);

  rosterDb = createFakeRosterDb(
    [
      { student_id: studentId,      real_name: 'Ana Smith',  login_username: 'date_tiger',  section: SECTION, role: 'student' },
      { student_id: otherStudentId, real_name: 'Bo Jones',   login_username: 'kiwi_otter',  section: SECTION, role: 'student' },
      { student_id: teacherId,      real_name: 'Tea Cher',   login_username: 'sage_owl',    section: SECTION, role: 'teacher' },
      { student_id: 'uuid-elsewhere', real_name: 'Cy Doe',   login_username: 'plum_eagle',  section: 'PeriodY', role: 'student' }
    ],
    { [teacherId]: 'teacher' }
  );
  trainerDb = createFakeTrainerDb();

  // createApp(db, ledgerDb, loadManifest, loadAnswerKey, loadSkillMap, bkt,
  //           remediationDb, lessonSchedule, configOverrides, worksheetBlankCounts,
  //           pollArchiveDb, nudgesDbOverride, lessonUnlockDbOverride, trainerDbOverride)
  const app = createApp(rosterDb, null, null, null, null, null, null, null, null, null, null, null, null, trainerDb);
  srv = new TestServer(app);
  await srv.start();
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
});

// ── Request helpers ───────────────────────────────────────────────────────────

function getState(deckId = DECK, headers = {}) {
  return srv.request('GET', `/trainer/state/${deckId}`, { headers });
}

function putState(state, { deckId = DECK, token = studentToken, baseUpdatedAt = null } = {}) {
  return srv.request('PUT', `/trainer/state/${deckId}`, {
    body: { token, state, baseUpdatedAt }
  });
}

function patchState(delta, { deckId = DECK, token = studentToken } = {}) {
  return srv.request('PATCH', `/trainer/state/${deckId}`, { body: { token, delta } });
}

const bearer = (token) => ({ 'Authorization': `Bearer ${token}` });

// ── GET /trainer/state/:deckId ────────────────────────────────────────────────

describe('GET /trainer/state/:deckId', () => {

  it('no row yet → 200 {ok:true, found:false}', async () => {
    const { status, body } = await getState(DECK, bearer(studentToken));

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, found: false });
  });

  it('missing Authorization header → 401', async () => {
    const { status, body } = await getState();

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('garbage bearer token → 401', async () => {
    const { status, body } = await getState(DECK, bearer('not.a.token'));

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('?token= query param is NOT accepted (Bearer only — spec CX-2)', async () => {
    // The legacy ?token pattern is deliberately not copied here: query strings
    // land in access logs. A valid token via query must still be a 401.
    const { status, body } = await srv.request(
      'GET', `/trainer/state/${DECK}?token=${encodeURIComponent(studentToken)}`
    );

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('bad deckId (uppercase) → 400', async () => {
    const { status } = await getState('BadDeck', bearer(studentToken));
    expect(status).toBe(400);
  });
});

// ── PUT /trainer/state/:deckId ────────────────────────────────────────────────

describe('PUT /trainer/state/:deckId', () => {

  const STATE = { v: 1, srs: { c1: [1, 500, 2, 100] }, hs: 42, lb: { gold: 1 } };

  it('insert (no row, baseUpdatedAt:null) → 200 with updatedAt, then GET round-trips', async () => {
    const put = await putState(STATE);

    expect(put.status).toBe(200);
    expect(put.body.ok).toBe(true);
    expect(typeof put.body.updatedAt).toBe('string');

    const get = await getState(DECK, bearer(studentToken));
    expect(get.status).toBe(200);
    expect(get.body.found).toBe(true);
    expect(get.body.state).toEqual(STATE);
    expect(get.body.updatedAt).toBe(put.body.updatedAt);
  });

  it('stale baseUpdatedAt → 409 {error:"stale", updatedAt:<current>} and no write', async () => {
    const first = await putState(STATE);

    const { status, body } = await putState({ v: 1, hs: 9999 }, {
      baseUpdatedAt: '2020-01-01T00:00:00.000Z'
    });

    expect(status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('stale');
    expect(body.updatedAt).toBe(first.body.updatedAt);

    // The stored state is untouched.
    const get = await getState(DECK, bearer(studentToken));
    expect(get.body.state).toEqual(STATE);
  });

  it('row exists + baseUpdatedAt:null (never pulled) → 409 too', async () => {
    await putState(STATE);

    const { status, body } = await putState({ v: 1 }, { baseUpdatedAt: null });

    expect(status).toBe(409);
    expect(body.error).toBe('stale');
  });

  it('correct baseUpdatedAt → 200 full-replace (omitted keys are gone)', async () => {
    const first = await putState(STATE);

    const replacement = { v: 1, hs: 100 }; // no srs, no lb
    const second = await putState(replacement, { baseUpdatedAt: first.body.updatedAt });

    expect(second.status).toBe(200);

    const get = await getState(DECK, bearer(studentToken));
    expect(get.body.state).toEqual(replacement);
    expect(get.body.state.srs).toBeUndefined();
  });

  it('state over 256 KB → 413 {error:"state too large"}', async () => {
    const oversized = { pad: 'x'.repeat(262144) }; // stringify > 262144 chars

    const { status, body } = await putState(oversized);

    expect(status).toBe(413);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('state too large');
  });

  it('missing/invalid token → 401', async () => {
    const { status } = await putState(STATE, { token: 'garbage.token' });
    expect(status).toBe(401);
  });

  it('bad deckId (underscore) → 400', async () => {
    const { status } = await putState(STATE, { deckId: 'bad_deck' });
    expect(status).toBe(400);
  });

  it('bad deckId (>64 chars) → 400', async () => {
    const { status } = await putState(STATE, { deckId: 'a'.repeat(65) });
    expect(status).toBe(400);
  });

  it('two concurrent PUTs with the same base → exactly one 200, one 409', async () => {
    const first = await putState(STATE);
    const base = first.body.updatedAt;

    const [a, b] = await Promise.all([
      putState({ v: 1, hs: 1 }, { baseUpdatedAt: base }),
      putState({ v: 1, hs: 2 }, { baseUpdatedAt: base })
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error).toBe('stale');
    expect(typeof loser.body.updatedAt).toBe('string'); // the winner's stamp

    // The winner's write is what's stored.
    const winner = a.status === 200 ? a : b;
    const get = await getState(DECK, bearer(studentToken));
    expect(get.body.updatedAt).toBe(winner.body.updatedAt);
  });

  it('TOCTOU: write lands between stamp pre-check and update → 409 via the atomic path', async () => {
    const first = await putState(STATE);
    const base = first.body.updatedAt;

    // Simulate the race deterministically: the pre-check reads the matching
    // stamp, then another device's write lands BEFORE our conditional update.
    const realGetStamp = trainerDb.getStamp.bind(trainerDb);
    let raced = false;
    trainerDb.getStamp = async (sid, deckId) => {
      const res = await realGetStamp(sid, deckId);
      if (!raced) {
        raced = true; // racer wins after our pre-check already read `base`
        await trainerDb.updateStateIf({ studentId: sid, deckId, state: { v: 1, hs: 777 }, baseUpdatedAt: base });
      }
      return res;
    };

    const { status, body } = await putState({ v: 1, hs: 1 }, { baseUpdatedAt: base });

    expect(status).toBe(409);
    expect(body.error).toBe('stale');
    expect(typeof body.updatedAt).toBe('string');
    expect(body.updatedAt).not.toBe(base); // re-read fresh stamp, not the stale one

    // The racer's state survived; ours never landed.
    const get = await getState(DECK, bearer(studentToken));
    expect(get.body.state).toEqual({ v: 1, hs: 777 });
  });
});

// ── PATCH /trainer/state/:deckId ──────────────────────────────────────────────

describe('PATCH /trainer/state/:deckId', () => {

  it('merges per-card into srs and shallow-replaces other top-level keys', async () => {
    await putState({
      v: 1,
      srs: { a: [1, 100, 0, 10], b: [1, 200, 1, 10] },
      hs: 50,
      streak: { current: 3, best: 5 }
    });

    const { status, body } = await patchState({
      srs: { b: [2, 900, 3, 20], c: [1, 300, 0, 20] }, // b updated, c new, a untouched
      hs: 75
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.updatedAt).toBe('string'); // client's next baseUpdatedAt

    const get = await getState(DECK, bearer(studentToken));
    expect(get.body.state.srs).toEqual({
      a: [1, 100, 0, 10],     // preserved (not in delta)
      b: [2, 900, 3, 20],     // incoming card wins
      c: [1, 300, 0, 20]      // new card unioned in
    });
    expect(get.body.state.hs).toBe(75);                       // top-level shallow-replaced
    expect(get.body.state.streak).toEqual({ current: 3, best: 5 }); // untouched
    expect(get.body.state.v).toBe(1);
  });

  it('stale flush tuples never regress newer stored cards (epoch, then rev, then lastUpdated)', async () => {
    await putState({
      v: 1,
      srs: { a: [5, 800, 3, 100, 1], b: [2, 500, 1, 50, 0], c: [3, 700, 2, 80, 0] },
      resetRev: 1
    });

    // A stale page-hide flush from another device: lower epoch on a, lower rev
    // on b, same epoch+rev but older minute on c — none may win.
    const { status } = await patchState({
      srs: { a: [9, 999, 4, 200, 0], b: [1, 100, 0, 10, 0], c: [3, 100, 0, 70, 0] },
      resetRev: 0
    });
    expect(status).toBe(200);

    const get = await getState(DECK, bearer(studentToken));
    expect(get.body.state.srs).toEqual({
      a: [5, 800, 3, 100, 1],  // higher epoch kept despite lower rev
      b: [2, 500, 1, 50, 0],   // higher rev kept
      c: [3, 700, 2, 80, 0]    // same epoch+rev, later minute kept
    });
    expect(get.body.state.resetRev).toBe(1); // max(), never lowered by a stale flush
  });

  it('newer flush tuples DO advance stored cards, and resetRev merges with max()', async () => {
    await putState({ v: 1, srs: { a: [2, 400, 1, 40, 0] }, resetRev: 0 });

    const { status } = await patchState({ srs: { a: [3, 600, 2, 60, 1] }, resetRev: 2 });
    expect(status).toBe(200);

    const get = await getState(DECK, bearer(studentToken));
    expect(get.body.state.srs).toEqual({ a: [3, 600, 2, 60, 1] });
    expect(get.body.state.resetRev).toBe(2);
  });

  it('no row yet → inserts the delta as the initial (sparse) state', async () => {
    const { status } = await patchState({ srs: { a: [1, 100, 0, 10] }, hs: 5 });

    expect(status).toBe(200);

    const get = await getState(DECK, bearer(studentToken));
    expect(get.body.found).toBe(true);
    expect(get.body.state).toEqual({ srs: { a: [1, 100, 0, 10] }, hs: 5 });
  });

  it('no concurrency check — patch succeeds without any baseUpdatedAt', async () => {
    await putState({ v: 1, hs: 1 });

    const { status } = await patchState({ hs: 2 });
    expect(status).toBe(200);
  });

  it('delta {srs:null} is ignored — never wipes the stored srs map', async () => {
    await putState({ v: 1, srs: { a: [1, 100, 0, 10] }, hs: 1 });

    const { status } = await patchState({ srs: null, hs: 2 });
    expect(status).toBe(200);

    const get = await getState(DECK, bearer(studentToken));
    expect(get.body.state.srs).toEqual({ a: [1, 100, 0, 10] }); // intact
    expect(get.body.state.hs).toBe(2);                          // other keys still applied
  });

  it('delta over 256 KB → 413', async () => {
    const { status, body } = await patchState({ pad: 'x'.repeat(262144) });

    expect(status).toBe(413);
    expect(body.error).toBe('state too large');
  });

  it('bad deckId → 400, bad token → 401', async () => {
    expect((await patchState({ hs: 1 }, { deckId: 'Nope!' })).status).toBe(400);
    expect((await patchState({ hs: 1 }, { token: 'bad.token' })).status).toBe(401);
  });
});

// ── GET /trainer/leaderboard/:section/:deckId ─────────────────────────────────

describe('GET /trainer/leaderboard/:section/:deckId', () => {

  it('public read: students with state appear, students without are omitted', async () => {
    await putState({ v: 1, lb: { gold: 2, weeklyXp: 120 } }); // studentId only

    const { status, body, headers } = await srv.request(
      'GET', `/trainer/leaderboard/${SECTION}/${DECK}`
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.section).toBe(SECTION);
    expect(body.deckId).toBe(DECK);
    expect(body.rows).toHaveLength(1); // kiwi_otter/sage_owl have no state row → omitted
    expect(body.rows[0].username).toBe('date_tiger');
    expect(body.rows[0].realName).toBe('Ana Smith');
    expect(body.rows[0].role).toBe('student'); // client filters role==='teacher' off the board
    expect(body.rows[0].lb).toEqual({ gold: 2, weeklyXp: 120 });
    expect(typeof body.rows[0].updatedAt).toBe('string');
    expect(headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('a teacher who plays appears with role:"teacher" so the client can filter', async () => {
    await putState({ v: 1, lb: { gold: 9 } }, { token: teacherToken });

    const { body } = await srv.request('GET', `/trainer/leaderboard/${SECTION}/${DECK}`);

    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].username).toBe('sage_owl');
    expect(body.rows[0].role).toBe('teacher');
  });

  it('never returns full SRS state on a cross-student route', async () => {
    await putState({ v: 1, srs: { a: [1, 1, 1, 1] }, lb: { gold: 1 } });

    const { body } = await srv.request('GET', `/trainer/leaderboard/${SECTION}/${DECK}`);

    expect(JSON.stringify(body)).not.toContain('"srs"');
  });

  it('other sections are excluded; bad deckId → 400', async () => {
    await putState({ v: 1, lb: { gold: 1 } });

    const other = await srv.request('GET', `/trainer/leaderboard/PeriodY/${DECK}`);
    expect(other.body.rows).toHaveLength(0);

    const bad = await srv.request('GET', `/trainer/leaderboard/${SECTION}/BAD!`);
    expect(bad.status).toBe(400);
  });
});

// ── GET /trainer/section/:section/summary/:deckId ─────────────────────────────

describe('GET /trainer/section/:section/summary/:deckId', () => {

  function getSummary(headers = {}) {
    return srv.request('GET', `/trainer/section/${SECTION}/summary/${DECK}`, { headers });
  }

  it('no auth → 401 forbidden', async () => {
    const { status, body } = await getSummary();

    expect(status).toBe(401);
    expect(body.error).toBe('forbidden');
  });

  it('student bearer token → 401 (requireTeacher rejects role=student)', async () => {
    const { status } = await getSummary(bearer(studentToken));
    expect(status).toBe(401);
  });

  it('?token= query param → 401 (CX-2: Bearer/secret-only), even with a VALID teacher token', async () => {
    const { status, body } = await srv.request(
      'GET', `/trainer/section/${SECTION}/summary/${DECK}?token=${encodeURIComponent(teacherToken)}`
    );

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('token must be sent as Authorization: Bearer');
  });

  it('x-teacher-secret → 200 and INCLUDES students without state (lb:null)', async () => {
    await putState({ v: 1, lb: { gold: 3 } }); // only studentId has state

    const { status, body } = await getSummary({ 'x-teacher-secret': teacherSecret });

    expect(status).toBe(200);
    expect(body.rows).toHaveLength(3); // every PeriodX roster row, active or not

    const active = body.rows.find(r => r.username === 'date_tiger');
    const idle   = body.rows.find(r => r.username === 'kiwi_otter');
    expect(active.role).toBe('student');
    expect(active.lb).toEqual({ gold: 3 });
    expect(typeof active.updatedAt).toBe('string');
    expect(idle.lb).toBeNull();
    expect(idle.updatedAt).toBeNull();

    // Teachers stay in the summary (only the student board filters them).
    const teacher = body.rows.find(r => r.username === 'sage_owl');
    expect(teacher.role).toBe('teacher');
  });

  it('bearer token resolving to role=teacher → 200', async () => {
    const { status, body } = await getSummary(bearer(teacherToken));

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

// ── Deck allowlist (writes only) ──────────────────────────────────────────────
// Regex-valid but non-allowlisted deckIds: writes are rejected (storage-
// exhaustion guard on the shared grade DB), reads still answer found:false.

describe('deck allowlist', () => {

  const UNKNOWN = 'totally-made-up-deck'; // passes DECK_ID_RE, not allowlisted

  it('PUT to a non-allowlisted deck → 400 unknown deck', async () => {
    const { status, body } = await putState({ v: 1 }, { deckId: UNKNOWN });

    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'unknown deck' });
  });

  it('PATCH to a non-allowlisted deck → 400 unknown deck', async () => {
    const { status, body } = await patchState({ hs: 1 }, { deckId: UNKNOWN });

    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'unknown deck' });
  });

  it('GET of a non-allowlisted deck stays readable → 200 found:false, not 400', async () => {
    const { status, body } = await getState(UNKNOWN, bearer(studentToken));

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, found: false });
  });
});

// ── 42P01 → 503 on every route (migration 0017 not run) ──────────────────────
// Each route's FIRST trainerDb touch answers undefined_table; all must degrade
// to the same friendly 503, never a raw 500.

describe('42P01 (migration 0017 not run) → 503 on every route', () => {

  const NOT_PROVISIONED = {
    data: null,
    error: { code: '42P01', message: 'relation "trainer_state" does not exist' }
  };

  it.each([
    ['GET state',   'getState',        () => getState(DECK, bearer(studentToken))],
    ['PUT state',   'getStamp',        () => putState({ v: 1 })],
    ['PATCH state', 'getState',        () => patchState({ hs: 1 })],
    ['leaderboard', 'getLbByStudents', () => srv.request('GET', `/trainer/leaderboard/${SECTION}/${DECK}`)]
  ])('%s → 503 friendly message', async (_route, dbMethod, send) => {
    trainerDb[dbMethod] = async () => NOT_PROVISIONED;

    const { status, body } = await send();

    expect(status).toBe(503);
    expect(body.error).toBe('trainer_state not provisioned (run migration 0017)');
  });
});
