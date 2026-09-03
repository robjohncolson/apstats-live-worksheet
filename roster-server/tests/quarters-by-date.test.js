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
    expect(quarterOfDate('2026-09-02')).toBe('Q1');
    expect(quarterOfDate('2026-11-09')).toBe('Q2');
    expect(quarterOfDate('2027-01-25')).toBe('Q3');
    expect(quarterOfDate('2027-04-15')).toBe('Q4');
  });

  it('the exact end date of each window returns that quarter', () => {
    expect(quarterOfDate('2026-11-06')).toBe('Q1');
    expect(quarterOfDate('2027-01-22')).toBe('Q2');
    expect(quarterOfDate('2027-04-14')).toBe('Q3');
    expect(quarterOfDate('2027-06-17')).toBe('Q4');
  });

  it('one day before Q1 start returns null', () => {
    expect(quarterOfDate('2026-09-01')).toBe(null);
  });

  it('one day after Q4 end returns null', () => {
    expect(quarterOfDate('2027-06-18')).toBe(null);
  });

  it('non-string / empty / null returns null', () => {
    expect(quarterOfDate(null)).toBe(null);
    expect(quarterOfDate(undefined)).toBe(null);
    expect(quarterOfDate('')).toBe(null);
    expect(quarterOfDate(20261001)).toBe(null);
  });

  it('boundary between Q1 and Q2: Q1 ends Fri 11-06, Q2 starts Mon 11-09 (the weekend between is no quarter)', () => {
    expect(quarterOfDate('2026-11-06')).toBe('Q1');
    expect(quarterOfDate('2026-11-07')).toBe(null);
    expect(quarterOfDate('2026-11-09')).toBe('Q2');
  });

  it('boundary between Q2 and Q3', () => {
    expect(quarterOfDate('2027-01-22')).toBe('Q2');
    expect(quarterOfDate('2027-01-25')).toBe('Q3');
  });

  it('boundary between Q3 and Q4', () => {
    expect(quarterOfDate('2027-04-14')).toBe('Q3');
    expect(quarterOfDate('2027-04-15')).toBe('Q4');
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
//
// SY2627 (2026-09-03): the file is GENERATED from the Desk's own calendar by
// scripts/build-lesson-schedule-sy2627.mjs and carries the calendar it was built
// from (`calendar`: first day, breaks, meeting days, quarters). These checks
// validate the file against ITSELF + grade-config, so a regenerated file with a
// changed calendar stays honest without hardcoded date copies here.
//
// Facts asserted:
//   - 77 lessons (old ids); crosswalk-core topics dated for BOTH periods,
//     bonus topics dated for NEITHER (null = never due)
//   - B and E have DIFFERENT dates (B meets Mon/Tue/Thu/Fri, E Mon/Wed/Fri)
//   - every date is that period's meeting day, not a closure, inside the
//     school year, before the AP exam
//   - the calendar's quarter windows equal grade-config's

describe('lesson-schedule.json — SY26-27 date sanity', () => {
  const CROSSWALK_PATH = path.join(__dirname, '../../2026-crosswalk.json');

  let doc = null;
  let lessons = null;
  let crosswalk = null;
  try {
    doc = JSON.parse(readFileSync(SCHEDULE_PATH, 'utf8'));
    lessons = doc.lessons;
    crosswalk = JSON.parse(readFileSync(CROSSWALK_PATH, 'utf8')).map;
  } catch (e) {
    doc = null;
    lessons = null;
    crosswalk = null;
  }

  function buildClosureSet(breaks) {
    const set = new Set();
    for (const { from, to } of breaks) {
      let cur = new Date(from + 'T00:00:00Z');
      const stop = new Date(to + 'T00:00:00Z');
      while (cur <= stop) {
        set.add(cur.toISOString().slice(0, 10));
        cur = new Date(cur.getTime() + 86400000);
      }
    }
    return set;
  }

  function dow(iso) {
    return new Date(iso + 'T00:00:00Z').getUTCDay();
  }

  function datedEntries() {
    const out = [];
    for (const [topicKey, entry] of Object.entries(lessons)) {
      for (const period of ['B', 'E']) {
        const d = entry.periods[period];
        if (d) out.push({ topicKey, period, date: d });
      }
    }
    return out;
  }

  it('lesson-schedule.json can be loaded, has 77 lessons and a calendar block', () => {
    expect(doc).not.toBe(null);
    expect(Object.keys(lessons).length).toBe(77);
    expect(doc.calendar && doc.calendar.firstDay).toBe('2026-09-02');
    expect(doc.calendar.examDate).toBe('2027-05-11');
    expect(doc.calendar.meetingDays).toEqual({ B: [1, 2, 4, 5], E: [1, 3, 5] });
  });

  it('crosswalk-core topics are dated for BOTH periods; bonus topics for NEITHER', () => {
    let core = 0;
    let bonus = 0;
    for (const [topicKey, entry] of Object.entries(lessons)) {
      const status = crosswalk[topicKey] ? crosswalk[topicKey].status : 'core';
      if (status === 'core') {
        core++;
        expect(entry.periods.B, `${topicKey}.periods.B (core)`).toBeTruthy();
        expect(entry.periods.E, `${topicKey}.periods.E (core)`).toBeTruthy();
      } else {
        bonus++;
        expect(entry.periods.B, `${topicKey}.periods.B (bonus)`).toBe(null);
        expect(entry.periods.E, `${topicKey}.periods.E (bonus)`).toBe(null);
      }
    }
    expect(core).toBe(66);
    expect(bonus).toBe(11);
  });

  it('every date is a meeting day for its period (B never Wed; E only Mon/Wed/Fri)', () => {
    for (const { topicKey, period, date } of datedEntries()) {
      expect(doc.calendar.meetingDays[period], `${topicKey} ${period}=${date} dow ${dow(date)}`)
        .toContain(dow(date));
    }
  });

  it('no date falls on a district closure', () => {
    const closures = buildClosureSet(doc.calendar.breaks);
    expect(closures.has('2026-09-04')).toBe(true);   // the Friday that started this
    expect(closures.has('2026-09-07')).toBe(true);   // Labor Day
    for (const { topicKey, period, date } of datedEntries()) {
      expect(closures.has(date), `${topicKey} ${period}=${date} is a closure`).toBe(false);
    }
  });

  it('every date is inside the school year and before the AP exam', () => {
    const yearStart = PHASE3_CONFIG.quarters.Q1.start;
    for (const { topicKey, period, date } of datedEntries()) {
      expect(date >= yearStart, `${topicKey} ${period}=${date} >= ${yearStart}`).toBe(true);
      expect(date < doc.calendar.examDate, `${topicKey} ${period}=${date} < exam`).toBe(true);
      expect(quarterOfDate(date), `${topicKey} ${period}=${date} resolves to a quarter`).toMatch(/^Q[1-4]$/);
      expect(quarterOfUnit(lessons[topicKey].unit)).toMatch(/^Q[1-4]$/);
    }
  });

  it('B and E walk their own meeting days — the same topic is NOT on the same date for both', () => {
    let differ = 0;
    for (const entry of Object.values(lessons)) {
      if (entry.periods.B && entry.periods.B !== entry.periods.E) differ++;
    }
    expect(differ).toBeGreaterThan(50);
    expect(lessons['1.1'].periods.B).not.toBe(lessons['1.1'].periods.E);
  });

  it('within a period, no two topics share a date', () => {
    for (const period of ['B', 'E']) {
      const seen = new Map();
      for (const { topicKey, date } of datedEntries().filter((x) => x.period === period)) {
        expect(seen.has(date), `${period} ${date}: ${topicKey} vs ${seen.get(date)}`).toBe(false);
        seen.set(date, topicKey);
      }
    }
  });

  it("the calendar's quarter windows are grade-config's quarter windows", () => {
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      expect(doc.calendar.quarters[q]).toEqual({
        start: PHASE3_CONFIG.quarters[q].start,
        end: PHASE3_CONFIG.quarters[q].end,
      });
    }
  });

  it('progress checks + posters are keyed by the NEW CED unit (1-5) with per-period dates', () => {
    expect(Object.keys(doc.progressChecks)).toEqual(['1', '2', '3', '4', '5']);
    expect(Object.keys(doc.posters)).toEqual(['1', '2', '3', '4', '5']);
    for (const u of ['1', '2', '3', '4', '5']) {
      const pc = doc.progressChecks[u];
      expect(pc.periods.B < pc.adminDay2.B, `U${u} PC B day1 < day2`).toBe(true);
      expect(pc.periods.E < pc.adminDay2.E, `U${u} PC E day1 < day2`).toBe(true);
      expect(doc.posters[u].periods.B < pc.periods.B, `U${u} poster before PC (B)`).toBe(true);
      expect(pc.adminDay2.E < doc.calendar.examDate).toBe(true);
    }
  });
});
