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
  postersAvgV3,
  posterUnitsInQuarter,
} from '../lesson-grade.js';
import { computeGrade } from '../grade.js';

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
  it('only lessons + quizzes present -> renormalized 30:30 blend', () => {
    // (0.30*0.90 + 0.30*0.60) / 0.60 = (0.27 + 0.18) / 0.60 = 0.45 / 0.60 = 0.75
    expect(workAvgV3({ lessons: 0.90, quizzes: 0.60, posters: null, blooket: null }))
      .toBeCloseTo(0.75, 6);
  });

  it('lessons + quizzes + blooket present (no poster) -> renormalized over 0.70', () => {
    const v = workAvgV3({ lessons: 1.0, quizzes: 0.0, posters: null, blooket: 1.0 });
    // (0.30*1 + 0.30*0 + 0.10*1) / 0.70 = 0.40 / 0.70 = 0.571429
    expect(v).toBeCloseTo(0.40 / 0.70, 6);
  });

  it('a posters key is a Work track (POSTER_WORK_TRACK_SPEC.md: 30% of Work)', () => {
    // posters 0.0: (0.30*1 + 0.30*0 + 0.30*0 + 0.10*1) / 1.00 = 0.40
    expect(workAvgV3({ lessons: 1.0, quizzes: 0.0, posters: 0.0, blooket: 1.0 })).toBeCloseTo(0.40, 6);
    // posters 1.0: (0.30*1 + 0.30*0 + 0.30*1 + 0.10*1) / 1.00 = 0.70
    expect(workAvgV3({ lessons: 1.0, quizzes: 0.0, posters: 1.0, blooket: 1.0 })).toBeCloseTo(0.70, 6);
    // posters alone: a single present track returns that track verbatim
    expect(workAvgV3({ lessons: null, quizzes: null, posters: 0.9, blooket: null })).toBeCloseTo(0.9, 6);
  });

  it('the default weights are 30/30/30/10 with a posters key', () => {
    expect(V3_WORK_WEIGHTS).toEqual({ lessons: 0.30, quizzes: 0.30, posters: 0.30, blooket: 0.10 });
    expect('posters' in V3_WORK_WEIGHTS).toBe(true);
  });

  it('a 1.15 poster clamps Work at 1 (decision 3: Work is clamped AFTER the blend)', () => {
    // 0.30*1 + 0.30*1 + 0.30*1.15 + 0.10*1 = 0.30 + 0.30 + 0.345 + 0.10 = 1.045 -> min(1, 1.045) = 1.0
    expect(workAvgV3({ lessons: 1.0, quizzes: 1.0, posters: 1.15, blooket: 1.0 })).toBe(1.0);
  });

  it('a 1.15 poster lifts a weaker blend (spec section 6 worked case a)', () => {
    // 0.30*0.9 + 0.30*0.7 + 0.30*1.15 + 0.10*0.8 = 0.27 + 0.21 + 0.345 + 0.08 = 0.905 (den 1.00)
    expect(workAvgV3({ lessons: 0.9, quizzes: 0.7, posters: 1.15, blooket: 0.8 })).toBeCloseTo(0.905, 6);
  });

  it('null posters renormalises over the other 0.70 (decision 4: absent, not zero)', () => {
    // (0.30*0.9 + 0.30*0.7 + 0.10*0.8) / 0.70 = (0.27 + 0.21 + 0.08) / 0.70 = 0.56 / 0.70 = 0.80
    expect(workAvgV3({ lessons: 0.9, quizzes: 0.7, posters: null, blooket: 0.8 })).toBeCloseTo(0.80, 6);
  });

  it('all 100 + a 90 poster lowers Work (spec section 6 worked case c)', () => {
    // 0.30*1 + 0.30*1 + 0.30*0.9 + 0.10*1 = 0.30 + 0.30 + 0.27 + 0.10 = 0.97 (den 1.00)
    expect(workAvgV3({ lessons: 1.0, quizzes: 1.0, posters: 0.9, blooket: 1.0 })).toBeCloseTo(0.97, 6);
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
    // lessonsAvg = 0.93333, quizzesAvg = 0.60 (posters + blooket null -> renormalise over .60)
    //   -> workAvg = (.30*.93333 + .30*.60)/.60 = (.28 + .18)/.60 = .46/.60 = 0.76667 -> 76.7
    expect(r.pcAvg).toBe(null);
    expect(r.workAvg).toBeCloseTo(76.7, 1);
    expect(r.quarterGrade).toBeCloseTo(76.7, 1);
    expect(r.lessonsDue).toBe(1);
    expect(r.lessonsTotal).toBe(2);
    expect(r.pcDue).toBe(false);   // PCs not open yet (the unit's last lesson is future)
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
    // lessonsAvg=1.0, quizzesAvg=0.5 -> workAvg=(.30*1 + .30*.5)/.60=(.30+.15)/.60=.45/.60=0.75; pcAvg=0.80 -> max=0.80
    expect(r.pcAvg).toBeCloseTo(80.0, 1);
    expect(r.workAvg).toBeCloseTo(75.0, 1);
    expect(r.quarterGrade).toBeCloseTo(80.0, 1);
    expect(r.pcDue).toBe(true);    // the unit's PCs are due-by-today
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
    expect(r.workAvg).toBeCloseTo(25.0, 1); // (.30*0.50 lessons + .30*0.0 quizzes)/.60 = .15/.60 = 0.25
  });

  it('buckets a lesson by its CALENDAR DATE (quarterOfLesson), not its old-unit band', () => {
    // SY2627 (2026-09-03): the real schedule teaches old units in CED order, so
    // an old unit straddles quarters. A unit-1 lesson due in Q2 counts in Q2
    // (the pre-SY2627 "pack-left" unit-band rule put it in Q1).
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-12-01', E: '2026-12-01' } }, // Q2 calendar window
    };
    const lessonMap = lessonMapOf({ '1.1': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 } });
    const byDate = { ...CFG, v3LessonsByDate: true }; // the live SY2627 config
    const q1 = computeQuarterV3({
      quarterKey: 'Q1', config: byDate, lessonMap, schedule,
      todayDateStr: '2027-01-01', section: 'PeriodB', unitPcData: {},
    });
    const q2 = computeQuarterV3({
      quarterKey: 'Q2', config: byDate, lessonMap, schedule,
      todayDateStr: '2027-01-01', section: 'PeriodB', unitPcData: {},
    });
    expect(q1.lessonsTotal).toBe(0); // NOT Q1 — the December date wins over the old-unit band
    expect(q2.lessonsTotal).toBe(1); // Dec 1 is in Q2's calendar window
  });

  it('WITHOUT v3LessonsByDate (the frozen SY2526 config) the old unit→quarter band still applies', () => {
    // Historical grades must not move: a config snapshot that predates the flag
    // keeps bucketing a unit-1 lesson in Q1 regardless of its date.
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-12-01', E: '2026-12-01' } },
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
    expect(q1.lessonsTotal).toBe(1);
    expect(q2.lessonsTotal).toBe(0);
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

// ── computeQuarterV3 — Blooket make-up track (BLOOKET_MAKEUP_BUILD.md) ─────────
//
// The Blooket is now a real per-lesson grade an absent student can make up via
// the Desk flashcards. The track's denominator = due lessons that HAVE a Blooket
// (`blooketLessons`); a missing-but-due Blooket counts as 0 (mirrors lessons/
// quizzes). r.blooket carries the resolved score (game, else flashcard make-up,
// else null→0). The blooketAvg folds into workAvg — it is NOT returned directly,
// so these assert via r.workAvg.
//
// Blooket weight is 10% (V3_WORK_WEIGHTS.blooket), lessons + quizzes 30% each.
// With lessons=100, quizzes=100 the arithmetic is:
//   no Blooket in denominator → workAvg = (.30+.30)/.60          = 100.0
//   Blooket due, 0 evidence   → workAvg = (.30+.30+.10·0)/.70    =  85.7
//   Blooket made up (80%)     → workAvg = (.30+.30+.10·0.8)/.70  =  97.1
describe('computeQuarterV3 — Blooket make-up track', () => {
  // 1.1 is due; 1.2 is future-dated so the unit's PC is NOT due → pcAvg stays
  // null → quarterGrade == workAvg (keeps the Blooket effect easy to read).
  const SCHEDULE = {
    '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } }, // due
    '1.2': { unit: 1, periods: { B: '2026-11-20', E: '2026-11-20' } }, // future
  };
  // Perfect lessons + quizzes on the one due lesson (Cws/W → noQuiz 100; Q 100).
  function mapWith(blooket) {
    const lesson = { Cws: 100, W: 100, Q: 100, lessonGrade: 100 };
    if (blooket != null) lesson.blooket = blooket;
    return lessonMapOf({ '1.1': lesson });
  }
  function run(blooketLessons, blooket) {
    return computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap: mapWith(blooket), schedule: SCHEDULE,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
      blooketLessons,
    });
  }

  it('a due lesson NOT in blooketLessons is excluded from the Blooket denominator', () => {
    const r = run([], null); // no Blooket-bearing lessons
    expect(r.pcAvg).toBe(null);             // PC not due (1.2 future)
    expect(r.workAvg).toBeCloseTo(100.0, 1); // mean(lessons 100, quizzes 100) only
    expect(r.quarterGrade).toBeCloseTo(100.0, 1);
  });

  it('a due Blooket-bearing lesson with NO evidence counts as 0 (drops workAvg)', () => {
    const r = run(['1.1'], null); // 1.1 has a Blooket, student has no game/flashcard
    // blooketAvg = 0 -> workAvg = (.30*1 + .30*1 + .10*0)/.70 = .60/.70 = 0.85714 -> 85.7
    expect(r.workAvg).toBeCloseTo(85.7, 1);
    expect(r.workAvg).toBeLessThan(100); // strictly below the no-Blooket case
  });

  it('the flashcard make-up (r.blooket=80) lifts workAvg above the 0 case', () => {
    const zero = run(['1.1'], null);
    const made = run(['1.1'], 80); // flashcard pass pinned at 80%
    // blooketAvg = 0.8 -> workAvg = (.30*1 + .30*1 + .10*0.8)/.70 = .68/.70 = 0.97143 -> 97.1
    expect(made.workAvg).toBeCloseTo(97.1, 1);
    expect(made.workAvg).toBeGreaterThan(zero.workAvg); // make-up helps
    expect(made.workAvg).toBeLessThan(100);             // but never a full 100 (no game)
  });

  it('back-compat: omitting blooketLessons leaves the Blooket track null (no tank)', () => {
    // Older callers that never pass blooketLessons → empty set → blooketAvg null
    // → renormalized away. Even a lesson with a recorded r.blooket is ignored.
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap: mapWith(80), schedule: SCHEDULE,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
      // blooketLessons omitted entirely
    });
    expect(r.workAvg).toBeCloseTo(100.0, 1); // Blooket excluded → lessons+quizzes only
  });

  it('exposes workTracks + blooketDue/Done/Todo for the grade coach', () => {
    const made = run(['1.1'], 80);   // 1.1 has a Blooket, made up to 80
    expect(made.workTracks).toBeTruthy();
    expect(made.workTracks.lessons).toBeCloseTo(100, 1);
    expect(made.workTracks.quizzes).toBeCloseTo(100, 1);
    expect(made.workTracks.blooket).toBeCloseTo(80, 1);
    expect(made.workTracks.posters).toBe(null); // no posterScores / workTracks.posters given -> absent (renormalised away)
    expect(made.blooketDue).toBe(1);
    expect(made.blooketDone).toBe(1);
    expect(made.blooketTodo).toEqual([]);

    const todo = run(['1.1'], null); // due Blooket, not done → a make-up opportunity
    expect(todo.workTracks.blooket).toBeCloseTo(0, 1);
    expect(todo.blooketDue).toBe(1);
    expect(todo.blooketDone).toBe(0);
    expect(todo.blooketTodo).toEqual(['1.1']);

    const none = run([], null);      // no Blooket-bearing lesson in the denominator
    expect(none.workTracks.blooket).toBe(null);
    expect(none.blooketDue).toBe(0);
    expect(none.blooketTodo).toEqual([]);
  });

  it('counts an ahead-of-schedule Blooket-only lesson (make-up before the due date)', () => {
    // A FUTURE-dated lesson whose ONLY work is a passed flashcard make-up
    // (blooket 80, no worksheet/quiz → lessonGrade null). The earned 80 must
    // still count — mirrors the lessons track's "if the work is done, count it"
    // rule. Pre-fix this was dropped (the Blooket track iterated dueLessons, and
    // lessonGrade — which gates an undated lesson into dueLessons — excludes blooket).
    const futureSchedule = {
      '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2027-09-01', E: '2027-09-01' } },
    };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: null, W: null, Q: null, lessonGrade: null, blooket: 80 },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule: futureSchedule,
      todayDateStr: '2026-09-10', section: 'PeriodB', unitPcData: {},
      blooketLessons: ['1.1'],
    });
    expect(r.blooketDue).toBe(1);
    expect(r.blooketDone).toBe(1);
    expect(r.blooketTodo).toEqual([]);
    expect(r.workTracks.blooket).toBeCloseTo(80, 1);
    // The lessons/quizzes tracks must NOT get a phantom 0 from this lesson — it's
    // not in dueLessons, so they stay null (only the Blooket track sees it).
    expect(r.workTracks.lessons).toBe(null);
    expect(r.workTracks.quizzes).toBe(null);
    expect(r.workAvg).toBeCloseTo(80, 1); // Blooket alone → workAvg = 80
  });
});

