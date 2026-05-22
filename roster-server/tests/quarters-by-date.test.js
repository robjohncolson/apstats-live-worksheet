// quarters-by-date.test.js -- F2: date-driven quarter assignment tests.
//
// Covers:
//   - quarterOfDate: window boundaries, out-of-range, invalid inputs
//   - quarterOfLesson: dated entry vs null-date fallback
//   - computeQuarterFromLessons date-driven: a lesson whose date falls in Q2
//     is counted in Q2 even if its unit is a Q1 unit; null-date falls back
//   - lesson-schedule.json: all 77 lessons have non-null B/E dates, each date
//     is a school day, dates are non-decreasing in topic order, each lesson's
//     date is within its unit's home quarter window
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PHASE3_CONFIG, quarterOfDate, quarterOfUnit } from '../grade-config.js';
import { quarterOfLesson, computeQuarterFromLessons } from '../lesson-grade.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULE_PATH = path.join(__dirname, '../data/lesson-schedule.json');

// ── quarterOfDate ─────────────────────────────────────────────────────────────

describe('quarterOfDate', () => {

  it('a date in each window returns that quarter', () => {
    expect(quarterOfDate('2026-10-01')).toBe('Q1');
    expect(quarterOfDate('2026-12-01')).toBe('Q2');
    expect(quarterOfDate('2027-03-01')).toBe('Q3');
    expect(quarterOfDate('2027-05-15')).toBe('Q4');
  });

  it('the exact start date of each window returns that quarter', () => {
    expect(quarterOfDate('2026-09-09')).toBe('Q1');
    expect(quarterOfDate('2026-11-14')).toBe('Q2');
    expect(quarterOfDate('2027-01-30')).toBe('Q3');
    expect(quarterOfDate('2027-04-10')).toBe('Q4');
  });

  it('the exact end date of each window returns that quarter', () => {
    expect(quarterOfDate('2026-11-13')).toBe('Q1');
    expect(quarterOfDate('2027-01-29')).toBe('Q2');
    expect(quarterOfDate('2027-04-09')).toBe('Q3');
    expect(quarterOfDate('2027-06-23')).toBe('Q4');
  });

  it('one day before Q1 start returns null', () => {
    expect(quarterOfDate('2026-09-08')).toBe(null);
  });

  it('one day after Q4 end returns null', () => {
    expect(quarterOfDate('2027-06-24')).toBe(null);
  });

  it('non-string / empty / null returns null', () => {
    expect(quarterOfDate(null)).toBe(null);
    expect(quarterOfDate(undefined)).toBe(null);
    expect(quarterOfDate('')).toBe(null);
    expect(quarterOfDate(20261001)).toBe(null);
  });

  it('boundary between Q1 and Q2: Q1 end and Q2 start are adjacent', () => {
    expect(quarterOfDate('2026-11-13')).toBe('Q1');
    expect(quarterOfDate('2026-11-14')).toBe('Q2');
  });

  it('boundary between Q2 and Q3', () => {
    expect(quarterOfDate('2027-01-29')).toBe('Q2');
    expect(quarterOfDate('2027-01-30')).toBe('Q3');
  });

  it('boundary between Q3 and Q4', () => {
    expect(quarterOfDate('2027-04-09')).toBe('Q3');
    expect(quarterOfDate('2027-04-10')).toBe('Q4');
  });
});

// ── quarterOfLesson ───────────────────────────────────────────────────────────

describe('quarterOfLesson', () => {

  it('entry with a date in Q2 returns Q2 even when its unit is a Q1 unit', () => {
    // Unit 1 is a Q1 unit, but the lesson is scheduled in Q2 territory.
    const entry = { unit: 1, periods: { B: '2026-11-20', E: '2026-11-20' } };
    expect(quarterOfLesson(entry, 'B', PHASE3_CONFIG)).toBe('Q2');
    expect(quarterOfLesson(entry, 'E', PHASE3_CONFIG)).toBe('Q2');
  });

  it('entry with a Q1 date returns Q1', () => {
    const entry = { unit: 1, periods: { B: '2026-09-15', E: '2026-09-15' } };
    expect(quarterOfLesson(entry, 'B', PHASE3_CONFIG)).toBe('Q1');
  });

  it('entry with null dates falls back to quarterOfUnit', () => {
    const entry = { unit: 1, periods: { B: null, E: null } };
    expect(quarterOfLesson(entry, 'B', PHASE3_CONFIG)).toBe('Q1');
  });

  it('entry with no periods at all falls back to quarterOfUnit', () => {
    const entry = { unit: 4 };
    expect(quarterOfLesson(entry, null, PHASE3_CONFIG)).toBe('Q2');
  });

  it('uses period-specific date when period is provided', () => {
    // B is in Q1, E is in Q2. Quarter should follow the requested period.
    const entry = { unit: 1, periods: { B: '2026-10-01', E: '2026-11-20' } };
    expect(quarterOfLesson(entry, 'B', PHASE3_CONFIG)).toBe('Q1');
    expect(quarterOfLesson(entry, 'E', PHASE3_CONFIG)).toBe('Q2');
  });

  it('falls back to B/E union when period is null', () => {
    // period=null: picks periods.B first.
    const entry = { unit: 1, periods: { B: '2026-11-20', E: '2026-11-20' } };
    expect(quarterOfLesson(entry, null, PHASE3_CONFIG)).toBe('Q2');
  });

  it('date outside all windows falls back to quarterOfUnit', () => {
    // 2020 date: outside all quarter windows -> fallback to unit band.
    const entry = { unit: 6, periods: { B: '2020-01-01', E: '2020-01-01' } };
    expect(quarterOfLesson(entry, 'B', PHASE3_CONFIG)).toBe('Q3');
  });

  it('a known section with a null date falls back to the unit band, not the other section', () => {
    // B is unscheduled (null); E sits in Q2. Asking for section B must NOT
    // borrow E's Q2 date -- B has no schedule, so it falls back to unit 1's
    // band (Q1). Section E still resolves by its own date (Q2).
    const entry = { unit: 1, periods: { B: null, E: '2026-12-01' } };
    expect(quarterOfLesson(entry, 'B', PHASE3_CONFIG)).toBe('Q1');
    expect(quarterOfLesson(entry, 'E', PHASE3_CONFIG)).toBe('Q2');
  });
});

