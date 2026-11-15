// worksheet-load-requests.test.js — simplify plan WP2: fewer requests per load.
//  1. gradebook-client fetchPrior: callers on one page share ONE prior-ledger GET
//     (concurrent or within 10 s); a write, a successful send or an identity change
//     forces a fresh read; failures are never reused.
//  2. worksheet-diagnostics: a healthy load reports once per student+worksheet per
//     day; failures and mismatches always report.
//  3. Desk nudge poll: 2 min, skipped while the tab is hidden.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { deskSource, fnBody } from './helpers/desk-source.js';

const root = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(root, f), 'utf8');
const windows = [];
afterEach(() => { for (const w of windows.splice(0)) w.close(); vi.useRealTimers(); });

function makeClient() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://apstats-app.example.com' });
  const win = dom.window; windows.push(win);
  win.ROSTER_SERVICE_URL = 'https://mock-service.test';
  const ctx = createContext(win);
  runInContext(read('roster_config.js'), ctx);
  runInContext(read('roster-client.js'), ctx);
  runInContext(read('offline-queue.js'), ctx);
  runInContext(read('gradebook-client.js'), ctx);
  win.localStorage.setItem('apstats_roster.v1', JSON.stringify({
    studentId: 'uuid-test-student', username: 'test_user', token: 'tok', signedInAt: '2026-11-14T00:00:00.000Z'
  }));
  const gets = [];
  win.fetch = vi.fn(async (url, opts) => {
    if (!opts || !opts.method || opts.method === 'GET') {
      gets.push(String(url));
      return { ok: true, status: 200, json: async () => ({ ok: true, rows: [{ item_id: 'WS-U1L1-Q1', response: 'mean', score: 1, source: 'worksheet' }] }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, ledgerId: 'L1' }) };
  });
  return { win, gc: win.gradebookClient, gets };
}

describe('fetchPrior: one shared GET per worksheet load', () => {
  it('concurrent callers share one request and each gets its own Map', async () => {
    const { gc, gets } = makeClient();
    const [a, b, c] = await Promise.all([
      gc.fetchPrior('WS-U1L1', { restore: true }), gc.fetchPrior('WS-U1L1', { repair: true }), gc.fetchPrior('WS-U1L1'),
    ]);
    expect(gets).toHaveLength(1);
    expect(a.get('WS-U1L1-Q1').response).toBe('mean');
    expect(a).not.toBe(b); expect(b).not.toBe(c);
    a.get('WS-U1L1-Q1').response = 'mutated';
    expect(b.get('WS-U1L1-Q1').response).toBe('mean');
  });

  it('a later caller within 10 s reuses the success; after 10 s it reads again', async () => {
    vi.useFakeTimers();
    const { gc, gets } = makeClient();
    await gc.fetchPrior('WS-U1L1');
    await vi.advanceTimersByTimeAsync(400);
    await gc.fetchPrior('WS-U1L1');
    expect(gets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10000);
    await gc.fetchPrior('WS-U1L1');
    expect(gets).toHaveLength(2);
  });

  it('a different worksheet prefix is a different read', async () => {
    const { gc, gets } = makeClient();
    await gc.fetchPrior('WS-U1L1');
    await gc.fetchPrior('WS-U1L2');
    expect(gets).toHaveLength(2);
  });

  it('a save in between forces a fresh read (no stale prior after new work)', async () => {
    const { gc, gets } = makeClient();
    await gc.fetchPrior('WS-U1L1');
    await gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q2', response: 'median' });
    await gc.fetchPrior('WS-U1L1');
    expect(gets).toHaveLength(2);
  });

  it('an identity change forces a fresh read', async () => {
    const { win, gc, gets } = makeClient();
    await gc.fetchPrior('WS-U1L1');
    win.dispatchEvent(new win.CustomEvent('roster-session-changed'));
    await gc.fetchPrior('WS-U1L1');
    expect(gets).toHaveLength(2);
  });

  it('a failed read is never reused', async () => {
    const { win, gc } = makeClient();
    win.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const first = await gc.fetchPrior('WS-U1L1');
    expect(first.loadFailed).toBe(true);
    win.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, rows: [] }) }));
    const second = await gc.fetchPrior('WS-U1L1');
    expect(second.loadFailed).toBeUndefined();
    expect(win.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('worksheet-diagnostics gate', () => {
  function bootDiag() {
    const dom = new JSDOM('<body><input class="blank" data-question-id="WS-U1L1-Q1"></body>', { url: 'https://example.com/u1_lesson1_live.html', runScripts: 'outside-only' });
    const w = dom.window; windows.push(w);
    w.localStorage.setItem('apstats_roster.v1', JSON.stringify({ studentId: 'student-a', token: 'T' }));
    w.ROSTER_SERVICE_URL = 'https://roster.example.com';
    const reports = [];
    w.fetch = vi.fn(async (url, options) => { reports.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; });
    w.eval(read('roster-client.js')); w.eval(read('worksheet-diagnostics.js'));
    return { w, reports };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const loaded = (w) => { w.document.querySelector('input').value = 'mean'; return new Map([['WS-U1L1-Q1', { response: 'mean' }]]); };

  it('a healthy load is reported once per day for the same student and worksheet', async () => {
    const { w, reports } = bootDiag();
    const D = w.worksheetDiagnostics;
    D.finish(D.begin('WS-U1L1'), loaded(w)); await settle();
    D.finish(D.begin('WS-U1L1'), loaded(w)); await settle();
    expect(reports).toHaveLength(1);
    expect(reports[0].outcome).toBe('loaded');
    D.finish(D.begin('WS-U1L2'), new Map()); await settle();
    expect(reports).toHaveLength(2);
  });

  it('failures and mismatches are always reported', async () => {
    const { w, reports } = bootDiag();
    const D = w.worksheetDiagnostics;
    D.finish(D.begin('WS-U1L1'), loaded(w)); await settle();
    const failed = new Map(); failed.loadFailed = true; failed.loadOutcome = 'network';
    D.finish(D.begin('WS-U1L1'), failed); await settle();
    D.finish(D.begin('WS-U1L1'), failed); await settle();
    w.document.querySelector('input').value = 'something else';
    D.finish(D.begin('WS-U1L1'), new Map([['WS-U1L1-Q1', { response: 'mean' }]])); await settle();
    expect(reports.map((r) => r.outcome)).toEqual(['loaded', 'network', 'network', 'loaded']);
    expect(reports[3].saved).toBe(1);
    expect(reports[3].matched).toBe(0);
  });
});

describe('Desk nudge poll', () => {
  it('polls every 2 minutes and skips hidden tabs; refocus still forces a poll', () => {
    const src = deskSource();
    expect(src).toMatch(/var STUDENT_NUDGE_POLL_MS = 120 \* 1000;/);
    const start = fnBody('_startStudentNudgePolling');
    expect(start).toMatch(/document\.hidden\) return;/);
    expect(start.indexOf('document.hidden')).toBeLessThan(start.indexOf('_pollStudentNudgeHistory(false)'));
    expect(src).toMatch(/if \(!document\.hidden\) _pollStudentNudgeHistory\(true\)/);
  });
});