// ── Quiz-bearing denominator (#2 fix) ─────────────────────────────────────────
// The Quiz track divides by due QUIZ-BEARING lessons, not all due lessons, so a
// quiz-less opener no longer drags the quiz average down. Only ever RAISES.
describe('computeQuarterV3 — quiz-bearing denominator', () => {
  it('quiz-less opener is EXCLUDED from the quiz denominator (raises vs old all-due)', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } }, // opener, NO quiz
      '1.2': { unit: 1, periods: { B: '2026-09-10', E: '2026-09-10' } }, // has a quiz
      '1.3': { unit: 1, periods: { B: '2026-09-30', E: '2026-09-30' } }, // future → keeps PC not-due, isolating the quiz effect
    };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: 100, Q: null, lessonGrade: 100 }, // opener: no quiz score
      '1.2': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 },  // aced the quiz
    });
    const args = {
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
    };

    // Fixed: only 1.2 is quiz-bearing → quizzesAvg = 100/1 = 100.
    const fixed = computeQuarterV3({ ...args, quizLessons: ['1.2'] });
    expect(fixed.quizDue).toBe(1);
    expect(fixed.quizDone).toBe(1);
    expect(fixed.workTracks.quizzes).toBeCloseTo(100, 1);
    expect(fixed.workAvg).toBeCloseTo(100, 1); // lessons 100 + quizzes 100

    // Old (no quizLessons → back-compat all-due denominator): 100/2 = 50, dragged.
    const old = computeQuarterV3(args);
    expect(old.workTracks.quizzes).toBeCloseTo(50, 1);
    // The fix only RAISES the grade.
    expect(fixed.quarterGrade).toBeGreaterThanOrEqual(old.quarterGrade);
    expect(fixed.quarterGrade).toBeCloseTo(100, 1);
    expect(old.quarterGrade).toBeCloseTo(75.0, 1); // (.30*1 + .30*.5)/.60 = .45/.60 = 0.75
  });

  it('an un-taken quiz on a quiz-BEARING due lesson still counts as 0 (engagement preserved)', () => {
    const schedule = {
      '1.2': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.3': { unit: 1, periods: { B: '2026-09-10', E: '2026-09-10' } },
    };
    const lessonMap = lessonMapOf({
      '1.2': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 },  // took the quiz
      '1.3': { Cws: 100, W: 100, Q: null, lessonGrade: 100 }, // quiz EXISTS, not taken
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      quizLessons: ['1.2', '1.3'], // BOTH have a quiz
    });
    expect(r.quizDue).toBe(2);
    expect(r.quizDone).toBe(1);
    expect(r.quizTodo).toContain('1.3');
    expect(r.workTracks.quizzes).toBeCloseTo(50, 1); // 100/2 — the skipped quiz = 0
  });
});

