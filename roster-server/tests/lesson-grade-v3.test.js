// lesson-grade-v3.test.js — pure-function unit tests for the v3 grading model.
// Tests quarterGradeV3 (the boundary worked-examples table), workAvgV3
// (present-track renormalization), and computeQuarterV3 (aggregation + the
// null-track gating + ceiling). NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  quarterGradeV3,
  workAvgV3,
  V3_WORK_WEIGHTS,
  computeQuarterV3,
} from '../lesson-grade.js';

// ── quarterGradeV3 — the worked-examples table from GRADING_MODEL_V3_BUILD.md ──

describe('quarterGradeV3 — boundary worked examples (spec §Worked examples)', () => {
  // [pcAvg, workAvg, expected quarter grade on [0,1]]
  const CASES = [
    [1.00, 1.00, 1.000], // both ≥ .40 → max — full mastery + engagement
    [1.00, 0.40, 1.000], // PC-led; min Work cleared
    [0.40, 1.00, 1.000], // Work-led; min PC cleared
    [1.00, 0.39, 0.700], // Work < .40 → PC-only ceiling
    [1.00, 0.00, 0.700], // pure PC gamer — capped
    [0.39, 1.00, 0.700], // PC < .40 → symmetric ceiling
    [0.00, 1.00, 0.700], // pure work, no PC — capped
    [0.80, 0.39, 0.595], // mean wins (Work helping)
    [0.39, 0.80, 0.595], // symmetric
    [0.50, 0.50, 0.500], // above floor; either track
    [0.30, 0.30, 0.300], // both gates failed; mean dominates
    [0.00, 0.00, 0.000], // honest zero
    [0.70, 0.60, 0.700], // typical "trying" student
    [0.40, 0.40, 0.400], // exact floor on both
  ];

  for (const [pc, work, expected] of CASES) {
    it(`PC=${pc}, Work=${work} → ${(expected * 100).toFixed(1)}%`, () => {
      expect(quarterGradeV3(pc, work)).toBeCloseTo(expected, 6);
    });
  }

  it('the two 40% cliffs are ~30 points each when the other track is 100%', () => {
    expect(quarterGradeV3(1.0, 0.39)).toBeCloseTo(0.70, 6);
    expect(quarterGradeV3(1.0, 0.40)).toBeCloseTo(1.00, 6);
    expect(quarterGradeV3(0.39, 1.0)).toBeCloseTo(0.70, 6);
    expect(quarterGradeV3(0.40, 1.0)).toBeCloseTo(1.00, 6);
  });
});

// ── workAvgV3 — renormalize over present tracks ───────────────────────────────

