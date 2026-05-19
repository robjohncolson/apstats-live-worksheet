// bundle-parity.test.js — the §4 "reuse AS-IS, not fork" + bundled-copy guard.
// Railway deploys roster-server with Root Dir = roster-server/, so repo-root
// data/ + lib/ are NOT shipped. Phase 2/3 bundle byte-identical copies; this
// test fails loudly the moment a copy drifts from its canonical source.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));        // roster-server/tests
const rs = resolve(here, '..');                              // roster-server
const repo = resolve(rs, '..');                              // repo root

function readBytes(p) {
  return readFileSync(p); // Buffer — exact byte comparison, EOL-sensitive
}

describe('bundle parity — byte-identical canonical copies', () => {
  it('roster-server/bkt.js === lib/bkt.js (BKT reused AS-IS, NOT forked)', () => {
    const bundled = readBytes(resolve(rs, 'bkt.js'));
    const canonical = readBytes(resolve(repo, 'lib', 'bkt.js'));
    expect(bundled.equals(canonical)).toBe(true);
  });

  it('roster-server/data/skill-map.json === data/skill-map.json (T2-frozen)', () => {
    const bundled = readBytes(resolve(rs, 'data', 'skill-map.json'));
    const canonical = readBytes(resolve(repo, 'data', 'skill-map.json'));
    expect(bundled.equals(canonical)).toBe(true);
  });

  it('roster-server/data/answer-key.json === data/answer-key.json (Phase-2)', () => {
    const bundled = readBytes(resolve(rs, 'data', 'answer-key.json'));
    const canonical = readBytes(resolve(repo, 'data', 'answer-key.json'));
    expect(bundled.equals(canonical)).toBe(true);
  });

  it('the bundled bkt.js really exposes the study-guide BKT API', async () => {
    await import('../bkt.js');
    const BKT = globalThis.BKT;
    expect(BKT).toBeDefined();
    expect(typeof BKT.updateMastery).toBe('function');
    expect(BKT.DEFAULT_PARAMS).toEqual({ pInit: 0.3, pTransit: 0.0, pSlip: 0.1, pGuess: 0.25 });
    // sanity: correct raises, incorrect lowers (same as lib/bkt.test.js)
    expect(BKT.updateMastery(0.5, true)).toBeGreaterThan(0.5);
    expect(BKT.updateMastery(0.5, false)).toBeLessThan(0.5);
  });
});
