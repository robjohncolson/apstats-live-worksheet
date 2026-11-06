// lesson-grade.test.js — pure-function unit tests for Gradebook Phase 6.
// Tests parseItemLesson, expandLessonKey, computeLessonGrades,
// computeQuarterFromLessons, todayInTz, sectionToPeriod.
// NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseItemLesson,
  expandLessonKey,
  buildWorksheetBlankCounts,
  computeLessonGrades,
  computeQuarterFromLessons,
  computeQuarterV3,
  quarterOfLesson,
  buildLessonsArray,
  computeQuizTotals,
  todayInTz,
  sectionToPeriod,
  dueTodayForQuarter,
  lessonNeverZero,
  addLateScoresThatHelp,
  isDateDue,
} from '../lesson-grade.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import { resolveProductionGradeInputs } from '../grade-contexts.js';
import { summarizeOrphanRows } from '../grade.js';

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

  it('BL-U1-L1-DESK_DONE (blooket flashcard make-up) → unit=1, lessonKey="1"', () => {
    expect(parseItemLesson('BL-U1-L1-DESK_DONE')).toEqual({ unit: 1, lessonKey: '1' });
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

  // 2026-11-05: u4_lesson3-4-5_live.html stamps its items "WS-U4L3-5-..." while the
  // schedule's worksheetKey is "3-4-5". The range form expands to the same topics.
  const RANGE_SCHEDULE = {
    ...SAMPLE_SCHEDULE,
    '4.3': { unit: 4, topicKey: '4.3', worksheetKey: '3-4-5', periods: { B: null, E: null }, combinedWith: ['4.4', '4.5'] },
    '4.4': { unit: 4, topicKey: '4.4', worksheetKey: '3-4-5', periods: { B: null, E: null }, combinedWith: ['4.3', '4.5'] },
    '4.5': { unit: 4, topicKey: '4.5', worksheetKey: '3-4-5', periods: { B: null, E: null }, combinedWith: ['4.3', '4.4'] },
  };

  it('range key "3-5" expands to the schedule "3-4-5" topics', () => {
    expect(expandLessonKey(4, '3-5', RANGE_SCHEDULE).sort()).toEqual(['4.3', '4.4', '4.5']);
  });

  it('the exact key "3-4-5" still expands as before', () => {
    expect(expandLessonKey(4, '3-4-5', RANGE_SCHEDULE).sort()).toEqual(['4.3', '4.4', '4.5']);
  });

  it('a range that spans two different worksheets matches nothing ("1-3")', () => {
    expect(expandLessonKey(4, '1-3', RANGE_SCHEDULE)).toEqual([]);
  });

  it('a range never matches a worksheet with different ends ("3-4")', () => {
    expect(expandLessonKey(4, '3-4', RANGE_SCHEDULE)).toEqual([]);
  });

  it('the range form respects the bonus filter', () => {
    expect(expandLessonKey(4, '3-5', RANGE_SCHEDULE, new Set(['4.5'])).sort()).toEqual(['4.3', '4.4']);
  });

  it('solo key "6" in unit 4 → ["4.6"]', () => {
    expect(expandLessonKey(4, '6', SAMPLE_SCHEDULE)).toEqual(['4.6']);
  });

  // Bonus-aware expansion (Codex HIGH 2026-08-07: old-3.7 via the shared
  // 3.6-7 worksheet). Year-aware by construction — SY2526's frozen context
  // derives an empty bonus set, so historical expansion is unchanged.
  it('combined key filters bonus members when a bonus set is provided', () => {
    const result = expandLessonKey(4, '1-2', SAMPLE_SCHEDULE, new Set(['4.2']));
    expect(result).toEqual(['4.1']);
  });

  it('combined key keeps legacy expansion when the bonus set is empty', () => {
    const result = expandLessonKey(4, '1-2', SAMPLE_SCHEDULE, new Set());
    expect(result.sort()).toEqual(['4.1', '4.2']);
  });

  it('combined key with ALL members bonus keeps the unfiltered expansion', () => {
    const result = expandLessonKey(4, '1-2', SAMPLE_SCHEDULE, new Set(['4.1', '4.2']));
    expect(result.sort()).toEqual(['4.1', '4.2']);
  });

  it('solo keys ignore the bonus set (bonus credit for direct rows is unchanged)', () => {
    expect(expandLessonKey(4, '6', SAMPLE_SCHEDULE, new Set(['4.6']))).toEqual(['4.6']);
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

describe('computeLessonGrades — shared-worksheet bonus filter (3.6-7 shape)', () => {
  const SCHEDULE_367 = {
    '3.6': { unit: 3, topicKey: '3.6', worksheetKey: '6-7', periods: { B: null, E: null }, combinedWith: ['3.7'] },
    '3.7': { unit: 3, topicKey: '3.7', worksheetKey: '6-7', periods: { B: null, E: null }, combinedWith: ['3.6'] },
  };
  const rows = [
    { source: 'frq', item_id: 'WS-U3L6-7-reflect1', score: 1, ts: 1 },
    { source: 'worksheet', item_id: 'WS-U3L6-7-b1', response: 'x', ts: 1 },
  ];
  const FRQ_BAND = { E: 100, P: 70, I: 35 };

  it('SY2627 lists (3.7 bonus): rows land in 3.6 only — no resurrected bonus lesson', () => {
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SCHEDULE_367, { bonusTopics: new Set(['3.7']) });
    expect(map.has('3.6')).toBe(true);
    expect(map.has('3.7')).toBe(false);
  });

  it('SY2526-style lists (empty bonus set): historical double expansion preserved', () => {
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SCHEDULE_367, { bonusTopics: new Set() });
    expect(map.has('3.6')).toBe(true);
    expect(map.has('3.7')).toBe(true);
  });
});

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

  it('FRQ-E + quiz 0% → weighted W:Q=2:3 (lessonFeederWeights renorm), grade=(2*100+3*0)/5=40', () => {
    // With lessonFeederWeights ws:W:Q=1:2:3, when ws absent W:Q renormalize to 2:3.
    // grade = (2*100 + 3*0) / (2+3) = 200/5 = 40.
    const rows = [
      makeRow('WS-U1L2-r1', { source: 'frq', score: 1 }),                 // E → 100
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'X' }), // wrong → 0%
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE);
    const l = map.get('1.2');
    expect(l).toBeDefined();
    expect(l.W).toBe(100);
    expect(l.Q).toBe(0);   // 1 graded, 0 correct
    expect(l.lessonGrade).toBeCloseTo(40, 1);
  });

  it('FRQ-E + quiz 80% (4/5) → weighted W:Q=2:3 (lessonFeederWeights renorm), grade=(2*100+3*80)/5=88', () => {
    // With lessonFeederWeights ws:W:Q=1:2:3, when ws absent W:Q renormalize to 2:3.
    // grade = (2*100 + 3*80) / (2+3) = (200+240)/5 = 88.
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
    expect(l.lessonGrade).toBeCloseTo(88, 1);
    // lessonGradeNoQuiz (the v3 Lessons-track value / the in-app Follow-Along cell)
    // EXCLUDES the quiz feeder: W-only (no Cws here) = 100, not the 88 that folds
    // the quiz in. This is the gap the in-app gradebook reconciliation surfaces.
    expect(l.lessonGradeNoQuiz).toBe(100);
  });

  it('lessonGradeNoQuiz === lessonGrade when there is no quiz', () => {
    const rows = [makeRow('WS-U1L1-r1', { source: 'frq', score: 1 })]; // FRQ-E only
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l.lessonGradeNoQuiz).toBe(100);
    expect(l.lessonGradeNoQuiz).toBe(l.lessonGrade);
  });

  it('lessonGradeNoQuiz is null when neither Cws nor W present (quiz-only lesson)', () => {
    const rows = [makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'B' })];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l.Q).not.toBe(null);
    expect(l.lessonGradeNoQuiz).toBe(null);
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
  it('PeriodX → E (live universal section follows Period E pacing)', () => expect(sectionToPeriod('PeriodX')).toBe('E'));
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
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
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
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
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
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
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
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
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
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
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
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
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
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
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
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
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

// ── W1: buildWorksheetBlankCounts ─────────────────────────────────────────────

