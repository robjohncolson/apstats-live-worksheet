// @vitest-environment node
// zero-quarter-membership.test.js — a lesson belongs to the quarter its ZERO DATE falls in
// (QUARTER_LINE_BY_DUE_DATE_SPEC.md, teacher 2026-11-07), on the live SY2627 inputs:
//   (1) Quarter 1 is identical with the flag on and off (seeded ledgers, both sections,
//       2026-11-06 to 2027-06-30): Q1's band is exactly the lessons taught in it
//   (2) the §1 membership sets on the real schedule, and lessonsTotal before -> after
//   (3) an empty Period B ledger in Quarter 2 around the line (11/08 - 11/13), and a
//       quarter that has not started has no grade even with work in its band
//   (4) an empty Period E ledger on Mon 11/09
//   (5) zeroQuarterOf: a gap day or a quarter's last day rolls to the next quarter
//   (6) the Q2 early bonus is today's: a Q1 worksheet's bonus stays with Q1
// Storage keys (4.2, 2.3) are ids here; students read CED labels (4.2 = 2.3 Day 2).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { computeGrade } from '../grade.js';
import { resolveProductionGradeInputs } from '../grade-contexts.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import { buildGradebook } from '../gradebook-grid.js';
import {
  addDays,
  buildLessonsArray,
  buildWorksheetBlankCounts,
  lessonQuarters,
  lessonZeroDate,
  zeroQuarterOf,
} from '../lesson-grade.js';

const prod = resolveProductionGradeInputs('SY2627');
const ANSWER_KEY = prod.answerKey.answerKey || prod.answerKey;
const SCHEDULE = prod.lessonSchedule;
const MANIFEST = JSON.parse(readFileSync(new URL('../data/work-manifest.json', import.meta.url), 'utf8'));
const BLANK_COUNTS = buildWorksheetBlankCounts(MANIFEST);

// Production grades with v3 on (USE_V3_GRADING on Railway; the test env leaves it off).
const LIVE = { ...prod.config, useV3: true, pcTrack: { enabled: true } };
const OFF = { ...LIVE, zeroQuarterMembership: false };          // the 2026-11-06 rules
const NO_PC = { ...LIVE, pcTrack: { enabled: false } };          // isolate the Work tracks
const NO_PC_OFF = { ...NO_PC, zeroQuarterMembership: false };

function grade(rows, config, section, today) {
  return computeGrade(rows, ANSWER_KEY, config, {
    lessonSchedule: SCHEDULE,
    eventSchedule: prod.eventSchedule,
    section,
    worksheetBlankCounts: BLANK_COUNTS,
    blooketPresence: prod.blooketPresence,
    blooketRequired: prod.blooketRequired,
    deckSlices: prod.deckSlices,
    asOf: new Date(today + 'T17:00:00Z').getTime(),
  });
}

