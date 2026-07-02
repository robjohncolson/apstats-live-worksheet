// ledger-gossip-lanes.test.js — the mesh §0.6 lane changes to ledger-gossip.js:
// (1) frame/parse stay BYTE-IDENTICAL when no lane is set (grades back-compat),
// (2) a lane-scoped session ignores other lanes' frames,
// (3) runLanes converges both lanes over one transport, with verify-on-ingest
//     rejecting a submission offered to the grades lane and vice-versa.
// @vitest-environment node

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(repo, 'ledger-gossip.js'), 'utf8');

function load() {
  const win = {};
  const ctx = createContext({ window: win, globalThis: win, self: win, Promise, JSON, Array, Object, String, console, setTimeout });
  runInContext(SRC, ctx);
  return win.LedgerGossip;
}

// An in-memory store for a lane.
function memStore(initial = []) {
  const map = new Map();
  initial.forEach((r) => map.set(r.receipt_id, r));
  return {
    all: () => Promise.resolve(Array.from(map.values())),
    put: (r) => { map.set(r.receipt_id, r); return Promise.resolve(); },
    ids: () => Array.from(map.keys()).sort(),
  };
}

// A mock transport wiring TWO peers' onMessage to each other, driving to quiescence.
function pairTransport() {
  const handlers = {}; // peerId -> onMessage of the OTHER side
  const buses = {};
  function make(selfId, otherId) {
    return {
      start(h) { handlers[selfId] = h; buses[selfId] = h; },
      send(peerId, msg) {
        // deliver to the other side's handler asynchronously
        Promise.resolve().then(() => { if (buses[otherId]) buses[otherId].onMessage(selfId, msg); });
      },
      stop() {},
      _firePeer(id) { if (buses[selfId]) buses[selfId].onPeer(id); },
    };
  }
  return { a: make('A', 'B'), b: make('B', 'A') };
}

describe('frame/parse — lane back-compat', () => {
  let G;
  beforeEach(() => { G = load(); });

  it('a lane-less frame is byte-identical to the pre-mesh {t,p} shape', () => {
    expect(G.frame('hello', { x: 1 })).toBe(JSON.stringify({ t: 'hello', p: { x: 1 } }));
    const m = G.parse(G.frame('hello', { x: 1 }));
    expect(m).toEqual({ type: 'hello', payload: { x: 1 }, lane: null });
  });

  it('a lane tag rides only when set', () => {
    expect(G.frame('sync', { a: 1 }, 'subs')).toBe(JSON.stringify({ t: 'sync', p: { a: 1 }, lane: 'subs' }));
    expect(G.parse(G.frame('sync', {}, 'subs')).lane).toBe('subs');
  });
});

describe('createSession — lane isolation', () => {
  let G;
  beforeEach(() => { G = load(); });

  it('a lane-scoped session ignores a frame of a different lane', async () => {
    const store = memStore();
    let ingested = 0;
    const sess = G.createSession({
      lane: 'subs',
      getRows: () => Promise.resolve([]),
      verify: () => { ingested += 1; return Promise.resolve(true); },
      store,
      send: () => {},
    });
    // A grades-lane SEND must be ignored by a subs session.
    await sess.handle(G.frame('send', { rows: [{ receipt_id: 'r1', receipt_compact: 'x.y' }] }, 'grades'));
    expect(ingested).toBe(0);
    // Its own lane is processed.
    await sess.handle(G.frame('send', { rows: [{ receipt_id: 'r1', receipt_compact: 'x.y' }] }, 'subs'));
    expect(ingested).toBe(1);
  });

  it('a lane-less session (legacy grades) still accepts everything', async () => {
    let ingested = 0;
    const sess = G.createSession({ getRows: () => Promise.resolve([]), verify: () => { ingested += 1; return Promise.resolve(true); }, store: memStore(), send: () => {} });
    await sess.handle(G.frame('send', { rows: [{ receipt_id: 'r1' }] }));       // no lane
    await sess.handle(G.frame('send', { rows: [{ receipt_id: 'r2' }] }, 'subs')); // tagged
    expect(ingested).toBe(2);
  });
});

describe('runLanes — two lanes converge over one transport', () => {
  let G;
  beforeEach(() => { G = load(); });

  it('grades + subs each converge, and a row only lands in its own lane', async () => {
    // A has a grade g1 and a submission s1; B has grade g2 and submission s2.
    const aGrades = memStore([{ receipt_id: 'g1', kind: 'grade' }]);
    const aSubs = memStore([{ receipt_id: 's1', kind: 'sub' }]);
    const bGrades = memStore([{ receipt_id: 'g2', kind: 'grade' }]);
    const bSubs = memStore([{ receipt_id: 's2', kind: 'sub' }]);
    // Lane verifiers: grades lane accepts only kind:'grade', subs only kind:'sub'
    // (stand-in for verifyLedgerRow's t:'ledger' vs verifySubmissionRow's t:'submission').
    const gradesVerify = (r) => Promise.resolve(r.kind === 'grade');
    const subsVerify = (r) => Promise.resolve(r.kind === 'sub');

    const t = pairTransport();
    let done;
    const timers = [];
    const fakeTimer = (fn) => { timers.push(fn); };

    const runA = G.runLanes(t.a, {
      lanes: [
        { lane: 'grades', getRows: aGrades.all, verify: gradesVerify, store: aGrades },
        { lane: 'subs', getRows: aSubs.all, verify: subsVerify, store: aSubs },
      ],
      setTimeout: fakeTimer, durationMs: 10,
    });
    const runB = G.runLanes(t.b, {
      lanes: [
        { lane: 'grades', getRows: bGrades.all, verify: gradesVerify, store: bGrades },
        { lane: 'subs', getRows: bSubs.all, verify: subsVerify, store: bSubs },
      ],
      setTimeout: fakeTimer, durationMs: 10,
    });

    // Discover each other.
    t.a._firePeer && t.a._firePeer('B');
    t.b._firePeer && t.b._firePeer('A');
    // Let the async message bus drain.
    for (let i = 0; i < 30; i++) await Promise.resolve();
    // Fire the round timers to resolve.
    timers.forEach((fn) => fn());
    await runA; await runB;

    expect(aGrades.ids()).toEqual(['g1', 'g2']);
    expect(bGrades.ids()).toEqual(['g1', 'g2']);
    expect(aSubs.ids()).toEqual(['s1', 's2']);
    expect(bSubs.ids()).toEqual(['s1', 's2']);
    // No cross-lane leakage: a submission never entered a grades store.
    expect(aGrades.ids()).not.toContain('s2');
    expect(aSubs.ids()).not.toContain('g2');
  });

  it('returns {available:false} without lanes or transport', async () => {
    expect((await G.runLanes(null, { lanes: [{ lane: 'x', getRows: () => Promise.resolve([]), verify: () => Promise.resolve(true), store: memStore() }] })).available).toBe(false);
    expect((await G.runLanes({ start: () => {}, send: () => {}, stop: () => {} }, { lanes: [] })).available).toBe(false);
  });
});
