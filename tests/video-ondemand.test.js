/**
 * tests/video-ondemand.test.js — ANDROID Phase 5 on-demand video manager.
 * Catalog + storage are injectable, so the resolve/download/evict logic is fully
 * tested without a device. The Capacitor Filesystem binding (video-store.js) is
 * exercised on-device.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'video-ondemand.js'), 'utf8');

function memStore() {
  const m = new Map();
  return {
    _map: m,
    has: (k) => Promise.resolve(m.has(k)),
    uri: (k) => Promise.resolve('file:///videos/' + k),
    write: (k, blob) => { m.set(k, blob); return Promise.resolve(); },
    remove: (k) => { m.delete(k); return Promise.resolve(); },
  };
}

function load({ play = true, base = 'https://cdn.example/v', store, fetchImpl } = {}) {
  const win = { PLAY_BUILD: play, MEDIA_BASE_URL: base, fetch: fetchImpl };
  const ctx = createContext({
    window: win, globalThis: win, fetch: fetchImpl, Blob, Promise, Number, Math, Array, Object, isFinite, String, console,
  });
  runInContext(SRC, ctx);
  if (store) win.VideoOnDemand._store = store;
  return win.VideoOnDemand;
}

const CATALOG = [
  { url: 'net/u1a', file: 'topic-1-1.mp4', unit: 1, label: '1.1', bytes: 1000 },
  { url: 'net/u1b', file: 'topic-1-2.mp4', unit: 1, label: '1.2', bytes: 2000 },
  { url: 'net/u2a', file: 'topic-2-1.mp4', unit: 2, label: '2.1', bytes: 3000 },
];
const okFetch = () => Promise.resolve({ ok: true, status: 200, headers: { get: () => '1000' }, body: null, blob: () => Promise.resolve(new Blob(['x'])) });

describe('VideoOnDemand — catalog + resolve', () => {
  let V, store;
  beforeEach(() => { store = memStore(); V = load({ store }); V.setCatalog(CATALOG); });

  it('setCatalog indexes by url and file', () => {
    expect(V.entryFor('net/u1a').file).toBe('topic-1-1.mp4');
    expect(V.entryFor('topic-2-1.mp4').unit).toBe(2);
  });
  it('resolve → remote with a download URL when not downloaded', async () => {
    const r = await V.resolve('net/u1a');
    expect(r.state).toBe('remote');
    expect(r.downloadUrl).toBe('https://cdn.example/v/topic-1-1.mp4');
  });
  it('resolve → none for an unknown url', async () => {
    expect((await V.resolve('net/nope')).state).toBe('none');
  });
  it('downloadUrl is null when MEDIA_BASE_URL is unset', async () => {
    const V2 = load({ store: memStore(), base: '' }); V2.setCatalog(CATALOG);
    expect((await V2.resolve('net/u1a')).downloadUrl).toBeNull();
  });
});

describe('VideoOnDemand — download + evict', () => {
  let V, store;
  beforeEach(() => { store = memStore(); V = load({ store, fetchImpl: okFetch }); V.setCatalog(CATALOG); });

  it('download stores the file and resolve flips to downloaded', async () => {
    const uri = await V.download('net/u1a');
    expect(uri).toBe('file:///videos/topic-1-1.mp4');
    expect(store._map.has('topic-1-1.mp4')).toBe(true);
    const r = await V.resolve('net/u1a');
    expect(r.state).toBe('downloaded');
    expect(r.playUri).toBe('file:///videos/topic-1-1.mp4');
    expect(await V.isDownloaded('net/u1a')).toBe(true);
  });

  it('downloadUnit fetches every video in the unit (idempotent)', async () => {
    const res = await V.downloadUnit(1);
    expect(res).toMatchObject({ downloaded: 2, failed: 0, total: 2 });
    expect(store._map.size).toBe(2);
    // re-run: already present, no re-download, still counted
    expect((await V.downloadUnit(1)).downloaded).toBe(2);
  });

  it('evictUnit removes a unit\'s files', async () => {
    await V.downloadUnit(1);
    const res = await V.evictUnit(1);
    expect(res.removed).toBe(2);
    expect(store._map.size).toBe(0);
  });

  it('unitsState reports total/downloaded/bytes per unit', async () => {
    await V.download('net/u1a');
    const st = await V.unitsState();
    expect(st[1]).toMatchObject({ total: 2, downloaded: 1, bytes: 1000 });
    expect(st[2]).toMatchObject({ total: 1, downloaded: 0 });
  });
});

describe('VideoOnDemand.evictionPlan (pure)', () => {
  const V = load({ store: memStore() });
  it('keeps the current ± keep units; evicts the rest furthest-first', () => {
    expect(V.evictionPlan({ currentUnit: 2, keep: 1 }, [1, 2, 3, 4, 5])).toEqual([5, 4]);
  });
  it('keep:0 evicts everything but the current unit', () => {
    expect(V.evictionPlan({ currentUnit: 3, keep: 0 }, [1, 3, 5]).sort()).toEqual([1, 5]);
  });
  it('no current unit → all downloaded units are evictable', () => {
    expect(V.evictionPlan({}, [1, 2]).sort()).toEqual([1, 2]);
  });
});
