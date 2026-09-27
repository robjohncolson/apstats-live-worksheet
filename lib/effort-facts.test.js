// @vitest-environment node
// lib/effort-facts.test.js — EFFORT_VISIBILITY_SPEC.md §1.
import { beforeAll, describe, expect, it } from 'vitest';

let E;
beforeAll(async () => { await import('./effort-facts.js'); E = globalThis.EffortFacts; });

// The real Unit 1/2 PC dates (data/lesson-schedule.json → progressChecks[n].adminDay2).
const SCHEDULE = { progressChecks: {
  1: { adminDay2: { B: '2026-10-13', E: '2026-10-16' } },
  2: { adminDay2: { B: '2026-11-24', E: '2026-11-30' } },
} };
const Q1 = { Q1: { lessonsDue: 12, pcUnits: [1, 2] }, Q2: { lessonsDue: 0, pcUnits: [3] } };

describe('pcOnFile', () => {
  it('returns the unit on file with its Day-2 date, not counting before that date', () => {
    const pc = E.pcOnFile({ U1: { pcRawPct: 66.66 } }, Q1, 'B', SCHEDULE, '2026-09-27', 'Q1');
    expect(pc).toEqual({ unit: 1, pct: 66.7, counting: false, countsFrom: '2026-10-13', day: 'Tue 10/13',
      all: [{ unit: 1, pct: 66.7, counting: false, countsFrom: '2026-10-13', day: 'Tue 10/13' }] });
  });
  it('counts FROM Day 2 (<=) and reads the period’s own date', () => {
    expect(E.pcOnFile({ U1: { pcRawPct: 70 } }, Q1, 'B', SCHEDULE, '2026-10-13', 'Q1').counting).toBe(true);
    const e = E.pcOnFile({ U1: { pcRawPct: 70 } }, Q1, 'E', SCHEDULE, '2026-10-13', 'Q1');
    expect(e.counting).toBe(false);
    expect(e.day).toBe('Fri 10/16');
  });
  it('two units on file: the lowest unit leads, both listed under `all`', () => {
    const pc = E.pcOnFile({ U2: { pcRawPct: 90 }, U1: { pcRawPct: 55 } }, Q1, 'B', SCHEDULE, '2026-10-20', 'Q1');
    expect(pc.unit).toBe(1);
    expect(pc.pct).toBe(55);
    expect(pc.counting).toBe(true);
    expect(pc.all.map(u => [u.unit, u.pct, u.counting])).toEqual([[1, 55, true], [2, 90, false]]);
  });
  it('only the current quarter’s PC band; falls back to the earliest quarter with lessons due', () => {
    expect(E.pcOnFile({ U3: { pcRawPct: 80 } }, Q1, 'B', SCHEDULE, '2026-09-27', 'Q1')).toBeNull();
    expect(E.pcOnFile({ U1: { pcRawPct: 80 } }, Q1, 'B', SCHEDULE, '2026-09-27').unit).toBe(1);
    expect(E.pcOnFile({ U1: { pcRawPct: 80 } }, Q1, 'B', SCHEDULE, '2026-09-27', 'Q2')).toBeNull();
  });
  it('empty cases: no units, no score, a non-number score', () => {
    expect(E.pcOnFile(null, Q1, 'B', SCHEDULE, '2026-09-27', 'Q1')).toBeNull();
    expect(E.pcOnFile({}, Q1, 'B', SCHEDULE, '2026-09-27', 'Q1')).toBeNull();
    expect(E.pcOnFile({ U1: { pcRawPct: null, W: 80 } }, Q1, 'B', SCHEDULE, '2026-09-27', 'Q1')).toBeNull();
    expect(E.pcOnFile({ U1: { pcRawPct: '70' } }, Q1, 'B', SCHEDULE, '2026-09-27', 'Q1')).toBeNull();
  });
  it('no schedule date: not counting, no day', () => {
    const pc = E.pcOnFile({ U1: { pcRawPct: 70 } }, Q1, 'B', null, '2026-09-27', 'Q1');
    expect([pc.counting, pc.countsFrom, pc.day]).toEqual([false, null, null]);
    expect(E.pcLine(pc)).toBe('Progress Check so far: 70% (paper).');
  });
});

