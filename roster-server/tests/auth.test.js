// auth.test.js — integration tests for enroll/verify/resolve routes
// Injects a fake in-memory db — NO network, NO real Supabase.
// Uses Node's built-in http + fetch (Node 18+) to test the Express app.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { verifyToken } from '../token.js';

// ── Fake in-memory db ────────────────────────────────────────────────────────

function createFakeDb() {
  const store = new Map(); // loginUsername.toLowerCase() → row

  return {
    store,

    async insertRoster({ realName, section, loginUsername, passwordHash, email }) {
      const key = loginUsername.toLowerCase();

      if (store.has(key)) {
        return {
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' }
        };
      }

      const row = {
        student_id:     `uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        login_username: loginUsername,
        password_hash:  passwordHash,
        real_name:      realName,
        section,
        email:          email || null,
        status:         'active'
      };
      store.set(key, row);

      return { data: row, error: null };
    },

    async findByUsername(username) {
      const key = username.toLowerCase();
      const row = store.get(key);

      if (!row) {
        return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
      }

      return { data: row, error: null };
    }
  };
}

// ── Lightweight test server ──────────────────────────────────────────────────

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
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const json = await res.json();
    return { status: res.status, body: json };
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

function makeSecret(prefix) {
  return `${prefix}-${randomBytes(16).toString('hex')}`;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

let db;
let srv;
let teacherSecret;
let tokenSecret;

beforeEach(async () => {
  teacherSecret = makeSecret('teacher');
  tokenSecret = makeSecret('token');

  process.env.ROSTER_TEACHER_SECRET = teacherSecret;
  process.env.ROSTER_TOKEN_SECRET   = tokenSecret;
  process.env.NODE_ENV              = 'test';

  db  = createFakeDb();
  const app = createApp(db);
  srv = new TestServer(app);
  await srv.start();
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
});

// ── /health ──────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with ok:true, service:"roster", and a time string', async () => {
    const { status, body } = await srv.request('GET', '/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe('roster');
    expect(typeof body.time).toBe('string');
  });
});

// ── /roster/enroll ───────────────────────────────────────────────────────────

describe('POST /roster/enroll', () => {
  async function enroll(overrides = {}) {
    return srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName: 'Alice Smith', section: 'SUMMER26', password: 'hunter2', ...overrides }
    });
  }

  it('happy path: returns studentId and username on success', async () => {
    const { status, body } = await enroll();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.studentId).toBe('string');
    expect(body.studentId.length).toBeGreaterThan(0);
    expect(typeof body.username).toBe('string');
    expect(body.username).toMatch(/^[a-z]+_[a-z]+/); // fruit_animal format
    expect(body.realName).toBe('Alice Smith');
    expect(body.section).toBe('SUMMER26');
  });

  it('stores a bcrypt hash — not plaintext — and hash passes bcrypt.compare', async () => {
    await enroll({ realName: 'Bob Jones', password: 'mypassword' });

    const rows = [...db.store.values()];
    const row  = rows.find(r => r.real_name === 'Bob Jones');
    expect(row).toBeDefined();

    // Must be a bcrypt hash (never plaintext)
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row.password_hash).not.toBe('mypassword');

    const matches = await bcrypt.compare('mypassword', row.password_hash);
    expect(matches).toBe(true);
  });

  it('returns 401 {ok:false,error:"forbidden"} when x-teacher-secret header is missing', async () => {
    const { status, body } = await srv.request('POST', '/roster/enroll', {
      body: { realName: 'Carol', section: 'SUMMER26', password: 'pass' }
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
  });

  it('returns 401 {ok:false,error:"forbidden"} when teacher secret is wrong', async () => {
    const { status, body } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': makeSecret('wrong') },
      body: { realName: 'Dave', section: 'SUMMER26', password: 'pass' }
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
  });

  it('returns 400 when required fields are missing', async () => {
    const { status, body } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName: 'Eve' } // missing section and password
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('response body never contains the word "password" or "hash"', async () => {
    const { body } = await enroll({ realName: 'Frank' });
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('password');
    expect(bodyStr).not.toContain('hash');
  });
});

// ── /roster/verify ───────────────────────────────────────────────────────────

describe('POST /roster/verify', () => {
  async function enrollOne(realName = 'Test Student', password = 'testpass') {
    const { body } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName, section: 'SUMMER26', password }
    });
    return body; // { ok, studentId, username, realName, section }
  }

  it('correct credentials → 200 with token and studentId', async () => {
    const enrolled = await enrollOne('Grace Lee', 'correctpass');
    expect(enrolled.ok).toBe(true);

    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: enrolled.username, password: 'correctpass' }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.studentId).toBe(enrolled.studentId);
    expect(typeof body.token).toBe('string');
    expect(body.realName).toBe('Grace Lee');
    expect(body.section).toBe('SUMMER26');
  });

  it('returned token is accepted by verifyToken() and resolves to the correct studentId', async () => {
    const enrolled = await enrollOne('Henry Park', 'mypass');
    const { body } = await srv.request('POST', '/roster/verify', {
      body: { username: enrolled.username, password: 'mypass' }
    });

    expect(body.ok).toBe(true);
    const resolvedId = verifyToken(body.token);
    expect(resolvedId).toBe(enrolled.studentId);
  });

  it('wrong password → 401 "Invalid username or password" (generic message)', async () => {
    const enrolled = await enrollOne('Irene Kim', 'rightpass');
    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: enrolled.username, password: 'wrongpass' }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid username or password');
  });

  it('unknown username → 401 with THE SAME generic message (no user enumeration)', async () => {
    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: 'totally_unknown_user', password: 'anypass' }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid username or password');
  });

  it('lookup is case-insensitive on username', async () => {
    const enrolled = await enrollOne('Jack Wu', 'casepass');

    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: enrolled.username.toUpperCase(), password: 'casepass' }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 400 when username or password is missing', async () => {
    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: 'someone' } // missing password
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('response body never contains "hash" or "password_hash"', async () => {
    const enrolled = await enrollOne('Kate Ng', 'safepass');
    const { body } = await srv.request('POST', '/roster/verify', {
      body: { username: enrolled.username, password: 'safepass' }
    });

    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('password_hash');
    expect(bodyStr).not.toContain('hash');
  });
});

// ── /roster/resolve ──────────────────────────────────────────────────────────

describe('POST /roster/resolve', () => {
  it('valid token resolves to studentId', async () => {
    const { body: enrollBody } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName: 'Leon Ray', section: 'SUMMER26', password: 'resolvepass' }
    });
    const { body: verifyBody } = await srv.request('POST', '/roster/verify', {
      body: { username: enrollBody.username, password: 'resolvepass' }
    });

    const { status, body } = await srv.request('POST', '/roster/resolve', {
      body: { token: verifyBody.token }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.studentId).toBe(enrollBody.studentId);
  });

  it('invalid/garbage token returns 401', async () => {
    const { status, body } = await srv.request('POST', '/roster/resolve', {
      body: { token: 'garbage.token' }
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('missing token field returns 401', async () => {
    const { status, body } = await srv.request('POST', '/roster/resolve', {
      body: {}
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });
});
