// doge-chain.test.js — the watch-only on-chain balance reader. Mocks global fetch
// (no network); pins network detection, koinu→DOGE conversion, the two explorer
// shapes, failure/stale fallback, and batch concurrency.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectNetwork, explorerUrl, fetchChainBalance, __clearChainCache,
} from '../doge-chain.js';

const okJson = (data) => ({ ok: true, json: async () => data });

beforeEach(() => { __clearChainCache(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('detectNetwork', () => {
  it('classifies mainnet, testnet, and junk', () => {
    expect(detectNetwork('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L')).toBe('main');
    expect(detectNetwork('nW8aieqoZN36fDVciNyRueRGvGLR3mr7L')).toBe('test');
    expect(detectNetwork('not-an-address')).toBeNull();
    expect(detectNetwork('')).toBeNull();
  });
});

describe('explorerUrl', () => {
  it('points mainnet and testnet at the right path', () => {
    expect(explorerUrl('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L')).toMatch(/blockchair\.com\/dogecoin\/address\//);
    expect(explorerUrl('nW8aieqoZN36fDVciNyRueRGvGLR3mr7L')).toMatch(/dogecoin\/testnet\/address\//);
  });
});

describe('fetchChainBalance — mainnet (BlockCypher)', () => {
  it('converts koinu → DOGE (÷1e8) and reports counts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ balance: 1250000000, unconfirmed_balance: 50000000, n_tx: 3 })));
    const r = await fetchChainBalance('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L');
    expect(r.network).toBe('main');
    expect(r.confirmedDoge).toBe(12.5);        // 1.25e9 koinu
    expect(r.unconfirmedDoge).toBe(0.5);
    expect(r.txCount).toBe(3);
    expect(r.source).toBe('blockcypher');
    expect(r.error).toBeUndefined();
  });
});

describe('fetchChainBalance — testnet (no provider wired)', () => {
  it('returns an explicit error without hitting the network (no DOGE-testnet API exists)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await fetchChainBalance('nW8aieqoZN36fDVciNyRueRGvGLR3mr7L');
    expect(r.network).toBe('test');
    expect(r.error).toMatch(/no DOGE testnet/i);
    expect(r.stale).toBe(true);
    expect(f).not.toHaveBeenCalled();          // dead path short-circuits, no 404
  });
});

describe('fetchChainBalance — failure handling', () => {
  it('returns an error record (no cache) when the explorer is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const r = await fetchChainBalance('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L');
    expect(r.error).toBeTruthy();
    expect(r.stale).toBe(true);
  });
  it('never throws on a network exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    const r = await fetchChainBalance('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L');
    expect(r.error).toBeTruthy();
  });
  it('serves the cached value within the TTL without re-fetching', async () => {
    const f = vi.fn().mockResolvedValue(okJson({ balance: 100000000, unconfirmed_balance: 0, n_tx: 1 }));
    vi.stubGlobal('fetch', f);
    const a = await fetchChainBalance('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L');
    const b = await fetchChainBalance('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L');
    expect(a.confirmedDoge).toBe(1);
    expect(b.cached).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);        // second call hit the cache
  });
  it('serves the last good value as STALE when a later fetch fails (after TTL)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    const f = vi.fn().mockResolvedValueOnce(okJson({ balance: 200000000, unconfirmed_balance: 0, n_tx: 1 }))
                     .mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', f);
    const addr = 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L';
    const a = await fetchChainBalance(addr);
    expect(a.confirmedDoge).toBe(2);
    vi.setSystemTime(new Date('2026-06-16T00:06:00Z'));   // +6 min, past the 5-min TTL
    const b = await fetchChainBalance(addr);
    expect(b.confirmedDoge).toBe(2);            // last good
    expect(b.stale).toBe(true);
  });
});
