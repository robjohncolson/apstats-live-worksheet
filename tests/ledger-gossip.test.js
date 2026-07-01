/**
 * Tests for ledger-gossip.js (ANDROID_PHASE3_GOSSIP_SPEC).
 * The gossip engine is transport-agnostic: these wire sessions over an in-memory
 * message bus (the MockTransport role) and prove convergence + the verify-on-ingest
 * security boundary with zero native code.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'ledger-gossip.js'), 'utf8');

function loadFresh() {
  const win = {};
  const ctx = createContext({ window: win, globalThis: win, Promise, JSON });
  runInContext(SRC, ctx);
  return win.LedgerGossip;
}

const LG = loadFresh();

// A signed row. receipt_compact 'good.*' verifies; 'bad.*' is treated as tampered.
function signed(id, compact = 'good.' + id) {
  return { item_id: 'WS-U1L1-Q' + id, source: 'worksheet', score: 1, receipt_id: id, receipt_compact: compact };
}

function memStore(rows = []) {
  const map = new Map();
  rows.forEach((r) => map.set(String(r.receipt_id), r));
  return {
    all: () => Promise.resolve(Array.from(map.values())),
    put: (r) => { map.set(String(r.receipt_id), r); return Promise.resolve(); },
    ids: () => Array.from(map.keys()).sort(),
  };
}

const verify = (row) => Promise.resolve(/^good\./.test(row && row.receipt_compact));

// One full anti-entropy exchange between two stores over an in-memory bus.
async function runPair(storeA, storeB) {
  const bus = [];
  const sessA = LG.createSession({ getRows: storeA.all, verify, store: storeA, send: (m) => bus.push(['B', m]) });
  const sessB = LG.createSession({ getRows: storeB.all, verify, store: storeB, send: (m) => bus.push(['A', m]) });
  const target = { A: sessA, B: sessB };
  await sessA.initiate();
  while (bus.length) {
    const [to, msg] = bus.shift();
    await target[to].handle(msg);
  }
  await Promise.all([sessA.done, sessB.done]);
}

describe('LedgerGossip pure helpers', () => {
  it('digest lists unique receipt_ids', () => {
    expect(LG.digest([signed('a'), signed('b'), signed('a')]).ids.sort()).toEqual(['a', 'b']);
  });
  it('digest skips rows with no receipt_id (un-addressable, never gossiped)', () => {
    expect(LG.digest([{ item_id: 'X', source: 'worksheet' }]).ids).toEqual([]);
  });
  it('diff returns wantIds not in haveIds', () => {
    expect(LG.diff(['a', 'b'], ['b', 'c', 'd']).sort()).toEqual(['c', 'd']);
  });
  it('rowsFor selects rows by id', () => {
    expect(LG.rowsFor([signed('a'), signed('b')], ['b']).map((r) => r.receipt_id)).toEqual(['b']);
  });
  it('frame/parse round-trips; parse rejects junk', () => {
    const f = LG.frame('hello', { x: 1 });
    expect(LG.parse(f)).toEqual({ type: 'hello', payload: { x: 1 } });
    expect(LG.parse('not json')).toBeNull();
    expect(LG.parse('{"no":"type"}')).toBeNull();
  });
});

describe('LedgerGossip.ingest — verify-on-ingest', () => {
  it('stores verified rows, rejects tampered ones', async () => {
    const store = memStore();
    const res = await LG.ingest([signed('a'), signed('b', 'bad.b')], { verify, store });
    expect(res.accepted).toBe(1);
    expect(res.rejected).toBe(1);
    expect(store.ids()).toEqual(['a']);
  });
  it('is idempotent (re-ingesting the same row keeps one copy)', async () => {
    const store = memStore();
    await LG.ingest([signed('a')], { verify, store });
    await LG.ingest([signed('a')], { verify, store });
    expect(store.ids()).toEqual(['a']);
  });
});

describe('LedgerGossip — two-peer convergence', () => {
  it('both peers converge to the union', async () => {
    const A = memStore([signed('r1'), signed('r2')]);
    const B = memStore([signed('r2'), signed('r3')]);
    await runPair(A, B);
    expect(A.ids()).toEqual(['r1', 'r2', 'r3']);
    expect(B.ids()).toEqual(['r1', 'r2', 'r3']);
  });

  it('a tampered row never propagates to the peer', async () => {
    const A = memStore([signed('r1'), signed('evil', 'bad.evil')]);
    const B = memStore([]);
    await runPair(A, B);
    expect(B.ids()).toEqual(['r1']);        // forged row refused on ingest
    expect(B.ids()).not.toContain('evil');
  });

  it('converges when one peer is empty', async () => {
    const A = memStore([signed('r1'), signed('r2')]);
    const B = memStore([]);
    await runPair(A, B);
    expect(B.ids()).toEqual(['r1', 'r2']);
    expect(A.ids()).toEqual(['r1', 'r2']);
  });
});

describe('LedgerGossip — epidemic multi-hop delivery', () => {
  it("a student's row reaches the teacher via a classmate (no direct contact)", async () => {
    const student = memStore([signed('s1')]); // never meets the teacher
    const classmate = memStore([]);
    const teacher = memStore([signed('t1')]);

    await runPair(student, classmate); // student ↔ classmate
    await runPair(classmate, teacher); // classmate ↔ teacher  (student & teacher never pair)

    expect(teacher.ids()).toContain('s1'); // arrived transitively
    expect(classmate.ids().sort()).toEqual(['s1', 't1']);
  });
});

describe('LedgerGossip.runRound — drives a round over a transport', () => {
  it('gossips with a discovered peer and reports received', async () => {
    const myStore = memStore([signed('m1')]);
    const peerStore = memStore([signed('p1')]);
    let handlers = null;
    const peerSess = LG.createSession({ getRows: peerStore.all, verify, store: peerStore, send: (m) => { if (handlers) handlers.onMessage('peerB', m); } });
    const transport = {
      start(h) { handlers = h; Promise.resolve().then(() => h.onPeer('peerB')); },
      send(peerId, msg) { peerSess.handle(msg); },
      stop() {},
    };
    const res = await LG.runRound(transport, { getRows: myStore.all, verify, store: myStore, durationMs: 0, setTimeout: (fn) => setTimeout(fn, 40) });
    expect(res).toMatchObject({ available: true, peers: 1, received: 1 });
    expect(myStore.ids()).toEqual(['m1', 'p1']);
    expect(peerStore.ids()).toEqual(['m1', 'p1']);
  });

  it('returns {available:false} with no transport', async () => {
    expect(await LG.runRound(null, {})).toEqual({ available: false });
  });
});
