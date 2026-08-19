// derive-quarter-bands.test.js — unit bands follow the schedule dates (the same
// logic quarterOfLesson uses), with the static config list only as fallback.
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { deriveQuarterBands } from '../lesson-grade.js';
import { PHASE3_CONFIG } from '../grade-config.js';

const CFG = PHASE3_CONFIG; // Q1 2026-09-09..11-13, Q2 ..2027-01-29, Q3 ..04-09, Q4 ..06-23

function sched(entries) {
  const out = {};
  entries.forEach(([key, unit, b, e]) => { out[key] = { unit, periods: { B: b ?? null, E: e ?? null } }; });
  return out;
}

describe('deriveQuarterBands', () => {
  it('returns the configured bands unchanged without a schedule', () => {
    expect(deriveQuarterBands(CFG, null, 'B', null)).toEqual({ Q1: [1, 2, 3], Q2: [4, 5], Q3: [6, 7], Q4: [8, 9] });
  });

  it('places a unit in the quarter of its LATEST scheduled lesson date for the period', () => {
    const s = sched([
      ['1.1', 1, '2026-09-10', '2026-09-11'],
      ['4.1', 4, '2026-10-28', '2026-10-29'],
      ['4.9', 4, '2026-11-05', '2026-11-06'],   // unit 4 ends inside Q1 → Q1
      ['5.1', 5, '2026-11-12', '2026-11-13'],
      ['5.8', 5, '2026-11-20', '2026-11-23'],   // unit 5 ends in Q2 → Q2
    ]);
    const bands = deriveQuarterBands(CFG, s, 'B', null);
    expect(bands.Q1).toEqual([1, 2, 3, 4]);   // 2,3 fall back to config
    expect(bands.Q2).toEqual([5]);
    expect(bands.Q3).toEqual([6, 7]);
    expect(bands.Q4).toEqual([8, 9]);
  });

  it('every unit lands in exactly one quarter, sorted', () => {
    const s = sched([['9.1', 9, '2026-09-15', null], ['1.1', 1, '2027-05-01', null]]);
    const bands = deriveQuarterBands(CFG, s, 'B', null);
    const all = Object.values(bands).flat();
    expect(all.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(bands.Q1).toContain(9);
    expect(bands.Q4).toContain(1);
  });

  it('uses only the student period date; unknown period uses B||E', () => {
    const s = sched([['1.1', 1, null, '2027-02-01']]);   // no B date, E in Q3
    expect(deriveQuarterBands(CFG, s, 'B', null).Q1).toContain(1);   // B has no date → config fallback
    expect(deriveQuarterBands(CFG, s, 'E', null).Q3).toContain(1);
    expect(deriveQuarterBands(CFG, s, null, null).Q3).toContain(1);
  });

  it('ignores stale prior-cohort dates before gradingWindowStart', () => {
    const s = sched([['6.1', 6, '2026-04-01', '2026-04-02']]);   // last year's April
    expect(deriveQuarterBands(CFG, s, 'B', '2026-08-01').Q3).toContain(6);   // fallback keeps config
  });
});
