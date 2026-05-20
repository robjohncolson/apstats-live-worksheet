// lesson-grade.test.js — pure-function unit tests for Gradebook Phase 6.
// Tests parseItemLesson, expandLessonKey, computeLessonGrades,
// computeQuarterFromLessons, todayInTz, sectionToPeriod.
// NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  parseItemLesson,
  expandLessonKey,
  computeLessonGrades,
  computeQuarterFromLessons,
  buildLessonsArray,
  todayInTz,
  sectionToPeriod,
} from '../lesson-grade.js';

// ── parseItemLesson ────────────────────────────────────────────────────────────

describe('parseItemLesson — item-ID pattern coverage', () => {

  it('WS-U1L2-Q5 → unit=1, lessonKey="2"', () => {
    expect(parseItemLesson('WS-U1L2-Q5')).toEqual({ unit: 1, lessonKey: '2' });
  });

  it('WS-U4L1-2-reflect1 → unit=4, lessonKey="1-2"', () => {
    expect(parseItemLesson('WS-U4L1-2-reflect1')).toEqual({ unit: 4, lessonKey: '1-2' });
  });

  it('WS-U4L3-4-5-reflect1 → unit=4, lessonKey="3-4-5"', () => {
    expect(parseItemLesson('WS-U4L3-4-5-reflect1')).toEqual({ unit: 4, lessonKey: '3-4-5' });
  });

  it('WS-U6L1-2-frq1 → unit=6, lessonKey="1-2"', () => {
    expect(parseItemLesson('WS-U6L1-2-frq1')).toEqual({ unit: 6, lessonKey: '1-2' });
  });

  it('U6-L3-Q1 (curriculum_quiz) → unit=6, lessonKey="3"', () => {
    expect(parseItemLesson('U6-L3-Q1')).toEqual({ unit: 6, lessonKey: '3' });
  });

  it('CR-U2-L4-DESK_DONE → unit=2, lessonKey="4"', () => {
    expect(parseItemLesson('CR-U2-L4-DESK_DONE')).toEqual({ unit: 2, lessonKey: '4' });
  });

  it('WS-U2-L4-DESK_DONE → unit=2, lessonKey="4"', () => {
    expect(parseItemLesson('WS-U2-L4-DESK_DONE')).toEqual({ unit: 2, lessonKey: '4' });
  });

  it('U1-PC-Q3 → unit=1, lessonKey=null (PC is unit-scoped)', () => {
    expect(parseItemLesson('U1-PC-Q3')).toEqual({ unit: 1, lessonKey: null });
  });

  it('U1-PC-MCQ-A-Q01 → unit=1, lessonKey=null', () => {
    expect(parseItemLesson('U1-PC-MCQ-A-Q01')).toEqual({ unit: 1, lessonKey: null });
  });

  it('unparseable → null', () => {
    expect(parseItemLesson('garbage-item-id')).toBe(null);
    expect(parseItemLesson('')).toBe(null);
    expect(parseItemLesson(null)).toBe(null);
    expect(parseItemLesson(undefined)).toBe(null);
  });

  it('blooket ID → null (not a gradeable source)', () => {
    expect(parseItemLesson('blooket-123')).toBe(null);
  });
});

// ── expandLessonKey ────────────────────────────────────────────────────────────

const SAMPLE_SCHEDULE = {
  '4.1': { unit: 4, topicKey: '4.1', worksheetKey: '1-2', periods: { B: null, E: null }, combinedWith: ['4.2'] },
  '4.2': { unit: 4, topicKey: '4.2', worksheetKey: '1-2', periods: { B: null, E: null }, combinedWith: ['4.1'] },
  '4.6': { unit: 4, topicKey: '4.6', worksheetKey: '6', periods: { B: null, E: null } },
  '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2020-01-01', E: '2020-01-02' } },
  '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2020-01-03', E: '2020-01-04' } },
};