// Regression: the quiz surface (and Blooket surface) must SURVIVE grade.js's
// explicit quarters[qKey] serializer into the /grade + /class/grades output, or
// the dashboard "(n/m taken)" verification line silently never renders.
describe('computeGrade — quiz/blooket surface threading', () => {
  const GRADE_CFG = {
    C: 85,
    feederWeights: { W: 1, Q: 2 },
    lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
    frqBand: { E: 100, P: 70, I: 35 },
    useV3: true,
    v3LessonsExcludeQuiz: true,
    schoolTz: 'America/New_York',
    gradingWindowStart: null, // no window filter so the past-dated fixture lessons stay in-band
    quarters: { Q1: { units: [1], start: '2026-01-01', end: '2026-08-31', pcAnchor: { p85: 40, p100: 60 } } },
  };

  it('quarters[Q].quizDue/quizDone/blooketDue reach the serialized output', () => {
    const schedule = {
      '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2026-01-09', E: '2026-01-09' } }, // opener, due
      '1.2': { unit: 1, worksheetKey: '2', periods: { B: '2026-01-10', E: '2026-01-10' } }, // has a quiz, due
    };
    const answerKey = { 'U1-L2-Q01': { answerKey: 'B', unit: '1' } };
    const rows = [
      { item_id: 'U1-L2-Q01', source: 'curriculum_quiz', response: 'B', recorded_at: '2026-01-11T00:00:00Z' },
    ];
    const out = computeGrade(rows, answerKey, GRADE_CFG, { lessonSchedule: schedule, section: 'PeriodB' });
    const q1 = out.quarters.Q1;
    // The #2 fix's verification surface (previously dropped by the serializer):
    expect(typeof q1.quizDue).toBe('number');
    expect(q1.quizDone).toBe(1);   // 1.2's quiz was taken + correct
    expect(q1.quizDue).toBe(1);    // only 1.2 is quiz-bearing (opener 1.1 excluded)
    // Blooket surface stays threaded too (same serializer slot).
    expect(typeof q1.blooketDue).toBe('number');
  });
});

