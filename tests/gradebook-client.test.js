/**
 * Tests for gradebook-client.js (Workstream C — Gradebook Sprint 1)
 *
 * Coverage per build doc §3 (WS-C expectations):
 * - no-identity → no-op, NO fetch issued
 * - happy path: posts to ${ROSTER_SERVICE_URL}/ledger/record with token in body → { ok:true, ledgerId }
 * - fetch rejects → { ok:false, reason:'network' } and the call does NOT throw
 * - HTTP 500 / server ok:false → { ok:false, reason:'network' }
 * - missing required args (source/itemId/response) → { ok:false, reason:'bad-args' }
 * - reads ROSTER_SERVICE_URL and token at call time (override mid-test)
 * - NO secret literals in gradebook-client.js source
 * - NO 'x-proctor-secret' anywhere in gradebook-client.js source (L-C)
 * - NO import/require statements (pure browser JS)
 */

import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

// ─── load source as text (for literal-scan assertions) ───────────────────────

const REPO_ROOT    = resolve(import.meta.dirname, '..');
const CLIENT_SRC   = readFileSync(resolve(REPO_ROOT, 'gradebook-client.js'), 'utf8');
const ROSTER_SRC   = readFileSync(resolve(REPO_ROOT, 'roster-client.js'),    'utf8');
const CONFIG_SRC   = readFileSync(resolve(REPO_ROOT, 'roster_config.js'),    'utf8');

// ─── helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'apstats_roster.v1';

/**
 * Boot a fresh jsdom window with roster_config.js + roster-client.js +
 * gradebook-client.js evaluated.  Returns { win, gradebookClient, rosterClient }.
 *
 * Uses vm.createContext(win) so bare `window` in the source resolves correctly.
 * overrideServiceUrl: if provided, sets win.ROSTER_SERVICE_URL before the scripts run.
 */
function makeWindow(overrideServiceUrl = 'https://mock-service.test') {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://apstats-app.example.com'
  });
  const win = dom.window;

  if (overrideServiceUrl !== null) {
    win.ROSTER_SERVICE_URL = overrideServiceUrl;
  }

  const ctx = createContext(win);
  runInContext(CONFIG_SRC,  ctx);
  runInContext(ROSTER_SRC,  ctx);
  runInContext(CLIENT_SRC,  ctx);

  return {
    win,
    rosterClient:    win.rosterClient,
    gradebookClient: win.gradebookClient
  };
}

/**
 * Set up win.localStorage so rosterClient.token() returns the given token.
 */
function setToken(win, token) {
  const session = {
    studentId:   'uuid-test-student',
    username:    'test_user',
    realName:    'Test Student',
    section:     'SUMMER26',
    token:       token,
    signedInAt:  '2026-05-17T00:00:00.000Z'
  };
  win.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/**
 * Replace win.fetch with a mock that resolves with the given JSON body.
 * Returns the vi.fn() so callers can assert call counts / arguments.
 */
function mockFetch(win, responseBody, { ok = true, status = 200 } = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => responseBody
  });
  win.fetch = fn;
  return fn;
}

// ─── tests ───────────────────────────────────────────────────────────────────

// ── 1. No-identity → immediate no-op, fetch NEVER called ─────────────────────