describe('expandLessonKey — combined-worksheet expansion', () => {

  it('combined key "1-2" in unit 4 → [4.1, 4.2]', () => {
    const result = expandLessonKey(4, '1-2', SAMPLE_SCHEDULE);
    expect(result.sort()).toEqual(['4.1', '4.2']);
  });

  it('solo key "6" in unit 4 → ["4.6"]', () => {
    expect(expandLessonKey(4, '6', SAMPLE_SCHEDULE)).toEqual(['4.6']);
  });

  it('solo key "1" in unit 1 → ["1.1"]', () => {
    expect(expandLessonKey(1, '1', SAMPLE_SCHEDULE)).toEqual(['1.1']);
  });

  it('key not in schedule → []', () => {
    expect(expandLessonKey(4, '99', SAMPLE_SCHEDULE)).toEqual([]);
  });

  it('null lessonKey → [] (PC items skipped)', () => {
    expect(expandLessonKey(1, null, SAMPLE_SCHEDULE)).toEqual([]);
  });

  it('null schedule → synthesizes "{unit}.{lessonKey}" so the no-schedule fallback works (Codex MAJOR 2 fold 2026-05-20)', () => {
    // Prior behaviour returned [] which left lessonMap empty in the graceful-
    // degrade path, collapsing quarterGrade to null. New behaviour: synthesize
    // a topicKey so lesson-level math still runs without a real schedule.
    expect(expandLessonKey(1, '1', null)).toEqual(['1.1']);
    expect(expandLessonKey(4, '1-2', null)).toEqual(['4.1-2']);
    // Null lessonKey still returns [] (PC items remain unit-scoped).
    expect(expandLessonKey(1, null, null)).toEqual([]);
  });
});

// ── computeLessonGrades ────────────────────────────────────────────────────────

const FRQ_BAND = { E: 100, P: 70, I: 35 };
const SAMPLE_ANSWER_KEY = {
  'U1-L1-Q01': { answerKey: 'B', unit: '1' },
  'U1-L2-Q01': { answerKey: 'C', unit: '1' },
};

function makeRow(itemId, opts = {}) {
  return {
    item_id: itemId,
    source: opts.source || 'frq',
    score: opts.score !== undefined ? opts.score : null,
    response: opts.response || null,
    unit: opts.unit || null,
    recorded_at: opts.recorded_at || '2026-01-01T00:00:00Z',
  };
}