// ── computeQuarterFromLessons date-driven ─────────────────────────────────────

describe('computeQuarterFromLessons — date-driven quarter assignment (F2)', () => {

  const TODAY = '2027-06-30';

  function lessonMap(entries) {
    const m = new Map();
    for (const [k, v] of Object.entries(entries)) m.set(k, v);
    return m;
  }

  it('a unit-1 lesson dated in Q2 is counted in Q2 (not Q1)', () => {
    // schedule: lesson 1.1 has a Q2 date (2026-12-01), so quarterOfLesson=Q2.
    // When we ask computeQuarterFromLessons for Q1, it should NOT include 1.1.
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-12-01', E: '2026-12-01' } },
      '1.2': { unit: 1, periods: { B: '2026-09-15', E: '2026-09-15' } },
    };
    const map = lessonMap({
      '1.1': { lessonGrade: 80 },
      '1.2': { lessonGrade: 60 },
    });

    // Q1 band: only 1.2 (Q1 date). 1.1 falls in Q2.
    const q1 = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(q1.lessonsTotal).toBe(1);  // only 1.2 in Q1
    expect(q1.lessonsDue).toBe(1);
    expect(q1.quarterGrade).toBe(60); // only 1.2's grade

    // Q2 band: only 1.1 (Q2 date).
    const q2 = computeQuarterFromLessons({
      quarterKey: 'Q2',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(q2.lessonsTotal).toBe(1);  // only 1.1 in Q2
    expect(q2.lessonsDue).toBe(1);
    expect(q2.quarterGrade).toBe(80); // only 1.1's grade
  });

  it('a null-date lesson falls back to its unit band', () => {
    // Lesson 1.1 has null dates -> falls back to Q1 (unit 1 is Q1).
    const schedule = {
      '1.1': { unit: 1, periods: { B: null, E: null } },
    };
    const map = lessonMap({ '1.1': { lessonGrade: 70 } });

    // Should appear in Q1 (unit-band fallback).
    const q1 = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(q1.lessonsTotal).toBe(1);

    // Should NOT appear in Q2.
    const q2 = computeQuarterFromLessons({
      quarterKey: 'Q2',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(q2.lessonsTotal).toBe(0);
  });

  it('lessons from multiple units in the same quarter window count together', () => {
    // Q1 has units 1, 2, 3. Schedule has one lesson from each, all with Q1 dates.
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-15', E: '2026-09-15' } },
      '2.1': { unit: 2, periods: { B: '2026-10-01', E: '2026-10-01' } },
      '3.1': { unit: 3, periods: { B: '2026-11-01', E: '2026-11-01' } },
    };
    const map = lessonMap({
      '1.1': { lessonGrade: 90 },
      '2.1': { lessonGrade: 80 },
      '3.1': { lessonGrade: 70 },
    });

    const q1 = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(q1.lessonsTotal).toBe(3);
    expect(q1.lessonsDue).toBe(3);
    // rawQuarter = (90+80+70)/3 = 80; banked = min(80,85) = 80.
    expect(q1.quarterGrade).toBe(80);
  });
});

// ── lesson-schedule.json sanity checks ───────────────────────────────────────

describe('lesson-schedule.json — SY26-27 date sanity', () => {

  // Closure ranges (mirrors the generator).
  const CLOSURE_RANGES = [
    ['2026-10-12', '2026-10-12'],
    ['2026-11-03', '2026-11-03'],
    ['2026-11-11', '2026-11-11'],
    ['2026-11-26', '2026-11-27'],
    ['2026-12-24', '2027-01-01'],
    ['2027-01-18', '2027-01-18'],
    ['2027-02-15', '2027-02-19'],
    ['2027-03-26', '2027-03-26'],
    ['2027-04-19', '2027-04-23'],
    ['2027-05-31', '2027-05-31'],
    ['2027-06-18', '2027-06-18'],
  ];

  function buildClosureSet(ranges) {
    const set = new Set();
    for (const [start, end] of ranges) {
      let cur = new Date(start + 'T00:00:00Z');
      const stop = new Date(end + 'T00:00:00Z');
      while (cur <= stop) {
        set.add(cur.toISOString().slice(0, 10));
        cur = new Date(cur.getTime() + 86400000);
      }
    }
    return set;
  }

  const CLOSURES = buildClosureSet(CLOSURE_RANGES);

  function isWeekday(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    const dow = d.getUTCDay();
    return dow >= 1 && dow <= 5;
  }

  function isSchoolDay(iso) {
    return isWeekday(iso) && !CLOSURES.has(iso);
  }

  // Quarter windows for validation.
  const UNIT_QUARTER_WINDOWS = {
    1: { start: '2026-09-09', end: '2026-11-13' },
    2: { start: '2026-09-09', end: '2026-11-13' },
    3: { start: '2026-09-09', end: '2026-11-13' },
    4: { start: '2026-11-14', end: '2027-01-29' },
    5: { start: '2026-11-14', end: '2027-01-29' },
    6: { start: '2027-01-30', end: '2027-04-09' },
    7: { start: '2027-01-30', end: '2027-04-09' },
    8: { start: '2027-04-10', end: '2027-06-23' },
    9: { start: '2027-04-10', end: '2027-06-23' },
  };

  let lessons;
  let sortedTopicKeys;

  try {
    const raw = readFileSync(SCHEDULE_PATH, 'utf8');
    const doc = JSON.parse(raw);
    lessons = doc.lessons;
    sortedTopicKeys = Object.keys(lessons).sort((a, b) => {
      const [ua, la] = a.split('.');
      const [ub, lb] = b.split('.');
      const ud = Number(ua) - Number(ub);
      return ud !== 0 ? ud : Number(la) - Number(lb);
    });
  } catch (e) {
    lessons = null;
    sortedTopicKeys = [];
  }

  it('lesson-schedule.json can be loaded and has 77 lessons', () => {
    expect(lessons).not.toBe(null);
    expect(Object.keys(lessons).length).toBe(77);
  });

  it('all 77 lessons have non-null B and E dates', () => {
    for (const [topicKey, entry] of Object.entries(lessons)) {
      expect(entry.periods.B, `${topicKey}.periods.B`).not.toBe(null);
      expect(entry.periods.E, `${topicKey}.periods.E`).not.toBe(null);
    }
  });

  it('every date is a weekday (Mon-Fri)', () => {
    for (const [topicKey, entry] of Object.entries(lessons)) {
      const b = entry.periods.B;
      const e = entry.periods.E;
      expect(isWeekday(b), `${topicKey} B=${b} is weekday`).toBe(true);
      expect(isWeekday(e), `${topicKey} E=${e} is weekday`).toBe(true);
    }
  });

  it('no date falls on a closure day', () => {
    for (const [topicKey, entry] of Object.entries(lessons)) {
      const b = entry.periods.B;
      const e = entry.periods.E;
      expect(CLOSURES.has(b), `${topicKey} B=${b} is not a closure`).toBe(false);
      expect(CLOSURES.has(e), `${topicKey} E=${e} is not a closure`).toBe(false);
    }
  });

  it('dates are non-decreasing in topic order (within each unit)', () => {
    // Group by unit and check monotonicity.
    const byUnit = {};
    for (const tk of sortedTopicKeys) {
      const u = lessons[tk].unit;
      if (!byUnit[u]) byUnit[u] = [];
      byUnit[u].push(lessons[tk].periods.B);
    }
    for (const [unit, dates] of Object.entries(byUnit)) {
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i] >= dates[i - 1], `Unit ${unit}: date[${i}]=${dates[i]} >= date[${i-1}]=${dates[i-1]}`).toBe(true);
      }
    }
  });

  it("each lesson's date is within its unit's home quarter window", () => {
    for (const [topicKey, entry] of Object.entries(lessons)) {
      const win = UNIT_QUARTER_WINDOWS[entry.unit];
      expect(win, `unit ${entry.unit} has a window`).toBeDefined();
      const b = entry.periods.B;
      expect(
        b >= win.start && b <= win.end,
        `${topicKey} B=${b} in [${win.start}, ${win.end}]`
      ).toBe(true);
    }
  });

  it('periods.B === periods.E for all lessons (shared schedule D4)', () => {
    for (const [topicKey, entry] of Object.entries(lessons)) {
      expect(entry.periods.B, `${topicKey} B===E`).toBe(entry.periods.E);
    }
  });
});
