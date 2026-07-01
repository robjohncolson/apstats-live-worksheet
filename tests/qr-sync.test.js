// qr-sync.test.js — the QR DUMP transport (ANDROID_PHASE6_QR_SYNC_SPEC §3.1/§4).
// Drives the REAL fountain codec + REAL LedgerGossip.ingest over a frame list (the
// "movie"), proving: a shown ledger reaches the scanner and ingests; forged rows are
// rejected on ingest (binding verify); the wire format round-trips; the verify-budget
// cap holds; and two interleaved movies decode independently.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function load() {
  const win = {};
  const ctx = createContext({
    window: win, globalThis: win,
    Math, Uint8Array, Array, Object, String, Number, isFinite, JSON, Promise,
    TextEncoder, TextDecoder, atob, btoa, Buffer, console,
  });
  for (const f of ['ledger-gossip.js', 'qr-fountain.js', 'qr-sync.js']) {
    runInContext(readFileSync(resolve(repo, f), 'utf8'), ctx);
  }
  return { QS: win.QrSync, LG: win.LedgerGossip };
}
const { QS } = load();

// A 'good.*' compact stands in for a signed+bound row; 'bad.*' is a forgery. The real
// signature binding is covered by receipt-verify-binding.test.js.
const verify = (row) => Promise.resolve(/^good\./.test((row && row.receipt_compact) || ''));
function memStore(rows = []) {
  const map = new Map();
  rows.forEach((r) => map.set(String(r.receipt_id), r));
  return {
    put: (r) => { map.set(String(r.receipt_id), r); return Promise.resolve(); },
    all: () => Promise.resolve(Array.from(map.values())),
    ids: () => Array.from(map.keys()).sort(),
  };
}
function signed(id, compact) {
  return { receipt_id: 'r' + id, receipt_compact: (compact || 'good.') + id, source: 'frq', item_id: 'WS-U1L1-Q' + id, score: 1, student_id: 'stu-1' };
}

async function runMovie(show, scan, { drop = 0, wire = false, maxSeq = 8000 } = {}) {
  for (let seq = 0; seq < maxSeq; seq++) {
    if (drop > 1 && seq % drop === 0) continue;
    let f = show.frameAt(seq);
    if (wire) f = QS.parse(QS.serialize(f));
    const st = await scan.frame(f);
    if (st.done) return st;
  }
  return { done: false };
}

describe('QrSync.buildDump', () => {
  it('ships only signed rows and is content-addressed', () => {
    const d = QS.buildDump([signed(1), { item_id: 'x', source: 'frq' }, signed(2)]);
    expect(d.count).toBe(2);                       // the unsigned row is dropped
    expect(d.sid).toMatch(/^[0-9a-f]{8}$/);
    expect(QS.buildDump([signed(1), signed(2)]).sid).toBe(d.sid); // deterministic
  });
});

describe('QrSync.serialize/parse — the wire form', () => {
  it('round-trips a frame through the "Q1|dump|…" string', () => {
    const f = QS.makeShow([signed(1), signed(2)]).frameAt(3);
    const back = QS.parse(QS.serialize(f));
    expect(back.sid).toBe(f.sid);
    expect(back.seed).toBe(f.seed);
    expect(Array.from(back.data)).toEqual(Array.from(f.data));
  });
  it('rejects junk / non-frames', () => {
    expect(QS.parse('hello')).toBeNull();
    expect(QS.parse('Q1|dump|a|b|c')).toBeNull();
  });
});

describe('QrSync — a shown ledger reaches the scanner', () => {
  it('ingests every signed row (even with 1-in-3 frames dropped)', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => signed(i));
    const show = QS.makeShow(rows, { symbolSize: 96 });
    const store = memStore();
    const scan = QS.makeScan({ verify, store });
    const st = await runMovie(show, scan, { drop: 3 });
    expect(st.done).toBe(true);
    expect(st.received).toBe(25);
    expect(store.ids().length).toBe(25);
  });

  it('round-trips through the actual QR wire string', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => signed(i));
    const store = memStore();
    const st = await runMovie(QS.makeShow(rows, { symbolSize: 128 }), QS.makeScan({ verify, store }), { wire: true });
    expect(st.done).toBe(true);
    expect(store.ids().length).toBe(12);
  });
});

describe('QrSync — forged rows are rejected on scan (binding verify)', () => {
  it('drops a re-stapled forgery, keeps the genuine rows', async () => {
    const rows = [signed(1), signed(2, 'bad.'), signed(3)]; // r2 is forged
    const store = memStore();
    const st = await runMovie(QS.makeShow(rows, { symbolSize: 128 }), QS.makeScan({ verify, store }));
    expect(st.done).toBe(true);
    expect(st.received).toBe(2);
    expect(st.rejected).toBe(1);
    expect(store.ids()).toEqual(['r1', 'r3']);   // forged r2 never stored
  });
});

