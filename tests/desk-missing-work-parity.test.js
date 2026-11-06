// @vitest-environment node
// Characterization captured from the two original inline Desk selectors before
// extraction. Keep these snapshots fixed while moving code; no copied legacy
// implementation is needed. Both the page wrappers and shared API must match.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fnBody } from './helpers/desk-source.js';

const MODULE_URL = new URL('../js/desk-missing-work.js', import.meta.url);
const moduleSource = existsSync(MODULE_URL) ? readFileSync(MODULE_URL, 'utf8') : null;

function lesson(overrides = {}) {
  return {
    lessonKey: '1.1', unit: 1, worksheetKey: '1',
    due: { B: '2026-09-17', E: '2026-09-19' },
    zeroDate: { B: '2026-09-30', E: '2026-10-02' },
    lessonGradeNoQuiz: null, Cws: null,
    ...overrides,
  };
}

// Make local-midnight parsing deterministic on every test host. DST cases supply
// the real New York offsets on either side of each transition; the elapsed
// intervals are 71/73 hours, so these catch accidental truncation of day counts.
function midnightDate(offsets = {}) {
  return class extends Date {
    constructor(value) {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00$/.test(value)) {
        super(value + (offsets[value.slice(0, 10)] || '+00:00'));
        return;
      }
      super(value);
    }
  };
}

function sandbox(warningDays, offsets) {
  const context = createContext({ Date: midnightDate(offsets), ZERO_WARN_DAYS: warningDays });
  // The optional load allows the first snapshot run to precede the extraction.
  // Once wrappers delegate to this API, a missing module fails their execution.
  runInContext('var window = globalThis;', context);
  if (moduleSource) runInContext(moduleSource, context);
  runInContext(fnBody('_zeroWarnings') + '\n' + fnBody('_pastDueWork'), context);
  return context;
}

