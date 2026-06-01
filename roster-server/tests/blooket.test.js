// blooket.test.js -- pure-function tests for the Blooket track (Unit A of
// BLOOKET_IMPORT_P2_BUILD.md): blooketScore (the authoritative formula),
// parseItemLesson's BLOOKET-* pattern, computeLessonGrades attaching the
// per-topic blooket score, and computeQuarterV3's mean-of-recorded Blooket
// track -- INCLUDING the load-bearing NO-REGRESSION + renormalization proofs.
// NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { blooketScore } from '../scoring.js';
import {
  parseItemLesson,
  computeLessonGrades,
  computeQuarterV3,
} from '../lesson-grade.js';

// ── blooketScore -- authoritative formula (spec section 1) ─────────────────────

describe('blooketScore -- the authoritative 0..1 formula', () => {
  it('worked cases from the spec', () => {
    expect(blooketScore(30, 30, 30)).toBeCloseTo(1.0, 6);     // perfect
    expect(blooketScore(20, 25, 30)).toBeCloseTo(0.6667, 4);  // walkaway penalty
    expect(blooketScore(15, 15, 30)).toBeCloseTo(0.5, 6);     // half coverage
    expect(blooketScore(33, 35, 30)).toBeCloseTo(0.9429, 4);  // over-total -> pure acc
    expect(blooketScore(0, 0, 30)).toBe(0);                   // no-show
  });

  it('attempted <= 0 -> 0 (no division by zero)', () => {
    expect(blooketScore(5, 0, 30)).toBe(0);
    expect(blooketScore(5, -3, 30)).toBe(0);
  });

  it('clamps into [0,1] and tolerates bad inputs', () => {
    expect(blooketScore(-5, 10, 30)).toBe(0);   // negative correct -> 0
    expect(blooketScore(40, 30, 30)).toBeCloseTo(1.0, 6); // over-perfect -> 1
    expect(blooketScore(10, 10, 0)).toBe(0);    // total <= 0 -> 0
    expect(blooketScore('x', 10, 30)).toBe(0);  // NaN correct -> 0
    expect(blooketScore(5, 'y', 30)).toBe(0);   // NaN attempted -> 0
  });

  it('== correct/total when attempted <= total (coverage is the multiplier)', () => {
    // 20 correct out of 25 attempted, total 30: acc=0.8, cov=25/30 -> 20/30
    expect(blooketScore(20, 25, 30)).toBeCloseTo(20 / 30, 6);
  });
});

// ── parseItemLesson -- BLOOKET pattern ─────────────────────────────────────────

describe('parseItemLesson -- BLOOKET-U{N}L{key}', () => {
  it('BLOOKET-U1L2 -> unit=1, lessonKey="2"', () => {
    expect(parseItemLesson('BLOOKET-U1L2')).toEqual({ unit: 1, lessonKey: '2' });
  });

  it('BLOOKET-U4L1-2 -> unit=4, lessonKey="1-2" (combined worksheet)', () => {
    expect(parseItemLesson('BLOOKET-U4L1-2')).toEqual({ unit: 4, lessonKey: '1-2' });
  });

  it('lowercase blooket-123 is NOT matched (stays null, existing contract)', () => {
    expect(parseItemLesson('blooket-123')).toBe(null);
  });

  it('a trailing suffix after the lessonKey does NOT match (anchored pattern)', () => {
    expect(parseItemLesson('BLOOKET-U1L2-Q1')).toBe(null);
  });
});

// ── computeLessonGrades -- attaches result.blooket ─────────────────────────────

const FRQ_BAND = { E: 100, P: 75, I: 25 };
const SCHEDULE = {
  '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2026-09-09', E: '2026-09-09' } },
  '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2026-09-11', E: '2026-09-11' } },
};

function row(itemId, { source = 'blooket', score = null, recorded_at } = {}) {
  return { item_id: itemId, source, score, response: null, attempt: 1, recorded_at: recorded_at || '2026-09-10T00:00:00Z' };
}

