// gradebook-client-write-first.test.js — simplify plan SH-1: a worksheet answer is
// written to the IndexedDB outbox BEFORE its POST. Same request count, same body,
// same success result; the row is deleted when the POST lands. The golden test runs
// one scripted session with write-first on and off and requires identical requests
// and identical server rows.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(root, f), 'utf8');
const windows = [];
afterEach(() => { for (const w of windows.splice(0)) w.close(); vi.useRealTimers(); });

function makeWindow({ queue = true } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://apstats-app.example.com' });
  const win = dom.window; windows.push(win);
  win.ROSTER_SERVICE_URL = 'https://mock-service.test';
  const ctx = createContext(win);
  runInContext(read('roster_config.js'), ctx);
  runInContext(read('roster-client.js'), ctx);
  if (queue) runInContext(read('offline-queue.js'), ctx);
  runInContext(read('gradebook-client.js'), ctx);
  win.localStorage.setItem('apstats_roster.v1', JSON.stringify({
    studentId: 'uuid-test-student', username: 'test_user', token: 'tok', signedInAt: '2026-11-14T00:00:00.000Z'
  }));
  return { win, gc: win.gradebookClient, Q: win.OfflineQueue };
}
const okResponse = (ledgerId = 'L1') => ({ ok: true, status: 200, json: async () => ({ ok: true, ledgerId }) });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('SH-1 write-first', () => {
  it('the row is on disk while the POST is out, and gone once it lands; result unchanged', async () => {
    const { win, gc, Q } = makeWindow();
    let finish;
    win.fetch = vi.fn(() => new Promise((r) => { finish = r; }));
    const call = gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'mean' });
    await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledTimes(1));
    const during = await Q.all();
    expect(during).toHaveLength(1);
    expect(during[0]).toMatchObject({ itemId: 'WS-U1L1-Q1', response: 'mean', studentId: 'uuid-test-student' });
    finish(okResponse());
    expect(await call).toEqual({ ok: true, ledgerId: 'L1', receipt: null });
    expect(await Q.all()).toHaveLength(0);
  });

  it('a drain during the flight does not send the row a second time or fire gb-row-saved', async () => {
    const { win, gc } = makeWindow();
    let finish;
    win.fetch = vi.fn(() => new Promise((r) => { finish = r; }));
    const saved = vi.fn();
    win.addEventListener('gb-row-saved', saved);
    const call = gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'mean' });
    await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledTimes(1));
    const drain = await gc.syncOfflineQueue();
    expect(drain.sent).toBe(0);
    finish(okResponse());
    await call;
    await tick(); await tick();
    expect(win.fetch).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
  });

  it('a network failure keeps exactly one row and reports queued (one store, no second write)', async () => {
    const { win, gc, Q } = makeWindow();
    const enqueue = vi.spyOn(Q, 'enqueue');
    win.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q2', response: 'median' });
    expect(result).toEqual({ ok: false, reason: 'network', queued: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const rows = await Q.all();
    expect(rows).toHaveLength(1);
    expect(rows[0].response).toBe('median');
  });

  it('the queued row is sent by the drain once the network is back', async () => {
    const { win, gc, Q } = makeWindow();
    win.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    await gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q2', response: 'median' });
    win.fetch = vi.fn(async () => okResponse());
    const drain = await gc.syncOfflineQueue();
    expect(drain.sent).toBe(1);
    expect(JSON.parse(win.fetch.mock.calls[0][1].body)).toMatchObject({ itemId: 'WS-U1L1-Q2', response: 'median' });
    expect(await Q.all()).toHaveLength(0);
  });

  it('a hung IndexedDB never delays the POST by more than the 250 ms cap', async () => {
    vi.useFakeTimers();
    const { win, gc } = makeWindow({ queue: false });
    win.OfflineQueue = {
      enqueue: () => new Promise(() => {}),
      supersede: async () => false,
      all: async () => [],
      keyOf: (r) => r.source + '|' + r.itemId + '|' + (r.attempt || 1),
      drain: async () => ({ sent: 0, failed: 0 }),
    };
    win.fetch = vi.fn(async () => okResponse());
    const call = gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q3', response: 'x' });
    await vi.advanceTimersByTimeAsync(100);
    expect(win.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(win.fetch).toHaveBeenCalledTimes(1);
    // The success path then waits at most 2 s for the hung pre-write before its
    // delete; record() still resolves (late), the POST was never held back.
    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
    expect((await call).ok).toBe(true);
  });

  it('shared device: another student\'s unsent row under the same key is not overwritten', async () => {
    const { win, gc, Q } = makeWindow();
    await Q.enqueue({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'theirs', studentId: 'other-student', transportSequence: 1 });
    let finish;
    win.fetch = vi.fn(() => new Promise((r) => { finish = r; }));
    const call = gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'mine' });
    await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledTimes(1));
    const rows = await Q.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ response: 'theirs', studentId: 'other-student' });
    finish(okResponse());
    await call;
  });

  it.each([
    ['an FRQ grade request', { source: 'frq', itemId: 'WS-U1L1-reflect1', response: 'long text', requestGrade: true }],
    ['a quiz row', { source: 'curriculum_quiz', itemId: 'U1-L2-Q01', response: 'B' }],
    ['a Desk Done row', { source: 'worksheet', itemId: 'DESK_DONE-1.1', response: 'done' }],
    ['an object response', { source: 'worksheet', itemId: 'WS-U1L1-Q4', response: { a: 1 } }],
  ])('%s is not pre-written', async (_label, opts) => {
    const { win, gc, Q } = makeWindow();
    let finish;
    win.fetch = vi.fn(() => new Promise((r) => { finish = r; }));
    const call = gc.record(opts);
    await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledTimes(1));
    expect(await Q.all()).toHaveLength(0);
    finish(okResponse());
    await call;
  });
});