// POSTER_WORK_TRACK_SPEC.md (2026-10-20): posters are a Work track again (30%).
// Without posterScores, computeQuarterV3 falls back to the legacy workTracks.posters
// value, so that channel now DOES move workAvg.
describe('computeQuarterV3 -- workTracks.posters (legacy channel) feeds the posters track', () => {
  const schedule = {
    '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
    '1.2': { unit: 1, periods: { B: '2026-09-30', E: '2026-09-30' } }, // future -> PC not due
  };
  const lessonMap = lessonMapOf({ '1.1': { Cws: 100, W: 100, Q: 50, lessonGrade: 100 } });
  const args = {
    quarterKey: 'Q1', config: CFG, lessonMap, schedule,
    todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
  };

  it('a posters value moves workAvg (and the quarter grade, PC not due)', () => {
    const none = computeQuarterV3(args);
    const zero = computeQuarterV3({ ...args, workTracks: { posters: 0 } });
    const full = computeQuarterV3({ ...args, workTracks: { posters: 1 } });
    // lessons 1.0, quizzes 0.5, no posters/blooket -> (.30 + .15)/.60 = .45/.60 = 0.75 -> 75.0
    expect(none.workAvg).toBeCloseTo(75.0, 1);
    // posters 0 -> (.30*1 + .30*.5 + .30*0)/.90 = .45/.90 = 0.50 -> 50.0
    expect(zero.workAvg).toBeCloseTo(50.0, 1);
    // posters 1 -> (.30*1 + .30*.5 + .30*1)/.90 = .75/.90 = 0.83333 -> 83.3
    expect(full.workAvg).toBeCloseTo(83.3, 1);
    expect(full.quarterGrade).toBeCloseTo(83.3, 1); // pcAvg null -> grade = workAvg
    expect(full.workTracks.posters).toBeCloseTo(100, 1);
  });
});

