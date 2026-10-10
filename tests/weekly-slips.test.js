// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { missingWork, quarterGrade, isCandidate, doFirst, latexText, boxSummary,
  renderTex, parseArgs, assertSafeOut, retakeStep, schoologyGrade, officialGrade, officialPcSentence } from '../scripts/weekly-slips.mjs';

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
    // gitignored is no longer an exception (Codex review 2026-09-26): nothing named lands under the repo
    expect(() => assertSafeOut(path.join(repo, 'node_modules', 'weekly-slips-test'))).toThrow('Refusing output');
    expect(() => assertSafeOut(path.join(repo, 'tools', '.slips-agent-logs', 'probe'))).toThrow('Refusing output');
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

  it('pins one full-page slip per candidate (no half pages, no blank filler slot)', () => {
    const students = [31, 80, 85, 90, 100].map(grade => student(grade));
    const tex = renderTex(students, students, 'PeriodB', '2026-09-26');
    // One slip per page (teacher 2026-09-27: "as legible as possible"): 12pt, 0.6in side margins,
    // the whole text height per slip, no cut line; the adjustbox caps height only, never the width.
    expect(tex).toContain('\\documentclass[12pt,letterpaper]{article}');
    expect(tex).toContain('\\usepackage[left=0.6in,right=0.6in,top=0.55in,bottom=0.55in]{geometry}');
    expect(tex).toContain('\\setlength{\\SlipH}{\\dimexpr\\textheight-12pt\\relax}');
    expect(tex).not.toContain('\\SlipPage');
    expect(tex).not.toContain('dotfill');
    expect(tex).toContain('\\begin{minipage}[t][\\SlipH][t]{\\linewidth}');
    expect(tex).toContain('max totalheight=\\SlipH');
    expect(tex).not.toContain('max totalsize');
    expect(tex).toMatch(/\\SlipBody\[0\.(44|5|56|62|66)\]\{/);
    // The name is the first thing a slip says, at full width above the two columns.
    expect(tex).toMatch(/\\Slip\{\\SlipBody\[[0-9.]+\]\{%\n\{\\fontsize\{17\}\{20\}\\bfseries Where you stand --- /);
    expect(tex).toContain('{\\normalsize Period B --- week of Sep 28 $\\cdot$ {\\bfseries Q1 so far: 31\\%.');
    expect(tex.match(/\\Slip\{\\SlipBody/g)).toHaveLength(5);   // one page per candidate
    expect(tex.match(/\\newpage/g)).toHaveLength(4);
    expect(tex.match(/\\Slip\{/g)).toHaveLength(5);   // one Slip per candidate, no empty filler cell
    expect(tex.match(/\\newpage/g)).toHaveLength(4);   // five candidates, five pages
    expect(tex).not.toContain('\\Slip{}');   // no empty filler: one full page per student
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

describe('slips v2 (SLIPS_V2_SPEC §1)', () => {
  const item = (lessonKey, kind, zeroDate, past) => ({ lessonKey, kind, zeroDate, past, daysLeft: 0 });
  const pooled = { key: '1.3:worksheet', title: '1.3 Follow-Along', values: [0, 0, 60, 80, 97, 100], tentativeZeros: 2 };

  it('scoreStrip: tentative zeros lead, then real values; one red chip for the student', async () => {
    const { scoreStrip } = await import('../scripts/weekly-slips.mjs');
    const kinds = chips => chips.map(chip => `${chip.v}${chip.kind[0]}`).join(' ');
    // Own 0 is tentative: the last tentative chip is "you", no extra chip.
    expect(kinds(scoreStrip(pooled, 0, true))).toBe('0t 0y 0r 0r 60r 80r 97r 100r');
    // Own 0 is counting: the first real 0 is "you".
    expect(kinds(scoreStrip(pooled, 0, false))).toBe('0t 0t 0y 0r 60r 80r 97r 100r');
    // Own value in D: marked in place. Not in D: inserted in order (withOwn).
    expect(kinds(scoreStrip(pooled, 80, false))).toBe('0t 0t 0r 0r 60r 80y 97r 100r');
    expect(kinds(scoreStrip(pooled, 31, false))).toBe('0t 0t 0r 0r 31y 60r 80r 97r 100r');
    expect(kinds(scoreStrip(pooled, 101, false))).toBe('0t 0t 0r 0r 60r 80r 97r 100r 101y');
    // Own 0 tentative but no tentative chips in the pool: it falls back to a real 0.
    expect(kinds(scoreStrip({ values: [0, 50, 60, 70, 80] }, 0, true))).toBe('0y 50r 60r 70r 80r');
    expect(scoreStrip(pooled, 0, true).filter(chip => chip.kind === 'you')).toHaveLength(1);
  });

  it('prints the Desk lead, foot and key sentences, naming the pooled periods (EFFORT_VISIBILITY_V2_SPEC §2)', async () => {
    const { stripText } = await import('../scripts/weekly-slips.mjs');
    const values = Array.from({ length: 28 }, (_, index) => (index < 2 ? 0 : 70 + index));
    expect(stripText({ title: '1.3 Follow-Along', values, tentativeZeros: 2 }, 'Sun 9/27', ['PeriodB', 'PeriodE'])).toEqual({
      lead: '30 students’ scores from Period B and Period E together for 1.3 Follow-Along (2 tentative):',
      foot: '26 of 30 students across both periods have a score here. 2 haven\'t yet — a tentative 0 until Sun 9/27. Every 0 on this list can still be replaced.',
      key: 'red = you · yellow = a 0 that is not counting yet · every other number is one student in Period B or E',
    });
    // One section in the payload: name only that one.
    expect(stripText({ title: '1.3 Quiz', values: [0, 50, 60, 70, 80] }, 'Sun 9/27', ['PeriodE'])).toEqual({
      lead: '5 students’ scores from Period E for 1.3 Quiz:',
      foot: '4 of 5 students in Period E have a score here. Every 0 on this list can still be replaced.',
      key: 'red = you · every other number is one student in Period E',
    });
    // No sections (an older payload): the v1 "classmates" words.
    expect(stripText({ title: '1.3 Follow-Along', values, tentativeZeros: 2 }, 'Sun 9/27')).toEqual({
      lead: '30 students’ scores for 1.3 Follow-Along (2 tentative):',
      foot: '26 of 30 classmates have a score here. 2 haven\'t yet — a tentative 0 until Sun 9/27. Every 0 on this list can still be replaced.',
      key: 'red = you · yellow = a 0 that is not counting yet · every other number is one classmate',
    });
    expect(stripText({ title: '1.3 Quiz', values: [0, 50, 60, 70, 80] }, 'Sun 9/27')).toEqual({
      lead: '5 students’ scores for 1.3 Quiz:',
      foot: '4 of 5 classmates have a score here. Every 0 on this list can still be replaced.',
      key: 'red = you · every other number is one classmate',
    });
    // One score: singular (teacher 2026-09-27).
    expect(stripText({ title: '1.3 Quiz', values: [80] }, 'Sun 9/27', ['PeriodE']).lead).toBe('1 student’s score from Period E for 1.3 Quiz:');
  });

  it('firstItem picks the 0 counting longest, else the one that becomes a 0 soonest', async () => {
    const { firstItem, orderMissing } = await import('../scripts/weekly-slips.mjs');
    const soonA = item('1.4', 'worksheet', '2026-09-28', false);
    const soonB = item('1.3', 'quiz', '2026-09-27', false);
    const pastA = item('1.2', 'blooket', '2026-09-20', true);
    const pastB = item('1.1', 'worksheet', '2026-09-18', true);
    expect(firstItem([pastA, soonB, pastB, soonA])).toBe(pastB);
    expect(firstItem([soonA, soonB])).toBe(soonB);
    expect(firstItem([])).toBeNull();
    expect(orderMissing([soonB, pastB, soonA, pastA])).toEqual([pastB, pastA, soonB, soonA]);
  });

  it('matches pooled items by <lessonKey>:<track> and withholds n < 5', async () => {
    const { findPooled } = await import('../scripts/weekly-slips.mjs');
    const pool = [pooled, { key: '1.3:quiz', values: [], tentativeZeros: 3 }, { key: '1.3:blooket', values: [], tentativeZeros: 6 }];
    expect(findPooled(pool, item('1.3', 'worksheet', '2026-09-27', false))).toBe(pooled);
    expect(findPooled(pool, item('1.3', 'quiz', '2026-09-27', false))).toBeNull();
    expect(findPooled(pool, item('1.3', 'blooket', '2026-09-27', false))).toBe(pool[2]);
    expect(findPooled(pool, item('1.4', 'worksheet', '2026-09-27', false))).toBeNull();
    expect(findPooled(null, item('1.3', 'worksheet', '2026-09-27', false))).toBeNull();
  });

  it('renders Desk colours, coloured missing rows, one tentative colorbox per chip, and the box plot last', async () => {
    const { renderTex, COLOR_DEFS } = await import('../scripts/weekly-slips.mjs');
    const lessons = [
      { lessonKey: '1.2', zeroDate: { B: '2026-09-20' }, Cws: null },
      { lessonKey: '1.3', zeroDate: { B: '2026-09-27' }, Cws: null, quizTotal: 2, hasBlooket: true, blooketBonus: true },
    ];
    const kid = { realName: 'X', quarters: { Q1: { quarterGrade: 31, lessonsDue: 3 } }, lessons };
    const others = [80, 97, 97, 99, 100].map(grade => student(grade));
    const pool = [{ key: '1.2:worksheet', title: '1.2 Follow-Along', values: [0, 0, 70, 80, 90], tentativeZeros: 3,
      zeroDate: '2026-09-20', zeroDates: { PeriodB: '2026-09-20', PeriodE: '2026-09-28' } }];
    pool.sections = ['PeriodB', 'PeriodE'];   // fetchPool carries the payload's sections on the array
    const tex = renderTex([kid, ...others], [kid], 'PeriodB', '2026-09-26', 'Q1', pool);
    expect(COLOR_DEFS).toHaveLength(7);   // + deskgreen (EFFORT_VISIBILITY_SPEC §2)
    for (const line of COLOR_DEFS) expect(tex).toContain(line);
    expect(tex).toContain('\\definecolor{deskred}{HTML}{CC0000}');
    expect(tex).toContain('\\definecolor{desktentative}{HTML}{FFF3B0}');
    expect(tex).toContain('Q1 so far: 31\\%. Class median 97.');
    expect(tex).toContain('\\MissRow{deskred}{deskredbg}{Follow-Along Worksheet 1.2 $\\cdot$ Variables}{0 since Sun 9/20}');
    expect(tex).toContain('\\MissRow{deskyellow}{deskyellowbg}{Quiz 1.3');
    expect(tex).toContain('{0 after Sun 9/27}');
    expect(tex).not.toContain('Flashcards 1.3');   // bonus decks never zero
    // First item = 1.2 (counting): 3 tentative chips, then the red real 0 in place.
    const tent = '\\colorbox{desktentative}{\\textcolor{desktentativeink}{0}}';
    expect(tex.split(tent).length - 1).toBe(3);
    expect(tex).toContain('\\colorbox{white}{\\textcolor{deskred}{\\textbf{\\underline{0}}}}');
    expect(tex).toContain('8 students\' scores from Period B and Period E together for 1.2 Follow-Along (3 tentative):');
    expect(tex).toContain('3 of 8 students across both periods have a score here. 3 haven\'t yet --- a tentative 0 until Mon 9/28. Every 0 on this list can still be replaced.');
    expect(tex).toContain('\\KeyTent{yellow} = a 0 that is not counting yet $\\cdot$ every other number is one student in Period B or E');
    expect(tex).toContain('height=\\PlotHeight');
    expect(tex).toContain('{\\ChipFont\\setlength{\\fboxsep}{1pt}\\raggedright\\sloppy ');   // chips follow the density step
    expect(tex).toContain('You: 31 --- below Q1.');
    const order = ['Missing work', 'Both periods on your first item', "Your section's quarter grades", 'What to do first', 'The Desk counts every lesson']
      .map(text => tex.indexOf(text));
    expect(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1]))).toBe(true);
  });

  it('a 14-row slip fits by density steps (smaller rows/chips, then right column + plot), not by scaling', async () => {
    const { renderTex } = await import('../scripts/weekly-slips.mjs');
    const lessons = Array.from({ length: 14 }, (_, index) => ({ lessonKey: `1.${index + 1}`, zeroDate: { B: '2026-09-20' }, Cws: null }));
    const kid = { realName: 'X', quarters: { Q1: { quarterGrade: 31, lessonsDue: 14 } }, lessons };
    const tex = renderTex([kid], [kid], 'PeriodB', '2026-09-26', 'Q1');
    expect(tex.match(/\\MissRow\{/g)).toHaveLength(14);
    // The rows and chips read the step's fonts; the plot reads the step's height.
    expect(tex).toContain('{\\RowFont #4\\par}');
    expect(tex).toContain('\\def\\RowFont{\\fontsize{12}{14.5}\\selectfont}\\def\\ChipFont{\\fontsize{11}{13}\\selectfont}\\def\\RightFont{}\\def\\PlotHeight{1.2in}');
    expect(tex).toContain('\\def\\RowFont{\\fontsize{11}{13}\\selectfont}\\def\\ChipFont{\\fontsize{10.5}{12.5}\\selectfont}\\def\\RightFont{}\\def\\PlotHeight{1in}');
    expect(tex).toContain('\\def\\RightFont{\\def\\small{\\fontsize{11}{13}\\selectfont}\\small}\\def\\PlotHeight{0.8in}');
    // Measured in order: step 0, then 1, then 2; only then may the height cap scale.
    expect(tex).toContain('\\newcommand{\\Slip}[1]{\\SlipTry{0}{#1}%\n\\SlipTooTall\\SlipTry{1}{#1}\\fi\n\\SlipTooTall\\SlipTry{2}{#1}\\fi\n');
    expect(tex.indexOf('\\SlipTry{2}{#1}')).toBeLessThan(tex.indexOf('\\begin{adjustbox}{max totalheight=\\SlipH}'));
  });

  it('prints the fallback sentence when the first item is not in the pooled payload', async () => {
    const { renderTex, STRIP_UNAVAILABLE } = await import('../scripts/weekly-slips.mjs');
    const kid = student(31);
    const withoutPool = renderTex([kid], [kid], 'PeriodB', '2026-09-26', 'Q1');
    expect(withoutPool).toContain("Class scores for this one aren't available yet.");
    expect(STRIP_UNAVAILABLE).toBe("Class scores for this one aren't available yet.");
    const withheld = renderTex([kid], [kid], 'PeriodB', '2026-09-26', 'Q1', [{ key: '1.0:worksheet', values: [], tentativeZeros: 2 }]);
    expect(withheld).toContain("Class scores for this one aren't available yet.");
    expect(withheld).not.toContain('desktentativeink}{0}');
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

describe('effort lines under the header (EFFORT_VISIBILITY_SPEC §2)', () => {
  // Today Sun 9/27: the Unit 1 PC (paper) is on file but counts from Period B's Day 2, Tue 10/13
  // (data/lesson-schedule.json), and 1.6 is scored ahead of its Mon 10/5 class day.
  const lessons = [
    { lessonKey: '1.2', due: { B: '2026-09-09' }, zeroDate: { B: '2026-09-22' }, lessonGradeNoQuiz: 70 },
    { lessonKey: '1.6', due: { B: '2026-10-05' }, zeroDate: { B: '2026-10-18' }, lessonGradeNoQuiz: 100, Q: 67 },
  ];
  const kid = { realName: 'X', units: { U1: { pcRawPct: 66.7 } },
    quarters: { Q1: { quarterGrade: 45, lessonsDue: 9, workAvg: 31, pcUnits: [1, 2] } }, lessons };

  it('a PC on file and one early-scored lesson render both lines, between the header and Missing work', async () => {
    const { renderTex, effortLines } = await import('../scripts/weekly-slips.mjs');
    expect(effortLines(kid, 'PeriodB', '2026-09-27', 'Q1')).toEqual({
      pc: 'Progress Check so far: 67% (paper) — counts from Tue 10/13. To finish the quarter with your 67%, your Work average has to reach 40% — you are at 31%, so bring it up by at least 9 points. Once both tracks are at least 40%, your grade is the higher one, and yours would be the Progress Check.',
      ahead: 'Ahead of the calendar: 1 lesson already done (1.6). It already counts in your Desk grade; Schoology catches up when its column opens.',
    });
    const tex = renderTex([kid], [kid], 'PeriodB', '2026-09-27', 'Q1');
    expect(tex).toContain('\\definecolor{deskgreen}{HTML}{2A8A2A}');
    expect(tex).toContain('{\\small Progress Check so far: 67\\% (paper) --- counts from Tue 10/13. To finish the quarter with your 67\\%, your Work average has to reach 40\\%');
    expect(tex).toContain('{\\small\\textcolor{deskgreen}{\\rule{5pt}{5pt}}\\hspace{4pt}Ahead of the calendar: 1 lesson already done (1.6).');
    const at = ['Q1 so far: 45\\%.', 'Progress Check so far', 'Ahead of the calendar', 'Missing work'].map(text => tex.indexOf(text));
    expect(at.every((value, index) => value > 0 && (index === 0 || value > at[index - 1]))).toBe(true);
  });

  it('the ahead line appends the Schoology projection from the /class/grades gradebook (AHEAD_WORK_PROJECTION_SPEC §2)', async () => {
    const { renderTex, effortLines } = await import('../scripts/weekly-slips.mjs');
    const withGb = { ...kid, gradebook: { quarters: { Q1: { schoologyTotal: 83.66, schoologyProjectedTotal: 85.04, aheadCells: 2 } } } };
    expect(effortLines(withGb, 'PeriodB', '2026-09-27', 'Q1').ahead).toBe(
      'Ahead of the calendar: 1 lesson already done (1.6). It already counts in your Desk grade; Schoology catches up when its column opens. Once it comes due Schoology will read about 85% (today 83.7%).');
    const tex = renderTex([withGb], [withGb], 'PeriodB', '2026-09-27', 'Q1');
    expect(tex).toContain('Once it comes due Schoology will read about 85\\% (today 83.7\\%).');
    // No gradebook (or aheadCells 0): the line is unchanged.
    const zero = { ...kid, gradebook: { quarters: { Q1: { schoologyTotal: 80, schoologyProjectedTotal: 80, aheadCells: 0 } } } };
    expect(effortLines(zero, 'PeriodB', '2026-09-27', 'Q1').ahead).not.toContain('Once');
  });

  it('parity: the slip projection is the server gradebook field (buildGradebook), not a re-derivation', async () => {
    const { effortLines } = await import('../scripts/weekly-slips.mjs');
    const { buildGradebook } = await import('../roster-server/gradebook-grid.js');
    const gradeObj = {
      units: { U1: { pcRawPct: null } },
      quarters: { Q1: { units: [1], quarterGrade: 85 } },
      lessons: [
        { lessonKey: '1.2', unit: 1, worksheetKey: '2', lessonGradeNoQuiz: 70, Q: null, quizTotal: 0, blooket: null, hasBlooket: false },
        { lessonKey: '1.6', unit: 1, worksheetKey: '6', lessonGradeNoQuiz: 100, Q: null, quizTotal: 0, blooket: null, hasBlooket: false },
      ],
    };
    const schedule = { '1.2': { unit: 1, periods: { B: '2026-09-09' } }, '1.6': { unit: 1, periods: { B: '2026-10-05' } } };
    const gradebook = buildGradebook(gradeObj, { lessonSchedule: schedule, section: 'PeriodB', todayStr: '2026-09-27' });
    // Server: today Lesson 70 → 70; projected (70 + 100)/2 = 85; one ahead cell (FA:1.6).
    expect(gradebook.quarters.Q1).toMatchObject({ schoologyTotal: 70, schoologyProjectedTotal: 85, aheadCells: 1 });
    const q = gradebook.quarters.Q1;
    expect(effortLines({ ...kid, gradebook }, 'PeriodB', '2026-09-27', 'Q1').ahead)
      .toContain(`Once it comes due Schoology will read about ${q.schoologyProjectedTotal}% (today ${q.schoologyTotal}%).`);
  });

  it('a student with neither renders neither', async () => {
    const { renderTex, effortTex } = await import('../scripts/weekly-slips.mjs');
    const plain = student(31);
    expect(effortTex(plain, 'PeriodB', '2026-09-27', 'Q1')).toBe('');
    const tex = renderTex([plain], [plain], 'PeriodB', '2026-09-27', 'Q1');
    expect(tex).not.toContain('Progress Check so far');
    expect(tex).not.toContain('Ahead of the calendar');
    expect(tex).not.toContain('\\rule{5pt}{5pt}');
  });

  it('the PC line carries no strategy below 40%, and says "counting" once Day 2 has come', async () => {
    const { effortLines } = await import('../scripts/weekly-slips.mjs');
    const low = { ...kid, units: { U1: { pcRawPct: 35 } } };
    expect(effortLines(low, 'PeriodB', '2026-09-27', 'Q1').pc).toBe('Progress Check so far: 35% (paper) — counts from Tue 10/13.');
    // Counting: the engine's pcAvg is the track, not the unit score.
    const counting = { ...kid, quarters: { Q1: { ...kid.quarters.Q1, pcAvg: 66.7 } } };
    expect(effortLines(counting, 'PeriodB', '2026-10-13', 'Q1').pc).toMatch(/^Progress Check so far: 67% \(paper\) — counting in your grade now\. To keep your 67%, your Work average has to reach 40% /);
    expect(effortLines({ ...kid, quarters: { Q1: { ...kid.quarters.Q1, pcAvg: 30 } } }, 'PeriodB', '2026-10-13', 'Q1').pc)
      .toBe('Progress Check so far: 67% (paper) — counting in your grade now.');
    // the gate reads the unrounded Work average
    const edge = { ...kid, units: { U1: { pcRawPct: 100 } }, quarters: { Q1: { ...kid.quarters.Q1, workAvg: 39.96, pcAvg: 100 } } };
    expect(effortLines(edge, 'PeriodB', '2026-10-13', 'Q1').pc).toContain('you are at 39.9%, so bring it up by at least 1 point.');
    expect(effortLines(kid, 'PeriodE', '2026-09-27', 'Q1').pc).toContain('counts from Fri 10/16');
  });

  it('the footer says how the grade is counted (teacher 2026-09-27)', async () => {
    const { renderTex } = await import('../scripts/weekly-slips.mjs');
    const tex = renderTex([kid], [kid], 'PeriodB', '2026-09-27', 'Q1');
    expect(tex).toContain('{\\small Printed Sun 9/27. Work is worksheets 50\\%, quizzes 35\\%, Blookets 15\\%. The Desk counts every lesson you have done, ahead of the calendar or not. Schoology is a rolling snapshot of what the class has covered so far, so early work shows up there when its column opens. Bonus sheets (DOK sheets and unit posters) are banked and added at the end of the quarter to whichever track helps you more --- they can only raise your grade.}');
    expect(tex).not.toContain('see the Desk for the graphs');
  });
});

describe('bonus-topic labels compile (Codex review 2026-09-26: the crosswalk label carries a ★)', () => {
  it('latexText maps the star to math and keeps the rest of the label', () => {
    expect(latexText('★ Beyond the Exam · Data Ethics')).toBe('$\\star$ Beyond the Exam $\\cdot$ Data Ethics');
  });
});

describe('retakeStep', () => {
  it('asks for a Unit 1 MCQ Part A retake when the score is below 90%', () => {
    expect(retakeStep({ units: { U1: { pcRawPct: 61.1 } } }))
      .toBe('Retake the Unit 1 Progress Check, MCQ Part A, on paper in class (you have 61%). Your best score counts.');
  });
  it('says nothing at 90% or more, or with no score on file', () => {
    expect(retakeStep({ units: { U1: { pcRawPct: 94.4 } } })).toBe(null);
    expect(retakeStep({ units: { U1: { pcRawPct: null } } })).toBe(null);
    expect(retakeStep({})).toBe(null);
  });
});

describe('schoologyGrade', () => {
  const quarters = { Q1: { quarterGrade: 40, lessonsDue: 3 } };
  it('is the override when there is one, else the calculated grade', () => {
    expect(schoologyGrade({ schoology: { calc: 68.9, override: 94.4 } })).toBe(94.4);
    expect(schoologyGrade({ schoology: { calc: 67.5, override: null } })).toBe(67.5);
  });
  it('replaces the Desk grade on the slip only when the run has Schoology grades', () => {
    expect(quarterGrade({ quarters, schoology: { calc: 67.5, override: null } }, 'Q1')).toBe(67.5);
    expect(quarterGrade({ quarters }, 'Q1')).toBe(40);
    expect(quarterGrade({ quarters, schoology: null }, 'Q1')).toBe(40);
  });
});

describe('officialGrade (OFFICIAL_GRADE_SYNC_SPEC)', () => {
  const quarters = { Q1: { quarterGrade: 37.9, lessonsDue: 3 } };
  const official = { quarter: 'Q1', grade: 68.7, parts: { work: 36.14, line: 41.14, rule: 'PC' } };
  it('the published official grade is the slip grade, ahead of Schoology and the Desk', () => {
    expect(officialGrade({ official })).toBe(68.7);
    expect(quarterGrade({ quarters, official, schoology: { calc: 36.14, override: null } }, 'Q1')).toBe(68.7);
  });
  it('falls back when nothing is published', () => {
    expect(officialGrade({ official: null })).toBeNull();
    expect(quarterGrade({ quarters, official: null }, 'Q1')).toBe(37.9);
  });
});

describe('officialPcSentence (teacher rule: work + bonuses >= 40 lets the PC count)', () => {
  it('PC counting: names the bonus that carried them over', () => {
    expect(officialPcSentence({ work: 36.14, pc: 66.7, line: 41.14, rule: 'PC' }))
      .toBe("Your Progress Check (67%) is your grade's base because your work (36.1%) plus 5 bonus points reached 40%. Keep it at 40% or more; under it, your grade falls back to your work.");
  });
  it('under the line: how many points until the PC counts', () => {
    expect(officialPcSentence({ work: 33.62, pc: 61.1, line: 35.62, rule: 'work (under 40)' }))
      .toBe('Your Progress Check (61%) starts counting as soon as your work (33.6%) plus 2 bonus points reaches 40% - about 4.4 more points. Then your grade becomes the higher of the two.');
  });
  it('work already higher: says the grade follows the work', () => {
    expect(officialPcSentence({ work: 85.9, pc: 55.6, line: 90.9, rule: 'work' }))
      .toBe('Your work (85.9%) is higher than your Progress Check (56%), so your grade follows your work; a higher Progress Check score would take over.');
  });
  it('one bonus point is singular; no breakdown gives no sentence', () => {
    expect(officialPcSentence({ work: 73.58, pc: 94.4, line: 74.58, rule: 'PC' })).toContain('plus 1 bonus point reached');
    expect(officialPcSentence({})).toBe('');
  });
});
