// pc-paper-blend.test.js - the Progress Check blend (PC_FOLLOWTHROUGH_SPEC.md section 1).
// One paper row per PART; the unit's paper % = half the points-weighted MCQ parts
// (A, B, C) + half the FRQ. A part posted as 0 counts; an absent part is excluded.
// Legacy REST rows count only until a unit has any B, C or FRQ row.
// The Python reconcile (tools/apclassroom_pc_reconcile.py paper_blend) is pinned
// to the SAME numbers in tests/test_apclassroom_pc_reconcile.py.
// NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { scorePcRows, pcPaperBlend } from '../scoring.js';
import { computeGrade } from '../grade.js';

function paper(unit, part, points, of, extra = {}) {
  const response = JSON.stringify({ part, points, of, origin: 'apclassroom', postedAt: '2026-10-20T23:10:00Z', ...extra });
  return { item_id: `U${unit}-PC-${part}-PAPER`, response, score: points / of, attempt: 1, recorded_at: '2026-10-20T23:10:00Z' };
}

function legacy(itemId, score) {
  return { item_id: itemId, response: '(paper)', score, attempt: 1, recorded_at: '2026-10-15T20:00:00Z' };
}

function pctOf(rows) {
  return scorePcRows(rows, {}).units.U1.pct;
}

describe('scorePcRows - MCQ/FRQ blend', () => {
  it('all four parts: MCQ half = (18 + 13 + 12) / 44, FRQ half = 14/16', () => {
    const rows = [paper(1, 'A', 18, 18), paper(1, 'B', 13, 14), paper(1, 'C', 12, 12), paper(1, 'FRQ', 14, 16)];
    // 100 * (0.5 * 43/44 + 0.5 * 0.875) = 100 * (0.48864 + 0.4375) = 92.61 -> 92.6
    expect(pctOf(rows)).toBe(92.6);
  });

  it('only MCQ parts: the points-weighted MCQ mean alone', () => {
    // (7 + 6) / (14 + 12) = 0.5 -> 50
    expect(pctOf([paper(1, 'B', 7, 14), paper(1, 'C', 6, 12)])).toBe(50);
  });

  it('only the FRQ: the FRQ score alone', () => {
    expect(pctOf([paper(1, 'FRQ', 8, 16)])).toBe(50);
  });

  it('an absent part is excluded, never 0', () => {
    // A 9/18 + FRQ 16/16, B and C not posted: 100 * (0.5 * 0.5 + 0.5 * 1) = 75
    expect(pctOf([paper(1, 'A', 9, 18), paper(1, 'FRQ', 16, 16)])).toBe(75);
  });

  it('a deadline zero row is PRESENT and counts as 0', () => {
    const zero = paper(1, 'FRQ', 0, 16, { note: 'Not submitted by 2026-10-23: scored 0. Schedule a retake with Mr. Colson.' });
    // 100 * (0.5 * 1 + 0.5 * 0) = 50
    expect(pctOf([paper(1, 'A', 18, 18), zero])).toBe(50);
  });

  it('max -> blend: a strong Part A no longer hides a weak B', () => {
    // old rule: max(17/18, 7/14) = 94.4; new: (17 + 7) / (18 + 14) = 0.75 -> 75
    expect(pctOf([paper(1, 'A', 17, 18), paper(1, 'B', 7, 14)])).toBe(75);
  });

  it('a row without `of` falls back to PC_PART_POINTS (U1: B 14, C 12)', () => {
    const rows = [legacy('U1-PC-B-PAPER', 1), legacy('U1-PC-C-PAPER', 0)];
    // (1 * 14 + 0 * 12) / 26 = 0.5385 -> 53.8
    expect(pctOf(rows)).toBe(53.8);
  });

  it('a unit missing from PC_PART_POINTS weights a row without `of` as 1', () => {
    const rows = [legacy('U2-PC-B-PAPER', 1), legacy('U2-PC-C-PAPER', 0)];
    expect(scorePcRows(rows, {}).units.U2.pct).toBe(50);
  });

  it('online makeup best-wins: the online mean still beats a lower blend', () => {
    const rows = [
      paper(1, 'A', 5, 18), paper(1, 'FRQ', 12, 16),
      { item_id: 'U1-PC26-MCQ-A-Q01', response: 'B', score: 1, attempt: 1 },
      { item_id: 'U1-PC26-MCQ-A-Q02', response: 'C', score: 1, attempt: 1 },
    ];
    expect(pctOf(rows)).toBe(100);
  });

  it('a legacy un-parted -PAPER row still best-wins', () => {
    const rows = [legacy('U1-PC-PAPER', 0.8), paper(1, 'B', 7, 14)];
    expect(pctOf(rows)).toBe(80);
  });
});