describe('pcLine', () => {
  it('whole numbers; the date while waiting; "counting" once it counts', () => {
    expect(E.pcLine({ pct: 66.7, counting: false, day: 'Tue 10/13' })).toBe('Progress Check so far: 67% (paper) — counts from Tue 10/13.');
    expect(E.pcLine({ pct: 66.7, counting: true, day: 'Tue 10/13' })).toBe('Progress Check so far: 67% (paper) — counting in your grade now.');
    expect(E.pcLine(null)).toBe('');
  });
});

describe('strategyLine — about the PC TRACK, never one unit (Codex review 2026-09-27)', () => {
  const unit = (u, pct, counting = false) => ({ unit: u, pct, counting, countsFrom: '2026-10-13', day: 'Tue 10/13' });
  const waiting = { ...unit(1, 66.7), all: [unit(1, 66.7)] };
  it('not counting yet: a hedged projection from the units on file; Work below 40 gets the points it needs', () => {
    expect(E.strategyLine(waiting, 31)).toBe('If your Progress Check track ends the quarter at about 67% or better, your grade will be the HIGHER of your two tracks once both are at least 40% — so your Work track only needs to reach 40%. You are at 31%; 9 points of Work does it.');
  });
  it('the projection is the MEAN of every unit on file: 60 and 0 → 30 → no strategy line', () => {
    const two = { ...unit(1, 60), all: [unit(1, 60), unit(2, 0)] };
    expect(E.pcTrack(two)).toEqual({ pct: 30, projected: true });
    expect(E.strategyLine(two, 31)).toBe('');
    const both = { ...unit(1, 60), all: [unit(1, 60), unit(2, 80)] };
    expect(E.strategyLine(both, 31)).toMatch(/^If your Progress Check track ends the quarter at about 70% or better/);
  });
  it('counting: the engine’s pcAvg is the track — pcAvg 30 with a unit at 60 → no strategy line', () => {
    const counting = { ...unit(1, 60, true), all: [unit(1, 60, true)] };
    expect(E.strategyLine(counting, 31, 40, 30)).toBe('');
    expect(E.strategyLine(counting, 31)).toBe('');              // no engine number: say nothing
    expect(E.strategyLine(counting, 31, 40, 72.4)).toBe('Your Progress Check track is 72%. Once both tracks are at least 40%, your grade is the HIGHER one — so your Work track only needs to reach 40%. You are at 31%; 9 points of Work does it.');
    expect(E.strategyLine(counting, 52, 40, 72.4)).toBe('Your Progress Check track is 72%. Once both tracks are at least 40%, your grade is the HIGHER one. You are already past 40%, so your grade follows your Progress Check.');
    expect(E.strategyLine(counting, 31, 40, 72.4)).not.toContain('(from');
  });
  it('the gate uses the UNROUNDED Work average: 39.96 with PC 100 still needs 1 point', () => {
    const full = { ...unit(1, 100, true), all: [unit(1, 100, true)] };
    const line = E.strategyLine(full, 39.96, 40, 100);
    expect(line).toContain('only needs to reach 40%');
    expect(line).toMatch(/You are at 40%; 1 point of Work does it\.$/);
    expect(line).not.toContain('already past');
  });
  it('Work already past 40 while waiting: the grade follows the PC once it counts (from its day); Work above the PC names the higher', () => {
    expect(E.strategyLine(waiting, 52)).toBe('If your Progress Check track ends the quarter at about 67% or better, your grade will follow your Progress Check once it counts (from Tue 10/13). You are already past 40% on Work.');
    expect(E.strategyLine(waiting, 90)).toContain('your grade will be the higher of your Work and your Progress Check once it counts (from Tue 10/13).');
  });
  it('empty cases: track below 40, no PC; no Work track yet keeps the 40% sentence only', () => {
    expect(E.strategyLine({ ...unit(1, 39.9), all: [unit(1, 39.9)] }, 31)).toBe('');
    expect(E.strategyLine(null, 31)).toBe('');
    expect(E.strategyLine(waiting, null)).toBe('If your Progress Check track ends the quarter at about 67% or better, your grade will be the HIGHER of your two tracks once both are at least 40% — so your Work track only needs to reach 40%.');
  });
});

