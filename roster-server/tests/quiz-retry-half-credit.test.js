// quiz-retry-half-credit.test.js — a correct quiz retry earns half credit
// (QUIZ_RETRY_HALF_CREDIT_SPEC.md §1, §4). Pure functions only: no server, no I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { quizCredit, scoreAgainstKey } from '../scoring.js';
import { computeLessonGrades, computeQuizTotals, buildLessonsArray } from '../lesson-grade.js';
import { computeGrade } from '../grade.js';
import { PHASE3_CONFIG, QUIZ_RETRY_HALF_CREDIT_FROM, quizRetryCutoff } from '../grade-config.js';

const CUTOFF = '2026-10-27T04:00:00Z';
const BEFORE = '2026-10-26T23:59:59.000Z';
const AFTER = '2026-10-28T15:00:00.000Z';

const KEY = {
  'U1-L2-Q01': { answerKey: 'A', unit: '1' },
  'U1-L2-Q02': { answerKey: 'B', unit: '1' },
};
const SCHEDULE = {
  '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2026-09-10', E: '2026-09-10' } },
};
const FRQ_BAND = { E: 100, P: 70, I: 35 };

function quizRow(itemId, response, attempt, recordedAt, extra = {}) {
  return {
    student_id: 'a-period-b-student',
    source: 'curriculum_quiz',
    item_id: itemId,
    response,
    score: null,
    attempt,
    recorded_at: recordedAt,
    ...extra,
  };
}

// Q01 right first time; Q02 wrong, then a correct retry.
function firstRightPlusRetryRight(recordedAt) {
  return [
    quizRow('U1-L2-Q01', 'A', 1, recordedAt),
    quizRow('U1-L2-Q02', 'X', 1, recordedAt),
    quizRow('U1-L2-Q02', 'B', 2, recordedAt),
  ];
}

// computeLessonGrades expects latest-per-item rows (grade.js pre-filters).
function latestOnly(rows) {
  return rows.filter((r) => !(r.item_id === 'U1-L2-Q02' && r.attempt === 1));
}

describe('grade-config — the cutoff', () => {
  it('is midnight EDT ending Monday 2026-10-26', () => {
    expect(QUIZ_RETRY_HALF_CREDIT_FROM).toBe(CUTOFF);
  });

  it('a config that names it wins; null turns the rule off; absent = production', () => {
    expect(quizRetryCutoff({ quizRetryHalfCreditFrom: '2030-01-01T00:00:00Z' })).toBe('2030-01-01T00:00:00Z');
    expect(quizRetryCutoff({ quizRetryHalfCreditFrom: null })).toBe(null);
    expect(quizRetryCutoff(PHASE3_CONFIG)).toBe(CUTOFF);
    expect(quizRetryCutoff(undefined)).toBe(CUTOFF);
  });
});

describe('quizCredit — the matrix', () => {
  const entry = KEY['U1-L2-Q02'];

  it('first answer correct → 1 (before or after the cutoff)', () => {
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 1, BEFORE), entry, CUTOFF)).toBe(1);
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 1, AFTER), entry, CUTOFF)).toBe(1);
  });

  it('retry correct before the cutoff → 1 (grandfathered)', () => {
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 2, BEFORE), entry, CUTOFF)).toBe(1);
  });

  it('retry correct exactly at the cutoff → 0.5', () => {
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 2, CUTOFF), entry, CUTOFF)).toBe(0.5);
  });

  it('retry correct after the cutoff → 0.5', () => {
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 2, AFTER), entry, CUTOFF)).toBe(0.5);
  });

  it('retry wrong → 0', () => {
    expect(quizCredit(quizRow('U1-L2-Q02', 'C', 2, AFTER), entry, CUTOFF)).toBe(0);
    expect(quizCredit(quizRow('U1-L2-Q02', 'C', 2, BEFORE), entry, CUTOFF)).toBe(0);
  });

  it('missing or unparseable recorded_at → full credit', () => {
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 2, undefined), entry, CUTOFF)).toBe(1);
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 2, 'not a date'), entry, CUTOFF)).toBe(1);
  });

  it('a string attempt "2" counts as a retry; a missing attempt is a first answer', () => {
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', '2', AFTER), entry, CUTOFF)).toBe(0.5);
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', undefined, AFTER), entry, CUTOFF)).toBe(1);
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', null, AFTER), entry, CUTOFF)).toBe(1);
  });

  it('a non-numeric attempt reads as a first answer, as latestPerItem reads it', () => {
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 'abc', AFTER), entry, CUTOFF)).toBe(1);
  });

  it('no cutoff (null) → the rule is off', () => {
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 2, AFTER), entry, null)).toBe(1);
  });

  it('an ungradable key entry → 0', () => {
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 1, AFTER), { answerKey: null }, CUTOFF)).toBe(0);
    expect(quizCredit(quizRow('U1-L2-Q02', 'B', 1, AFTER), undefined, CUTOFF)).toBe(0);
  });
});