// Minimal manifest fixture for blank-count tests.
const MANIFEST_FIXTURE = {
  generatedFrom: 'fixture',
  units: [
    {
      unit: 'U1',
      lessons: [
        {
          lesson: '1.1',
          activities: [
            {
              activity: 'worksheet',
              source: 'worksheet',
              itemIds: [
                'WS-U1L1-Q1',
                'WS-U1L1-Q2',
                'WS-U1L1-Q3',
                'WS-U1L1-reflect1',   // NOT a blank
                'WS-U1L1-exitTicket', // NOT a blank
              ],
            },
          ],
        },
        {
          lesson: '1.2',
          activities: [
            {
              activity: 'worksheet',
              source: 'worksheet',
              itemIds: [
                'WS-U1L2-Q1',
                'WS-U1L2-Q2',
              ],
            },
          ],
        },
      ],
    },
    {
      unit: 'U4',
      lessons: [
        {
          lesson: '4.1-2',
          activities: [
            {
              activity: 'worksheet',
              source: 'worksheet',
              itemIds: [
                'WS-U4L1-2-Q1',
                'WS-U4L1-2-Q2',
                'WS-U4L1-2-Q3',
                'WS-U4L1-2-reflect1', // NOT a blank
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('buildWorksheetBlankCounts — manifest parsing', () => {

  it('counts only -Q# itemIds (not reflections or exitTickets)', () => {
    const counts = buildWorksheetBlankCounts(MANIFEST_FIXTURE);
    expect(counts['1.1']).toBe(3);  // Q1, Q2, Q3 only
    expect(counts['1.2']).toBe(2);  // Q1, Q2
    expect(counts['4.1-2']).toBe(3); // Q1, Q2, Q3 only
  });

  it('keys by the manifest lesson string verbatim', () => {
    const counts = buildWorksheetBlankCounts(MANIFEST_FIXTURE);
    expect(Object.keys(counts).sort()).toEqual(['1.1', '1.2', '4.1-2']);
  });

  it('returns {} on null/undefined manifest', () => {
    expect(buildWorksheetBlankCounts(null)).toEqual({});
    expect(buildWorksheetBlankCounts(undefined)).toEqual({});
  });

  it('returns {} on malformed manifest (missing units array)', () => {
    expect(buildWorksheetBlankCounts({})).toEqual({});
    expect(buildWorksheetBlankCounts({ units: 'notanarray' })).toEqual({});
  });

  it('skips lesson entries without a string lesson key', () => {
    const badManifest = {
      units: [
        { unit: 'U1', lessons: [{ lesson: 42, activities: [] }] },
      ],
    };
    expect(buildWorksheetBlankCounts(badManifest)).toEqual({});
  });
});

// ── FRQ_PROVISIONAL_FLOOR (2026-09-14): blanks-only lessons never fall on grading ──

describe('computeLessonGrades — provisional reflection floor', () => {
  const BAND = { E: 100, P: 85, I: 60 };
  const COUNTS = { '1.1': 3 };
  const WEIGHTS = { ws: 1, W: 2, Q: 3 };
  const SINCE = '2026-09-15';
  const NEW = '2026-09-20T14:00:00Z';   // worksheet started after the cutoff
  const OLD = '2026-09-10T14:00:00Z';   // worksheet started before the cutoff
  const blanks = (ts) => [
    { item_id: 'WS-U1L1-Q1', source: 'worksheet', score: 1, response: null, recorded_at: ts },
    { item_id: 'WS-U1L1-Q2', source: 'worksheet', score: 1, response: null, recorded_at: ts },
    { item_id: 'WS-U1L1-Q3', source: 'worksheet', score: 1, response: null, recorded_at: ts },
  ];
  const run = (rows, extra = {}) => computeLessonGrades(rows, BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, {
    worksheetBlankCounts: COUNTS, weights: WEIGHTS, frqFloorSince: SINCE, ...extra,
  }).get('1.1');

  it('blanks only, started after the cutoff → reflections count at the I band and the lesson is provisional', () => {
    const l = run(blanks(NEW));
    expect(l.Cws).toBe(100);
    expect(l.W).toBe(null);                        // nothing graded — display stays honest
    expect(l.frqProvisional).toBe(true);
    // (1*100 + 2*60) / 3 = 73.3
    expect(l.lessonGrade).toBe(73.3);
    expect(l.lessonGradeNoQuiz).toBe(73.3);
  });

  it('grading the reflections can only RAISE a provisional lesson (P,P → 90; I,I → same 73.3)', () => {
    const pp = run([...blanks(NEW),
      makeRow('WS-U1L1-reflect1', { source: 'frq', score: 0.5, recorded_at: NEW }),
      makeRow('WS-U1L1-reflect2', { source: 'frq', score: 0.5, recorded_at: NEW }),
    ]);
    expect(pp.frqProvisional).toBe(false);
    expect(pp.W).toBe(85);
    expect(pp.lessonGradeNoQuiz).toBe(90);        // (100 + 2*85)/3
    const ii = run([...blanks(NEW),
      makeRow('WS-U1L1-reflect1', { source: 'frq', score: 0, recorded_at: NEW }),
    ]);
    expect(ii.frqProvisional).toBe(false);
    expect(ii.lessonGradeNoQuiz).toBe(73.3);      // never below the provisional number
  });

  it('blanks only, started BEFORE the cutoff → old behavior (blanks alone, no flag)', () => {
    const l = run(blanks(OLD));
    expect(l.frqProvisional).toBe(false);
    expect(l.lessonGrade).toBe(100);
    expect(l.lessonGradeNoQuiz).toBe(100);
  });

  it('the EARLIEST blank decides "started": editing one blank later does not pull an old lesson under the floor', () => {
    const rows = blanks(OLD);
    rows[2] = { ...rows[2], recorded_at: NEW };
    const l = run(rows);
    expect(l.frqProvisional).toBe(false);
    expect(l.lessonGradeNoQuiz).toBe(100);
  });

  it('floor disabled (frqFloorSince null / absent) → old behavior everywhere', () => {
    expect(run(blanks(NEW), { frqFloorSince: null }).lessonGradeNoQuiz).toBe(100);
    const map = computeLessonGrades(blanks(NEW), BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: COUNTS, weights: WEIGHTS,
    });
    expect(map.get('1.1').lessonGradeNoQuiz).toBe(100);
    expect(map.get('1.1').frqProvisional).toBe(false);
  });

  it('no blanks recorded → no floor (FRQ-only and quiz-only lessons are untouched)', () => {
    const l = computeLessonGrades([
      makeRow('WS-U1L1-reflect1', { source: 'frq', score: 1, recorded_at: NEW }),
    ], BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, { worksheetBlankCounts: COUNTS, weights: WEIGHTS, frqFloorSince: SINCE }).get('1.1');
    expect(l.frqProvisional).toBe(false);
    expect(l.lessonGradeNoQuiz).toBe(100);
  });

  it('with a quiz present the floor still enters the full blend: (1*100 + 2*60 + 3*100)/6', () => {
    const l = run([...blanks(NEW), makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'B', recorded_at: NEW })]);
    expect(l.frqProvisional).toBe(true);
    expect(l.lessonGrade).toBe(86.7);
    expect(l.lessonGradeNoQuiz).toBe(73.3);
  });

  it('exit ticket graded but no reflection: bonus still rides on the provisional base, never below it', () => {
    const l = run([...blanks(NEW), makeRow('WS-U1L1-exitTicket', { source: 'frq', score: 1, recorded_at: NEW })]);
    expect(l.exitBonus).toBe(5);
    expect(l.lessonGradeNoQuiz).toBeGreaterThanOrEqual(73.3);
  });
});

// ── W1: computeLessonGrades with worksheet blank scoring ──────────────────────

const W1_WEIGHTS = { ws: 1, W: 2, Q: 3 };
const BLANK_COUNTS = { '1.1': 3, '4.1-2': 3 };

function makeBlankRow(itemId, score, opts = {}) {
  return {
    item_id: itemId,
    source: 'worksheet',
    score: score,
    response: null,
    unit: opts.unit || null,
    recorded_at: opts.recorded_at || '2026-01-01T00:00:00Z',
  };
}

describe('W1: computeLessonGrades — worksheet blank scoring', () => {

  it('three-way weighted mean: all feeders present → (Cws*1 + W*2 + Q*3)/6', () => {
    // Lesson 1.1: 3 blanks in manifest (count key "1.1").
    // 3 blank rows all correct (score=1): Cws = (3*1)/3 * 100 = 100.
    // 1 FRQ-E: W = 100. 1 quiz correct/1: Q = 100.
    // B = (1*100 + 2*100 + 3*100) / (1+2+3) = 600/6 = 100.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      makeBlankRow('WS-U1L1-Q2', 1),
      makeBlankRow('WS-U1L1-Q3', 1),
      makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),                     // E → 100
      makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'B' }),      // correct
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l).toBeDefined();
    expect(l.Cws).toBe(100);
    expect(l.W).toBe(100);
    expect(l.Q).toBe(100);
    expect(l.lessonGrade).toBe(100);
  });

  it('three-way weighted mean: mixed scores → (Cws*1 + W*2 + Q*3)/6', () => {
    // 3-blank lesson: 1 correct (1), 1 partial (0.5), 1 wrong (0).
    // sum = 1.5, blankCount = 3 → Cws = (1.5/3)*100 = 50.
    // FRQ-E: W = 100. Quiz: 0% (wrong). Q = 0.
    // B = (1*50 + 2*100 + 3*0) / 6 = (50+200+0)/6 = 250/6 ≈ 41.7
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),    // correct
      makeBlankRow('WS-U1L1-Q2', 0.5),  // partial
      makeBlankRow('WS-U1L1-Q3', 0),    // wrong
      makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),                     // E → 100
      makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'X' }),     // wrong → 0%
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBeCloseTo(50, 1);
    expect(l.W).toBe(100);
    expect(l.Q).toBe(0);
    expect(l.lessonGrade).toBeCloseTo(41.7, 1);
  });

  it('worksheet-only lesson: only Cws present → lessonGrade=Cws', () => {
    // 3 blanks, all scored 1. No FRQ, no quiz.
    // Cws = 100. B = (1*100)/(1) = 100.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      makeBlankRow('WS-U1L1-Q2', 1),
      makeBlankRow('WS-U1L1-Q3', 1),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBe(100);
    expect(l.W).toBe(null);
    expect(l.Q).toBe(null);
    expect(l.lessonGrade).toBe(100);
  });

  it('a flashcard self-attest (BL-…-DESK_DONE) is the Blooket MAKE-UP, but stays out of Cws/lessonGrade', () => {
    // BLOOKET_MAKEUP_BUILD.md: the BL- row no longer touches Cws (fails
    // BLANK_ITEM_PATTERN) or lessonGrade, but it NOW stands in as the Blooket
    // score (make-up) when there's no game score. Score is 0..100 (the pass %).
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      makeBlankRow('WS-U1L1-Q2', 1),
      makeBlankRow('WS-U1L1-Q3', 1),
      makeRow('BL-U1-L1-DESK_DONE', { source: 'worksheet', score: 80 }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBe(100);          // Cws untouched (BL- is not a blank)
    expect(l.blooket).toBe(80);       // make-up Blooket from the flashcard pass
    expect(l.lessonGrade).toBe(100);  // lessonGrade is Cws/W/Q only — no blooket
  });

  it('blooket = the BETTER of the game and the flashcard (max, not game-wins)', () => {
    // FLASHCARD_TIMED_DECK_BUILD.md: a strong timed-deck run beats a mediocre game.
    const higherFlash = computeLessonGrades([
      makeRow('BLOOKET-U1L1', { source: 'blooket', score: 0.6 }),        // game 60%
      makeRow('BL-U1-L1-DESK_DONE', { source: 'worksheet', score: 80 }), // flashcard 80%
    ], FRQ_BAND, {}, SAMPLE_SCHEDULE, { worksheetBlankCounts: BLANK_COUNTS, weights: W1_WEIGHTS });
    expect(higherFlash.get('1.1').blooket).toBe(80);  // flashcard wins (it's higher)

    const higherGame = computeLessonGrades([
      makeRow('BLOOKET-U1L1', { source: 'blooket', score: 0.9 }),        // game 90%
      makeRow('BL-U1-L1-DESK_DONE', { source: 'worksheet', score: 80 }), // flashcard 80%
    ], FRQ_BAND, {}, SAMPLE_SCHEDULE, { worksheetBlankCounts: BLANK_COUNTS, weights: W1_WEIGHTS });
    expect(higherGame.get('1.1').blooket).toBe(90);   // game wins (it's higher)
  });

  it('renormalization when ws feeder absent (no blank rows): W:Q = 2:3', () => {
    // No blanks submitted. Cws = null. FRQ-E (W=100), quiz 0%.
    // B = (2*100 + 3*0) / (2+3) = 200/5 = 40.
    const rows = [
      makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),                     // E → 100
      makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'X' }),     // wrong → 0%
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBe(null);
    expect(l.W).toBe(100);
    expect(l.Q).toBe(0);
    expect(l.lessonGrade).toBeCloseTo(40, 1);
  });

  it('partial-credit blank (score=0.5) contributes 0.5 to the numerator', () => {
    // 3 blanks: 1 correct, 1 partial, 1 unattempted (absent from ledger).
    // sum recorded = 1 + 0.5 = 1.5; blankCount from manifest = 3.
    // Cws = (1.5/3) * 100 = 50.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      makeBlankRow('WS-U1L1-Q2', 0.5),
      // Q3 absent — contributes 0 to numerator, still in denominator (count=3)
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBeCloseTo(50, 1);
  });

  it('Cws denominator from manifest (unattempted blanks absent from ledger count as 0)', () => {
    // 3 blanks in manifest. Only 1 recorded blank (score=1).
    // Cws = (1/3) * 100 ≈ 33.3. The 2 absent blanks weigh down the score.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      // Q2, Q3 never submitted — 0 in numerator, 3 in denominator
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBeCloseTo(33.3, 1);
  });

  it('DESK_DONE row is excluded from blank scoring', () => {
    // The synthetic DESK_DONE row must NOT appear in worksheetItems for blank scoring.
    const rows = [
      { item_id: 'WS-U1-L1-DESK_DONE', source: 'worksheet', score: null, response: null, recorded_at: '2026-01-01T00:00:00Z' },
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    // DESK_DONE parses to unit=1, lessonKey='1'. Schedule maps 1.1 → '1.1'
    // but the item_id doesn't match BLANK_ITEM_PATTERN so worksheetItems is empty.
    const l = map.get('1.1');
    expect(l).toBeDefined();
    expect(l.worksheetItems).toHaveLength(0);
    expect(l.Cws).toBe(null);
  });

  it('null/undefined score on a blank row treated as 0', () => {
    // A blank row with score=null (e.g. not yet wired by W1 client script).
    // Should count as 0 in numerator but the blank still appears in worksheetItems.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', null),
      makeBlankRow('WS-U1L1-Q2', undefined),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    // sum = 0 + 0 = 0; blankCount = 3 → Cws = 0.
    expect(l.Cws).toBe(0);
  });

  it('missing manifest → Cws null, no crash, W/Q still compute', () => {
    // opts.worksheetBlankCounts = null → Cws = null; B from W+Q only.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      makeBlankRow('WS-U1L1-Q2', 1),
      makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: null,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l).toBeDefined();
    expect(l.Cws).toBe(null);
    expect(l.W).toBe(100);
    expect(l.lessonGrade).toBe(100); // only W present → W-only renormalized
  });

  it('combined worksheet Cws lands on both topic keys (4.1 AND 4.2)', () => {
    // WS-U4L1-2-Q1 expands to both 4.1 and 4.2 via the schedule.
    // 3 blanks, all score 1 → Cws = 100 on both topics.
    const rows = [
      makeBlankRow('WS-U4L1-2-Q1', 1),
      makeBlankRow('WS-U4L1-2-Q2', 1),
      makeBlankRow('WS-U4L1-2-Q3', 1),
    ];
    const blanks = { '4.1-2': 3 };
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: blanks,
      weights: W1_WEIGHTS,
    });
    const l41 = map.get('4.1');
    const l42 = map.get('4.2');
    expect(l41).toBeDefined();
    expect(l42).toBeDefined();
    expect(l41.Cws).toBe(100);
    expect(l42.Cws).toBe(100);
    expect(l41.lessonGrade).toBe(100);
    expect(l42.lessonGrade).toBe(100);
  });
});

