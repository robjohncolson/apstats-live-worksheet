// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { missingWork, quarterGrade, isCandidate, doFirst, latexText, boxSummary,
  renderTex, parseArgs, assertSafeOut } from '../scripts/weekly-slips.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Copied from tests/desk-zero-warning.test.js.
const LESSONS = [
  { lessonKey: '1.1', zeroDate: { B: '2026-09-21', E: '2026-09-22' }, lessonGradeNoQuiz: 95, Cws: 100 },
  { lessonKey: '1.2', zeroDate: { B: '2026-09-23', E: '2026-09-24' }, lessonGradeNoQuiz: null, Cws: null },
  { lessonKey: '1.3', zeroDate: { B: '2026-09-24', E: '2026-09-27' }, lessonGradeNoQuiz: null, Cws: null },
  { lessonKey: '1.4', zeroDate: { B: '2026-09-27', E: '2026-09-28' }, lessonGradeNoQuiz: null, Cws: null },
  { lessonKey: '1.0', zeroDate: { B: '2026-09-18', E: '2026-09-19' }, lessonGradeNoQuiz: null, Cws: null },
  { lessonKey: '1.10', zeroDate: { B: null, E: null }, lessonGradeNoQuiz: null, Cws: null },
  { lessonKey: '9.9', lessonGradeNoQuiz: null },
];
const html = readFileSync(path.join(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const start = html.indexOf('function _zeroWarnings(');
const end = html.indexOf('function _zeroTodayIso(', start);
const deskMissing = runInNewContext(`var ZERO_WARN_DAYS = 3; ${html.slice(start, end)}; _zeroWarnings`);
const student = (grade, name = 'X') => ({ realName: name, quarters: { Q1: { quarterGrade: grade } }, lessons: LESSONS });

describe('weekly slips', () => {
  it.each(['B', 'E'])('matches the Desk fixture for period %s', period => {
    for (const date of ['2026-09-10', '2026-09-21', '2026-09-23', '2026-09-30']) {
      const rows = missingWork(LESSONS, period, date);
      expect(rows.map(({ lessonKey, kind, past }) => ({ lessonKey, kind, past })))
        .toEqual(deskMissing(LESSONS, period, date).map(({ lessonKey, kind, past }) => ({ lessonKey, kind, past })));
      expect(rows).toEqual(deskMissing(LESSONS, period, date));
    }
  });

  it('matches all three Desk kinds, numeric zero scores, and the three-day boundary', () => {
    const lessons = LESSONS.concat([
      { lessonKey: '2.1', zeroDate: { B: '2026-09-21' }, quizTotal: 2, hasBlooket: true },
      { lessonKey: '2.2', zeroDate: { B: '2026-09-20' }, Cws: 0, quizTotal: 2, Q: 0, hasBlooket: true, blooket: 0 },
      { lessonKey: '2.3', zeroDate: { B: '2026-09-24' }, lessonGradeNoQuiz: 0, quizTotal: 0, hasBlooket: true },
      { lessonKey: '2.4', zeroDate: { B: '2026-09-25' }, quizTotal: 2, hasBlooket: true },
    ]);
    const rows = missingWork(lessons, 'B', '2026-09-21');
    expect(rows).toEqual(deskMissing(lessons, 'B', '2026-09-21'));
    expect(rows.filter(row => row.lessonKey === '2.1').map(row => [row.kind, row.past]))
      .toEqual([['worksheet', false], ['quiz', false], ['blooket', false]]);
    expect(rows.some(row => ['2.2', '2.4'].includes(row.lessonKey))).toBe(false);
    expect(missingWork(null, 'B', '2026-09-21')).toEqual([]);
  });

  it('reads the server-named current quarter, never a later placeholder quarter, and never coerces', () => {
    const quarters = { Q1: { quarterGrade: 99, lessonsDue: 9 }, Q2: { quarterGrade: null, lessonsDue: 0 }, Q3: { quarterGrade: 50, lessonsDue: 1 }, Q4: { quarterGrade: '90', lessonsDue: 0 } };
    expect(quarterGrade({ quarters }, 'Q1')).toBe(99);          // the server says Q1
    expect(quarterGrade({ quarters })).toBe(99);                // fallback: earliest quarter with lessons due
    expect(quarterGrade({ quarters }, 'Q4')).toBeNull();        // a string is not a grade
    expect(quarterGrade({})).toBeNull();
  });

  it('uses strict thresholds, preserves past-item eligibility with --min, and includes everyone with --all', () => {
    expect(isCandidate(69.9, [])).toBe(true);
    expect(isCandidate(70, [])).toBe(false);
    expect(isCandidate(99, [{ past: true }])).toBe(true);
    expect(isCandidate(99, [{ past: false }])).toBe(false);
    expect(isCandidate(null, [])).toBe(false);
    expect(isCandidate(null, [], parseArgs(['--all']))).toBe(true);
    expect(isCandidate(79, [], parseArgs(['--min', '80']))).toBe(true);
    expect(isCandidate(80, [], parseArgs(['--min', '80']))).toBe(false);
    expect(isCandidate(99, [{ past: true }], parseArgs(['--min', '50']))).toBe(true);
  });

  it('ranks empty tracks first, then past, date, and original lesson order', () => {
    const lessons = [
      { lessonKey: 'done', Cws: 0, Q: 0 },
      { lessonKey: 'later', zeroDate: { B: '2026-09-24' }, Cws: 90, quizTotal: 1, Q: 80, hasBlooket: true },
      { lessonKey: 'first', zeroDate: { B: '2026-09-19' }, quizTotal: 1 },
      { lessonKey: 'second', zeroDate: { B: '2026-09-19' }, quizTotal: 1 },
    ];
    const missing = missingWork(lessons, 'B', '2026-09-21');
    expect(doFirst(lessons, missing).map(row => `${row.lessonKey}:${row.kind}`))
      .toEqual(['later:blooket', 'first:worksheet', 'first:quiz']);
    const emptyQuiz = lessons.map(lesson => ({ ...lesson, Q: null }));
    expect(doFirst(emptyQuiz, missingWork(emptyQuiz, 'B', '2026-09-21')).map(row => `${row.lessonKey}:${row.kind}`))
      .toEqual(['first:quiz', 'second:quiz', 'later:quiz']);
  });

  it('escapes names and labels as prose, including TeX commands', () => {
    expect(latexText('A&B_C')).toBe('A\\&B\\_C');
    expect(latexText('\\{}%$#^~')).toBe('\\textbackslash{}\\{\\}\\%\\$\\#\\textasciicircum{}\\textasciitilde{}');
    const named = student(31, 'A&B_C');
    expect(renderTex([named], [named], 'PeriodB', '2026-09-26')).toContain('A\\&B\\_C');
  });

  it('refuses unignored output inside the repo before reading credentials', () => {
    expect(() => assertSafeOut(repo)).toThrow('Refusing output');
    expect(() => assertSafeOut(path.join(repo, 'private-slips-not-ignored'))).toThrow('Refusing output');
    expect(assertSafeOut(path.join(os.tmpdir(), 'weekly-slips-test'))).toBe(path.resolve(os.tmpdir(), 'weekly-slips-test'));
    expect(assertSafeOut(path.join(repo, 'node_modules', 'weekly-slips-test'))).toBe(path.join(repo, 'node_modules', 'weekly-slips-test'));
  });

  it('rounds grades and uses non-outlier whiskers rather than min/max', () => {
    const students = [0, 90, 91, 92, 93, 94, 95.4].map(grade => student(grade));
    expect(boxSummary(students)).toEqual({ min: 0, q1: 90, median: 92, q3: 94, max: 95,
      lowerWhisker: 90, upperWhisker: 95, outliers: [0] });
    const tex = renderTex(students, [students[0]], 'PeriodB', '2026-09-21');
    expect(tex).toContain('lower whisker=90,lower quartile=90,median=92,upper quartile=94,upper whisker=95');
    expect(tex).toContain('coordinates {(0,1)}');
    expect(tex).toContain('mark=*,red] coordinates {(0,0.4)}');
    expect(boxSummary(students.slice(0, 4))).toBeNull();
  });

  it('pins two half-page slips per Letter page, including a blank odd slot', () => {
    const students = [31, 80, 85, 90, 100].map(grade => student(grade));
    const tex = renderTex(students, students, 'PeriodB', '2026-09-26');
    expect(tex).toContain('\\documentclass[10pt,letterpaper]{article}');
    expect(tex).toContain('\\newcommand{\\SlipPage}[2]{\\noindent#1\\par\\vspace{0.15in}\\noindent#2\\par}');
    expect(tex).toContain('\\begin{minipage}[t][4.7in][t]{\\linewidth}');
    expect(tex).toContain('max totalsize={\\linewidth}{4.6in}');
    expect(tex.match(/\\SlipPage\{/g)).toHaveLength(3);
    expect(tex.match(/\\Slip\{/g)).toHaveLength(6);
    expect(tex.match(/\\newpage/g)).toHaveLength(2);
    expect(tex).toContain('{\\Slip{}}');
    expect(tex).toContain('week of Sep 28');
    expect(tex).toContain('Every item on this list can still be finished.');
    expect(tex).not.toContain('\r');
  });

  it('validates CLI options and defaults to both sections and private output', () => {
    expect(parseArgs([]).sections).toEqual(['PeriodB', 'PeriodE']);
    expect(parseArgs([]).out).toBe(path.join(os.homedir(), 'grade-backups', 'slips'));
    expect(parseArgs(['--section', 'PeriodE', '--no-pdf', '--dry-run', '--date', '2026-09-26']))
      .toMatchObject({ sections: ['PeriodE'], noPdf: true, dryRun: true, date: '2026-09-26' });
    for (const args of [['--min'], ['--min', 'x'], ['--section', 'B'], ['--date', '2026-02-30'], ['--oops']]) {
      expect(() => parseArgs(args)).toThrow();
    }
  });
});

describe('current quarter selection (2026-09-26 fix)', () => {
  it('reads the quarter that has lessons due, never a later placeholder quarter', async () => {
    const m = await import('../scripts/weekly-slips.mjs');
    const quarters = { Q1: { quarterGrade: 100, lessonsDue: 9 }, Q2: { quarterGrade: 50, lessonsDue: 0 }, Q3: { quarterGrade: 0, lessonsDue: 0 } };
    expect(m.currentQuarterKey(quarters, 'Q1')).toBe('Q1');
    expect(m.currentQuarterKey(quarters)).toBe('Q1');
    expect(m.quarterGrade({ quarters })).toBe(100);
    expect(m.quarterGrade({ quarters: { Q1: { quarterGrade: 88, lessonsDue: 4 }, Q2: { quarterGrade: 91, lessonsDue: 2 } } }, 'Q2')).toBe(91);
    expect(m.quarterGrade({ quarters: { Q1: { quarterGrade: null, lessonsDue: 0 } } })).toBeNull();
  });
});
