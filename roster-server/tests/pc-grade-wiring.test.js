// pc-grade-wiring.test.js — PC makeup Phase 2 grade wiring
// (PC_MAKEUP_PHASE2_GRADE_SPEC.md §A/§B/§C). Covers:
//   • scorePcRows: honor server-computed row.score, legacy re-score fallback,
//     FRQ partial credit, paper best-wins over the online mean, ungradable skip.
//   • the pcTrack gate: OFF (production default) → PC rows are grade-INERT
//     (pcRawPct null, P=0, pcAvg null); ON → PC counts. This is the load-bearing
//     inertness proof for the deployed-but-not-activated Phase 2.
// NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { scorePcRows } from '../scoring.js';
import { computeGrade } from '../grade.js';
import { computeQuarterV3 } from '../lesson-grade.js';

const KEY = {
  // legacy proctored PC items live in the public answer key (re-scored)
  'U1-PC-MCQ-A-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '1' },
  'U1-PC-MCQ-A-Q02': { answerKey: 'D', type: 'multiple-choice', unit: '1' },
  'U1-PC-FRQ-Q01':   { answerKey: null, type: 'free-response', unit: '1' }, // ungradable
};

function row(itemId, { response = null, score = null, attempt = 1 } = {}) {
  return { item_id: itemId, response, score, attempt, recorded_at: '2026-09-20T12:00:00Z' };
}

describe('scorePcRows — hybrid PC feeder', () => {
  it('honors a finite server-computed row.score (makeup MCQ 0/1)', () => {
    const rows = [
      row('U1-PC26-MCQ-A-Q01', { score: 1 }),
      row('U1-PC26-MCQ-A-Q02', { score: 0 }),
    ];
    // no answer-key entry for PC26 ids — score is honored, NOT re-scored
    const { units } = scorePcRows(rows, {});
    expect(units.U1.pct).toBe(50); // mean(1, 0) = 0.5
  });

  it('re-scores legacy proctored rows (no score) against the public key', () => {
    const rows = [
      row('U1-PC-MCQ-A-Q01', { response: 'A' }), // correct
      row('U1-PC-MCQ-A-Q02', { response: 'B' }), // key is 'D' → wrong
      row('U1-PC-FRQ-Q01',   { response: 'essay' }), // null key → ungradable, dropped
    ];
    const { units } = scorePcRows(rows, KEY);
    expect(units.U1.pct).toBe(50); // graded {1,0}; FRQ excluded from denominator
  });

  it('honors FRQ partial credit via a fractional score', () => {
    const rows = [
      row('U1-PC26-MCQ-A-Q01', { score: 1 }),
      row('U1-PC26-FRQ-Q01', { score: 2 / 3 }), // E/P/I → P
    ];
    const { units } = scorePcRows(rows, {});
    expect(units.U1.pct).toBeCloseTo(83.3, 1); // mean(1, 0.667)*100
  });

  it('paper best-wins over the online mean (a makeup only raises)', () => {
    const lowOnline = [
      row('U1-PC26-MCQ-A-Q01', { score: 0 }),
      row('U1-PC26-MCQ-A-Q02', { score: 0 }),
      row('U1-PC-A-PAPER', { score: 0.9 }), // proctored paper
    ];
    expect(scorePcRows(lowOnline, {}).units.U1.pct).toBe(90); // paper 90 > online 0

    const highOnline = [
      row('U1-PC26-MCQ-A-Q01', { score: 1 }),
      row('U1-PC26-MCQ-A-Q02', { score: 1 }),
      row('U1-PC-A-PAPER', { score: 0.5 }),
    ];
    expect(scorePcRows(highOnline, {}).units.U1.pct).toBe(100); // online 100 > paper 50
  });

  it('clamps an out-of-range score and skips a truly unscorable row', () => {
    const rows = [
      row('U1-PC26-MCQ-A-Q01', { score: 1.4 }), // clamps to 1
      row('U1-PC26-FRQ-Q02', { response: 'ungraded', score: null }), // no score + no key → skip
    ];
    const { units } = scorePcRows(rows, {});
    expect(units.U1.pct).toBe(100); // only the clamped 1.0 counts
  });
});

// ── The gate: PC rows are grade-INERT until config.pcTrack.enabled ────────────

const GATE_CFG_BASE = {
  C: 85,
  feederWeights: { W: 1, Q: 1 },
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
  frqBand: { E: 100, P: 70, I: 35 },
  useV3: false,
  quarters: {
    Q1: { units: [1], start: '2026-09-01', end: '2026-11-30', pcAnchor: { p85: 40, p100: 60 } },
    Q2: { units: [2], start: '2026-12-01', end: '2027-01-31', pcAnchor: { p85: 45, p100: 64 } },
    Q3: { units: [3], start: '2027-02-01', end: '2027-03-31', pcAnchor: { p85: 50, p100: 67 } },
    Q4: { units: [4], start: '2027-04-01', end: '2027-06-15', pcAnchor: { p85: 55, p100: 70 } },
  },
};

function cfg(pcEnabled) {
  return { ...GATE_CFG_BASE, pcTrack: { enabled: pcEnabled } };
}

describe('pcTrack gate — PC rows are inert until enabled', () => {
  // A perfect PC and no other work: with PC ON the unit is lifted; with PC OFF
  // it must be exactly as if the PC row did not exist.
  const rows = [
    { source: 'pc', item_id: 'U1-PC-MCQ-A-Q01', response: 'A', score: null, attempt: 1 },
  ];

  it('OFF (production default) → PC row does not touch the unit grade', () => {
    const g = computeGrade(rows, KEY, cfg(false), {});
    // no lesson/quiz/frq work at all → the unit only exists via the PC row's
    // completion bump; its PC contribution must be null/0.
    const u1 = g.units.U1;
    expect(u1 == null || u1.pcRawPct == null).toBe(true);
    if (u1) expect(u1.P).toBe(0);
  });

  it('ON → the same PC row lifts the unit (raw 100 → P 100)', () => {
    const g = computeGrade(rows, KEY, cfg(true), {});
    expect(g.units.U1.pcRawPct).toBe(100);
    expect(g.units.U1.P).toBe(100); // Q1 anchor: 100 ≥ p100(60)
    expect(g.units.U1.unitGrade).toBe(100);
  });

  it('OFF → computeQuarterV3 pcAvg stays null even when the unit PC is due (no cliff)', () => {
    const schedule = { '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } } };
    const lessonMap = new Map([['1.1', { Cws: 100, W: 100, Q: 100, lessonGrade: 100 }]]);
    const args = {
      quarterKey: 'Q1', config: null, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {}, // due, unattempted
    };
    // disabled → pcAvg null → grade is the Work track alone (no 70% cap)
    const off = computeQuarterV3({ ...args, config: cfg(false) });
    expect(off.pcAvg).toBe(null);
    expect(off.pcDue).toBe(false);
    expect(off.quarterGrade).toBeCloseTo(off.workAvg, 6);

    // enabled → the due-but-unattempted PC counts as 0 and caps at 70% of Work
    const on = computeQuarterV3({ ...args, config: cfg(true) });
    expect(on.pcAvg).toBe(0);
    expect(on.pcDue).toBe(true);
    expect(on.quarterGrade).toBeCloseTo(0.7 * on.workAvg, 1);
  });
});
