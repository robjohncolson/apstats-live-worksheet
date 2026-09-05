// derive-quarter-bands.test.js — unit bands follow the schedule dates (the same
// logic quarterOfLesson uses), with the static config list only as fallback.
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { deriveQuarterBands } from '../lesson-grade.js';
import { PHASE3_CONFIG } from '../grade-config.js';

const CFG = PHASE3_CONFIG; // SY2627: Q1 2026-09-02..11-06, Q2 11-09..01-22, Q3 01-25..04-14, Q4 04-15..06-17

function sched(entries) {
  const out = {};
  entries.forEach(([key, unit, b, e]) => { out[key] = { unit, periods: { B: b ?? null, E: e ?? null } }; });
  return out;
}

describe('deriveQuarterBands', () => {
  it('returns the configured bands unchanged without a schedule', () => {
    expect(deriveQuarterBands(CFG, null, 'B', null)).toEqual({ Q1: [1, 2, 3], Q2: [4, 5], Q3: [6, 7], Q4: [8, 9] });
  });

  it('places a unit in the quarter holding MOST of its scheduled lessons for the period', () => {
    const s = sched([
      ['1.1', 1, '2026-09-10', '2026-09-11'],
      ['4.1', 4, '2026-10-28', '2026-10-29'],
      ['4.9', 4, '2026-11-05', '2026-11-06'],   // unit 4: both lessons in Q1 → Q1
      ['5.1', 5, '2026-11-12', '2026-11-13'],
      ['5.8', 5, '2026-11-20', '2026-11-23'],   // unit 5: both in Q2 → Q2
    ]);
    const bands = deriveQuarterBands(CFG, s, 'B', null);
    expect(bands.Q1).toEqual([1, 2, 3, 4]);   // 2,3 fall back to config
    expect(bands.Q2).toEqual([5]);
    expect(bands.Q3).toEqual([6, 7]);
    expect(bands.Q4).toEqual([8, 9]);
  });

  it('SY2627 regression: old Unit 1 stays in Q1 even though 1.10 (Normal → CED 2.11) is taught in Q2', () => {
    const s = sched([
      ['1.1', 1, '2026-09-08', '2026-09-09'], ['1.2', 1, '2026-09-10', '2026-09-11'],
      ['1.3', 1, '2026-09-11', '2026-09-14'], ['1.4', 1, '2026-09-14', '2026-09-16'],
      ['1.5', 1, '2026-09-15', '2026-09-18'], ['1.6', 1, '2026-09-17', '2026-09-21'],
      ['1.7', 1, '2026-09-21', '2026-09-25'], ['1.8', 1, '2026-09-22', '2026-09-28'],
      ['1.9', 1, '2026-09-24', '2026-09-30'],
      ['1.10', 1, '2026-11-09', '2026-12-02'],   // the one November lesson used to drag the whole unit into Q2
    ]);
    const bands = deriveQuarterBands(CFG, s, 'B', null);
    expect(bands.Q1).toContain(1);
    expect(bands.Q2).not.toContain(1);
    expect(deriveQuarterBands(CFG, s, 'E', null).Q1).toContain(1);
  });

  it('a tie goes to the earlier quarter', () => {
    const s = sched([['6.1', 6, '2026-11-05', null], ['6.2', 6, '2026-11-12', null]]);   // one Q1, one Q2
    expect(deriveQuarterBands(CFG, s, 'B', null).Q1).toContain(6);
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
