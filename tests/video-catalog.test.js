// tests/video-catalog.test.js — ANDROID Phase 5 catalog generator (pure).
import { describe, it, expect } from 'vitest';
import { buildCatalog } from '../scripts/build-video-catalog.mjs';

describe('buildCatalog', () => {
  const manifest = {
    byUrl: {
      urlA: { topic: '1-2', file: 'media/1-2__0__abc.mp4' },
      urlB: { topic: '1-2', file: 'media/1-2__0__abc.mp4' },   // dup file → deduped
      urlC: { topic: '10-1', file: 'media/10-1__0__xyz.mp4' },  // two-digit unit
      urlD: { topic: 'PC', file: 'media/pc__0__q.mp4' },        // non-numeric → unit 0
      urlE: { topic: '2-1' },                                    // no file → skipped
    },
  };

  it('dedups by file, parses unit, strips to basename, sizes', () => {
    const cat = buildCatalog(manifest, () => 1234);
    expect(cat).toHaveLength(3);
    const byFile = Object.fromEntries(cat.map((e) => [e.file, e]));
    expect(byFile['1-2__0__abc.mp4']).toMatchObject({ url: 'media/1-2__0__abc.mp4', unit: 1, label: '1-2', bytes: 1234 });
    expect(byFile['10-1__0__xyz.mp4'].unit).toBe(10);
    expect(byFile['pc__0__q.mp4'].unit).toBe(0);
  });

  it('sorts by unit then file', () => {
    const cat = buildCatalog(manifest);
    expect(cat.map((e) => e.unit)).toEqual([0, 1, 10]);
  });

  it('empty/malformed manifest → empty', () => {
    expect(buildCatalog(null)).toEqual([]);
    expect(buildCatalog({ byUrl: {} })).toEqual([]);
  });
});
