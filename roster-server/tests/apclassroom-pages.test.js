// apclassroom-pages.test.js - POST /admin/apclassroom-page/:assignmentId,
// GET /admin/apclassroom-pages and the `apclassroomPages` field of GET /health.
// Fake in-memory dbs, NO network beyond the local test server.

import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { MAX_PAGE_BYTES, parsePagePost } from '../apclassroom-pages.js';

const TEACHER = 'teacher-secret-fixture';
const asTeacher = { 'x-teacher-secret': TEACHER };

const MCQ_PAGE = 'Results by Student\nStudent\nPoints Earned (of 14)\nPear Cat\n11\n';
const FRQ_PAGE = 'Assessment Progress\nStudent\nDate Submitted\nPlum Owl\nScored\n13/16\n';

function createFakeRosterDb() {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async findByStudentId() { return { data: null, error: null }; },
    async listRoster() { return { data: [], error: null }; },
  };
}

function createFakeLedgerDb() {
  return {
    async getLedgerByStudent() { return { data: [], error: null }; },
    async insertLedgerRow() { return { data: {}, error: null }; },
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
  async postText(id, text, headers = asTeacher) {
    const res = await fetch(`${this.baseUrl}/admin/apclassroom-page/${id}`, {
      method: 'POST', headers: { 'content-type': 'text/plain', ...headers }, body: text,
    });
    return { status: res.status, body: await res.json() };
  }
  async postJson(id, body, headers = asTeacher) {
    const res = await fetch(`${this.baseUrl}/admin/apclassroom-page/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }
  async get(path, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { headers });
    return { status: res.status, body: await res.json() };
  }
}

async function startServer() {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  delete process.env.TEACHER_KEY;
  process.env.NODE_ENV = 'test';
  const app = createApp(createFakeRosterDb(), createFakeLedgerDb(), async () => ({ units: [] }),
    async () => ({ answerKey: {} }));
  const server = new TestServer(app);
  await server.start();
  return server;
}

let srv;
afterEach(async () => {
  if (srv) { await srv.stop(); srv = null; }
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.APCLASSROOM_PAGE_KEY;
});

const PAGE_KEY = 'page-key-fixture-0123456789';
const asSender = { 'x-page-key': PAGE_KEY };

describe('parsePagePost', () => {
  it('accepts a text body or { text } and counts utf-8 bytes', () => {
    expect(parsePagePost('81595010', MCQ_PAGE)).toEqual({ text: MCQ_PAGE, bytes: Buffer.byteLength(MCQ_PAGE) });
    expect(parsePagePost('81595010', { text: FRQ_PAGE }).text).toBe(FRQ_PAGE);
  });

  it('rejects a bad id, an empty body and junk text', () => {
    expect(parsePagePost('abc', MCQ_PAGE).status).toBe(400);
    expect(parsePagePost('12345', MCQ_PAGE).status).toBe(400);
    expect(parsePagePost('1234567890123', MCQ_PAGE).status).toBe(400);
    expect(parsePagePost('81595010', '   ').status).toBe(400);
    expect(parsePagePost('81595010', {}).status).toBe(400);
    expect(parsePagePost('81595010', '<html>Sign In</html>').error).toMatch(/not an AP Classroom/);
  });
});

describe('POST /admin/apclassroom-page + GET /admin/apclassroom-pages', () => {
  it('both routes need the teacher secret; nothing is stored without it', async () => {
    srv = await startServer();
    expect((await srv.postText('81595010', MCQ_PAGE, {})).status).toBe(401);
    expect((await srv.postText('81595010', MCQ_PAGE, { 'x-teacher-secret': 'wrong' })).status).toBe(401);
    expect((await srv.get('/admin/apclassroom-pages')).status).toBe(401);
    expect((await srv.get('/admin/apclassroom-pages?ids=81595010')).status).toBe(401);
    const meta = await srv.get('/admin/apclassroom-pages', asTeacher);
    expect(meta.body.pages).toEqual({});
  });

  it('stores a text/plain page and serves it back by id', async () => {
    srv = await startServer();
    const posted = await srv.postText('81595010', MCQ_PAGE);
    expect(posted.status).toBe(200);
    expect(posted.body).toMatchObject({ ok: true, assignmentId: '81595010', bytes: Buffer.byteLength(MCQ_PAGE) });
    expect(Date.parse(posted.body.receivedAt)).toBeGreaterThan(0);
    expect(JSON.stringify(posted.body)).not.toMatch(/Pear Cat/);

    const got = await srv.get('/admin/apclassroom-pages?ids=81595010,99999999,junk', asTeacher);
    expect(got.status).toBe(200);
    expect(Object.keys(got.body.pages)).toEqual(['81595010']);
    expect(got.body.pages['81595010']).toEqual({ text: MCQ_PAGE, receivedAt: posted.body.receivedAt, bytes: posted.body.bytes });
  });

  it('accepts application/json { text }', async () => {
    srv = await startServer();
    const posted = await srv.postJson('81595036', { text: FRQ_PAGE });
    expect(posted.status).toBe(200);
    const got = await srv.get('/admin/apclassroom-pages?ids=81595036', asTeacher);
    expect(got.body.pages['81595036'].text).toBe(FRQ_PAGE);
  });

  it('validates the id and rejects empty or junk bodies', async () => {
    srv = await startServer();
    expect((await srv.postText('abc123', MCQ_PAGE)).status).toBe(400);
    expect((await srv.postText('12345', MCQ_PAGE)).status).toBe(400);
    expect((await srv.postText('81595010', '')).status).toBe(400);
    const junk = await srv.postText('81595010', 'College Board\nSign In\n');
    expect(junk.status).toBe(400);
    expect(junk.body.error).toMatch(/not an AP Classroom/);
    expect((await srv.get('/admin/apclassroom-pages', asTeacher)).body.pages).toEqual({});
  });

  it('the latest post wins', async () => {
    srv = await startServer();
    await srv.postText('81595010', MCQ_PAGE);
    const newer = MCQ_PAGE + 'Plum Owl\n12\n';
    await srv.postText('81595010', newer);
    const got = await srv.get('/admin/apclassroom-pages?ids=81595010', asTeacher);
    expect(got.body.pages['81595010'].text).toBe(newer);
  });

  it('a page over 512 KB is refused (text and JSON) and not stored', async () => {
    srv = await startServer();
    const big = 'Points Earned (of 14)\n' + 'x'.repeat(MAX_PAGE_BYTES);
    const asText = await srv.postText('81595010', big);
    expect(asText.status).toBe(413);
    expect(JSON.stringify(asText.body)).not.toMatch(/xxxx/);
    expect((await srv.postJson('81595010', { text: big })).status).toBe(413);
    const justUnder = 'Points Earned (of 14)\n' + 'x'.repeat(MAX_PAGE_BYTES - 100);
    expect((await srv.postText('81595024', justUnder)).status).toBe(200);
    expect(Object.keys((await srv.get('/admin/apclassroom-pages', asTeacher)).body.pages)).toEqual(['81595024']);
  });

  it('GET without ids returns metadata only (no text)', async () => {
    srv = await startServer();
    await srv.postText('81595010', MCQ_PAGE);
    await srv.postText('81595036', FRQ_PAGE);
    const meta = await srv.get('/admin/apclassroom-pages', asTeacher);
    expect(Object.keys(meta.body.pages).sort()).toEqual(['81595010', '81595036']);
    for (const page of Object.values(meta.body.pages)) {
      expect(Object.keys(page).sort()).toEqual(['bytes', 'receivedAt']);
    }
    expect(JSON.stringify(meta.body)).not.toMatch(/Pear Cat|Plum Owl|Points Earned/);
  });
});

describe('x-page-key (the sender key): the POST only', () => {
  it('a matching x-page-key posts a page; the teacher reads it back', async () => {
    process.env.APCLASSROOM_PAGE_KEY = PAGE_KEY;
    srv = await startServer();
    const posted = await srv.postText('81595010', MCQ_PAGE, asSender);
    expect(posted.status).toBe(200);
    expect(posted.body).toMatchObject({ ok: true, assignmentId: '81595010' });
    expect(JSON.stringify(posted.body)).not.toContain(PAGE_KEY);
    const got = await srv.get('/admin/apclassroom-pages?ids=81595010', asTeacher);
    expect(got.body.pages['81595010'].text).toBe(MCQ_PAGE);
  });

  it('x-page-key never opens the GET routes or another /admin route', async () => {
    process.env.APCLASSROOM_PAGE_KEY = PAGE_KEY;
    srv = await startServer();
    await srv.postText('81595010', MCQ_PAGE, asSender);
    const withIds = await srv.get('/admin/apclassroom-pages?ids=81595010', asSender);
    expect(withIds.status).toBe(401);
    expect(JSON.stringify(withIds.body)).not.toMatch(/Pear Cat|81595010/);
    expect((await srv.get('/admin/apclassroom-pages', asSender)).status).toBe(401);
    const res = await fetch(`${srv.baseUrl}/admin/job-result`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...asSender },
      body: JSON.stringify({ job: 'snapshot', code: 'verified' }),
    });
    expect(res.status).toBe(401);
  });

  it('a wrong key is 401 and stores nothing', async () => {
    process.env.APCLASSROOM_PAGE_KEY = PAGE_KEY;
    srv = await startServer();
    const wrong = await srv.postText('81595010', MCQ_PAGE, { 'x-page-key': PAGE_KEY + 'x' });
    expect(wrong.status).toBe(401);
    expect(JSON.stringify(wrong.body)).not.toContain(PAGE_KEY);
    expect((await srv.postText('81595010', MCQ_PAGE, { 'x-page-key': '' })).status).toBe(401);
    expect((await srv.get('/admin/apclassroom-pages', asTeacher)).body.pages).toEqual({});
  });

  it('with APCLASSROOM_PAGE_KEY unset (or blank) the header path is off', async () => {
    srv = await startServer();
    expect((await srv.postText('81595010', MCQ_PAGE, asSender)).status).toBe(401);
    expect((await srv.postText('81595010', MCQ_PAGE, { 'x-page-key': 'undefined' })).status).toBe(401);
    process.env.APCLASSROOM_PAGE_KEY = '   ';
    expect((await srv.postText('81595010', MCQ_PAGE, { 'x-page-key': '   ' })).status).toBe(401);
    expect((await srv.get('/admin/apclassroom-pages', asTeacher)).body.pages).toEqual({});
  });

  it('the teacher secret still posts with the page key configured', async () => {
    process.env.APCLASSROOM_PAGE_KEY = PAGE_KEY;
    srv = await startServer();
    expect((await srv.postText('81595010', MCQ_PAGE)).status).toBe(200);
  });
});

describe('GET /health apclassroomPages', () => {
  it('starts empty, then shows a count and the newest time with no ids or text', async () => {
    srv = await startServer();
    expect((await srv.get('/health')).body.apclassroomPages).toEqual({ count: 0, newestAt: null });

    await srv.postText('81595010', MCQ_PAGE);
    const last = await srv.postText('81595036', FRQ_PAGE);
    const { body } = await srv.get('/health');
    expect(body.apclassroomPages).toEqual({ count: 2, newestAt: last.body.receivedAt });
    const raw = JSON.stringify(body.apclassroomPages);
    expect(raw).not.toMatch(/81595010|81595036|Pear Cat|Plum Owl|Points Earned/);
  });
});