describe('computeLessonGrades -- blooket attachment', () => {
  it('a blooket row attaches result.blooket on 0..100 (clamped from stored 0..1)', () => {
    const rows = [row('BLOOKET-U1L2', { score: 0.8 })];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SCHEDULE, {});
    expect(map.get('1.2').blooket).toBe(80);
  });

  it('a stored score > 1 is clamped to 100; < 0 is clamped to 0', () => {
    const hi = computeLessonGrades([row('BLOOKET-U1L2', { score: 1.5 })], FRQ_BAND, {}, SCHEDULE, {});
    expect(hi.get('1.2').blooket).toBe(100);
    const lo = computeLessonGrades([row('BLOOKET-U1L2', { score: -0.2 })], FRQ_BAND, {}, SCHEDULE, {});
    expect(lo.get('1.2').blooket).toBe(0);
  });

  it('a topic with no blooket row has blooket null', () => {
    const rows = [row('BLOOKET-U1L2', { score: 0.8 })];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SCHEDULE, {});
    // 1.2 has a blooket; the (untouched) 1.1 never gets an accumulator -> not in map
    expect(map.has('1.1')).toBe(false);
  });

  it('a combined blooket (BLOOKET-U4L1-2) attaches to BOTH expanded topics', () => {
    const schedule = {
      '4.1': { unit: 4, topicKey: '4.1', worksheetKey: '1-2', periods: { B: null, E: null }, combinedWith: ['4.2'] },
      '4.2': { unit: 4, topicKey: '4.2', worksheetKey: '1-2', periods: { B: null, E: null }, combinedWith: ['4.1'] },
    };
    const map = computeLessonGrades([row('BLOOKET-U4L1-2', { score: 0.6 })], FRQ_BAND, {}, schedule, {});
    expect(map.get('4.1').blooket).toBe(60);
    expect(map.get('4.2').blooket).toBe(60);
  });
});

// ── computeQuarterV3 -- the Blooket track ──────────────────────────────────────

const CFG = {
  C: 85,
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
  v3LessonsExcludeQuiz: true,
  useV3: true,
  quarters: {
    Q1: { units: [1], start: '2026-09-01', end: '2026-11-30', pcAnchor: { p85: 40, p100: 60 } },
  },
};

function lessonMapOf(obj) {
  return new Map(Object.entries(obj));
}

describe('computeQuarterV3 -- Blooket track (mean-of-recorded)', () => {
  const schedule = {
    '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
    '1.2': { unit: 1, periods: { B: '2026-09-11', E: '2026-09-11' } },
  };

  it('NO REGRESSION: with ZERO blooket rows, workAvg == lessons+quizzes only', () => {
    // Lessons-track value (noQuiz): Cws=80, W=null -> 80 -> .8; quizzes Q=60 -> .6.
    // No blooket attached anywhere. workAvg must renormalize over {lessons,quizzes}.
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null },
      '1.2': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
    });
    // lessons .8, quizzes .6 -> mean = .7 -> 70.0 (byte-identical to pre-blooket)
    expect(r.workAvg).toBeCloseTo(70.0, 1);
  });

  it('RENORMALIZATION: one recorded blooket engages the track and re-weights workAvg', () => {
    // lessons .8, quizzes .6, blooket 1.0 ->
    //   workAvg = (.30*.8 + .30*.6 + .10*1.0)/(.70) = .52/.70 = .742857 -> 74.3
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: 100 },
      '1.2': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
    });
    // exactly one blooket recorded (the 1.1 row) -> blooket track = its mean = 1.0
    expect(r.workAvg).toBeCloseTo(74.3, 1);
  });

  it('mean-of-RECORDED: a missing blooket is EXCLUDED, never counted as 0', () => {
    // Two due lessons; only one has a blooket (0.4). The track mean is 0.4, NOT
    // 0.2 -- the un-recorded lesson must NOT drag the blooket track to half.
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: 40 },
      '1.2': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: null },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
    });
    // lessons 1.0, quizzes 1.0, blooket 0.4 ->
    //   (.30*1 + .30*1 + .10*.4)/.70 = (.30+.30+.04)/.70 = .64/.70 = .914286 -> 91.4
    expect(r.workAvg).toBeCloseTo(91.4, 1);
  });

  it('two recorded blookets -> the track is their MEAN (not the sum / lessonsDue)', () => {
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: 100 },
      '1.2': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: 0 },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
    });
    // blooket track = mean(1.0, 0.0) = 0.5
    // workAvg = (.30*1 + .30*1 + .10*.5)/.70 = .65/.70 = .928571 -> 92.9
    expect(r.workAvg).toBeCloseTo(92.9, 1);
  });

  it('blooket ceiling does NOT inflate: the ceiling uses the recorded mean, not 100', () => {
    // One due lesson, recorded blooket 0.5. The ceiling assumes lessons/quizzes
    // reach 100 for un-attempted items, but the blooket stays at its mean (0.5).
    const oneLesson = { '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } } };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 50, W: null, Q: 50, lessonGrade: 50, blooket: 50 },
    });
    const withBlooket = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule: oneLesson,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: { 1: 50 },
    });
    // ceiling is bounded by 100 and >= the current grade
    expect(withBlooket.ceiling).toBeLessThanOrEqual(100);
    expect(withBlooket.ceiling).toBeGreaterThanOrEqual(withBlooket.quarterGrade);
  });
});