describe('aheadLessons / aheadLine', () => {
  const LESSONS = [
    { lessonKey: '1.5', due: { B: '2026-09-27', E: '2026-09-28' }, lessonGradeNoQuiz: 90 },     // due today: not ahead
    { lessonKey: '1.7', due: { B: '2026-10-06', E: '2026-10-07' }, Cws: 80, Q: null },
    { lessonKey: '1.6', due: { B: '2026-10-05', E: '2026-10-05' }, lessonGradeNoQuiz: 100, Q: 66.66, blooket: 88 },
    { lessonKey: '1.8', due: { B: '2026-10-08', E: null }, blooket: 70 },
    { lessonKey: '1.9', due: { B: '2026-10-09', E: '2026-10-12' } },                            // nothing recorded
    { lessonKey: '9.9', lessonGradeNoQuiz: 100 },                                                 // no date: never "ahead"
  ];
  it('any of the three scores, a FUTURE date for this period, in date order', () => {
    expect(E.aheadLessons(LESSONS, 'B', '2026-09-27')).toEqual([
      { lessonKey: '1.6', due: '2026-10-05', day: 'Mon 10/5', worksheet: 100, quiz: 66.7, blooket: 88 },
      { lessonKey: '1.7', due: '2026-10-06', day: 'Tue 10/6', worksheet: 80, quiz: null, blooket: null },
      { lessonKey: '1.8', due: '2026-10-08', day: 'Thu 10/8', worksheet: null, quiz: null, blooket: 70 },
    ]);
    expect(E.aheadLessons(LESSONS, 'E', '2026-09-27').map(a => a.lessonKey)).toEqual(['1.5', '1.6', '1.7']);
  });
  it('empty cases', () => {
    expect(E.aheadLessons(null, 'B', '2026-09-27')).toEqual([]);
    expect(E.aheadLessons(LESSONS, null, '2026-09-27')).toEqual([]);
    expect(E.aheadLessons(LESSONS, 'B', '2026-12-31')).toEqual([]);
    expect(E.aheadLine([])).toBe('');
    expect(E.aheadLine(null)).toBe('');
  });
  it('the praise sentence, plural and singular', () => {
    const ahead = E.aheadLessons(LESSONS, 'B', '2026-09-27');
    expect(E.aheadLine(ahead)).toBe("Ahead of the calendar: 3 lessons already done (1.6, 1.7, 1.8). They already count in your Desk grade; Schoology catches up when each lesson's column opens.");
    expect(E.aheadLine(ahead.slice(0, 1))).toBe('Ahead of the calendar: 1 lesson already done (1.6). It already counts in your Desk grade; Schoology catches up when its column opens.');
  });
  it('the counting note: three sentences, bonus only raises', () => {
    expect(E.COUNTING_NOTE).toBe('The Desk counts every lesson you have done, ahead of the calendar or not. Schoology is a rolling snapshot of what the class has covered so far, so early work shows up there when its column opens. Bonus sheets are banked and added at the end of the quarter to whichever track helps you more — they can only raise your grade.');
  });
  it('names each lesson by the number the student sees; a folded topic is named once', () => {
    const ahead = [{ lessonKey: '3.1' }, { lessonKey: '3.2' }, { lessonKey: '3.3' }];
    const ced = { '3.1': '1.10', '3.2': '1.10', '3.3': '1.11' };
    expect(E.aheadLine(ahead, k => ced[k])).toBe("Ahead of the calendar: 3 lessons already done (1.10, 1.11). They already count in your Desk grade; Schoology catches up when each lesson's column opens.");
    expect(E.aheadLine(ahead, () => { throw new Error('x'); })).toContain('(3.1, 3.2, 3.3)');
  });
  it('a long list names eight and counts the rest', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ lessonKey: '2.' + (i + 1) }));
    expect(E.aheadLine(many)).toContain('(2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8 and 2 more)');
    // a list already cut to eight (the coach context) keeps the true count
    expect(E.aheadLine(many.slice(0, 8), null, 10)).toBe(E.aheadLine(many));
    expect(E.aheadLine(many.slice(0, 2), null, 1)).toContain('2 lessons already done (2.1, 2.2)');
  });
});