describe('SH-1 golden session: write-first on and off produce the same requests and rows', () => {
  async function runSession(writeFirst) {
    const { win, gc, Q } = makeWindow();
    win.__GB_WRITE_FIRST__ = writeFirst;
    const posts = [];
    const server = new Map();
    let offline = false;
    win.fetch = vi.fn(async (url, opts) => {
      if (offline) throw new Error('offline');
      const body = JSON.parse(opts.body);
      posts.push({ itemId: body.itemId, response: body.response, source: body.source });
      server.set(body.source + '|' + body.itemId + '|' + (body.attempt || 1), body.response);   // upsert, last write wins
      return okResponse('L' + posts.length);
    });
    const results = [];
    results.push(await gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'mean' }));
    results.push(await gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'median' }));
    results.push(await gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q2', response: 'IQR' }));
    offline = true;
    results.push(await gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q3', response: 'skewed' }));
    offline = false;
    results.push(await gc.syncOfflineQueue());
    await tick(); await tick();
    return { posts, server: [...server.entries()].sort(), results, left: await Q.all() };
  }

  it('identical POSTs, identical results, identical server rows, empty outbox', async () => {
    const off = await runSession(false);
    const on = await runSession(true);
    expect(on.posts).toEqual(off.posts);
    expect(on.results).toEqual(off.results);
    expect(on.server).toEqual(off.server);
    expect(on.left).toHaveLength(0);
    expect(off.left).toHaveLength(0);
    expect(on.server).toEqual([
      ['worksheet|WS-U1L1-Q1|1', 'median'], ['worksheet|WS-U1L1-Q2|1', 'IQR'], ['worksheet|WS-U1L1-Q3|1', 'skewed'],
    ]);
  });
});

describe('SH-1 ordering: a pre-write slower than the POST leaves no orphan row', () => {
  it('the delete waits for the late pre-write, so the outbox ends empty', async () => {
    const { win, gc, Q } = makeWindow();
    const realEnqueue = Q.enqueue.bind(Q);
    Q.enqueue = (row) => new Promise((resolve) => setTimeout(() => resolve(realEnqueue(row)), 400));
    win.fetch = vi.fn(async () => okResponse());
    const result = await gc.record({ source: 'worksheet', itemId: 'WS-U1L1-Q9', response: 'late' });
    expect(result.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 500));
    expect(await Q.all()).toHaveLength(0);
    expect(win.fetch).toHaveBeenCalledTimes(1);
  });
});