describe('scoreAgainstKey — credit aggregate', () => {
  it('after the cutoff: 1 + 0.5 of 2 = 75%, correct counts full credit only', () => {
    const agg = scoreAgainstKey(firstRightPlusRetryRight(AFTER), KEY, CUTOFF);
    expect(agg.units.U1).toMatchObject({ attempted: 2, graded: 2, correct: 1, credit: 1.5, pct: 75 });
    expect(agg.totals).toMatchObject({ correct: 1, credit: 1.5, pct: 75 });
  });

  it('before the cutoff: 2 of 2 = 100%', () => {
    const agg = scoreAgainstKey(firstRightPlusRetryRight(BEFORE), KEY, CUTOFF);
    expect(agg.units.U1).toMatchObject({ correct: 2, credit: 2, pct: 100 });
  });

  it('no third argument → the production cutoff', () => {
    expect(scoreAgainstKey(firstRightPlusRetryRight(AFTER), KEY).units.U1.pct).toBe(75);
  });
});

describe('computeLessonGrades — the Quizzes feeder Q', () => {
  const opts = { quizRetryHalfCreditFrom: CUTOFF };

  it('first correct + retry correct after the cutoff → Q = 75', () => {
    const acc = computeLessonGrades(latestOnly(firstRightPlusRetryRight(AFTER)), FRQ_BAND, KEY, SCHEDULE, opts).get('1.2');
    expect(acc.Q).toBe(75);
    const q02 = acc.quizItems.find((q) => q.itemId === 'U1-L2-Q02');
    expect(q02).toMatchObject({ credit: 0.5, correct: false });
  });

  it('the same answers before the cutoff → Q = 100', () => {
    const acc = computeLessonGrades(latestOnly(firstRightPlusRetryRight(BEFORE)), FRQ_BAND, KEY, SCHEDULE, opts).get('1.2');
    expect(acc.Q).toBe(100);
  });

  it('opts without a cutoff use the production one', () => {
    const acc = computeLessonGrades(latestOnly(firstRightPlusRetryRight(AFTER)), FRQ_BAND, KEY, SCHEDULE, {}).get('1.2');
    expect(acc.Q).toBe(75);
  });

  it('review credit still combines as max(): an E review lifts the half item to 1', () => {
    const rows = [
      ...latestOnly(firstRightPlusRetryRight(AFTER)),
      { source: 'quiz_review', item_id: 'U1-L2-Q02#rev', response: 'B', score: 1, attempt: 1, recorded_at: AFTER },
    ];
    const acc = computeLessonGrades(rows, FRQ_BAND, KEY, SCHEDULE, opts).get('1.2');
    expect(acc.Q).toBe(100);
  });

  it('a lower review never drops the half credit: max(0.5, 1/3) = 0.5', () => {
    const rows = [
      ...latestOnly(firstRightPlusRetryRight(AFTER)),
      { source: 'quiz_review', item_id: 'U1-L2-Q02#rev', response: 'B', score: 1 / 3, attempt: 1, recorded_at: AFTER },
    ];
    const acc = computeLessonGrades(rows, FRQ_BAND, KEY, SCHEDULE, opts).get('1.2');
    expect(acc.Q).toBe(75);
  });

  it('buildLessonsArray carries credit 0.5 and correct false for the Desk', () => {
    const map = computeLessonGrades(latestOnly(firstRightPlusRetryRight(AFTER)), FRQ_BAND, KEY, SCHEDULE, opts);
    const lessons = buildLessonsArray(map, SCHEDULE, undefined, null, computeQuizTotals(KEY, SCHEDULE));
    const q02 = lessons.find((x) => x.lessonKey === '1.2').items.quiz.find((q) => q.itemId === 'U1-L2-Q02');
    expect(q02.credit).toBe(0.5);
    expect(q02.correct).toBe(false);
  });
});

describe('computeGrade (v3) — config override path', () => {
  function grade(rows, overrides) {
    const config = { ...PHASE3_CONFIG, useV3: true, gradingWindowStart: null, ...overrides };
    return computeGrade(rows, KEY, config, {
      lessonSchedule: SCHEDULE,
      section: 'PeriodB',
      asOf: new Date('2026-10-30T16:00:00.000Z').getTime(),
      blooketPresence: [],
      blooketRequired: [],
      trainerMap: null,
    });
  }

  it('a correct retry after the cutoff: lesson Q 75 and unit Q 75', () => {
    const g = grade(firstRightPlusRetryRight(AFTER), {});
    expect(g.lessons.find((x) => x.lessonKey === '1.2').Q).toBe(75);
    expect(g.units.U1.Q).toBe(75);
  });

  it('configOverrides can move the cutoff: null keeps full credit', () => {
    const g = grade(firstRightPlusRetryRight(AFTER), { quizRetryHalfCreditFrom: null });
    expect(g.lessons.find((x) => x.lessonKey === '1.2').Q).toBe(100);
    expect(g.units.U1.Q).toBe(100);
  });
});