describe('QrSync — verify-budget cap', () => {
  it('ingests at most maxRows per scan', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => signed(i));
    const store = memStore();
    const st = await runMovie(QS.makeShow(rows, { symbolSize: 128 }), QS.makeScan({ verify, store, maxRows: 10 }));
    expect(st.done).toBe(true);
    expect(st.capped).toBe(true);
    expect(st.received).toBe(10);
    expect(store.ids().length).toBe(10);
  });
});

describe('QrSync — a completed movie is not re-ingested', () => {
  it('reports {already:true} when replayed', async () => {
    const rows = [signed(1), signed(2)];
    const store = memStore();
    const scan = QS.makeScan({ verify, store });
    const show = QS.makeShow(rows, { symbolSize: 256 });
    await runMovie(show, scan);
    const replay = await scan.frame(show.frameAt(0));
    expect(replay.already).toBe(true);
    expect(store.ids().length).toBe(2);
  });
});

describe('QrSync — hostile frame hardening (adversarial review)', () => {
  it('parse rejects out-of-bounds / non-integer k/len/s', () => {
    // huge len → would allocate GBs; negative/fractional k → would crash; len>k*s.
    expect(QS.parse('Q1|dump|dead|1|1500000000|1|0|AQID')).toBeNull();
    expect(QS.parse('Q1|dump|dead|-5|10|8|0|AAAAAAAAAAA=')).toBeNull();
    expect(QS.parse('Q1|dump|dead|2.5|10|8|0|AAAAAAAAAAA=')).toBeNull();
    expect(QS.parse('Q1|dump|dead|2|10000|8|0|AAAAAAAAAAA=')).toBeNull(); // len > k*s
  });

  it('frame() ignores a malicious huge-k frame without allocating a decoder', async () => {
    const scan = QS.makeScan({ verify, store: memStore() });
    const st = await scan.frame({ t: 'dump', sid: 'evil', k: 1e9, len: 100, s: 100, seed: 0, data: new Uint8Array(100) });
    expect(st.ignored).toBe(true);
  });

  it('frame() ignores a symbol whose data length ≠ s', async () => {
    const scan = QS.makeScan({ verify, store: memStore() });
    const st = await scan.frame({ t: 'dump', sid: 'x', k: 2, len: 10, s: 8, seed: 0, data: new Uint8Array(64) });
    expect(st.ignored).toBe(true);
  });

  it('makeScan throws without a verify function (fails closed)', () => {
    expect(() => QS.makeScan({ store: memStore() })).toThrow();
  });

  it('drops a foreign same-sid frame (mismatched k/len/s) instead of poisoning the decoder', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => signed(i));
    const show = QS.makeShow(rows, { symbolSize: 96 });
    const store = memStore();
    const scan = QS.makeScan({ verify, store });
    // First establish the real session, then inject a poison frame with the same sid but different k.
    await scan.frame(show.frameAt(0));
    const poison = await scan.frame({ t: 'dump', sid: show.sid, k: show.k + 1, len: show.len, s: show.symbolSize, seed: 1, data: new Uint8Array(show.symbolSize) });
    expect(poison.ignored).toBe(true);
    const st = await runMovie(show, scan);       // the real movie still completes cleanly
    expect(st.done).toBe(true);
    expect(store.ids().length).toBe(6);
  });

  it('collecting more movies than maxSessions works when they complete sequentially', async () => {
    const store = memStore();
    const scan = QS.makeScan({ verify, store, maxSessions: 4 });
    for (let m = 0; m < 6; m++) {                 // 6 students, cap 4 → must not wedge
      const show = QS.makeShow([signed(m * 10), signed(m * 10 + 1)], { symbolSize: 256 });
      const st = await runMovie(show, scan);
      expect(st.done).toBe(true);
    }
    expect(store.ids().length).toBe(12);
  });
});

describe('QrSync — two interleaved movies decode independently', () => {
  it('keeps sessions partitioned by sid', async () => {
    const showA = QS.makeShow([signed(1), signed(2)], { symbolSize: 256 });
    const showB = QS.makeShow([signed(3), signed(4), signed(5)], { symbolSize: 256 });
    expect(showA.sid).not.toBe(showB.sid);
    const store = memStore();
    const scan = QS.makeScan({ verify, store });
    let doneA = false, doneB = false;
    for (let seq = 0; seq < 4000 && !(doneA && doneB); seq++) {
      const a = await scan.frame(showA.frameAt(seq)); if (a.done) doneA = true;
      const b = await scan.frame(showB.frameAt(seq)); if (b.done) doneB = true;
    }
    expect(doneA && doneB).toBe(true);
    expect(store.ids()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
  });
});