// ── Seeded ledgers ──────────────────────────────────────────────────────────────
// A student with a random diligence works some worksheets (on time or up to 16 days
// late, fully or in part, with reflections), plays some decks (whole worksheet and one
// day), answers some quizzes, and may have a Unit 1 Progress Check and a Unit 1 poster.
let seed = 20261108;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick(list) {
  return list[Math.floor(rnd() * list.length)];
}
function stamp(day, hour) {
  return `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

const WORKSHEET_ITEMS = {};   // "4.1-2" -> its item ids
for (const unit of MANIFEST.units || []) {
  for (const lesson of unit.lessons || []) {
    for (const activity of lesson.activities || []) {
      if (activity.activity !== 'worksheet' || !Array.isArray(activity.itemIds)) continue;
      (WORKSHEET_ITEMS[lesson.lesson] = WORKSHEET_ITEMS[lesson.lesson] || []).push(...activity.itemIds);
    }
  }
}
// A worksheet's item ids. The manifest keys a 3+ lesson worksheet by its first and last
// lesson ('4.3-5', the live UNIT_ID U4L3-5) while the schedule's worksheetKey lists them
// all ('3-4-5'); the engine matches the two the same way (expandLessonKey, first-last).
function worksheetItems(entry) {
  const direct = WORKSHEET_ITEMS[`${entry.unit}.${entry.worksheetKey}`];
  if (direct) return direct;
  const parts = String(entry.worksheetKey).split('-');
  if (parts.length < 3) return [];
  return WORKSHEET_ITEMS[`${entry.unit}.${parts[0]}-${parts[parts.length - 1]}`] || [];
}

const QUIZ_IDS = Object.keys(ANSWER_KEY)
  .filter((id) => /^U\d+-L\d+-Q/i.test(id) && ANSWER_KEY[id] && ANSWER_KEY[id].answerKey != null);

function worksheetRows(entry, classDay) {
  const day = rnd() < 0.6 ? classDay : addDays(classDay, 1 + Math.floor(rnd() * 16));
  const share = rnd() < 0.7 ? 1 : rnd();   // the part of the blanks done
  const rows = [];
  for (const id of worksheetItems(entry)) {
    if (/-Q\d+$/.test(id)) {
      if (rnd() < share) rows.push({ source: 'worksheet', item_id: id, score: rnd() < 0.85 ? 1 : 0, attempt: 1, recorded_at: stamp(day, 18) });
      continue;
    }
    if (/reflect|exitTicket/.test(id) && rnd() < 0.8) {
      rows.push({ source: 'frq', item_id: id, score: pick([1, 0.5, 0, null]), attempt: 1, recorded_at: stamp(day, 19) });
    }
  }
  if (rnd() < 0.8) {
    rows.push({ source: 'worksheet', item_id: `BL-U${entry.unit}-L${entry.worksheetKey}-DESK_DONE`, score: Math.round(rnd() * 100), attempt: 1, recorded_at: stamp(day, 20) });
  }
  return rows;
}

function quizRows(entry, topicKey, classDay) {
  const prefix = `U${entry.unit}-L${topicKey.split('.')[1]}-Q`;
  const rows = [];
  for (const id of QUIZ_IDS) {
    if (!id.toUpperCase().startsWith(prefix)) continue;
    if (rnd() >= 0.9) continue;
    const response = rnd() < 0.7 ? String(ANSWER_KEY[id].answerKey) : 'zz';
    rows.push({ source: 'curriculum_quiz', item_id: id, response, attempt: 1, recorded_at: stamp(classDay, 17) });
  }
  return rows;
}

function seededLedger(period) {
  const rows = [];
  const diligence = rnd();
  const worked = new Set();
  for (const [topicKey, entry] of Object.entries(SCHEDULE)) {
    const classDay = entry && entry.periods && entry.periods[period];
    if (!classDay || classDay > '2026-11-20' || entry.worksheetKey == null) continue;
    const worksheet = `${entry.unit}.${entry.worksheetKey}`;
    if (!worked.has(worksheet) && rnd() < diligence) {
      worked.add(worksheet);
      rows.push(...worksheetRows(entry, classDay));
    }
    // One day's slice of a combined deck (FLASHCARD_DECK_SLICES_SPEC.md D3).
    if (String(entry.worksheetKey).includes('-') && rnd() < diligence * 0.6) {
      rows.push({ source: 'worksheet', item_id: `BL-U${entry.unit}-L${topicKey.split('.')[1]}-DESK_DAY`, score: Math.round(rnd() * 100), attempt: 1, recorded_at: stamp(classDay, 21) });
    }
    if (rnd() < diligence) rows.push(...quizRows(entry, topicKey, classDay));
  }
  if (rnd() < 0.7) {
    rows.push({ source: 'pc', item_id: 'U1-PC-MCQ-A-PAPER', score: Math.round(rnd() * 18), response: JSON.stringify({ of: 18 }), attempt: 1, recorded_at: stamp('2026-10-15', 15) });
  }
  if (rnd() < 0.5) {
    rows.push({ source: 'poster', item_id: 'POSTER-U1', score: pick([90, 100, 115]), attempt: 1, recorded_at: stamp('2026-10-09', 15) });
  }
  return rows;
}

// Every lesson value field: a row minus its zero-date and quarter fields.
function lessonValues(lessons) {
  return lessons.map(({ zeroDate, neverZero, quarter, liftQuarter, ...rest }) => rest);
}

const DAYS = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-12',
  '2026-11-13', '2026-11-20', '2026-12-15', '2027-01-23', '2027-02-01', '2027-06-30'];

describe('the seeded ledgers reach every dated worksheet', () => {
  it('every worksheet with a class day has item ids (4.3-4-5 resolves to the manifest 4.3-5)', () => {
    const missing = [];
    for (const entry of Object.values(SCHEDULE)) {
      if (!entry || entry.worksheetKey == null) continue;
      const dated = entry.periods && (entry.periods.B || entry.periods.E);
      if (!dated) continue;
      if (worksheetItems(entry).length === 0) missing.push(`${entry.unit}.${entry.worksheetKey}`);
    }
    expect(missing).toEqual([]);
    // The worksheet the old lookup missed: three of the lift-only lessons (4.3, 4.4, 4.5).
    expect(worksheetItems(SCHEDULE['4.4']).length).toBeGreaterThan(0);
  });
});

describe('(1) Quarter 1 is identical with the flag on and off', () => {
  it('24 seeded ledgers, both sections, 12 days from Fri 2026-11-06 to 2027-06-30', () => {
    let compared = 0;
    let q2Changed = 0;
    for (let i = 0; i < 24; i++) {
      const section = i % 2 ? 'PeriodB' : 'PeriodE';
      const rows = seededLedger(section === 'PeriodB' ? 'B' : 'E');
      for (const today of DAYS) {
        const on = grade(rows, LIVE, section, today);
        const off = grade(rows, OFF, section, today);
        const where = `${section} #${i} ${today}`;
        expect(on.quarters.Q1, where).toStrictEqual(off.quarters.Q1);
        expect(on.units, where).toStrictEqual(off.units);
        expect(on.completion, where).toStrictEqual(off.completion);
        expect(lessonValues(on.lessons), where).toStrictEqual(lessonValues(off.lessons));
        if (!isDeepStrictEqual(on.quarters.Q2, off.quarters.Q2)) q2Changed += 1;
        compared += 1;
      }
    }
    expect(compared).toBe(24 * DAYS.length);
    // Not vacuous: the flag does move Quarter 2.
    expect(q2Changed).toBeGreaterThan(0);
  });
});