const cases = [
  { name: 'due today is not past due', today: '2026-09-17' },
  { name: 'day after due is quiet past due', today: '2026-09-18' },
  { name: 'four days before zero is quiet past due', today: '2026-09-26' },
  { name: 'three days before zero enters warnings', today: '2026-09-27' },
  { name: 'zero date is a warning but not past', today: '2026-09-30' },
  { name: 'day after zero remains a past warning', today: '2026-10-01' },
  { name: 'period E uses its later dates', period: 'E', today: '2026-09-27' },
  { name: 'explicit one-day window leaves two days quiet', warningDays: 1, today: '2026-09-28' },
  { name: 'explicit five-day window includes four days', warningDays: 5, today: '2026-09-26' },
  {
    name: 'track presence including zero, quiz-only work and bonus decks', today: '2026-09-28',
    lessons: [
      lesson({ lessonKey: 'all-missing', quizTotal: 4, Q: null, hasBlooket: true, blooket: null }),
      lesson({ lessonKey: 'zero-is-work', Cws: 0, quizTotal: 4, Q: 0, hasBlooket: true, blooket: 0 }),
      lesson({ lessonKey: 'zero-frq-is-work', lessonGradeNoQuiz: 0 }),
      lesson({ lessonKey: 'quiz-does-not-complete-worksheet', lessonGrade: 90, quizTotal: 4, Q: 90 }),
      lesson({ lessonKey: 'bonus-deck', Cws: 70, hasBlooket: true, blooketBonus: true, blooket: null }),
      lesson({ lessonKey: 'no-quiz', Cws: 70, quizTotal: 0, Q: null }),
      lesson({ lessonKey: 'quiz-and-deck-missing', Cws: 70, quizTotal: 4, hasBlooket: true }),
    ],
  },
  {
    name: 'same missing tracks in quiet past-due rows', today: '2026-09-25',
    lessons: [
      lesson({ lessonKey: 'all-missing', quizTotal: 4, Q: null, hasBlooket: true, blooket: null }),
      lesson({ lessonKey: 'zero-is-work', Cws: 0, quizTotal: 4, Q: 0, hasBlooket: true, blooket: 0 }),
      lesson({ lessonKey: 'quiz-does-not-complete-worksheet', lessonGrade: 90, quizTotal: 4, Q: 90 }),
      lesson({ lessonKey: 'bonus-deck', Cws: 70, hasBlooket: true, blooketBonus: true }),
    ],
  },
  {
    name: 'stable ties retain input order and grouped worksheet identity', today: '2026-09-25',
    lessons: [
      lesson({ lessonKey: '4.2', unit: 4, worksheetKey: '1-2', quizTotal: 3, hasBlooket: true }),
      lesson({ lessonKey: '4.1', unit: 4, worksheetKey: '1-2', quizTotal: 3, hasBlooket: true }),
      lesson({ lessonKey: '3.9', unit: 3, worksheetKey: '9', zeroDate: { B: '2026-09-29' } }),
    ],
  },
  {
    name: 'stable warning ties sort by date then track', today: '2026-09-28',
    lessons: [
      lesson({ lessonKey: '4.2', unit: 4, worksheetKey: '1-2', quizTotal: 3, hasBlooket: true }),
      lesson({ lessonKey: '4.1', unit: 4, worksheetKey: '1-2', quizTotal: 3, hasBlooket: true }),
      lesson({ lessonKey: '3.9', unit: 3, worksheetKey: '9', zeroDate: { B: '2026-09-29' } }),
    ],
  },
  { name: 'missing lessons', lessons: null, today: '2026-09-28' },
  { name: 'non-array lessons', lessons: {}, today: '2026-09-28' },
  { name: 'missing period', period: null, today: '2026-09-28' },
  { name: 'missing today', today: null },
  { name: 'unknown period does not borrow dates', period: 'X', today: '2026-09-28' },
  {
    name: 'malformed entries and absent dates are skipped', today: '2026-09-28',
    lessons: [null, {}, 7, { lessonKey: 'bad', due: 5, zeroDate: 7 },
      lesson({ lessonKey: 'no-due', due: null }),
      lesson({ lessonKey: 'no-zero', zeroDate: null }),
      lesson({ lessonKey: 'wrong-period', zeroDate: { E: '2026-09-30' } })],
  },
  {
    name: 'malformed date preserves existing NaN behavior', today: '2026-09-28',
    lessons: [lesson({ lessonKey: 'bad-date', zeroDate: { B: 'not-a-date' }, unit: undefined, worksheetKey: undefined })],
  },
  {
    name: 'spring DST rounds 71 elapsed hours to three calendar days', today: '2026-03-07',
    lessons: [lesson({ due: { B: '2026-02-25' }, zeroDate: { B: '2026-03-10' } })],
    offsets: { '2026-03-07': '-05:00', '2026-03-10': '-04:00' },
  },
  {
    name: 'fall DST rounds 73 elapsed hours to three calendar days', today: '2026-10-31',
    lessons: [lesson({ due: { E: '2026-10-21' }, zeroDate: { E: '2026-11-03' } })],
    period: 'E', offsets: { '2026-10-31': '-04:00', '2026-11-03': '-05:00' },
  },
  {
    name: 'fall DST four calendar days remains quiet past due', today: '2026-10-31',
    lessons: [lesson({ due: { B: '2026-10-22' }, zeroDate: { B: '2026-11-04' } })],
    offsets: { '2026-10-31': '-04:00', '2026-11-04': '-05:00' },
  },
];

describe('Desk missing-work extraction preserves original behavior', () => {
  it.each(cases)('$name', ({ lessons = [lesson()], period = 'B', today, warningDays = 3, offsets }) => {
    const context = sandbox(warningDays, offsets);
    const result = {
      warnings: context._zeroWarnings(lessons, period, today),
      pastDue: context._pastDueWork(lessons, period, today),
    };
    expect(result).toMatchSnapshot();

    if (moduleSource) {
      expect(context.DeskMissingWork.zeroWarnings(lessons, period, today, warningDays)).toEqual(result.warnings);
      expect(context.DeskMissingWork.pastDueWork(lessons, period, today, warningDays)).toEqual(result.pastDue);
    }
  });
});