describe('computeLessonGrades — lesson math', () => {

  it('two FRQ-Is on 1.1 → W=35, lessonGrade=35', () => {
    const rows = [
      makeRow('WS-U1L1-r1', { source: 'frq', score: 0 }),
      makeRow('WS-U1L1-r2', { source: 'frq', score: 0 }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l).toBeDefined();
    expect(l.W).toBe(35);
    expect(l.Q).toBe(null);
    expect(l.lessonGrade).toBe(35);
  });

  it('FRQ-E + quiz 0% → weighted W:Q=1:2, grade=(100+2*0)/3=33.3', () => {
    // Codex 2026-05-20 fold: title was misleading ("80%" but actually tests
    // 0% quiz). Renamed + corrected; the 80% case lives in the next test.
    const rows = [
      makeRow('WS-U1L2-r1', { source: 'frq', score: 1 }),                 // E → 100
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'X' }), // wrong → 0%
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE);
    const l = map.get('1.2');
    expect(l).toBeDefined();
    expect(l.W).toBe(100);
    expect(l.Q).toBe(0);   // 1 graded, 0 correct
    expect(l.lessonGrade).toBeCloseTo(33.3, 1);
  });

  it('FRQ-E + quiz 80% (4/5) → weighted W:Q=1:2, grade=(100+2*80)/3=86.7', () => {
    // Real 80%-mixed-feeder case. 5 quiz items, 4 correct → Q=80; W=100 from
    // one FRQ-E → lessonGrade = (1*100 + 2*80) / 3 ≈ 86.67.
    const extendedKey = Object.assign({}, SAMPLE_ANSWER_KEY, {
      'U1-L2-Q01': { unit: 'U1', answerKey: 'B' },
      'U1-L2-Q02': { unit: 'U1', answerKey: 'B' },
      'U1-L2-Q03': { unit: 'U1', answerKey: 'B' },
      'U1-L2-Q04': { unit: 'U1', answerKey: 'B' },
      'U1-L2-Q05': { unit: 'U1', answerKey: 'B' },
    });
    const rows = [
      makeRow('WS-U1L2-r1', { source: 'frq', score: 1 }),                  // E → 100
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'B' }),  // correct
      makeRow('U1-L2-Q02', { source: 'curriculum_quiz', response: 'B' }),  // correct
      makeRow('U1-L2-Q03', { source: 'curriculum_quiz', response: 'B' }),  // correct
      makeRow('U1-L2-Q04', { source: 'curriculum_quiz', response: 'B' }),  // correct
      makeRow('U1-L2-Q05', { source: 'curriculum_quiz', response: 'X' }),  // wrong → 4/5 = 80%
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, extendedKey, SAMPLE_SCHEDULE);
    const l = map.get('1.2');
    expect(l).toBeDefined();
    expect(l.W).toBe(100);
    expect(l.Q).toBe(80);
    expect(l.lessonGrade).toBeCloseTo(86.7, 1);
  });

  it('FRQ-E only (no quiz) → W=100, Q=null, lessonGrade=100 (W-only renormalized)', () => {
    const rows = [
      makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l.W).toBe(100);
    expect(l.Q).toBe(null);
    expect(l.lessonGrade).toBe(100);
  });

  it('quiz-only (no frq) → W=null, Q=score, lessonGrade=Q', () => {
    const rows = [
      makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'B' }), // correct
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l.W).toBe(null);
    expect(l.Q).toBe(100);   // 1/1 correct
    expect(l.lessonGrade).toBe(100);
  });

  it('combined WS-U4L1-2 contributes to both 4.1 AND 4.2', () => {
    const rows = [
      makeRow('WS-U4L1-2-reflect1', { source: 'frq', score: 0 }), // I → 35
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const l41 = map.get('4.1');
    const l42 = map.get('4.2');
    expect(l41).toBeDefined();
    expect(l42).toBeDefined();
    expect(l41.lessonGrade).toBe(35);
    expect(l42.lessonGrade).toBe(35);
  });

  it('both null (no frq + no quiz) → lessonGrade null', () => {
    const rows = [
      makeRow('WS-U1L1-done', { source: 'worksheet' }), // completion-only
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l.W).toBe(null);
    expect(l.Q).toBe(null);
    expect(l.lessonGrade).toBe(null);
  });

  it('PC items are NOT included in lesson grades (skipped)', () => {
    const rows = [
      makeRow('U1-PC-Q01', { source: 'pc', score: 1 }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    // No lesson entry should have been created for PC items.
    expect(map.size).toBe(0);
  });
});

// ── todayInTz + sectionToPeriod ───────────────────────────────────────────────

describe('todayInTz', () => {
  it('returns a YYYY-MM-DD string for valid timezone', () => {
    const result = todayInTz('America/New_York');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a YYYY-MM-DD string for invalid timezone (graceful fallback)', () => {
    const result = todayInTz('Fake/Timezone');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('sectionToPeriod', () => {
  it('PeriodB → B', () => expect(sectionToPeriod('PeriodB')).toBe('B'));
  it('PeriodE → E', () => expect(sectionToPeriod('PeriodE')).toBe('E'));
  it('B → B (bare)', () => expect(sectionToPeriod('B')).toBe('B'));
  it('null → null', () => expect(sectionToPeriod(null)).toBe(null));
  it('unknown string → null', () => expect(sectionToPeriod('Section1')).toBe(null));
});

// ── computeQuarterFromLessons ─────────────────────────────────────────────────

describe('computeQuarterFromLessons — date-driven quarter grade', () => {

  const ALL_PAST_SCHEDULE = {
    '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2020-01-01', E: '2020-01-01' } },
    '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2020-01-02', E: '2020-01-02' } },
  };

  const ALL_FUTURE_SCHEDULE = {
    '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2099-01-01', E: '2099-01-01' } },
    '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2099-01-01', E: '2099-01-01' } },
  };

  const MIXED_SCHEDULE = {
    '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2020-01-01', E: '2020-01-01' } },
    '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2099-01-01', E: '2099-01-01' } },
  };

  const TODAY = '2026-05-20';

  function lessonMap(entries) {
    const m = new Map();
    for (const [k, v] of Object.entries(entries)) m.set(k, v);
    return m;
  }

  it('empty band → quarterGrade null, lessonsDue=0, lessonsTotal=0', () => {
    const result = computeQuarterFromLessons({
      quarterBand: [1],
      lessonMap: new Map(),
      schedule: {},
      todayDateStr: TODAY,
      section: null,
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.quarterGrade).toBe(null);
    expect(result.lessonsDue).toBe(0);
    expect(result.lessonsTotal).toBe(0);
  });

  it('all lessons future → quarterGrade null, lessonsDue=0', () => {
    const result = computeQuarterFromLessons({
      quarterBand: [1],
      lessonMap: new Map(),
      schedule: ALL_FUTURE_SCHEDULE,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.quarterGrade).toBe(null);
    expect(result.lessonsDue).toBe(0);
    expect(result.lessonsTotal).toBe(2);
  });

  it('1 lesson due-and-graded at 35, 1 due-ungraded → quarterGrade = 35/2 = 17.5', () => {
    const map = lessonMap({ '1.1': { lessonGrade: 35, W: 35, Q: null, frqItems: [], quizItems: [], worksheetItems: [] } });
    const result = computeQuarterFromLessons({
      quarterBand: [1],
      lessonMap: map,
      schedule: ALL_PAST_SCHEDULE,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.quarterGrade).toBe(17.5);
    expect(result.lessonsDue).toBe(2);
    expect(result.lessonsGraded).toBe(1);
  });

  it('1 due graded at 35, 1 future → quarterGrade=35, ceiling=(35+100)/2=67.5', () => {
    const map = lessonMap({ '1.1': { lessonGrade: 35, W: 35, Q: null, frqItems: [], quizItems: [], worksheetItems: [] } });
    const result = computeQuarterFromLessons({
      quarterBand: [1],
      lessonMap: map,
      schedule: MIXED_SCHEDULE,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.quarterGrade).toBe(35);
    expect(result.ceiling).toBe(67.5);
    expect(result.lessonsDue).toBe(1);
    expect(result.lessonsTotal).toBe(2);
  });

  it('26 lessons all due, all graded at 100 → rawQuarter=100, banked=85, quarterGrade=85', () => {
    // Build a schedule of 26 lessons in U1 (simulates Q1 band).
    const schedule26 = {};
    const lm = new Map();
    for (let i = 1; i <= 26; i++) {
      const k = `1.${i}`;
      schedule26[k] = { unit: 1, topicKey: k, worksheetKey: String(i), periods: { B: '2020-01-01', E: '2020-01-01' } };
      lm.set(k, { lessonGrade: 100, W: 100, Q: null, frqItems: [], quizItems: [], worksheetItems: [] });
    }
    const result = computeQuarterFromLessons({
      quarterBand: [1],
      lessonMap: lm,
      schedule: schedule26,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.quarterGrade).toBe(85);
    expect(result.ceiling).toBe(null);  // all done, no room to grow
    expect(result.lessonsDue).toBe(26);
    expect(result.lessonsGraded).toBe(26);
    expect(result.lessonsTotal).toBe(26);
  });

  it('PC-only data: P_quarter > 0 with nothing due → quarterGrade = P_quarter', () => {
    const result = computeQuarterFromLessons({
      quarterBand: [1],
      lessonMap: new Map(),
      schedule: ALL_FUTURE_SCHEDULE,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 92.5 },
      C: 85,
    });
    // Nothing due → rawQuarter null; P_quarter=92.5 → quarterGrade=92.5.
    expect(result.quarterGrade).toBe(92.5);
  });

  it('PC + lessons: max(banked, P_quarter) preserves only-raises asymmetry', () => {
    // banked=35 from one graded lesson; P_quarter=92.5.
    const map = lessonMap({ '1.1': { lessonGrade: 35, W: 35, Q: null, frqItems: [], quizItems: [], worksheetItems: [] } });
    const result = computeQuarterFromLessons({
      quarterBand: [1],
      lessonMap: map,
      schedule: MIXED_SCHEDULE,    // 1.1 is past, 1.2 is future
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 92.5 },
      C: 85,
    });
    // rawQuarter=35/1=35, banked=35; P=92.5 > banked → quarterGrade=92.5.
    expect(result.quarterGrade).toBe(92.5);
  });

  it('unknown section → uses union of B+E dates', () => {
    // Both B and E are in the past → lessons are due even without knowing section.
    const result = computeQuarterFromLessons({
      quarterBand: [1],
      lessonMap: new Map(),
      schedule: ALL_PAST_SCHEDULE,
      todayDateStr: TODAY,
      section: null,   // unknown
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.lessonsDue).toBe(2);
  });
});