// -- Posters track (POSTER_WORK_TRACK_SPEC.md sections 1-2) ----------------------------
describe('posters track helpers -- postersAvgV3 / posterUnitsInQuarter', () => {
  it('postersAvgV3 = mean of recorded scores / 100 over the quarter units; a null unit is skipped', () => {
    // only unit 1 has a score: 115 / 100 = 1.15 (NOT clamped -- the clamp is on Work)
    expect(postersAvgV3({ 1: 115, 2: null }, [1, 2])).toBeCloseTo(1.15, 6);
    // two scores: (115 + 90) / 2 / 100 = 102.5 / 100 = 1.025
    expect(postersAvgV3({ 1: 115, 2: 90 }, [1, 2])).toBeCloseTo(1.025, 6);
    // a score for a unit OUTSIDE the quarter's poster units is ignored: mean(90)/100 = 0.90
    expect(postersAvgV3({ 1: 90, 2: 115 }, [1])).toBeCloseTo(0.90, 6);
  });

  it('postersAvgV3 -> null when no poster score exists (absent, never 0)', () => {
    expect(postersAvgV3({}, [1])).toBe(null);
    expect(postersAvgV3({ 1: null }, [1])).toBe(null);
    expect(postersAvgV3(null, [1])).toBe(null);
  });

  it('posterUnitsInQuarter buckets a unit by its poster DATE into the test config quarters', () => {
    const events = { posters: { 1: { periods: { B: '2026-10-08' } } } };
    // 2026-10-08 is inside CFG Q1 (2026-09-01..2026-11-30) -> [1]; Q2 (2026-12-01..) -> []
    expect(posterUnitsInQuarter(events, 'B', CFG, 'Q1')).toEqual([1]);
    expect(posterUnitsInQuarter(events, 'B', CFG, 'Q2')).toEqual([]);
    // no event schedule -> null (callers fall back to the unit band)
    expect(posterUnitsInQuarter(null, 'B', CFG, 'Q1')).toBe(null);
  });
});