describe('workAvgV3 — present-track renormalization', () => {
  it('only lessons + quizzes present → plain mean of the two', () => {
    // (0.30·L + 0.30·Q) / 0.60 = (L + Q) / 2
    expect(workAvgV3({ lessons: 0.90, quizzes: 0.60, posters: null, blooket: null }))
      .toBeCloseTo(0.75, 6);
  });

  it('all four present → full weighted blend', () => {
    const v = workAvgV3({ lessons: 1.0, quizzes: 0.0, posters: 0.5, blooket: 1.0 });
    // 0.30·1 + 0.30·0 + 0.30·0.5 + 0.10·1 = 0.30 + 0 + 0.15 + 0.10 = 0.55
    expect(v).toBeCloseTo(0.55, 6);
  });

  it('a single present track returns that track verbatim', () => {
    expect(workAvgV3({ lessons: 0.42, quizzes: null, posters: null, blooket: null }))
      .toBeCloseTo(0.42, 6);
  });

  it('no track present → null', () => {
    expect(workAvgV3({ lessons: null, quizzes: null, posters: null, blooket: null })).toBe(null);
    expect(workAvgV3(null)).toBe(null);
  });

  it('weights sum to 1.0 (sanity)', () => {
    const sum = Object.values(V3_WORK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });
});

// ── computeQuarterV3 — aggregation + gating + ceiling ─────────────────────────

const CFG = {
  C: 85,
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
  v3LessonsExcludeQuiz: true,
  useV3: true,
  quarters: {
    Q1: { units: [1], start: '2026-09-01', end: '2026-11-30', pcAnchor: { p85: 40, p100: 60 } },
    Q2: { units: [2], start: '2026-12-01', end: '2027-01-31', pcAnchor: { p85: 45, p100: 64 } },
  },
};

function lessonMapOf(obj) {
  return new Map(Object.entries(obj));
}

describe('computeQuarterV3 — aggregation', () => {
  it('early quarter (PC not due) → quarter grade = workAvg, pcAvg null', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.2': { unit: 1, periods: { B: '2026-09-30', E: '2026-09-30' } }, // future
    };
    // Only 1.1 is due. Cws=80, W=100 → noQuiz = (1·80 + 2·100)/3 = 93.333; Q=60.
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 80, W: 100, Q: 60, lessonGrade: 80 },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
    });
    // lessonsAvg = 0.93333, quizzesAvg = 0.60 → workAvg = mean = 0.76667 → 76.7
    expect(r.pcAvg).toBe(null);
    expect(r.workAvg).toBeCloseTo(76.7, 1);
    expect(r.quarterGrade).toBeCloseTo(76.7, 1);
    expect(r.lessonsDue).toBe(1);
    expect(r.lessonsTotal).toBe(2);
  });

  it('PC due + both tracks above floor → max-of-two', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.2': { unit: 1, periods: { B: '2026-09-11', E: '2026-09-11' } },
    };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: 100, Q: 50, lessonGrade: 100 },
      '1.2': { Cws: 100, W: 100, Q: 50, lessonGrade: 100 },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: { 1: 80 },
    });
    // lessonsAvg=1.0, quizzesAvg=0.5 → workAvg=0.75; pcAvg=0.80 → max=0.80
    expect(r.pcAvg).toBeCloseTo(80.0, 1);
    expect(r.workAvg).toBeCloseTo(75.0, 1);
    expect(r.quarterGrade).toBeCloseTo(80.0, 1);
  });

  it('PC-only gamer (high PC, no work) → 70% ceiling on the grade', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.2': { unit: 1, periods: { B: '2026-09-11', E: '2026-09-11' } },
    };
    const lessonMap = lessonMapOf({}); // no work at all
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: { 1: 100 },
    });
    // both lessons due but ungraded → lessonsAvg=0, quizzesAvg=0 → workAvg=0
    // pcAvg=1.0 → soft branch → max(0.7, 0, 0.5) = 0.7 → 70.0
    expect(r.pcAvg).toBeCloseTo(100.0, 1);
    expect(r.workAvg).toBeCloseTo(0.0, 1);
    expect(r.quarterGrade).toBeCloseTo(70.0, 1);
  });

  it('recorded PC for a not-yet-due unit does NOT leak in (no 100% for skipping due work)', () => {
    // Q1 lessons all future-dated → nothing due; a PC score is recorded anyway.
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-11-20', E: '2026-11-20' } },
      '1.2': { unit: 1, periods: { B: '2026-11-25', E: '2026-11-25' } },
    };
    const lessonMap = lessonMapOf({}); // no work
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: { 1: 100 },
    });
    // PC's unit isn't due (lessons future) → pcAvg null; no due work → workAvg null.
    expect(r.pcAvg).toBe(null);
    expect(r.workAvg).toBe(null);
    expect(r.quarterGrade).toBe(null); // NOT 100 — the anti-gaming floor is not bypassed
  });

  it('PC due but un-attempted engages the 70% single-track ceiling against strong work', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.2': { unit: 1, periods: { B: '2026-09-11', E: '2026-09-11' } },
    };
    // Perfect work on both due lessons + quizzes, but the (now-due) PC is skipped.
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 },
      '1.2': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {}, // PC due, not taken
    });
    // workAvg = mean(lessons 1.0, quizzes 1.0) = 1.0; pcAvg = 0 (due + un-attempted)
    // → soft branch → max(0, 0.7, 0.5) = 0.7 → 70.0
    expect(r.pcAvg).toBeCloseTo(0.0, 1);
    expect(r.workAvg).toBeCloseTo(100.0, 1);
    expect(r.quarterGrade).toBeCloseTo(70.0, 1);
  });

  it('stale prior-cohort lesson date does NOT resurrect a phantom 0 PC (window filter)', () => {
    // Only a pre-window (SY25-26) lesson exists for the unit; the cohort window
    // starts 2026-09-01. The lessons track drops it AND the PC proxy must too —
    // else pcAvg=0 forces quarterGrade=0 instead of the Phase-6-consistent null.
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-04-15', E: '2026-04-15' } },
    };
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap: new Map(), schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      gradingWindowStart: '2026-09-01',
    });
    expect(r.pcAvg).toBe(null);        // phantom NOT resurrected (was 0 before the fix)
    expect(r.workAvg).toBe(null);
    expect(r.quarterGrade).toBe(null); // matches Phase 6 (was 0 before the fix)
  });

  it('an out-of-range raw PC% is clamped so grade/ceiling never exceed 100', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
    };
    const lessonMap = lessonMapOf({ '1.1': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 } });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: { 1: 130 }, // > 100
    });
    expect(r.pcAvg).toBeLessThanOrEqual(100);
    expect(r.quarterGrade).toBeLessThanOrEqual(100);
    expect(r.ceiling).toBeLessThanOrEqual(100);
  });

  it('exclude-quiz flag OFF folds the quiz into the Lessons track', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
    };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: 100, Q: 0, lessonGrade: 50 },
    });
    const cfgOff = { ...CFG, v3LessonsExcludeQuiz: false };
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: cfgOff, lessonMap, schedule,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
    });
    // lessonsAvg uses lessonGrade=50 → 0.50 (not the noQuiz 100).
    expect(r.workAvg).toBeCloseTo(25.0, 1); // mean(0.50 lessons, 0.0 quizzes) = 0.25
  });

  it('buckets a lesson by its unit→quarter band, NOT its calendar date (pack-left)', () => {
    // A unit-1 lesson taught in Q2 calendar territory still counts toward Q1
    // (unit 1 ∈ Q1 band) — matching how PCs bucket + the pack-left intent.
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-12-01', E: '2026-12-01' } }, // Q2 calendar window
    };
    const lessonMap = lessonMapOf({ '1.1': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 } });
    const q1 = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2027-01-01', section: 'PeriodB', unitPcData: {},
    });
    const q2 = computeQuarterV3({
      quarterKey: 'Q2', config: CFG, lessonMap, schedule,
      todayDateStr: '2027-01-01', section: 'PeriodB', unitPcData: {},
    });
    expect(q1.lessonsTotal).toBe(1); // unit 1 → Q1 band, despite the December date
    expect(q2.lessonsTotal).toBe(0); // NOT Q2, even though Dec 1 is in Q2's calendar window
  });

  it('empty quarter (nothing scheduled/due) → all null', () => {
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap: new Map(), schedule: {},
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
    });
    expect(r.quarterGrade).toBe(null);
    expect(r.pcAvg).toBe(null);
    expect(r.workAvg).toBe(null);
    expect(r.ceiling).toBe(null);
    expect(r.lessonsTotal).toBe(0);
  });

  it('ceiling assumes remaining/un-attempted items score 100', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.2': { unit: 1, periods: { B: '2026-09-30', E: '2026-09-30' } }, // future
    };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 50, W: 50, Q: 50, lessonGrade: 50 },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: { 1: 60 },
    });
    // ceiling ≥ current grade, and ≤ 100
    expect(r.ceiling).not.toBe(null);
    expect(r.ceiling).toBeGreaterThanOrEqual(r.quarterGrade);
    expect(r.ceiling).toBeLessThanOrEqual(100);
  });
});