// ── computeQuizTotals + buildLessonsArray quizTotal ───────────────────────────
// The Desk quiz-Done gate needs a per-topic total of gradable quiz questions
// (the "% answered" denominator). computeQuizTotals derives it from the answer
// key, bucketing via expandLessonKey so combined-worksheet topics sum their
// constituent lessons.

describe('computeQuizTotals — per-topic gradable quiz counts from the answer key', () => {
  const KEY = {
    'U1-L1-Q01': { answerKey: 'A', unit: '1' },     // → 1.1 (1)
    'U1-L2-Q01': { answerKey: 'B', unit: '1' },     // → 1.2
    'U1-L2-Q02': { answerKey: 'C', unit: '1' },     // → 1.2
    'U1-L2-Q03': { answerKey: null, unit: '1' },    // ungradable → excluded
    'U4-L1-Q01': { answerKey: 'D', unit: '4' },     // combined → 4.1 + 4.2
    'U4-L2-Q01': { answerKey: 'E', unit: '4' },     // combined → 4.1 + 4.2
    'U4-L6-Q01': { answerKey: 'A', unit: '4' },     // → 4.6
    'U1-PC-Q01': { answerKey: 'B', unit: '1' },     // PC → excluded (no L#-Q)
    'WS-U1L2-Q5': { answerKey: 'A' },               // worksheet blank → excluded
  };

  it('counts gradable L#-Q quiz items per topic, excluding ungradable/PC/worksheet', () => {
    const totals = computeQuizTotals(KEY, SAMPLE_SCHEDULE);
    expect(totals['1.1']).toBe(1);
    expect(totals['1.2']).toBe(2);          // Q03 ungradable, excluded
    expect(totals['4.6']).toBe(1);
    expect(totals['1.PC']).toBeUndefined(); // PC not counted
  });

  it('buckets per-topic quizzes to their own topic, matching buildLessonMap bucketing', () => {
    const totals = computeQuizTotals(KEY, SAMPLE_SCHEDULE);
    // cr quiz itemIds use SOLO lesson keys (U4-L1-Q, U4-L2-Q), so expandLessonKey
    // maps each to its own topic only — NOT the combined group. This is the same
    // expandLessonKey buildLessonMap uses for attempted items, so a topic's
    // "% answered" = attempted/total compares like-for-like even when 4.1/4.2
    // share a worksheet.
    expect(totals['4.1']).toBe(1);
    expect(totals['4.2']).toBe(1);
  });

  it('null answerKey or schedule → {}', () => {
    expect(computeQuizTotals(null, SAMPLE_SCHEDULE)).toEqual({});
    expect(computeQuizTotals(KEY, null)).toEqual({});
  });

  it('buildLessonsArray surfaces quizTotal per lesson (0 when the topic has no quiz)', () => {
    const totals = computeQuizTotals(KEY, SAMPLE_SCHEDULE);
    const lessons = buildLessonsArray(new Map(), SAMPLE_SCHEDULE, undefined, null, totals);
    const byKey = Object.fromEntries(lessons.map(l => [l.lessonKey, l]));
    expect(byKey['1.2'].quizTotal).toBe(2);
    expect(byKey['4.6'].quizTotal).toBe(1);
    // A scheduled topic with no answer-key quiz items defaults to 0.
    const l11 = byKey['1.1'];
    expect(l11.quizTotal).toBe(1);
    // Omitting quizTotals entirely defaults every lesson to 0 (back-compat).
    const lessonsNoTotals = buildLessonsArray(new Map(), SAMPLE_SCHEDULE);
    expect(lessonsNoTotals.every(l => l.quizTotal === 0)).toBe(true);
  });
});