describe('gradebook-client.js — no-identity (no token)', () => {
  it('returns { ok:false, reason:"no-identity" } when rosterClient.token() returns null', async () => {
    const { win, gradebookClient } = makeWindow();
    // No session in localStorage → token() returns null
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'WS-U4L1-2-Q1',
      response: 'some answer'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-identity');
  });

  it('does NOT call fetch when token is absent', async () => {
    const { win, gradebookClient } = makeWindow();
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    await gradebookClient.record({
      source:   'worksheet',
      itemId:   'WS-U4L1-2-Q1',
      response: 'answer'
    });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns no-identity when rosterClient is absent entirely', async () => {
    const { win, gradebookClient } = makeWindow();
    // Remove rosterClient from the window
    win.rosterClient = undefined;
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'ans'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-identity');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns no-identity when rosterClient.token throws', async () => {
    const { win, gradebookClient } = makeWindow();
    win.rosterClient = { token: () => { throw new Error('storage blocked'); } };
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'ans'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-identity');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ── 2. Happy path ─────────────────────────────────────────────────────────────

describe('gradebook-client.js — happy path', () => {
  it('POSTs to ${ROSTER_SERVICE_URL}/ledger/record and returns { ok:true, ledgerId }', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'signed.token.abc');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-ledger-001', evidenceTier: 'practice' });

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'WS-U4L1-2-Q1',
      unit:     'U4',
      topic:    '4.1',
      skill:    'VAR-3.D',
      response: 'probability describes long-run behavior',
      score:    1,
      attempt:  1
    });

    expect(result.ok).toBe(true);
    expect(result.ledgerId).toBe('uuid-ledger-001');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe('https://mock-service.test/ledger/record');
  });

  it('includes the token in the POST body (not in a header)', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'my.jwt.token');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-002', evidenceTier: 'practice' });

    await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q2',
      response: 'answer text'
    });

    const [, options] = fetchFn.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.token).toBe('my.jwt.token');
  });

  it('sends all optional fields in the body when provided', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'tok');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-003', evidenceTier: 'practice' });

    await gradebookClient.record({
      source:   'frq',
      itemId:   'FRQ-U5-001',
      unit:     'U5',
      topic:    '5.3',
      skill:    'UNC-3.A',
      response: { text: 'my answer', words: 42 },
      score:    2,
      attempt:  2
    });

    const [, options] = fetchFn.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.source).toBe('frq');
    expect(body.itemId).toBe('FRQ-U5-001');
    expect(body.unit).toBe('U5');
    expect(body.topic).toBe('5.3');
    expect(body.skill).toBe('UNC-3.A');
    expect(body.response).toEqual({ text: 'my answer', words: 42 });
    expect(body.score).toBe(2);
    expect(body.attempt).toBe(2);
  });

  it('treats explicit null response as present and forwards it', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'tok');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-null', evidenceTier: 'practice' });

    const result = await gradebookClient.record({
      source: 'worksheet',
      itemId: 'Q-null',
      response: null
    });

    expect(result).toEqual({ ok: true, ledgerId: 'uuid-null' });

    const [, options] = fetchFn.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.response).toBeNull();
  });

  it('does NOT send x-proctor-secret in the request headers (decision L-C)', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'tok');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-lc', evidenceTier: 'practice' });

    await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'answer'
    });

    const [, options] = fetchFn.mock.calls[0];
    const headers = options.headers || {};
    expect(Object.keys(headers).map(k => k.toLowerCase())).not.toContain('x-proctor-secret');
  });

  it('uses Content-Type: application/json', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-ct', evidenceTier: 'practice' });

    await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'ans' });

    const [, options] = fetchFn.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });
});

// ── 3. Network / server errors → { ok:false, reason:'network' }, never throw ──

describe('gradebook-client.js — network and server errors', () => {
  it('returns { ok:false, reason:"network" } when fetch rejects', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    win.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'answer'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('network');
  });

  it('does NOT throw when fetch rejects (caller must never see a rejection)', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    win.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

    await expect(
      gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'ans' })
    ).resolves.not.toThrow();
  });

  it('returns { ok:false, reason:"network" } on HTTP 500 (server error body)', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    mockFetch(win, { ok: false, error: 'internal server error' }, { ok: false, status: 500 });

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'answer'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('network');
  });

  it('returns { ok:false, reason:"network" } on HTTP 401 (bad token server-side)', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'expired-token');
    mockFetch(win, { ok: false, error: 'invalid token' }, { ok: false, status: 401 });

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'answer'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('network');
  });

  it('returns { ok:false, reason:"network" } when JSON.parse of response throws', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    win.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); }
    });

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'answer'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('network');
  });
});

// ── 4. Missing / invalid required args → bad-args ─────────────────────────────