describe('legacy REST rows (section 1.3)', () => {
  it('A 5/18 + REST 12/16, nothing per-part yet -> today\'s number (best of A and REST)', () => {
    const rows = [legacy('U1-PC-A-PAPER', 5 / 18), legacy('U1-PC-REST-PAPER', 12 / 16)];
    expect(pctOf(rows)).toBe(75);
  });

  it('add FRQ 12/16 per-part -> REST ignored, 100 * (0.5 * 5/18 + 0.5 * 12/16) = 51.4', () => {
    const rows = [legacy('U1-PC-A-PAPER', 5 / 18), legacy('U1-PC-REST-PAPER', 12 / 16), paper(1, 'FRQ', 12, 16)];
    expect(pctOf(rows)).toBe(51.4);
  });
});

describe('parts are exposed', () => {
  it('units[U#].parts carries score, points, of, note, origin, postedAt', () => {
    const rows = [legacy('U1-PC-A-PAPER', 5 / 18), paper(1, 'FRQ', 12, 16, { note: 'scored in AP Classroom' })];
    const parts = scorePcRows(rows, {}).units.U1.parts;
    expect(Object.keys(parts).sort()).toEqual(['A', 'FRQ']);
    expect(parts.FRQ).toEqual({
      score: 0.75, points: 12, of: 16, note: 'scored in AP Classroom', origin: 'apclassroom', postedAt: '2026-10-20T23:10:00Z',
    });
    // A legacy '(paper)' response parses as {}: score only.
    expect(parts.A).toMatchObject({ points: null, of: null, note: null, origin: null });
  });

  it('a unit with only online rows has no parts key', () => {
    const rows = [{ item_id: 'U1-PC26-MCQ-A-Q01', response: 'B', score: 1, attempt: 1 }];
    expect(scorePcRows(rows, {}).units.U1.parts).toBeUndefined();
  });

  it('computeGrade copies the parts to units[U#].pcParts', () => {
    const cfg = {
      C: 85, feederWeights: { W: 1, Q: 1 }, lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
      frqBand: { E: 100, P: 70, I: 35 }, useV3: false, pcTrack: { enabled: true },
      quarters: {
        Q1: { units: [1], start: '2026-09-01', end: '2026-11-30', pcAnchor: { p85: 40, p100: 60 } },
        Q2: { units: [2], start: '2026-12-01', end: '2027-01-31', pcAnchor: { p85: 45, p100: 64 } },
        Q3: { units: [3], start: '2027-02-01', end: '2027-03-31', pcAnchor: { p85: 50, p100: 67 } },
        Q4: { units: [4], start: '2027-04-01', end: '2027-06-15', pcAnchor: { p85: 55, p100: 70 } },
      },
    };
    const rows = [paper(1, 'A', 9, 18), paper(1, 'FRQ', 16, 16)].map((r) => ({ ...r, source: 'pc' }));
    const g = computeGrade(rows, {}, cfg, {});
    expect(g.units.U1.pcUncurvedPct).toBe(75);
    expect(g.units.U1.pcRawPct).toBe(85.7);      // U1 class scale (PC_CURVE_SPEC)
    expect(g.units.U1.pcParts.FRQ.points).toBe(16);
  });
});

describe('pcPaperBlend (the pure helper the bundle exports)', () => {
  it('no parts -> null', () => {
    expect(pcPaperBlend({}, 1)).toBe(null);
    expect(pcPaperBlend(null, 'U1')).toBe(null);
  });

  it('accepts "U1" or 1 for the unit', () => {
    const parts = { B: { score: 1, of: null }, C: { score: 0, of: null } };
    expect(pcPaperBlend(parts, 'U1')).toBeCloseTo(100 * 14 / 26, 6);
    expect(pcPaperBlend(parts, 1)).toBeCloseTo(100 * 14 / 26, 6);
  });
});