// ── Q = correct / TOTAL (unanswered counts as wrong) ──────────────────────────
// Aligns the quiz track with the Desk button: 1 right of 3 = 33%, not 100%.
// Requires a schedule so computeQuizTotals can resolve the denominator.

describe('computeLessonGrades — Q scores correct/total (unanswered = wrong)', () => {
  const KEY3 = {
    'U1-L2-Q01': { answerKey: 'A', unit: '1' },
    'U1-L2-Q02': { answerKey: 'B', unit: '1' },
    'U1-L2-Q03': { answerKey: 'C', unit: '1' },
  };

  it('1 of 3 answered correctly → Q = 33.3 (NOT 100 — no longer correct/attempted)', () => {
    const rows = [makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' })];
    const map = computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {});
    expect(map.get('1.2').Q).toBe(33.3);
  });

  it('3 of 3 answered, 2 correct → Q = 66.7', () => {
    const rows = [
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' }),  // correct
      makeRow('U1-L2-Q02', { source: 'curriculum_quiz', response: 'B' }),  // correct
      makeRow('U1-L2-Q03', { source: 'curriculum_quiz', response: 'X' }),  // wrong
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {});
    expect(map.get('1.2').Q).toBe(66.7);
  });

  it('all 3 correct → Q = 100', () => {
    const rows = [
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' }),
      makeRow('U1-L2-Q02', { source: 'curriculum_quiz', response: 'B' }),
      makeRow('U1-L2-Q03', { source: 'curriculum_quiz', response: 'C' }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {});
    expect(map.get('1.2').Q).toBe(100);
  });

  it('no quiz attempted → Q stays null (never tanks a not-yet-taken lesson)', () => {
    const rows = [makeRow('WS-U1L2-frq1', { source: 'frq', score: 1 })];
    const map = computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {});
    expect(map.get('1.2').Q).toBe(null);
  });

  it('no schedule → defensive fallback to correct/attempted (1/1 = 100)', () => {
    const rows = [makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' })];
    const map = computeLessonGrades(rows, FRQ_BAND, KEY3, null, {});
    // Without a schedule computeQuizTotals can't resolve the denominator, so Q
    // falls back to correct/attempted. expandLessonKey synthesizes "1.2".
    expect(map.get('1.2').Q).toBe(100);
  });
});

// ── AI-granted quiz exceptions (source='quiz_exception', item_id `<base>#exc`) ──
// A wrong quiz item the AI accepted on appeal counts correct, lifting Q.

describe('computeLessonGrades — AI-granted quiz exceptions flip an item correct', () => {
  const KEY3 = {
    'U1-L2-Q01': { answerKey: 'A', unit: '1' },
    'U1-L2-Q02': { answerKey: 'B', unit: '1' },
    'U1-L2-Q03': { answerKey: 'C', unit: '1' },
  };

  it('an exception row flips a wrong item to correct (1/3 → 2/3)', () => {
    const rows = [
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' }),  // correct
      makeRow('U1-L2-Q02', { source: 'curriculum_quiz', response: 'X' }),  // wrong (key B)
      makeRow('U1-L2-Q03', { source: 'curriculum_quiz', response: 'Y' }),  // wrong (key C)
    ];
    expect(computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {}).get('1.2').Q).toBe(33.3);

    const withExc = computeLessonGrades(
      [...rows, makeRow('U1-L2-Q02#exc', { source: 'quiz_exception', response: 'X' })],
      FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {}
    );
    expect(withExc.get('1.2').Q).toBe(66.7);                 // Q02 forgiven → 2 of 3
    expect(withExc.get('1.2').quizItems.length).toBe(3);     // no phantom quiz item added
  });

  it('exception with no matching quiz row is inert (cannot manufacture a score)', () => {
    const rows = [makeRow('U1-L2-Q99#exc', { source: 'quiz_exception', response: 'Z' })];
    const acc = computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {}).get('1.2');
    expect(acc ? acc.Q : null).toBe(null);
  });
});

// ── quiz_review partial credit (E=1, P=2/3, I=1/3) ────────────────────────────
// AI-review rows (source='quiz_review', item_id <base>#rev, score=credit) give a
// wrong quiz item partial credit; per-item credit = MAX(answer-key, review).