describe('gradebook-client.js — argument validation (bad-args)', () => {
  it('returns bad-args when source is missing', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({ itemId: 'Q1', response: 'ans' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-args');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns bad-args when itemId is missing', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({ source: 'worksheet', response: 'ans' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-args');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns bad-args when response is missing', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q1' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-args');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns bad-args when opts is null', async () => {
    const { gradebookClient } = makeWindow();

    const result = await gradebookClient.record(null);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-args');
  });

  it('returns bad-args when opts is undefined', async () => {
    const { gradebookClient } = makeWindow();

    const result = await gradebookClient.record(undefined);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-args');
  });

  it('bad-args check happens before identity check (no fetch even without identity)', async () => {
    // When args are bad, we should get bad-args regardless of identity state.
    // This test intentionally has no token AND bad args.
    const { win, gradebookClient } = makeWindow();
    // No session → token() = null, but args are also missing
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({ source: 'worksheet' }); // missing itemId + response

    expect(result.reason).toBe('bad-args');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ── 5. Reads URL and token at call time (not module load) ─────────────────────

describe('gradebook-client.js — reads URL and token at call time', () => {
  it('uses the ROSTER_SERVICE_URL value present at call time, not at load time', async () => {
    const { win, gradebookClient } = makeWindow('https://original.test');
    setToken(win, 'tok');

    // Override URL after module load but before the call
    win.ROSTER_SERVICE_URL = 'https://overridden.test';

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-override', evidenceTier: 'practice' });

    await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'ans' });

    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe('https://overridden.test/ledger/record');
  });

  it('uses the token present in localStorage at call time (not at load time)', async () => {
    const { win, gradebookClient } = makeWindow();
    // No token at load time; set it just before the call
    setToken(win, 'late-token');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-late', evidenceTier: 'practice' });

    await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'ans' });

    const [, options] = fetchFn.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.token).toBe('late-token');
  });

  it('returns no-identity if token is cleared between calls', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'first-token');

    // First call succeeds
    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-first', evidenceTier: 'practice' });
    const r1 = await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'ans' });
    expect(r1.ok).toBe(true);

    // Clear the session (sign out)
    win.localStorage.removeItem(STORAGE_KEY);

    // Second call — no identity
    const r2 = await gradebookClient.record({ source: 'worksheet', itemId: 'Q2', response: 'ans2' });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('no-identity');
    // Fetch should have been called only once (for the first call)
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ── 6. Security: no secret / x-proctor-secret literals in source ─────────────

describe('Security: no secret literals or x-proctor-secret in gradebook-client.js', () => {
  it('contains no x-proctor-secret string literal', () => {
    expect(CLIENT_SRC).not.toContain('x-proctor-secret');
  });

  it('contains no hardcoded password literals', () => {
    expect(CLIENT_SRC).not.toMatch(/password\s*=\s*["'][^"']{3,}/);
    expect(CLIENT_SRC).not.toMatch(/secret\s*=\s*["'][^"']{3,}/);
  });

  it('contains no Supabase service-role key pattern (eyJ...)', () => {
    expect(CLIENT_SRC).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });

  it('has no import/require statements (pure browser JS)', () => {
    expect(CLIENT_SRC).not.toMatch(/^\s*import\s+/m);
    expect(CLIENT_SRC).not.toMatch(/require\s*\(/);
  });

  it('contains no ROSTER_PROCTOR_SECRET literal', () => {
    expect(CLIENT_SRC).not.toContain('ROSTER_PROCTOR_SECRET');
  });
});

// ── 7. fetchPrior — PERSISTENT_ANSWERS_BUILD.md §4 ───────────────────────────
//
// fetchPrior(prefix) NEVER throws. NEVER rejects. Always resolves to a Map.

describe('gradebook-client.js — fetchPrior (no identity)', () => {
  it('returns an empty Map when not signed in', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');

    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when rosterClient is absent entirely', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    win.rosterClient = undefined;
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');

    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when token() throws', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    win.rosterClient = {
      token: () => { throw new Error('storage blocked'); },
      studentId: () => 'uuid-test-student'
    };
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');

    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('gradebook-client.js — fetchPrior (bad args)', () => {
  it('returns an empty Map when prefix is missing', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior();
    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when prefix is empty string', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior('');
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when prefix contains wildcards / special chars', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    for (const bad of ['WS-U4%', 'WS-U4*', 'WS-U4 OR 1=1', 'WS-U4;DROP']) {
      const out = await gradebookClient.fetchPrior(bad);
      expect(out).toBeInstanceOf(Map);
      expect(out.size).toBe(0);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when prefix is not a string', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');

    for (const bad of [null, 42, {}, [], true]) {
      const out = await gradebookClient.fetchPrior(bad);
      expect(out).toBeInstanceOf(Map);
      expect(out.size).toBe(0);
    }
  });
});

describe('gradebook-client.js — fetchPrior (network / server errors)', () => {
  it('returns an empty Map when fetch rejects', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    win.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
  });

  it('does NOT throw when fetch rejects', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    win.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

    await expect(
      gradebookClient.fetchPrior('WS-U4L1-2')
    ).resolves.not.toThrow();
  });

  it('returns an empty Map on HTTP 401 / 403', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    mockFetch(win, { ok: false, error: 'forbidden' }, { ok: false, status: 401 });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(0);
  });

  it('returns an empty Map when ROSTER_SERVICE_URL is not set', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    // roster_config.js falls back to a prod URL by default — clear it AFTER load.
    win.ROSTER_SERVICE_URL = null;
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when JSON parse throws', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    win.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad json'); }
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(0);
  });

  it('returns an empty Map when server returns ok:false', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    mockFetch(win, { ok: false, error: 'bad prefix' });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(0);
  });

  it('returns an empty Map when rows is not an array', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    mockFetch(win, { ok: true, rows: 'not-an-array' });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(0);
  });
});

