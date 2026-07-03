// mesh-robustness.test.js — P2.1 robustness fixes for the findings the P2 @ts-check
// pass surfaced (TYPECHECK_HARDENING_SPEC.md; Codex-triaged, test-first):
//   1. receipt-verify: one malformed/transient issuer key must not abort verifyReceipt's
//      issuer loop (the real signer may sort after it), and a rejected key import must
//      not poison keyCache forever.
//   2. ledger-gossip.ingest: a row whose store.put REJECTS must not be counted accepted
//      nor have its id reported as converged (it was landing in BOTH tallies).
//   3. ledger-seal.sealEpoch: a missing asOfDateNY must reject BEFORE signing —
//      canonicalize drops undefined, so it would otherwise sign an epoch with no `d`.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const REPO = resolve(import.meta.dirname, '..');

// ── receipt-verify harness ──────────────────────────────────────────────────────
function loadReceiptVerify({ crypto = webcrypto } = {}) {
  const win = {};
  const ctx = createContext({
    window: win, globalThis: win, crypto,
    atob, TextEncoder, TextDecoder, Promise, JSON, Object, String, Number, Array,
    Uint8Array, Map, console,
  });
  runInContext(readFileSync(resolve(REPO, 'receipt-verify.js'), 'utf8'), ctx);
  return win.ReceiptVerify;
}

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

// A student-of-the-mesh style signed compact: payload bytes + a real Ed25519 sig.
async function signedCompact(privateKey, payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await webcrypto.subtle.sign({ name: 'Ed25519' }, privateKey, bytes);
  return b64url(bytes) + '.' + b64url(new Uint8Array(sig));
}

async function makeIssuer() {
  const pair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const raw = await webcrypto.subtle.exportKey('raw', pair.publicKey);
  return { privateKey: pair.privateKey, pubkey: b64url(new Uint8Array(raw)) };
}

describe('receipt-verify — issuer-loop robustness (P2.1 finding 1)', () => {
  it('a malformed registered issuer key does not abort verification: the real signer still verifies', async () => {
    const RV = loadReceiptVerify();
    const issuer = await makeIssuer();
    // The malformed key registers BEFORE the real signer, so the loop hits it first.
    RV.registerIssuerKeys(['!!!not-base64url!!!'], { name: 'Broken', kind: 'roster' });
    RV.registerIssuerKeys([issuer.pubkey], { name: 'Real Roster', kind: 'roster' });
    const compact = await signedCompact(issuer.privateKey, { v: 1, t: 'ledger', sid: 's1', src: 'frq', i: 'X', sc: 1 });
    const r = await RV.verifyReceipt(compact);          // must RESOLVE, not reject
    expect(r.ok).toBe(true);
    expect(r.issuer.name).toBe('Real Roster');
  });

  it('an unknown-signer receipt resolves ok:false (not a thrown error) even with a malformed key registered', async () => {
    const RV = loadReceiptVerify();
    RV.registerIssuerKeys(['%%%also-bad%%%'], { name: 'Broken', kind: 'roster' });
    const stranger = await makeIssuer();                // never registered
    const compact = await signedCompact(stranger.privateKey, { v: 1, t: 'ledger', sid: 's1', src: 'frq', i: 'X' });
    const r = await RV.verifyReceipt(compact);
    expect(r.ok).toBe(false);
    expect(r.issuer).toBe(null);
  });

  it('a rejected key import is evicted from keyCache — the next call retries instead of replaying the failure', async () => {
    let calls = 0;
    const flakySubtle = {
      importKey: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('transient WebCrypto failure')) : Promise.resolve('THE_KEY');
      },
    };
    const RV = loadReceiptVerify({ crypto: { subtle: flakySubtle } });
    await expect(RV.importIssuerKey('AAAA')).rejects.toThrow(/transient/);
    await expect(RV.importIssuerKey('AAAA')).resolves.toBe('THE_KEY');   // retried, not poisoned
    expect(calls).toBe(2);
    // …and a SUCCESSFUL import stays cached (no needless re-imports).
    await expect(RV.importIssuerKey('AAAA')).resolves.toBe('THE_KEY');
    expect(calls).toBe(2);
  });
});