describe('computeLessonGrades — quiz_review partial credit (E=1, P=2/3, I=1/3)', () => {
  const PKEY = {
    'U1-L2-Q01': { answerKey: 'A', unit: '1' },
    'U1-L2-Q02': { answerKey: 'B', unit: '1' },
    'U1-L2-Q03': { answerKey: 'C', unit: '1' },
  };
  const base = [
    makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' }),  // correct → 1
    makeRow('U1-L2-Q02', { source: 'curriculum_quiz', response: 'X' }),  // wrong
    makeRow('U1-L2-Q03', { source: 'curriculum_quiz', response: 'Y' }),  // wrong
  ];

  it('a P review (2/3) lifts a wrong item to partial credit: 1 + 2/3 of 3 = 55.6', () => {
    const rows = [...base, makeRow('U1-L2-Q02#rev', { source: 'quiz_review', response: 'X', score: 2 / 3 })];
    expect(computeLessonGrades(rows, FRQ_BAND, PKEY, SAMPLE_SCHEDULE, {}).get('1.2').Q).toBe(55.6);
  });

  it('P + I reviews stack: 1 + 2/3 + 1/3 = 2 of 3 = 66.7', () => {
    const rows = [
      ...base,
      makeRow('U1-L2-Q02#rev', { source: 'quiz_review', response: 'X', score: 2 / 3 }),
      makeRow('U1-L2-Q03#rev', { source: 'quiz_review', response: 'Y', score: 1 / 3 }),
    ];
    expect(computeLessonGrades(rows, FRQ_BAND, PKEY, SAMPLE_SCHEDULE, {}).get('1.2').Q).toBe(66.7);
  });

  it('credit = MAX(key, review): a correct item is not lowered by a low review', () => {
    const rows = [...base, makeRow('U1-L2-Q01#rev', { source: 'quiz_review', response: 'A', score: 1 / 3 })];
    const acc = computeLessonGrades(rows, FRQ_BAND, PKEY, SAMPLE_SCHEDULE, {}).get('1.2');
    expect(acc.Q).toBe(33.3); // Q01 stays 1; Q02/Q03 = 0
    expect(acc.quizItems.find(q => q.itemId === 'U1-L2-Q01').credit).toBe(1);
  });

  it('legacy quiz_exception still reads as full credit (1.0)', () => {
    const rows = [...base, makeRow('U1-L2-Q02#exc', { source: 'quiz_exception', response: 'X' })];
    expect(computeLessonGrades(rows, FRQ_BAND, PKEY, SAMPLE_SCHEDULE, {}).get('1.2').Q).toBe(66.7);
  });

  it('buildLessonsArray surfaces a per-item credit field', () => {
    const rows = [...base, makeRow('U1-L2-Q02#rev', { source: 'quiz_review', response: 'X', score: 2 / 3 })];
    const map = computeLessonGrades(rows, FRQ_BAND, PKEY, SAMPLE_SCHEDULE, {});
    const lessons = buildLessonsArray(map, SAMPLE_SCHEDULE, undefined, null, computeQuizTotals(PKEY, SAMPLE_SCHEDULE));
    const q02 = lessons.find(x => x.lessonKey === '1.2').items.quiz.find(q => q.itemId === 'U1-L2-Q02');
    expect(q02.credit).toBeCloseTo(2 / 3, 5);
  });
});

// ── 2026-10-22 band re-set (frqBand E 107.5 / P 92.5 / I 81.25 / ungraded 70) ──
// Review D1 (REVIEW_2026_10_22_EVENING.md): commits 22aa29e5 + ddfccdf2 pinned the
// config values but not the lesson numbers they were solved from. These pin the
// production band end to end through computeLessonGrades.

describe('computeLessonGrades — production frqBand targets (2026-10-22)', () => {
  const BAND = PHASE3_CONFIG.frqBand;
  const SINCE = PHASE3_CONFIG.frqProvisionalFloorSince;
  const COUNTS = { '1.1': 3 };
  const WEIGHTS = PHASE3_CONFIG.lessonFeederWeights;
  const NEW = '2026-10-20T14:00:00Z';
  const blanks = () => [
    { item_id: 'WS-U1L1-Q1', source: 'worksheet', score: 1, response: null, recorded_at: NEW },
    { item_id: 'WS-U1L1-Q2', source: 'worksheet', score: 1, response: null, recorded_at: NEW },
    { item_id: 'WS-U1L1-Q3', source: 'worksheet', score: 1, response: null, recorded_at: NEW },
  ];
  const reflections = (score) => [
    makeRow('WS-U1L1-reflect1', { source: 'frq', score, recorded_at: NEW }),
    makeRow('WS-U1L1-reflect2', { source: 'frq', score, recorded_at: NEW }),
  ];
  const run = (rows) => computeLessonGrades(rows, BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, {
    worksheetBlankCounts: COUNTS, weights: WEIGHTS, frqFloorSince: SINCE,
  }).get('1.1');

  it('all blanks right + no reflection graded → 80 (provisional, the ungraded value)', () => {
    const l = run(blanks());
    expect(l.frqProvisional).toBe(true);
    expect(l.lessonGrade).toBe(80);
    expect(l.lessonGradeNoQuiz).toBe(80);
  });

  it('all blanks right + I,I → 87.5; P,P → 95; E,E → 105 (never above the lesson ceiling)', () => {
    expect(run([...blanks(), ...reflections(0)]).lessonGrade).toBe(87.5);
    expect(run([...blanks(), ...reflections(0.5)]).lessonGrade).toBe(95);
    expect(run([...blanks(), ...reflections(1)]).lessonGrade).toBe(105);
    expect(run([...blanks(), ...reflections(1)]).lessonGradeNoQuiz).toBe(105);
  });

  it('a graded I reads above the ungraded provisional number (grading only raises)', () => {
    expect(BAND.I).toBeGreaterThan(BAND.ungraded);
    expect(run([...blanks(), ...reflections(0)]).lessonGrade).toBeGreaterThan(run(blanks()).lessonGrade);
  });

  it('a reflection-only E lesson is clamped to 105, not 107.5', () => {
    const l = run(reflections(1));
    expect(l.W).toBe(107.5);              // the feeder keeps the band value
    expect(l.lessonGrade).toBe(105);
    expect(l.lessonGradeNoQuiz).toBe(105);
  });

  it('a band without `ungraded` (frozen SY2526 shape) still floors at I', () => {
    const l = computeLessonGrades(blanks(), { E: 100, P: 85, I: 60 }, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: COUNTS, weights: WEIGHTS, frqFloorSince: SINCE,
    }).get('1.1');
    expect(l.lessonGrade).toBe(73.3);
  });
});

describe('computeLessonGrades - orphan rows (id names an unscheduled lesson)', () => {
  const real = () => [
    makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),
    makeRow('WS-U1L2-r1', { source: 'frq', score: 0 }),
  ];
  const orphan = makeRow('WS-U1L77-Q1', { source: 'worksheet', score: 1 });

  it('an orphan row is counted on map.orphans, not silently dropped', () => {
    const map = computeLessonGrades([...real(), orphan], FRQ_BAND, {}, SAMPLE_SCHEDULE);
    expect(map.orphans).toEqual([
      { itemId: 'WS-U1L77-Q1', source: 'worksheet', unit: 1, lessonKey: '77' },
    ]);
  });

  it('the orphan does not change any lesson grade or the Map shape', () => {
    const without = computeLessonGrades(real(), FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const withOrphan = computeLessonGrades([...real(), orphan], FRQ_BAND, {}, SAMPLE_SCHEDULE);
    expect([...withOrphan.keys()]).toEqual([...without.keys()]);
    expect([...withOrphan.entries()]).toEqual([...without.entries()]);
    expect(Object.keys(withOrphan)).toEqual([]);   // non-enumerable: invisible to spreads/JSON
    expect(without.orphans).toEqual([]);
  });

  it('PC items (unit-scoped) and unparseable ids are not orphans', () => {
    const rows = [makeRow('U1-PC-Q1', { source: 'pc', score: 1 }), makeRow('POSTER-U1', { source: 'frq', score: 1 })];
    expect(computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE).orphans).toEqual([]);
  });

  it('summarizeOrphanRows: null when none, else count + first 5 item ids', () => {
    expect(summarizeOrphanRows([])).toBe(null);
    expect(summarizeOrphanRows(undefined)).toBe(null);
    const many = Array.from({ length: 7 }, (_, i) => ({ itemId: `WS-U1L77-Q${i + 1}` }));
    expect(summarizeOrphanRows(many)).toEqual({
      count: 7,
      samples: ['WS-U1L77-Q1', 'WS-U1L77-Q2', 'WS-U1L77-Q3', 'WS-U1L77-Q4', 'WS-U1L77-Q5'],
    });
  });
});