describe('(2) the §1 membership on the real schedule', () => {
  const rows = buildLessonsArray(new Map(), SCHEDULE, undefined, null, {}, prod.blooketPresence, [], prod.blooketBonusTopics, LIVE);
  const byKey = Object.fromEntries(rows.map((row) => [row.lessonKey, row]));
  const keys = (keep) => rows.filter(keep).map((row) => row.lessonKey);

  it('taught in Q1, regular in Q2 (lift-only in Q1): B 4.2-4.7 (2.3 Day 2, 2.4-2.8), E 2.3, 4.1-4.6 (2.2-2.7)', () => {
    expect(keys((r) => r.liftQuarter.B === 'Q1' && r.quarter.B === 'Q2')).toEqual(['4.2', '4.3', '4.4', '4.5', '4.6', '4.7']);
    expect(keys((r) => r.liftQuarter.E === 'Q1' && r.quarter.E === 'Q2')).toEqual(['2.3', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6']);
  });

  it('taught in Q2, regular in Q3 (the same rule in January): B 5.7 8.4 8.5 8.6, E 8.1 8.4 8.5 8.6', () => {
    expect(keys((r) => r.liftQuarter.B === 'Q2' && r.quarter.B === 'Q3')).toEqual(['5.7', '8.4', '8.5', '8.6']);
    expect(keys((r) => r.liftQuarter.E === 'Q2' && r.quarter.E === 'Q3')).toEqual(['8.1', '8.4', '8.5', '8.6']);
  });

  it('no other lesson has a lift quarter, and no SY2627 lesson is never a 0', () => {
    expect(keys((r) => r.liftQuarter.B != null)).toEqual(['4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '5.7', '8.4', '8.5', '8.6']);
    expect(keys((r) => r.liftQuarter.E != null)).toEqual(['2.3', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '8.1', '8.4', '8.5', '8.6']);
    expect(keys((r) => r.neverZero.B || r.neverZero.E)).toEqual([]);
  });

  it('the last Q1 regular lessons and the first lessons taught in Q2', () => {
    // B 4.1 = 2.3 Day 1 (zero Thu 11/05); E 2.1 + 2.2 = 2.1 (zero Thu 11/05).
    expect(byKey['4.1'].quarter.B).toBe('Q1');
    expect(byKey['4.1'].zeroDate.B).toBe('2026-11-05');
    for (const key of ['2.1', '2.2']) {
      expect(byKey[key].quarter.E, key).toBe('Q1');
      expect(byKey[key].zeroDate.E, key).toBe('2026-11-05');
    }
    // Taught Mon 11/09, zero Sun 11/22: B 4.8; E 4.7 and 4.8.
    expect([byKey['4.8'].quarter.B, byKey['4.8'].liftQuarter.B, byKey['4.8'].zeroDate.B]).toEqual(['Q2', null, '2026-11-22']);
    for (const key of ['4.7', '4.8']) {
      expect([byKey[key].quarter.E, byKey[key].liftQuarter.E, byKey[key].zeroDate.E], key).toEqual(['Q2', null, '2026-11-22']);
    }
  });

  it('every dated row keeps its real zero date (class day + 13); an undated row keeps its unit band', () => {
    for (const row of rows) {
      for (const p of ['B', 'E']) {
        const where = row.lessonKey + ' ' + p;
        expect(row.zeroDate[p], where).toBe(lessonZeroDate(row.due[p], LIVE));
        if (!row.due[p]) expect(row.quarter[p], where).toBe(lessonQuarters(SCHEDULE[row.lessonKey], p, LIVE).taught);
      }
    }
  });

  it('lessonsTotal per quarter, flag off -> on: B 27/28/15/7 -> 27/34/19/7, E 26/28/16/7 -> 26/35/20/7', () => {
    const totals = (config, section) => {
      const quarters = grade([], config, section, '2026-11-09').quarters;
      return ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => quarters[q].lessonsTotal);
    };
    expect(totals(OFF, 'PeriodB')).toEqual([27, 28, 15, 7]);
    expect(totals(LIVE, 'PeriodB')).toEqual([27, 34, 19, 7]);
    expect(totals(OFF, 'PeriodE')).toEqual([26, 28, 16, 7]);
    expect(totals(LIVE, 'PeriodE')).toEqual([26, 35, 20, 7]);
  });
});

describe('(3) an empty Period B ledger in Quarter 2 around the line', () => {
  const quarters = (today) => grade([], NO_PC, 'PeriodB', today).quarters;

  it('Sun 11/08: nothing is due in Q2 yet, so Q2 has no grade', () => {
    const q2 = quarters('2026-11-08').Q2;
    expect(q2.lessonsDue).toBe(0);
    expect(q2.quizTodo).toEqual([]);
    expect(q2.blooketTodo).toEqual([]);
    expect(q2.quarterGrade).toBeNull();
  });

  it('Mon 11/09: 4.2 (2.3 Day 2, zero date Sun 11/08) is the first Q2 zero', () => {
    const q2 = quarters('2026-11-09').Q2;
    expect(q2.lessonsDue).toBe(1);
    expect(q2.workTracks.lessons).toBe(0);
    expect(q2.quizTodo).toEqual(['4.2']);
    expect(q2.blooketTodo).toEqual(['4.2']);
    expect(q2.quarterGrade).toBe(0);
  });

  it('Tue 11/10 adds 4.3; Fri 11/13 owes the 4.2-4.5 quizzes and two decks', () => {
    expect(quarters('2026-11-10').Q2.quizTodo).toEqual(['4.2', '4.3']);
    const q2 = quarters('2026-11-13').Q2;
    expect(q2.quizTodo).toEqual(['4.2', '4.3', '4.4', '4.5']);
    expect(q2.blooketTodo).toEqual(['4.2', '4.3']);   // 4.3 stands for the shared 4.3-4-5 deck
  });

  it('the shared 4.1-2 deck is a 0 in Q1 (via 4.1) and in Q2 (via 4.2): the accepted overlap', () => {
    const { Q1, Q2 } = quarters('2026-11-09');
    expect(Q1.blooketTodo).toContain('4.1');
    expect(Q2.blooketTodo).toContain('4.2');
  });

  it('flag off (the 11-06 rules): nothing in Q2 is due yet on Fri 11/13', () => {
    const q2 = grade([], NO_PC_OFF, 'PeriodB', '2026-11-13').quarters.Q2;
    expect(q2.lessonsDue).toBe(0);
    expect(q2.quizTodo).toEqual([]);
  });
});

// Teacher decision 8.6: until it has a grade, the Sunday pill reads "Quarter 2 · starts
// Mon Nov 9". Before its first day nothing in Q2 is due, and the band now holds the
// Q1-taught 4.2-4.7, so their work used to make a weekend Q2 number that dropped on
// Monday (fixer finding C1). The grade waits for the quarter's first day.
describe('(3b) a quarter that has not started has no grade, even with work in its band', () => {
  // Period B: the 4.1-2 worksheet (2.3, taught Mon 10/26 for 4.2) and its deck, both done
  // on 10/26; the 4.2 quiz never taken.
  const blanks = (worksheet, day) => (WORKSHEET_ITEMS[worksheet] || [])
    .filter((id) => /-Q\d+$/.test(id))
    .map((id) => ({ source: 'worksheet', item_id: id, score: 1, attempt: 1, recorded_at: stamp(day, 18) }));
  const q1Work = [
    ...blanks('4.1-2', '2026-10-26'),
    { source: 'worksheet', item_id: 'BL-U4-L1-2-DESK_DONE', score: 100, attempt: 1, recorded_at: stamp('2026-10-26', 20) },
  ];

  for (const today of ['2026-11-07', '2026-11-08']) {
    it(`${today}: Q2 has no grade, base or ceiling; its tracks are still computed`, () => {
      const q2 = grade(q1Work, NO_PC, 'PeriodB', today).quarters.Q2;
      expect(q2.quarterGrade).toBeNull();
      expect(q2.quarterGradeBase).toBeNull();
      expect(q2.ceiling).toBeNull();
      expect(q2.lessonsDue).toBe(1);   // 4.2 counts by its work (nothing is scheduled-due yet)
      expect(q2.workAvg).toBe(85);
      expect(q2.quizTodo).toEqual([]);
    });
  }

  it('Mon 11/09: Q2 has its grade, with the 4.2 quiz a 0', () => {
    const q2 = grade(q1Work, NO_PC, 'PeriodB', '2026-11-09').quarters.Q2;
    expect(q2.quizTodo).toEqual(['4.2']);
    expect(q2.quarterGrade).toBe(48.6);
    expect(q2.ceiling).toBe(100);
  });

  it('flag off (the 11-06 rules) is unchanged: work taught in Q2 made a Q2 number before 11/09', () => {
    // The 4.7-8 worksheet done Fri 11/06 also counts for 4.8 (taught Mon 11/09).
    const ahead = [...q1Work, ...blanks('4.7-8', '2026-11-06')];
    expect(grade(ahead, NO_PC_OFF, 'PeriodB', '2026-11-08').quarters.Q2.quarterGrade).toBe(80);
    expect(grade(ahead, NO_PC, 'PeriodB', '2026-11-08').quarters.Q2.quarterGrade).toBeNull();
  });

  it('Quarter 1 has its grade on the same days (it started 09/02)', () => {
    for (const today of ['2026-11-07', '2026-11-08']) {
      expect(typeof grade(q1Work, NO_PC, 'PeriodB', today).quarters.Q1.quarterGrade, today).toBe('number');
    }
  });

  it('My Gradebook\'s Quarter 2 tab on Sun 11/08: no Desk grade, and the reason says why', () => {
    const g = grade(q1Work, NO_PC, 'PeriodB', '2026-11-08');
    const { Q2 } = buildGradebook(g, { lessonSchedule: SCHEDULE, eventSchedule: prod.eventSchedule, section: 'PeriodB', todayStr: '2026-11-08' }).quarters;
    expect(Q2.v3Total).toBeNull();
    expect(Q2.reconciliation.branch).toBe('none');
    expect(Q2.reconciliation.reason).toBe('No grade yet: this quarter has not started.');
  });
});

describe('(4) an empty Period E ledger on Mon 11/09', () => {
  it('2.3 (2.2) and 4.1 (2.3 Day 1), both zero dates Sun 11/08, are the first Q2 zeros', () => {
    const q2 = grade([], NO_PC, 'PeriodE', '2026-11-09').quarters.Q2;
    expect(q2.lessonsDue).toBe(2);
    expect(q2.quizTodo).toEqual(['2.3']);          // 4.1 has no quiz
    expect(q2.blooketTodo).toEqual(['2.3', '4.1']); // 4.1 stands for the shared 4.1-2 deck
  });
});

describe("(5) zeroQuarterOf: a gap day or a quarter's last day rolls to the next quarter", () => {
  it('the Q1 / Q2 line (Q1 ends Fri 11/06; the 0 lands the morning after the zero date)', () => {
    expect(zeroQuarterOf('2026-11-05', LIVE)).toBe('Q1');
    for (const day of ['2026-11-06', '2026-11-07', '2026-11-08']) expect(zeroQuarterOf(day, LIVE), day).toBe('Q2');
  });

  it('the Q2 / Q3 line (Q2 ends Fri 01/22)', () => {
    expect(zeroQuarterOf('2027-01-21', LIVE)).toBe('Q2');
    for (const day of ['2027-01-22', '2027-01-23', '2027-01-24']) expect(zeroQuarterOf(day, LIVE), day).toBe('Q3');
  });

  it('past the last quarter (Q4 ends Thu 06/17): null, the year end', () => {
    expect(zeroQuarterOf('2027-06-16', LIVE)).toBe('Q4');
    for (const day of ['2027-06-17', '2027-06-18', '2027-08-01']) expect(zeroQuarterOf(day, LIVE), day).toBeNull();
  });

  it('the line follows dueAfterLessonDay: under the old rule a zero date on the last day stays in it', () => {
    expect(zeroQuarterOf('2026-11-06', { ...LIVE, dueAfterLessonDay: false })).toBe('Q1');
  });

  it('null without a zero date or without quarters', () => {
    expect(zeroQuarterOf(null, LIVE)).toBeNull();
    expect(zeroQuarterOf('2026-11-05', {})).toBeNull();
    expect(zeroQuarterOf('2026-11-05', null)).toBeNull();
  });

  it('a zero date past the last quarter is never a 0: quarter null, liftQuarter the quarter it was taught in', () => {
    // B zero date 06/17 (Q4's last day), E 06/23.
    const schedule = { '9.4': { unit: 9, worksheetKey: '4', periods: { B: '2027-06-04', E: '2027-06-10' } } };
    const [row] = buildLessonsArray(new Map(), schedule, undefined, null, {}, [], [], [], LIVE);
    expect(row.zeroDate).toEqual({ B: null, E: null });
    expect(row.neverZero).toEqual({ B: true, E: true });
    expect(row.quarter).toEqual({ B: null, E: null });
    expect(row.liftQuarter).toEqual({ B: 'Q4', E: 'Q4' });
    // The engine keeps it in Q4's band, where the freeze makes it late, never due.
    expect(lessonQuarters(schedule['9.4'], 'B', LIVE)).toEqual({ quarter: 'Q4', taught: 'Q4' });
  });
});

describe("(6) the Q2 early bonus is today's: a Q1 worksheet's bonus stays with Q1", () => {
  // A diligent Period B student: every worksheet through 4.7 fully done on its class day.
  const rows = [];
  for (const entry of Object.values(SCHEDULE)) {
    const classDay = entry.periods && entry.periods.B;
    if (!classDay || classDay > '2026-11-06' || entry.worksheetKey == null) continue;
    for (const id of worksheetItems(entry)) {
      if (/-Q\d+$/.test(id)) rows.push({ source: 'worksheet', item_id: id, score: 1, attempt: 1, recorded_at: stamp(classDay, 18) });
    }
  }
  const early = (quarter) => [quarter.earlyBonus, quarter.earlyLessons, quarter.earlyKeys, quarter.aheadLessons, quarter.aheadKeys];

  for (const today of ['2026-11-09', '2026-11-20']) {
    it(`${today}: Q1 and Q2 early fields equal the flag-off engine's`, () => {
      const on = grade(rows, NO_PC, 'PeriodB', today).quarters;
      const off = grade(rows, NO_PC_OFF, 'PeriodB', today).quarters;
      expect(early(on.Q2)).toEqual(early(off.Q2));
      expect(early(on.Q1)).toEqual(early(off.Q1));
      // Not vacuous: 4.6 (taught Thu 11/05, done on time) earns its bonus in Q1 and is
      // also in Q2's band now, so only the taught-earlier skip keeps Q2 from crediting it.
      expect(on.Q1.earlyKeys).toContain('4.6');
      expect(lessonQuarters(SCHEDULE['4.6'], 'B', NO_PC).quarter).toBe('Q2');
      expect(on.Q2.earlyKeys).not.toContain('4.6');
    });
  }
});

describe('My Gradebook files lesson columns by quarter[period] on the real schedule', () => {
  const tabs = (config, section) => {
    const g = grade([], config, section, '2026-11-09');
    return buildGradebook(g, { lessonSchedule: SCHEDULE, eventSchedule: prod.eventSchedule, section, todayStr: '2026-11-09' }).quarters;
  };
  const col = (quarter, key) => quarter.columns.find((c) => c.key === key);

  it('Period B Quarter 1: everything taught in Q1; 4.2-4.7 are lift-only there', () => {
    const { Q1, Q2 } = tabs(LIVE, 'PeriodB');
    for (const key of ['FA:2.1', 'FA:2.2', 'FA:2.3', 'FA:4.1-2', 'BL:4.1-2']) expect(col(Q1, key).liftOnly, key).toBeUndefined();
    for (const key of ['QUIZ:4.2', 'FA:4.3-4-5', 'QUIZ:4.5', 'FA:4.6', 'FA:4.7-8', 'QUIZ:4.7']) expect(col(Q1, key).liftOnly, key).toBe(true);
    expect(col(Q1, 'FA:4.7-8').topicKeys).toEqual(['4.7']);
    for (const key of ['FA:1.10', 'QUIZ:4.8', 'FA:4.9', 'FA:2.4']) expect(col(Q1, key), key).toBeUndefined();
    // Every lift-only Q1 column is a regular Q2 column.
    for (const c of Q1.columns.filter((c) => c.liftOnly)) {
      expect(col(Q2, c.key), c.key).toBeDefined();
      expect(col(Q2, c.key).liftOnly, c.key).toBeUndefined();
    }
  });

  it('Period B Quarter 2: 4.1-2 by 4.2 alone; 5.7 and 8.4-8.6 lift-only (regular in Q3)', () => {
    const { Q2 } = tabs(LIVE, 'PeriodB');
    expect(col(Q2, 'FA:4.1-2').topicKeys).toEqual(['4.2']);
    expect(col(Q2, 'FA:4.7-8').topicKeys).toEqual(['4.7', '4.8']);
    for (const key of ['QUIZ:4.2', 'FA:4.3-4-5', 'FA:4.6', 'FA:4.7-8', 'FA:1.10']) expect(col(Q2, key).liftOnly, key).toBeUndefined();
    for (const key of ['FA:5.7', 'FA:8.4', 'FA:8.6']) expect(col(Q2, key).liftOnly, key).toBe(true);
    expect(col(Q2, 'FA:2.1')).toBeUndefined();
  });

  it('Period E: 2.3 and 4.1-4.6 are lift-only in Q1 and regular in Q2', () => {
    const { Q1, Q2 } = tabs(LIVE, 'PeriodE');
    for (const key of ['FA:2.3', 'FA:4.1-2', 'BL:4.1-2', 'FA:4.6']) {
      expect(col(Q1, key).liftOnly, key).toBe(true);
      expect(col(Q2, key).liftOnly, key).toBeUndefined();
    }
    expect(col(Q1, 'FA:2.2').liftOnly).toBeUndefined();
  });

  // Decision 8.2: B's 2.3 Follow-Along / 2.3 Blooket stay in Schoology MP1 (decided by 4.1).
  it('Period B: the 4.1-2 worksheet counts in the Q1 tab; in the Q2 tab it is flagged schoologyQuarter Q1', () => {
    const { Q1, Q2 } = tabs(LIVE, 'PeriodB');
    for (const key of ['FA:4.1-2', 'BL:4.1-2']) {
      expect([col(Q1, key).liftOnly, col(Q1, key).schoologyQuarter], key).toEqual([undefined, undefined]);
      expect([col(Q2, key).liftOnly, col(Q2, key).schoologyQuarter], key).toEqual([undefined, 'Q1']);
    }
    expect(col(Q2, 'QUIZ:4.2').schoologyQuarter).toBeUndefined();   // 2.3 Day 2 Quiz moves to MP2
  });

  it('no other column, in any tab of either section, is flagged schoologyQuarter', () => {
    const flagged = [];
    for (const section of ['PeriodB', 'PeriodE']) {
      for (const [qk, quarter] of Object.entries(tabs(LIVE, section))) {
        for (const c of quarter.columns) if (c.schoologyQuarter) flagged.push(`${section} ${qk} ${c.key}`);
      }
    }
    expect(flagged).toEqual(['PeriodB Q2 FA:4.1-2', 'PeriodB Q2 BL:4.1-2']);
  });

  it('Period B, 4.1-2 worksheet + deck only (11/12): the Q1 tab totals them, the Q2 tab shows them uncounted', () => {
    const rows = [
      ...(WORKSHEET_ITEMS['4.1-2'] || []).filter((id) => /-Q\d+$/.test(id))
        .map((id) => ({ source: 'worksheet', item_id: id, score: 1, attempt: 1, recorded_at: stamp('2026-10-26', 18) })),
      { source: 'worksheet', item_id: 'BL-U4-L1-2-DESK_DONE', score: 90, attempt: 1, recorded_at: stamp('2026-10-26', 20) },
    ];
    const g = grade(rows, LIVE, 'PeriodB', '2026-11-12');
    const { Q1, Q2 } = buildGradebook(g, { lessonSchedule: SCHEDULE, eventSchedule: prod.eventSchedule, section: 'PeriodB', todayStr: '2026-11-12' }).quarters;
    expect([Q1.cells['FA:4.1-2'], Q1.cells['BL:4.1-2']]).toEqual([80, 90]);
    expect(Q1.schoologyTotal).toBe(82.5);   // (15 x 80 + 5 x 90) / 20
    expect([Q2.cells['FA:4.1-2'], Q2.cells['BL:4.1-2']]).toEqual([80, 90]);
    expect(Q2.schoologyTotal).toBeNull();   // Schoology MP2 has no 2.3 Follow-Along or Blooket
    expect(Q2.schoologyProjectedTotal).toBeNull();
    expect(Q2.aheadCells).toBe(0);
  });

  it('flag off: no column is flagged schoologyQuarter', () => {
    for (const section of ['PeriodB', 'PeriodE']) {
      for (const quarter of Object.values(tabs(OFF, section))) {
        expect(quarter.columns.some((c) => 'schoologyQuarter' in c), section).toBe(false);
      }
    }
  });

  it('flag off: the old-unit band (Q1 = old units 1, 3, 4), as before', () => {
    const { Q1, Q3 } = tabs(OFF, 'PeriodB');
    expect(col(Q1, 'FA:1.10')).toBeDefined();
    expect(col(Q1, 'FA:2.1')).toBeUndefined();
    expect(col(Q3, 'FA:2.1')).toBeDefined();
    expect(Q1.columns.some((c) => c.liftOnly)).toBe(false);
  });
});

describe('the flag is gated, and the Q1 close dates are display-only', () => {
  it('the live config has it; the frozen SY2526 config and the golden fixture config do not', () => {
    expect(PHASE3_CONFIG.zeroQuarterMembership).toBe(true);
    const sy2526 = JSON.parse(readFileSync(new URL('../data/grade-config.sy2526-freeze.json', import.meta.url), 'utf8'));
    expect('zeroQuarterMembership' in sy2526).toBe(false);
    const golden = JSON.parse(readFileSync(new URL('./fixtures/golden-synthetic/inputs.json', import.meta.url), 'utf8'));
    expect('zeroQuarterMembership' in golden.productionGradeInputs.config).toBe(false);
    expect('zeroFreezeAtQuarterEnd' in golden.productionGradeInputs.config).toBe(false);
  });

  it('lessonQuarters files by the class day unless all three flags are on', () => {
    const entry = SCHEDULE['4.6'];   // B taught Thu 11/05, zero date Wed 11/18
    expect(lessonQuarters(entry, 'B', LIVE)).toEqual({ quarter: 'Q2', taught: 'Q1' });
    for (const off of [{ zeroQuarterMembership: false }, { zeroFreezeAtQuarterEnd: false }, { v3LessonsByDate: false }]) {
      expect(lessonQuarters(entry, 'B', { ...LIVE, ...off }), JSON.stringify(off)).toEqual({ quarter: 'Q1', taught: 'Q1' });
    }
  });

  // close moved Thu 11/12 -> Tue 11/10 (teacher 2026-11-08): the close + MP1 final run Wed 11/11.
  it('Q1 close (Tue 11/10) and finalUntil (Thu 11/19) never change a grade', () => {
    expect(PHASE3_CONFIG.quarters.Q1.close).toBe('2026-11-10');
    expect(PHASE3_CONFIG.quarters.Q1.finalUntil).toBe('2026-11-19');
    const { close: _close, finalUntil: _finalUntil, ...plainQ1 } = LIVE.quarters.Q1;
    const plain = { ...LIVE, quarters: { ...LIVE.quarters, Q1: plainQ1 } };
    const rows = seededLedger('B');
    for (const today of ['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-20']) {
      expect(grade(rows, LIVE, 'PeriodB', today), today).toStrictEqual(grade(rows, plain, 'PeriodB', today));
    }
  });
});