// ── ledger-gossip harness ───────────────────────────────────────────────────────
function loadGossip() {
  const win = {};
  const ctx = createContext({ window: win, globalThis: win, Promise, JSON });
  runInContext(readFileSync(resolve(REPO, 'ledger-gossip.js'), 'utf8'), ctx);
  return win.LedgerGossip;
}

const row = (id) => ({ item_id: 'WS-U1L1-Q' + id, source: 'worksheet', receipt_id: id, receipt_compact: 'good.' + id });

describe('ledger-gossip.ingest — store.put rejection accounting (P2.1 finding 2)', () => {
  it('a row whose put rejects is counted rejected ONLY, and its id is not reported as converged', async () => {
    const LG = loadGossip();
    const res = await LG.ingest([row('r1')], {
      verify: () => Promise.resolve(true),
      store: { put: () => Promise.reject(new Error('idb full')) },
    });
    expect(res).toEqual({ accepted: 0, rejected: 1, ids: [] });
  });

  it('mixed batch: counts are disjoint and sum to the batch size', async () => {
    const LG = loadGossip();
    const res = await LG.ingest([row('ok1'), row('boom'), row('ok2')], {
      verify: () => Promise.resolve(true),
      store: { put: (r) => (r.receipt_id === 'boom' ? Promise.reject(new Error('nope')) : Promise.resolve()) },
    });
    expect(res.accepted).toBe(2);
    expect(res.rejected).toBe(1);
    expect(res.ids).toEqual(['ok1', 'ok2']);
    expect(res.accepted + res.rejected).toBe(3);
  });

  it('pre-existing semantics preserved: with no store at all, verified rows still count accepted', async () => {
    const LG = loadGossip();
    const res = await LG.ingest([row('a')], { verify: () => Promise.resolve(true) });
    expect(res).toEqual({ accepted: 1, rejected: 0, ids: ['a'] });
  });
});

// ── ledger-seal harness ─────────────────────────────────────────────────────────
function loadSeal() {
  const win = { crypto: webcrypto };
  const ctx = createContext({
    window: win, globalThis: win, crypto: webcrypto,
    TextEncoder, Promise, JSON, Object, String, Uint8Array, Array, Date, console,
  });
  runInContext(readFileSync(resolve(REPO, 'ledger-seal.js'), 'utf8'), ctx);
  return win.LedgerSeal;
}

describe('ledger-seal.sealEpoch — asOfDateNY guard (P2.1 finding 3)', () => {
  it('rejects clearly when asOfDateNY is missing — BEFORE signing', async () => {
    const LedgerSeal = loadSeal();
    let signed = false;
    const signImpl = () => { signed = true; return Promise.resolve({ compact: 'c', receiptId: 'r' }); };
    await expect(LedgerSeal.sealEpoch({ heads: { s1: 'h1' }, signImpl }))
      .rejects.toThrow(/asOfDateNY/);
    expect(signed).toBe(false);                          // never reached the signer
  });

  it('happy path unchanged: seals with `d` = asOfDateNY in the signed payload', async () => {
    const LedgerSeal = loadSeal();
    const seen = [];
    const signImpl = (_key, payload) => { seen.push(payload); return Promise.resolve({ compact: 'c', receiptId: 'r' }); };
    const out = await LedgerSeal.sealEpoch({ heads: { s1: 'h1' }, asOfDateNY: '2026-07-03', signImpl, now: 1, nonce: 'n' });
    expect(seen).toHaveLength(1);
    expect(seen[0].d).toBe('2026-07-03');
    expect(seen[0].t).toBe('epoch');
    expect(out.epoch.asOfDateNY).toBe('2026-07-03');
  });
});