describe('combined-worksheet lessons share one flashcard deck', () => {
  const FRQ_BAND = { E: 107.5, P: 92.5, I: 81.25, ungraded: 70 };
  const SCHED = {
    '4.1': { unit: 4, topicKey: '4.1', worksheetKey: '1-2', periods: { B: null, E: null }, combinedWith: ['4.2'] },
    '4.2': { unit: 4, topicKey: '4.2', worksheetKey: '1-2', periods: { B: null, E: null }, combinedWith: ['4.1'] },
    '4.6': { unit: 4, topicKey: '4.6', worksheetKey: '6', periods: { B: null, E: null } },
  };
  const row = (itemId, score, source = 'worksheet') => ({ item_id: itemId, source, score, response: null, unit: null, recorded_at: null });

  it('a deck played from Day 1 counts for Day 2 too', () => {
    const map = computeLessonGrades([row('BL-U4-L1-DESK_DONE', 96.6)], FRQ_BAND, {}, SCHED, {});
    expect(map.get('4.1').blooket).toBe(96.6);
    expect(map.get('4.2').blooket).toBe(96.6);
  });

  it('a deck played from Day 2 only counts for Day 1 (the Blooket track keys the group by its first topic)', () => {
    const map = computeLessonGrades([row('BL-U4-L2-DESK_DONE', 70)], FRQ_BAND, {}, SCHED, {});
    expect(map.get('4.1').blooket).toBe(70);
    expect(map.get('4.2').blooket).toBe(70);
    expect(map.get('4.1').lessonGrade).toBeNull();
  });

  it('the HIGHEST of the two days wins for both, game and flashcard alike', () => {
    const map = computeLessonGrades([
      row('BL-U4-L1-DESK_DONE', 60),
      row('BL-U4-L2-DESK_DONE', 85),
      row('BLOOKET-U4L1', 0.9, 'blooket'),
    ], FRQ_BAND, {}, SCHED, {});
    expect(map.get('4.1').blooket).toBe(90);
    expect(map.get('4.2').blooket).toBe(90);
  });

  it('a solo worksheet never borrows another lesson\'s deck', () => {
    const map = computeLessonGrades([row('BL-U4-L1-DESK_DONE', 96.6)], FRQ_BAND, {}, SCHED, {});
    expect(map.get('4.6')).toBeUndefined();
  });
});

// ── Quarter-end zero freeze (QUARTER_ZERO_FREEZE_SPEC.md, teacher 2026-11-06) ──
// "Whatever is a zero on the quarter's last day counts as a zero; anything that is merely
// late does not turn into a zero afterwards. Late work still counts when it is finished."
// Q1 ends Fri 2026-11-06. 4.1 (zero date 11-02/11-03) is a 0 inside Q1; 4.5 (zero date
// 11-12/11-15) was merely late when Q1 closed; 5.1 is a Q2 lesson. From 11-07 on, 4.5 is
// "late" in Q1: never a 0, and its scores join each track only where they help.

