/**
 * Tests for the Desk Phase 3 gossip orchestration (_phase3SyncNearby).
 * Drives the REAL ledger-gossip engine through the Desk function over a mock
 * GossipTransport wired to a real peer session — proving the Desk actually gossips,
 * verifies, and ingests received rows. The native transport is validated by the
 * gradle build, not here.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

// Real gossip engine.
function loadGossip() {
  const win = {};
  runInContext(readFileSync(resolve(repo, 'ledger-gossip.js'), 'utf8'),
    createContext({ window: win, globalThis: win, Promise, JSON }));
  return win.LedgerGossip;
}
const LG = loadGossip();

function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const FNS = ['_phase2InputsKey', '_phase3GossipReady', '_phase3VerifyRow', '_phase3SyncNearby']
  .map((n) => fnBody(DESK, n)).join('\n');

function signed(id) {
  return { item_id: 'WS-U1L1-Q' + id, source: 'worksheet', score: 1, receipt_id: id, receipt_compact: 'good.' + id };
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
const ReceiptVerify = { verifyReceipt: (c) => Promise.resolve({ ok: /^good\./.test(c) }) };

// A transport that connects the Desk to ONE real peer session backed by peerStore.
function mockTransport(peerStore) {
  let handlers = null;
  const peerSession = LG.createSession({
    getRows: peerStore.all,
    verify: (row) => ReceiptVerify.verifyReceipt(row.receipt_compact).then((r) => !!(r && r.ok)),
    store: peerStore,
    send: (m) => { if (handlers && handlers.onMessage) handlers.onMessage('peerB', m); },
  });
  return {
    kind: 'mock',
    start(h) { handlers = h; Promise.resolve().then(() => h.onPeer && h.onPeer('peerB')); return Promise.resolve(); },
    send(peerId, msg) { peerSession.handle(msg); return Promise.resolve(); },
    stop() { return Promise.resolve(); },
  };
}

function harness({ myStore, transport, vasContext = null }) {
  const rosterClient = { studentId: () => 'stu-1' };
  const window = { rosterClient, GossipTransport: transport, LedgerGossip: LG, LedgerStore: myStore, ReceiptVerify };
  const _viewAsContext = () => vasContext;
  const run = new Function(
    'window', '_viewAsContext', 'rosterClient', 'GossipTransport', 'LedgerGossip', 'LedgerStore', 'ReceiptVerify', 'setTimeout', 'Promise',
    FNS + '\nreturn { _phase3GossipReady, _phase3SyncNearby };'
  );
  return run(window, _viewAsContext, rosterClient, transport, LG, myStore, ReceiptVerify, setTimeout, Promise);
}

describe('_phase3GossipReady', () => {
  it('false when no transport', () => {
    const H = harness({ myStore: memStore(), transport: undefined });
    expect(H._phase3GossipReady()).toBe(false);
  });
  it('false in view-as', () => {
    const H = harness({ myStore: memStore(), transport: mockTransport(memStore()), vasContext: { studentId: 'x' } });
    expect(H._phase3GossipReady()).toBe(false);
  });
  it('true with a transport + not view-as', () => {
    const H = harness({ myStore: memStore(), transport: mockTransport(memStore()) });
    expect(H._phase3GossipReady()).toBe(true);
  });
});

describe('_phase3SyncNearby', () => {
  it('returns {available:false} when not ready', async () => {
    const H = harness({ myStore: memStore(), transport: undefined });
    expect(await H._phase3SyncNearby({ durationMs: 10 })).toEqual({ available: false });
  });

  it('gossips with a peer: both converge, received counted', async () => {
    const myStore = memStore([signed('m1')]);
    const peerStore = memStore([signed('p1')]);
    const H = harness({ myStore, transport: mockTransport(peerStore) });
    const res = await H._phase3SyncNearby({ durationMs: 60 });
    expect(res.available).toBe(true);
    expect(res.peers).toBe(1);
    expect(res.received).toBe(1);                 // received p1
    expect(myStore.ids()).toEqual(['m1', 'p1']);   // Desk converged
    expect(peerStore.ids()).toEqual(['m1', 'p1']); // peer converged
  });
});
