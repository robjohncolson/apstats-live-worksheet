// pc-figures.test.js — the PC26 figure signer (PC_FIGURES_INTEGRATION_SPEC D1-a).
// No network: a fake Supabase storage client returns deterministic signed URLs.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { createFiguresSigner } from '../pc-figures.js';

const MANIFEST = {
  bucket: 'pc-figures',
  items: {
    'U1-PC26-MCQ-A-Q08': { stems: ['0'], choices: [] },              // single stem
    'U1-PC26-MCQ-B-Q10': { stems: ['0', '1'], choices: [] },          // two stems (array-visual item)
    'U1-PC26-MCQ-A-Q07': { stems: [], choices: ['A', 'B', 'C', 'D'] }, // figure choices
  },
};

// map: bucket-relative path → signedUrl (absent = a missing file for that slot)
function fakeClient(map, calls = []) {
  return {
    storage: {
      from(bucket) {
        return {
          async createSignedUrls(paths, ttl) {
            calls.push({ bucket, paths, ttl });
            return {
              data: paths.map((p) => (map[p]
                ? { path: p, signedUrl: map[p], error: null }
                : { path: p, signedUrl: null, error: 'Object not found' })),
              error: null,
            };
          },
        };
      },
    },
  };
}

const url = (p) => 'https://signed/' + p + '?token=x';

describe('createFiguresSigner.signForItems', () => {
  it('single stem → { stems:[url], choices:{} }', async () => {
    const p = 'U1-PC26-MCQ-A-Q08_0.png';
    const s = createFiguresSigner(fakeClient({ [p]: url(p) }), MANIFEST);
    const out = await s.signForItems(['U1-PC26-MCQ-A-Q08']);
    expect(out['U1-PC26-MCQ-A-Q08']).toEqual({ stems: [url(p)], choices: {} });
  });

  it('multiple stems preserve slot order 0,1', async () => {
    const p0 = 'U1-PC26-MCQ-B-Q10_0.png', p1 = 'U1-PC26-MCQ-B-Q10_1.png';
    const s = createFiguresSigner(fakeClient({ [p0]: url(p0), [p1]: url(p1) }), MANIFEST);
    const out = await s.signForItems(['U1-PC26-MCQ-B-Q10']);
    expect(out['U1-PC26-MCQ-B-Q10'].stems).toEqual([url(p0), url(p1)]);
  });

  it('figure choices → { stems:[], choices:{A,B,C,D} }', async () => {
    const map = {};
    ['A', 'B', 'C', 'D'].forEach((k) => { map['U1-PC26-MCQ-A-Q07_' + k + '.png'] = url(k); });
    const s = createFiguresSigner(fakeClient(map), MANIFEST);
    const out = await s.signForItems(['U1-PC26-MCQ-A-Q07']);
    expect(out['U1-PC26-MCQ-A-Q07'].stems).toEqual([]);
    expect(Object.keys(out['U1-PC26-MCQ-A-Q07'].choices).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('batches ALL requested items into ONE createSignedUrls call', async () => {
    const calls = [];
    const map = {
      'U1-PC26-MCQ-A-Q08_0.png': url('a'),
      'U1-PC26-MCQ-B-Q10_0.png': url('b'), 'U1-PC26-MCQ-B-Q10_1.png': url('c'),
    };
    const s = createFiguresSigner(fakeClient(map, calls), MANIFEST);
    await s.signForItems(['U1-PC26-MCQ-A-Q08', 'U1-PC26-MCQ-B-Q10']);
    expect(calls).toHaveLength(1);
    expect(calls[0].paths).toHaveLength(3); // 1 + 2 slots, one round trip
  });

  it('items absent from the manifest are simply omitted (no figures)', async () => {
    const s = createFiguresSigner(fakeClient({}), MANIFEST);
    const out = await s.signForItems(['U9-PC26-MCQ-A-Q99']);
    expect(out).toEqual({});
  });

  it('a single missing file fails only that slot, not its siblings', async () => {
    const p1 = 'U1-PC26-MCQ-B-Q10_1.png'; // only slot 1 exists
    const s = createFiguresSigner(fakeClient({ [p1]: url(p1) }), MANIFEST);
    const out = await s.signForItems(['U1-PC26-MCQ-B-Q10']);
    expect(out['U1-PC26-MCQ-B-Q10'].stems).toEqual([url(p1)]); // slot 0 dropped, slot 1 kept
  });

  it('a thrown storage call degrades to {} (never throws)', async () => {
    const badClient = { storage: { from() { return { async createSignedUrls() { throw new Error('boom'); } }; } } };
    const s = createFiguresSigner(badClient, MANIFEST);
    await expect(s.signForItems(['U1-PC26-MCQ-A-Q08'])).resolves.toEqual({});
  });
});