describe('quarter-end zero freeze', () => {
  const LIVE = { ...PHASE3_CONFIG, pcTrack: { enabled: false } };   // PC off: isolate the Work tracks
  const { zeroFreezeAtQuarterEnd: _flag, ...LEGACY } = LIVE;          // the same config without the freeze
  const SCHEDULE = {
    '4.1': { unit: 4, worksheetKey: '1', periods: { B: '2026-10-20', E: '2026-10-21' } },
    '4.5': { unit: 4, worksheetKey: '5', periods: { B: '2026-10-30', E: '2026-11-02' } },
    '5.1': { unit: 5, worksheetKey: '1', periods: { B: '2026-11-10', E: '2026-11-11' } },
  };
  const DONE_41 = { Cws: 80, W: 80, Q: 80, lessonGrade: 80, blooket: 80 };
  const DONE_45 = { Cws: 90, W: 90, Q: 70, lessonGrade: 80, blooket: 60, trainer: 50 };
  const STRONG_45 = { Cws: 95, W: 95, Q: 90, lessonGrade: 92, blooket: 100 };
  const mapOf = (entries) => new Map(Object.entries(entries));
  function v3(config, lessonMap, todayDateStr, { quarterKey = 'Q1', section = 'PeriodB' } = {}) {
    return computeQuarterV3({
      quarterKey, config, lessonMap, schedule: SCHEDULE, todayDateStr, section, unitPcData: {},
      quizLessons: ['4.1', '4.5', '5.1'], blooketLessons: ['4.1', '4.5', '5.1'], trainerLessons: ['4.5'],
    });
  }
  function phase6(config, lessonMap, todayDateStr) {
    return computeQuarterFromLessons({
      quarterKey: 'Q1', config, lessonMap, schedule: SCHEDULE, todayDateStr,
      section: 'PeriodB', pcBandData: { P_quarter: 0 }, C: 85,
    });
  }

  it('the live SY2627 config turns the freeze on; the frozen SY2526 config does not have it', () => {
    expect(PHASE3_CONFIG.zeroFreezeAtQuarterEnd).toBe(true);
    const sy2526 = JSON.parse(readFileSync(new URL('../data/grade-config.sy2526-freeze.json', import.meta.url), 'utf8'));
    expect('zeroFreezeAtQuarterEnd' in sy2526).toBe(false);
  });

  describe('dueTodayForQuarter (the one clamp both quarter engines use)', () => {
    it('clamps today to the quarter end once the quarter is over', () => {
      expect(dueTodayForQuarter('2026-11-20', 'Q1', LIVE)).toBe('2026-11-06');
      expect(dueTodayForQuarter('2027-03-01', 'Q2', LIVE)).toBe('2027-01-22');
    });
    it('is a no-op while the quarter is open, on its last day, and for later quarters', () => {
      expect(dueTodayForQuarter('2026-11-05', 'Q1', LIVE)).toBe('2026-11-05');
      expect(dueTodayForQuarter('2026-11-06', 'Q1', LIVE)).toBe('2026-11-06');
      expect(dueTodayForQuarter('2026-11-20', 'Q2', LIVE)).toBe('2026-11-20');
    });
    it('without the flag, an unknown quarter, no quarters or no today: today unchanged', () => {
      expect(dueTodayForQuarter('2026-11-20', 'Q1', LEGACY)).toBe('2026-11-20');
      expect(dueTodayForQuarter('2026-11-20', 'Q9', LIVE)).toBe('2026-11-20');
      expect(dueTodayForQuarter('2026-11-20', 'Q1', { zeroFreezeAtQuarterEnd: true })).toBe('2026-11-20');
      expect(dueTodayForQuarter('2026-11-20', 'Q1', null)).toBe('2026-11-20');
      expect(dueTodayForQuarter(null, 'Q1', LIVE)).toBeNull();
    });
  });

  describe('lessonNeverZero (the /grade neverZero flag)', () => {
    it('a zero date after the quarter end can never be a 0; one before it can', () => {
      expect(lessonNeverZero('2026-11-12', 'Q1', LIVE)).toBe(true);
      expect(lessonNeverZero('2026-11-05', 'Q1', LIVE)).toBe(false);
    });
    it('boundary: a zero date ON the last day is never a 0 under dueAfterLessonDay (that day has not ended)', () => {
      expect(lessonNeverZero('2026-11-06', 'Q1', LIVE)).toBe(true);
      // The engine agrees: due-ness is judged at the quarter end, and 11-06 < 11-06 is false.
      expect(isDateDue('2026-11-06', dueTodayForQuarter('2027-06-30', 'Q1', LIVE), LIVE)).toBe(false);
      // The old due-at-start-of-day rule would have zeroed it on the last day itself.
      expect(lessonNeverZero('2026-11-06', 'Q1', { ...LIVE, dueAfterLessonDay: false })).toBe(false);
    });
    it('always agrees with the clamped due test, around every quarter end', () => {
      const around = {
        Q1: ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
        Q2: ['2027-01-21', '2027-01-22', '2027-01-23'],
      };
      for (const [quarterKey, zeroDates] of Object.entries(around)) {
        for (const zeroDate of zeroDates) {
          const everDue = isDateDue(zeroDate, dueTodayForQuarter('2027-12-31', quarterKey, LIVE), LIVE);
          expect(lessonNeverZero(zeroDate, quarterKey, LIVE), quarterKey + ' ' + zeroDate).toBe(!everDue);
        }
      }
    });
    it('off without the flag, or without a zero date', () => {
      expect(lessonNeverZero('2026-11-12', 'Q1', LEGACY)).toBe(false);
      expect(lessonNeverZero(null, 'Q1', LIVE)).toBe(false);
    });
  });

  describe('computeQuarterV3', () => {
    it('(a) a Q1 lesson merely late when Q1 closed, with no work: not due, and a 0 in no track', () => {
      const r = v3(LIVE, mapOf({ '4.1': DONE_41 }), '2026-11-20');
      expect(r.lessonsTotal).toBe(2);
      expect(r.lessonsDue).toBe(1);                // 4.1 only
      expect(r.workTracks.lessons).toBe(80);       // 4.5 does not drag the Lessons track
      expect(r.quizTodo).toEqual([]);
      expect(r.blooketTodo).toEqual([]);
      expect(r.trainerDue).toBe(0);
      expect(r.trainerTodo).toEqual([]);
    });

    it('(e) without the flag the same lesson DOES zero after its zero date (legacy)', () => {
      const r = v3(LEGACY, mapOf({ '4.1': DONE_41 }), '2026-11-20');
      expect(r.lessonsDue).toBe(2);
      expect(r.workTracks.lessons).toBe(40);       // (80 + 0) / 2
      expect(r.quizTodo).toEqual(['4.5']);
      expect(r.blooketTodo).toEqual(['4.5']);
      expect(r.trainerTodo).toEqual(['4.5']);
      expect(v3(LIVE, mapOf({ '4.1': DONE_41 }), '2026-11-20').quarterGrade).toBeGreaterThan(r.quarterGrade);
    });

    it('(b) the same lesson WITH work counts in every track it lifts, and is a 0 in none', () => {
      const r = v3(LIVE, mapOf({ '4.1': DONE_41, '4.5': DONE_45 }), '2026-11-20');
      expect(r.workTracks.lessons).toBe(85);       // (80 + 90) / 2: the late worksheet lifts the track
      expect(r.lessonsDue).toBe(2);
      expect(r.lessonsGraded).toBe(2);
      expect(r.workTracks.quizzes).toBe(80);       // the late 70 would pull the 80 down: left out
      expect([r.quizDue, r.quizDone, r.quizTodo]).toEqual([1, 1, []]);
      expect(r.workTracks.blooket).toBe(80);       // same for the deck played at 60
      expect([r.blooketDue, r.blooketDone, r.blooketTodo]).toEqual([1, 1, []]);
      expect([r.trainerDue, r.trainerDone]).toEqual([1, 1]);   // nothing else in that track: it starts it
      const strong = v3(LIVE, mapOf({ '4.1': DONE_41, '4.5': STRONG_45 }), '2026-11-20');
      expect(strong.workTracks).toMatchObject({ lessons: 87.5, quizzes: 85, blooket: 90 });
      expect([strong.quizDue, strong.quizDone, strong.blooketDue, strong.blooketDone]).toEqual([2, 2, 2, 2]);
    });

    it('(b) finished late work counts from the day after the quarter ends, not from its zero date', () => {
      // 4.5's B zero date is Thu 11-12 (the Q1 close day): its work already counts on 11-07.
      const lessonMap = mapOf({ '4.1': DONE_41, '4.5': STRONG_45 });
      for (const today of ['2026-11-07', '2026-11-09', '2026-11-12', '2026-11-13', '2027-02-01']) {
        expect(v3(LIVE, lessonMap, today).workTracks, today).toMatchObject({ lessons: 87.5, quizzes: 85, blooket: 90 });
      }
      // On the quarter's last day it is not late yet, so nothing changes until the next day.
      expect(v3(LIVE, lessonMap, '2026-11-06')).toEqual(v3(LEGACY, lessonMap, '2026-11-06'));
    });

    it('(b) starting late work never lowers the grade: partial work joins once it helps', () => {
      const untouched = v3(LIVE, mapOf({ '4.1': DONE_41 }), '2026-11-12');
      const partials = [
        { Cws: 2, frqFloor: 70 },   // one blank saved, the reflection not graded yet
        { Q: 20 },                  // one quiz question answered
        { blooket: 30 },            // the deck played once, at 30%
      ];
      for (const partial of partials) {
        const r = v3(LIVE, mapOf({ '4.1': DONE_41, '4.5': partial }), '2026-11-12');
        expect(r.quarterGrade, JSON.stringify(partial)).toBe(untouched.quarterGrade);
        expect(r.workTracks, JSON.stringify(partial)).toEqual(untouched.workTracks);
      }
      // Finishing it well then raises the grade.
      expect(v3(LIVE, mapOf({ '4.1': DONE_41, '4.5': STRONG_45 }), '2026-11-12').quarterGrade)
        .toBeGreaterThan(untouched.quarterGrade);
      // The legacy rule counted the same one blank as a drag once 4.5 was due.
      const legacyBlank = v3(LEGACY, mapOf({ '4.1': DONE_41, '4.5': partials[0] }), '2026-11-20');
      expect(legacyBlank.workTracks.lessons).toBeLessThan(80);
    });

    it('(b) each kind of late work counts on its own, while the missing kinds are never a 0', () => {
      const worksheetOnly = v3(LIVE, mapOf({ '4.1': DONE_41, '4.5': { Cws: 90, W: 90, lessonGrade: 90 } }), '2026-11-20');
      expect(worksheetOnly.workTracks.lessons).toBe(85);
      expect(worksheetOnly.quizTodo).toEqual([]);
      expect(worksheetOnly.blooketTodo).toEqual([]);
      const quizOnly = v3(LIVE, mapOf({ '4.1': DONE_41, '4.5': { Q: 90, lessonGrade: 90 } }), '2026-11-20');
      expect(quizOnly.quizDue).toBe(2);
      expect(quizOnly.workTracks.quizzes).toBe(85);
      expect(quizOnly.workTracks.lessons).toBe(80);   // no worksheet work: not a Lessons-track 0
      const deckOnly = v3(LIVE, mapOf({ '4.1': DONE_41, '4.5': { blooket: 100 } }), '2026-11-20');
      expect(deckOnly.blooketDue).toBe(2);
      expect(deckOnly.workTracks.blooket).toBe(90);
      expect(deckOnly.lessonsDue).toBe(1);
    });

    it('(c) a lesson whose zero date fell inside Q1 is still a 0 (unchanged)', () => {
      const live = v3(LIVE, mapOf({}), '2026-11-20');
      expect(live.lessonsDue).toBe(1);
      expect(live.workTracks.lessons).toBe(0);
      expect(live.quizTodo).toEqual(['4.1']);
      expect(live.blooketTodo).toEqual(['4.1']);
      expect(v3(LEGACY, mapOf({}), '2026-11-20').quizTodo).toEqual(['4.1', '4.5']);
    });

    it('(d) on or before the quarter end the clamp is a no-op: identical with and without the flag', () => {
      for (const lessonMap of [mapOf({}), mapOf({ '4.1': DONE_41 }), mapOf({ '4.5': DONE_45 })]) {
        for (const today of ['2026-10-28', '2026-11-05', '2026-11-06']) {
          for (const section of ['PeriodB', 'PeriodE', null]) {
            expect(v3(LIVE, lessonMap, today, { section }), today).toEqual(v3(LEGACY, lessonMap, today, { section }));
          }
        }
      }
    });

    it('(g) a Q2 lesson while Q2 is open is unaffected (it still zeroes after its zero date)', () => {
      const live = v3(LIVE, mapOf({}), '2026-11-30', { quarterKey: 'Q2' });
      expect(live).toEqual(v3(LEGACY, mapOf({}), '2026-11-30', { quarterKey: 'Q2' }));
      expect(live.quizTodo).toEqual(['5.1']);
    });

    it('Period E has its own dates: 4.5 (E zero date 11-15) is frozen out for E too', () => {
      expect(v3(LIVE, mapOf({}), '2026-11-20', { section: 'PeriodE' }).quizTodo).toEqual(['4.1']);
      expect(v3(LEGACY, mapOf({}), '2026-11-20', { section: 'PeriodE' }).quizTodo).toEqual(['4.1', '4.5']);
    });
  });

  describe('addLateScoresThatHelp (late work only helps)', () => {
    const late = (...scores) => scores.map((score, i) => ({ key: 'L' + i, score }));

    it('adds late scores best first while each one is at least the running average', () => {
      // 160 / 2 = 80; 100 lifts it to 86.7, 90 to 87.5, and 70 would pull it down.
      expect(addLateScoresThatHelp(160, 2, late(70, 100, 90))).toEqual({ sum: 350, count: 4, keptKeys: ['L1', 'L2'] });
    });
    it('a score equal to the average joins (it cannot lower it); a lower one does not', () => {
      expect(addLateScoresThatHelp(160, 2, late(80)).keptKeys).toEqual(['L0']);
      expect(addLateScoresThatHelp(160, 2, late(79.9)).keptKeys).toEqual([]);
    });
    it('no late scores leaves the track alone; an empty track starts from the best late score', () => {
      expect(addLateScoresThatHelp(160, 2, [])).toEqual({ sum: 160, count: 2, keptKeys: [] });
      expect(addLateScoresThatHelp(0, 0, late(60, 90))).toEqual({ sum: 90, count: 1, keptKeys: ['L1'] });
    });
    it('gives the best average of every possible choice of late scores', () => {
      let seed = 20261106;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (let t = 0; t < 400; t++) {
        const count = Math.floor(rnd() * 4);
        let sum = 0;
        for (let i = 0; i < count; i++) sum += Math.round(rnd() * 105);
        const scores = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => Math.round(rnd() * 105));
        let best = -Infinity;
        for (let mask = 0; mask < (1 << scores.length); mask++) {
          let s = sum, c = count;
          scores.forEach((v, i) => { if (mask & (1 << i)) { s += v; c += 1; } });
          if (c > 0) best = Math.max(best, s / c);
        }
        const got = addLateScoresThatHelp(sum, count, late(...scores));
        expect(got.sum / got.count).toBeCloseTo(best, 9);
      }
    });
  });

  describe('the real SY2627 schedule around the Q1 close (Thu 2026-11-12)', () => {
    const prod = resolveProductionGradeInputs('SY2627');
    const config = { ...prod.config, pcTrack: { enabled: false } };
    const schedule = prod.lessonSchedule.lessons || prod.lessonSchedule;
    const rows = buildLessonsArray(new Map(), schedule, undefined, null, {}, prod.blooketPresence, [], prod.blooketBonusTopics, config);
    const taughtInQ1 = (row, p) => Boolean(row.due[p]) && row.due[p] <= '2026-11-06';
    // A student at 80 on every feeder of every Q1 lesson that zeroed inside Q1; nothing on the late ones.
    function q1(period, today, extra = {}) {
      const lessonMap = new Map();
      for (const row of rows) {
        if (!taughtInQ1(row, period) || row.neverZero[period]) continue;
        lessonMap.set(row.lessonKey, { Cws: 80, W: 80, Q: 80, lessonGrade: 80, blooket: 80 });
      }
      for (const [key, value] of Object.entries(extra)) lessonMap.set(key, value);
      return computeQuarterV3({
        quarterKey: 'Q1', config, lessonMap, schedule, todayDateStr: today, section: 'Period' + period,
        unitPcData: {}, quizLessons: Object.keys(schedule), blooketLessons: prod.blooketPresence, trainerLessons: [],
      });
    }
    const FINISHED = { Cws: 100, W: 100, Q: 100, lessonGrade: 100, blooket: 100 };

    it('the never-zero set is exactly B 4.2-4.7 and E 2.3, 4.1-4.7 (old storage keys)', () => {
      const late = (p) => rows.filter((row) => taughtInQ1(row, p) && row.neverZero[p]).map((row) => row.lessonKey);
      expect(late('B')).toEqual(['4.2', '4.3', '4.4', '4.5', '4.6', '4.7']);
      expect(late('E')).toEqual(['2.3', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7']);
    });

    it('a late lesson finished before the close counts in Q1 on the close day, in both sections', () => {
      // B 4.6 (zero date 11-18) and E 4.4 (zero date 11-12) would zero only after the close:
      // their work still counts on Thu 11-12, as it does for B 4.3 (zero date 11-09) and E 2.3.
      // (B 4.2 shares the 4.1-2 deck with 4.1, which Q1 already counts: one slot per worksheet.)
      for (const [period, key] of [['B', '4.6'], ['B', '4.3'], ['E', '4.4'], ['E', '2.3']]) {
        const before = q1(period, '2026-11-12');
        const after = q1(period, '2026-11-12', { [key]: FINISHED });
        expect(after.workTracks.lessons, period + ' ' + key).toBeGreaterThan(before.workTracks.lessons);
        expect(after.workTracks.quizzes, period + ' ' + key).toBeGreaterThan(before.workTracks.quizzes);
        expect(after.workTracks.blooket, period + ' ' + key).toBeGreaterThan(before.workTracks.blooket);
        expect(after.quarterGrade, period + ' ' + key).toBeGreaterThan(before.quarterGrade);
      }
    });

    it('one blank on the late 3-4-5 worksheet, one quiz answer or a weak deck never lowers Q1', () => {
      const blank = { Cws: 1.7, frqFloor: 70 };   // one blank of 59: lesson value about 47
      for (const period of ['B', 'E']) {
        for (const today of ['2026-11-10', '2026-11-12', '2026-11-13']) {
          const untouched = q1(period, today).quarterGrade;
          expect(untouched, period + ' ' + today).toBe(80);
          expect(q1(period, today, { '4.3': blank, '4.4': blank, '4.5': blank }).quarterGrade).toBe(untouched);
          expect(q1(period, today, { '4.5': { Q: 20 } }).quarterGrade).toBe(untouched);
          expect(q1(period, today, { '4.5': { blooket: 30 } }).quarterGrade).toBe(untouched);
        }
      }
    });
  });

  describe('computeQuarterFromLessons (Phase 6)', () => {
    it('uses the same clamp: the late lesson is not due, a lesson with work still counts', () => {
      const lessonMap = mapOf({ '4.1': { lessonGrade: 80 } });
      expect(phase6(LIVE, lessonMap, '2026-11-20')).toMatchObject({ lessonsDue: 1, quarterGrade: 80 });
      expect(phase6(LEGACY, lessonMap, '2026-11-20')).toMatchObject({ lessonsDue: 2, quarterGrade: 40 });
      const withLate = mapOf({ '4.1': { lessonGrade: 80 }, '4.5': { lessonGrade: 60 } });
      expect(phase6(LIVE, withLate, '2026-11-20')).toEqual(phase6(LEGACY, withLate, '2026-11-20'));
      expect(phase6(LIVE, lessonMap, '2026-11-05')).toEqual(phase6(LEGACY, lessonMap, '2026-11-05'));
    });
  });

  describe('buildLessonsArray', () => {
    const lessonsFor = (config, schedule = SCHEDULE) => buildLessonsArray(
      new Map(), schedule, undefined, null, {}, [], [], [], config);
    const byKey = (rows) => Object.fromEntries(rows.map((row) => [row.lessonKey, row]));

    it('(f) reports zeroDate null + neverZero true only for a period its quarter closed on', () => {
      const rows = byKey(lessonsFor(LIVE));
      expect(rows['4.5'].zeroDate).toEqual({ B: null, E: null });
      expect(rows['4.5'].neverZero).toEqual({ B: true, E: true });
      expect(rows['4.5'].due).toEqual({ B: '2026-10-30', E: '2026-11-02' });   // due dates stay
      expect(rows['4.1'].zeroDate).toEqual({ B: '2026-11-02', E: '2026-11-03' });
      expect(rows['4.1'].neverZero).toEqual({ B: false, E: false });
      expect(rows['5.1'].zeroDate).toEqual({ B: '2026-11-23', E: '2026-11-24' });
      expect(rows['5.1'].neverZero).toEqual({ B: false, E: false });
    });

    it('(f) each period uses its own quarter: E taught in Q1, B taught in Q2', () => {
      const rows = byKey(lessonsFor(LIVE, {
        '4.6': { unit: 4, worksheetKey: '6', periods: { B: '2026-11-09', E: '2026-11-05' } },
        '4.9': { unit: 4, worksheetKey: '9', periods: { B: null, E: '2026-11-06' } },
      }));
      expect(rows['4.6'].zeroDate).toEqual({ B: '2026-11-22', E: null });
      expect(rows['4.6'].neverZero).toEqual({ B: false, E: true });
      expect(rows['4.9'].zeroDate).toEqual({ B: null, E: null });
      expect(rows['4.9'].neverZero).toEqual({ B: false, E: true });
    });

    it('(f) without the flag there is no neverZero field and every zero date stays', () => {
      const rows = lessonsFor(LEGACY);
      expect(JSON.stringify(rows)).not.toContain('neverZero');
      expect(byKey(rows)['4.5'].zeroDate).toEqual({ B: '2026-11-12', E: '2026-11-15' });
      expect(JSON.stringify(lessonsFor(null))).not.toContain('neverZero');
    });
  });
});
