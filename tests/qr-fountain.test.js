// qr-fountain.test.js — the LT fountain codec (ANDROID_PHASE6_QR_SYNC_SPEC §3.3).
// Pure, no camera: proves the codec round-trips a payload, tolerates dropped and
// reordered frames, and does NOT falsely "complete" on a partial stream.
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
  runInContext(readFileSync(resolve(repo, 'qr-fountain.js'), 'utf8'),
    createContext({ window: win, globalThis: win, Math, Uint8Array, Array, Object, isFinite }));
  return win.QrFountain;
}
const F = load();

function bytesOf(n, seed = 1) {
  const r = F._mulberry32(seed);
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.floor(r() * 256);
  return a;
}
function eq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
// Stream encoder→decoder; `drop` skips every Nth seed (0 = none). Returns symbols used.
function transfer(bytes, { symbolSize = 64, drop = 0, maxSeq = 20000 } = {}) {
  const enc = F.makeEncoder(bytes, { symbolSize });
  const dec = F.makeDecoder(enc.k, enc.len, enc.symbolSize);
  let used = 0;
  for (let seq = 0; seq < maxSeq; seq++) {
    if (drop > 1 && seq % drop === 0) continue;
    const sym = enc.symbolAt(seq);
    used += 1;
    if (dec.add(sym.seed, sym.data)) break;
  }
  return { ok: dec.complete(), used, k: enc.k, result: dec.result() };
}

describe('QrFountain — round-trip across sizes', () => {
  for (const k of [1, 2, 5, 20, 70]) {
    it(`recovers a ~${k}-block payload exactly`, () => {
      const bytes = bytesOf(k * 64 - 7 > 0 ? k * 64 - 7 : 5, 100 + k); // ragged last block
      const t = transfer(bytes, { symbolSize: 64 });
      expect(t.ok).toBe(true);
      expect(t.k).toBe(Math.max(1, Math.ceil(bytes.length / 64)));
      expect(eq(t.result, bytes)).toBe(true);
    });
  }

  it('overhead stays modest (used ≤ 2×k for a 70-block payload)', () => {
    const bytes = bytesOf(70 * 64, 9);
    const t = transfer(bytes, { symbolSize: 64 });
    expect(t.ok).toBe(true);
    expect(t.used).toBeLessThanOrEqual(2 * t.k);
  });
});

describe('QrFountain — drop tolerance', () => {
  it('still decodes when every 3rd frame is dropped', () => {
    const bytes = bytesOf(40 * 64 - 3, 11);
    const t = transfer(bytes, { symbolSize: 64, drop: 3 });
    expect(t.ok).toBe(true);
    expect(eq(t.result, bytes)).toBe(true);
  });
});

describe('QrFountain — order independence', () => {
  it('decodes frames delivered in reverse', () => {
    const bytes = bytesOf(20 * 64 - 10, 7);
    const enc = F.makeEncoder(bytes, { symbolSize: 64 });
    const dec = F.makeDecoder(enc.k, enc.len, enc.symbolSize);
    const syms = [];
    for (let seq = 0; seq < enc.k * 3; seq++) syms.push(enc.symbolAt(seq));
    syms.reverse();
    let ok = false;
    for (const s of syms) if (dec.add(s.seed, s.data)) { ok = true; break; }
    expect(ok).toBe(true);
    expect(eq(dec.result(), bytes)).toBe(true);
  });
});

describe('QrFountain — interruption is safe', () => {
  it('does not falsely complete on a partial stream (and result is null)', () => {
    const bytes = bytesOf(30 * 64, 5);
    const enc = F.makeEncoder(bytes, { symbolSize: 64 });
    const dec = F.makeDecoder(enc.k, enc.len, enc.symbolSize);
    // Feed only ~half of k symbols — cannot possibly have all blocks.
    for (let seq = 0; seq < Math.floor(enc.k / 2); seq++) {
      const s = enc.symbolAt(seq);
      dec.add(s.seed, s.data);
    }
    expect(dec.complete()).toBe(false);
    expect(dec.result()).toBeNull();
  });
});

describe('QrFountain — real JSON payload', () => {
  it('round-trips a UTF-8 JSON blob', () => {
    const obj = { rows: Array.from({ length: 30 }, (_, i) => ({ receipt_id: 'r' + i, item_id: 'WS-U1L1-Q' + i, source: 'frq', score: 1, receipt_compact: 'abc.' + i })) };
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    const t = transfer(bytes, { symbolSize: 128 });
    expect(t.ok).toBe(true);
    const back = JSON.parse(new TextDecoder().decode(t.result));
    expect(back.rows.length).toBe(30);
    expect(back.rows[7].item_id).toBe('WS-U1L1-Q7');
  });
});