describe('computeQuarterV3 -- posterScores feeds the posters track', () => {
  // 1.1 due; 1.2 future -> PC not due -> pcAvg null -> quarterGrade == workAvg.
  const schedule = {
    '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
    '1.2': { unit: 1, periods: { B: '2026-09-30', E: '2026-09-30' } },
  };
  // Unit 1's poster is dated 2026-10-08 (Q1); unit 2's 2026-12-05 (Q2).
  const eventSchedule = {
    posters: {
      1: { periods: { B: '2026-10-08', E: '2026-10-08' } },
      2: { periods: { B: '2026-12-05', E: '2026-12-05' } },
    },
  };
  function run(lesson, posterScores) {
    return computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap: lessonMapOf({ '1.1': lesson }), schedule,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
      eventSchedule, posterScores,
    });
  }
  const weak = { Cws: 100, W: 100, Q: 50, lessonGrade: 100 };   // lessons 1.0, quizzes 0.5
  const perfect = { Cws: 100, W: 100, Q: 100, lessonGrade: 100 }; // lessons 1.0, quizzes 1.0

  it('a 90 poster LIFTS a student whose other tracks average below 90', () => {
    const r = run(weak, { 1: 90 });
    // posters 90/100 = 0.90 -> (.30*1 + .30*.5 + .30*.9)/.90 = (.30 + .15 + .27)/.90 = .72/.90 = 0.80 -> 80.0
    // (without the poster: (.30 + .15)/.60 = 0.75 -> 75.0)
    expect(r.workTracks.posters).toBeCloseTo(90, 1);
    expect(r.workAvg).toBeCloseTo(80.0, 1);
    expect(r.quarterGrade).toBeCloseTo(80.0, 1);
  });

  it('a 90 poster LOWERS a student whose other tracks are 100 (decision 5)', () => {
    const r = run(perfect, { 1: 90 });
    // (.30*1 + .30*1 + .30*.9)/.90 = (.30 + .30 + .27)/.90 = .87/.90 = 0.96667 -> 96.7
    expect(r.workAvg).toBeCloseTo(96.7, 1);
  });

  it('a 115 poster can exceed 1 on its track but Work is clamped at 100', () => {
    const lifted = run(weak, { 1: 115 });
    // (.30*1 + .30*.5 + .30*1.15)/.90 = (.30 + .15 + .345)/.90 = .795/.90 = 0.88333 -> 88.3
    expect(lifted.workTracks.posters).toBeCloseTo(115, 1);
    expect(lifted.workAvg).toBeCloseTo(88.3, 1);
    const clamped = run(perfect, { 1: 115 });
    // (.30 + .30 + .345)/.90 = .945/.90 = 1.05 -> min(1, 1.05) = 1.0 -> 100.0
    expect(clamped.workAvg).toBeCloseTo(100.0, 1);
    expect(clamped.quarterGrade).toBeCloseTo(100.0, 1);
  });

  it("no score for the quarter's poster unit -> posters null, Work renormalises (decision 4)", () => {
    const none = run(weak, {});
    expect(none.workTracks.posters).toBe(null);
    // (.30*1 + .30*.5)/.60 = .45/.60 = 0.75 -> 75.0
    expect(none.workAvg).toBeCloseTo(75.0, 1);
    // a score for unit 2 (poster dated in Q2) is ignored by Q1 -> same 75.0
    const otherQuarter = run(weak, { 2: 115 });
    expect(otherQuarter.workTracks.posters).toBe(null);
    expect(otherQuarter.workAvg).toBeCloseTo(75.0, 1);
  });
});