describe('gradebook-client.js — fetchPrior (happy path / dedup)', () => {
  it('returns a Map of itemId → {response, score, source} on success', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'session.token.abc');

    const fetchFn = mockFetch(win, {
      ok: true,
      rows: [
        { item_id: 'WS-U4L1-2-Q1', response: 'first answer',  score: 1,  source: 'worksheet' },
        { item_id: 'WS-U4L1-2-Q2', response: 'second answer', score: null, source: 'worksheet' }
      ]
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');

    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(2);
    expect(out.get('WS-U4L1-2-Q1')).toEqual({
      response: 'first answer', score: 1, source: 'worksheet'
    });
    expect(out.get('WS-U4L1-2-Q2')).toEqual({
      response: 'second answer', score: null, source: 'worksheet'
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain('https://mock.test/ledger/student/');
    expect(url).toContain('prefix=WS-U4L1-2');
    // Token must NOT be in the URL (leaks into logs); it goes in the header.
    expect(url).not.toContain('token=');
    expect(opts.headers.Authorization).toBe('Bearer session.token.abc');
  });

  it('dedupes by item_id (newest-first wins)', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');

    // Server returns rows newest-first; the first occurrence per item_id wins.
    mockFetch(win, {
      ok: true,
      rows: [
        { item_id: 'WS-U4L1-2-Q1', response: 'newest', score: 1, source: 'worksheet' },
        { item_id: 'WS-U4L1-2-Q1', response: 'older',  score: 0, source: 'worksheet' },
        { item_id: 'WS-U4L1-2-Q2', response: 'second', score: 1, source: 'worksheet' }
      ]
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(2);
    expect(out.get('WS-U4L1-2-Q1').response).toBe('newest');
    expect(out.get('WS-U4L1-2-Q2').response).toBe('second');
  });

  it('skips rows without item_id', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');

    mockFetch(win, {
      ok: true,
      rows: [
        { response: 'no-itemid', score: 1, source: 'worksheet' },                       // skipped
        { item_id: '',          response: 'empty-id', score: 1, source: 'worksheet' }, // skipped (falsy)
        { item_id: 'WS-U4L1-2-Q1', response: 'ok', score: 1, source: 'worksheet' }
      ]
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(1);
    expect(out.get('WS-U4L1-2-Q1').response).toBe('ok');
  });

  it('sends URL-encoded prefix in the query and the raw token in the Authorization header', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok+with/special=chars');

    const fetchFn = mockFetch(win, { ok: true, rows: [] });

    await gradebookClient.fetchPrior('WS-U4L1-2');

    const [url, opts] = fetchFn.mock.calls[0];
    // Prefix is URL-encoded in the query string.
    expect(url).toContain('prefix=WS-U4L1-2');
    // Token is carried in the Authorization header, verbatim — never the URL.
    expect(url).not.toContain('token=');
    expect(opts.headers.Authorization).toBe('Bearer tok+with/special=chars');
  });

  it('handles object responses (not just strings) in row.response', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');

    mockFetch(win, {
      ok: true,
      rows: [
        { item_id: 'WS-U4L1-2-FRQ1', response: { text: 'multi-line answer' }, score: 0.5, source: 'frq' }
      ]
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(1);
    expect(out.get('WS-U4L1-2-FRQ1').response).toEqual({ text: 'multi-line answer' });
    expect(out.get('WS-U4L1-2-FRQ1').source).toBe('frq');
  });
});

describe('gradebook-client.js — fetchPrior (source-level contract)', () => {
  it('source contains a fetchPrior function on window.gradebookClient', () => {
    expect(CLIENT_SRC).toContain('fetchPrior');
    expect(CLIENT_SRC).toContain('function (prefix)');
  });

  it('source does NOT modify record() (additive only)', () => {
    // The record path must still match the original signature pattern.
    expect(CLIENT_SRC).toContain('record: async function (opts)');
  });

  it('fetchPrior source NEVER calls record() or any write endpoint', () => {
    // Pull the fetchPrior function body and verify no writes.
    const start = CLIENT_SRC.indexOf('fetchPrior:');
    expect(start).toBeGreaterThan(0);
    // Everything from fetchPrior: to the closing `})();`
    const tail = CLIENT_SRC.slice(start);
    expect(tail).not.toContain('/ledger/record');
    expect(tail).not.toMatch(/method:\s*['"]POST['"]/);
  });
});
