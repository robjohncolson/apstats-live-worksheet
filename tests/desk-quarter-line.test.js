// tests/desk-quarter-line.test.js — QUARTER_LINE_BY_DUE_DATE_SPEC.md §3 (teacher 2026-11-07): the Desk,
// Pico and phone delineation of Quarter 1 (ended Fri Nov 6, closes Thu Nov 12, "final" through Nov 19)
// and Quarter 2. Pure helpers in js/desk-missing-work.js, the Desk's own functions run in a JSDOM
// sandbox on fixture /grade payloads that carry the new server fields (lessons[].quarter{B,E},
// liftQuarter{B,E}, config.quarters.Q1.close/finalUntil, quarters.Q1.closed), plus the degrade path
// (an older cached payload without them keeps today's single-quarter view).
//
// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { deskSource, deskHtml, fnBody, fnBodyOf } from './helpers/desk-source.js';
import { CED_SOURCE } from './fixtures/ced2026-labels.js';
import { PHASE3_CONFIG } from '../roster-server/grade-config.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const MISSING_WORK = read('js/desk-missing-work.js');
const CALENDAR = read('js/desk-calendar.js');
const GRADEBOOK = read('js/desk-gradebook-grid.js');
const MOBILE = read('mobile-home.html');
const DESK_SRC = deskSource();

// A top-level `const NAME = [...]` / `{...}` declaration of the Desk, brace matched, as a `var`
// (a `const` inside one eval would stay local to that eval).
function declaration(name, open, close) {
  const at = new RegExp('const\\s+' + name + '\\s*=').exec(DESK_SRC);
  if (!at) throw new Error('missing declaration ' + name);
  let depth = 0;
  for (let i = DESK_SRC.indexOf(open, at.index); i < DESK_SRC.length; i++) {
    if (DESK_SRC[i] === open) depth++;
    if (DESK_SRC[i] === close && --depth === 0) return DESK_SRC.slice(at.index, i + 1).replace(/^const\s/, 'var ') + ';';
  }
  throw new Error('unbalanced ' + name);
}

// ── Fixtures: the real SY2627 schedule rows (data/lesson-schedule.json), Period B and E ──────────
const CONFIG_QUARTERS = {
  Q1: { start: '2026-09-02', end: '2026-11-06', close: '2026-11-12', finalUntil: '2026-11-19' },
  Q2: { start: '2026-11-09', end: '2027-01-22' },
  Q3: { start: '2027-01-25', end: '2027-04-14' },
  Q4: { start: '2027-04-15', end: '2027-06-17' },
};
const OLD_CONFIG_QUARTERS = Object.fromEntries(Object.entries(CONFIG_QUARTERS)
  .map(([q, { start, end }]) => [q, { start, end }]));
const P = (b, e) => ({ B: b, E: e });
// Lesson rows as /grade sends them after the deploy (quarter = where it can be a 0; liftQuarter =
// the earlier quarter it was taught in). Missing work: 2.1 worksheet (B Q1), the shared 4.1-2 deck,
// the 4.2 quiz, the 4.3-4-5 worksheet, the 4.6 worksheet.
function lessons({ withQuarters = true } = {}) {
  const rows = [
    { lessonKey: '2.1', unit: 2, worksheetKey: '1', due: P('2026-10-19', '2026-10-23'), zeroDate: P('2026-11-01', '2026-11-05'),
      quarter: P('Q1', 'Q1'), liftQuarter: P(null, null), lessonGradeNoQuiz: null, Cws: null, quizTotal: 0, Q: null },
    { lessonKey: '4.1', unit: 4, worksheetKey: '1-2', due: P('2026-10-23', '2026-10-26'), zeroDate: P('2026-11-05', '2026-11-08'),
      quarter: P('Q1', 'Q2'), liftQuarter: P(null, 'Q1'), lessonGradeNoQuiz: 90, Cws: 90, quizTotal: 0, Q: null, hasBlooket: true, blooket: null },
    { lessonKey: '4.2', unit: 4, worksheetKey: '1-2', due: P('2026-10-26', '2026-10-28'), zeroDate: P('2026-11-08', '2026-11-10'),
      quarter: P('Q2', 'Q2'), liftQuarter: P('Q1', 'Q1'), lessonGradeNoQuiz: 90, Cws: 90, quizTotal: 3, Q: null, hasBlooket: true, blooket: null },
    { lessonKey: '4.3', unit: 4, worksheetKey: '3-4-5', due: P('2026-10-27', '2026-10-28'), zeroDate: P('2026-11-09', '2026-11-10'),
      quarter: P('Q2', 'Q2'), liftQuarter: P('Q1', 'Q1'), lessonGradeNoQuiz: null, Cws: null, quizTotal: 0, Q: null },
    { lessonKey: '4.6', unit: 4, worksheetKey: '6', due: P('2026-11-05', '2026-11-06'), zeroDate: P('2026-11-18', '2026-11-19'),
      quarter: P('Q2', 'Q2'), liftQuarter: P('Q1', 'Q1'), lessonGradeNoQuiz: null, Cws: null, quizTotal: 0, Q: null },
    { lessonKey: '4.8', unit: 4, worksheetKey: '7-8', due: P('2026-11-09', '2026-11-09'), zeroDate: P('2026-11-22', '2026-11-22'),
      quarter: P('Q2', 'Q2'), liftQuarter: P(null, null), lessonGradeNoQuiz: null, Cws: null, quizTotal: 3, Q: null },
  ];
  if (withQuarters) return rows;
  // An older cached /grade: no quarter fields (and the after-the-line zero dates still null).
  return rows.map(({ quarter, liftQuarter, ...rest }) => (rest.lessonKey >= '4.2'
    ? { ...rest, zeroDate: P(null, null), neverZero: P(true, true) } : rest));
}
const GRADE_QUARTERS = () => ({
  Q1: { quarterGrade: 91.6, pcAvg: 80, workAvg: 91.6, closed: null },
  Q2: { quarterGrade: 84.6, pcAvg: null, workAvg: 84.6, closed: null },
  Q3: { quarterGrade: null }, Q4: { quarterGrade: null },
});
const OFFICIAL_Q1 = { quarter: 'Q1', grade: 92.4, asOf: '2026-11-09T02:00:00.000Z', parts: { work: 92.4, rule: 'work' } };

// ── The Desk sandbox: the real functions by name, the real missing-work module and CED labels ──
const DESK_FNS = [
  'quarterOfDate', '_gradeClosedQuarters', '_deskGradeQuarters', '_deskQuarterPhase', '_quarterConfig', '_quarterName', '_quarterDayText',
  '_quarterHeadingText', '_zeroQuarterView', '_zeroRowsInQuarter', '_officialGradeFor', '_quarterFinalGrade',
  '_doNowSidePill', '_quarterStartsText', '_officialGradeTitle',
  '_zeroWarnings', '_zeroTodayIso', '_zeroCurrentWarnings', '_pastDueWork', '_pastDueCurrentWork',
  '_zeroSchoologyTitle', '_gradebookSchoologyTitle', '_gradebookSchoologyPeriod', '_zeroSchoologyLabel', '_zeroLessonByKey',
  '_zeroDayText', '_zeroWhenText', '_zeroLatestSoonDay', '_zeroEarliestSoonDay', '_zeroPillText', '_zeroQuarterPillText',
  '_donowApplyZeroState', '_updateDoNowMissingPill', '_zeroCountText',
  '_walletPrependZeroCard', '_zeroCardStatus', '_zeroQuarterStatus', '_quarterStatusLead', '_zeroLateStatusText',
  '_zeroCardAttachScores', '_zeroStatusText', '_zeroCardRow', '_zeroCardActionButton', '_zeroSchoologyTag',
  '_pastDueWhenText', '_pastDueCardRow',
  '_walletPct', '_walletCurrentQuarter', '_walletCurrentGrade', '_walletQuarterGrade', '_walletOtherQuarterLine',
  '_walletGradeDropText', '_zeroAnyPast',
  '_coachMissingList', '_coachQuarterLine', '_coachLessonFilter', '_buildCoachContext', '_renderCoachPanel', '_coachFirstText',
  '_coachBottleneckText', '_fetchSideOfficialGrade',
  '_isoAddDays', '_cedShortText', '_quarterNoticeLessons', '_quarterNoticeText', '_quarterNoticeKey', '_quarterNoticeNow',
  '_dismissQuarterNotice', '_renderQuarterNotice',
  '_walletBonusResponse', '_walletBonusFooterText', '_bonusSummary', '_bonusPendingText', '_doNowBonusText', '_walletBonusBlock',
  '_snapClosedQuarterFor', '_snapNeverZeroFor', '_snapAdvice', '_snapFocus',
];
const GRADEBOOK_FNS = ['_firstGradebookQuarter', '_gradebookTabLabel', '_gradebookHasNextQuarter', '_gradebookElsewhere',
  '_myGradebookCatOrder', '_gradeBand', '_myGradebookColourKey', 'renderMyGradebook'];

const opened = [];
afterEach(() => { opened.splice(0).forEach((w) => w.close()); });

// A Date whose "now" is fixed (local midnight of `iso`), so _schoolTodayIso / new Date() agree.
function fixedDate(win, iso) {
  const Native = win.Date;
  const now = new Native(iso + 'T12:00:00').getTime();
  function FixedDate(...args) {
    if (!(this instanceof FixedDate)) return new Native(now).toString();
    return args.length ? new Native(...args) : new Native(now);
  }
  FixedDate.prototype = Native.prototype;
  Object.setPrototypeOf(FixedDate, Native);
  FixedDate.now = () => now;
  return FixedDate;
}

function desk({ today = '2026-11-09', period = 'B', withQuarters = true, config = CONFIG_QUARTERS, quarters = GRADE_QUARTERS(),
  official = null, officialByQuarter = {}, gradebook = null, html = '' } = {}) {
  const dom = new JSDOM('<div id="donow-card" class="donow-todo"><div id="donow-notice" style="display:none"></div>'
    + '<div id="donow-grades"></div></div><div id="wallet-content"></div><div id="panel"></div>' + html,
  { runScripts: 'outside-only', url: 'https://desk.test/ap_stats_roadmap_square_mode.html' });
  const win = dom.window;
  opened.push(win);
  win.Date = fixedDate(win, today);
  win.eval(CED_SOURCE);
  win.eval(MISSING_WORK);
  win.eval(declaration('QUARTER_WINDOWS', '[', ']'));
  win.eval(declaration('QUARTER_BAND_LABEL', '{', '}'));
  win.eval('var ZERO_WARN_DAYS = 3; var DESK_SCHOOLOGY_TITLES_CED = true; var DESK_BONUS_MULTIPLIER = 1.5;'
    + ' var _gradeLessonsCache = null, _gradeQuartersCache = null, _gradeGradebookCache = null, _gradeConfigCache = null;'
    + ' var _gradeClosedCache = null, _sideOfficialByDay = {}, _donowData = null;'
    + ' var _officialGradeCache = null, _officialGradeByQuarter = {}; var cP = "B";');
  win.eval(DESK_FNS.map((name) => fnBody(name)).join('\n'));
  win.eval(GRADEBOOK_FNS.map((name) => fnBodyOf(GRADEBOOK, name)).join('\n'));
  win.eval('var _activeGradebook = null; function _lessonDateMap() { return {}; } function _gbDateStr(d) { return "Nov " + d.getDate(); }');
  Object.assign(win, {
    tdy: () => new win.Date(today + 'T00:00:00'),
    openWallet() { win.__opened = (win.__opened || 0) + 1; },
    _snapOpenAssignment() {}, _zeroOpenLesson() {}, _zeroOpenQuiz() {}, _zeroOpenFlashcards() {},
  });
  win.eval('cP = ' + JSON.stringify(period) + ';');
  win._gradeLessonsCache = lessons({ withQuarters });
  win._gradeQuartersCache = quarters;
  win._gradeConfigCache = config ? { quarters: config } : null;
  // As renderDoNowGrades does: the close snapshots travel with the dates (D8).
  win._gradeClosedCache = win._gradeClosedQuarters(quarters);
  win._officialGradeCache = official;
  win._officialGradeByQuarter = officialByQuarter;
  win._gradeGradebookCache = gradebook;
  return win;
}

const texts = (nodes) => [...nodes].map((n) => n.textContent.replace(/\s+/g, ' ').trim());

// ── 1. The pure module ──────────────────────────────────────────────────────────────────────────
describe('js/desk-missing-work.js — the quarter line, pure', () => {
  const ctx = createContext({});
  runInContext(MISSING_WORK + '\nthis.M = DeskMissingWork;', ctx);
  const M = ctx.M;

  it('quarterPhase: Q1 current through Fri Nov 6; closing Sat Nov 7 – Thu Nov 12 (gap days: Q2 current); final through Nov 19', () => {
    const at = (d) => JSON.parse(JSON.stringify(M.quarterPhase(CONFIG_QUARTERS, d)));
    expect(at('2026-11-06')).toEqual({ current: 'Q1', closing: null, final: null });
    expect(at('2026-11-07')).toEqual({ current: 'Q2', closing: 'Q1', final: null });
    expect(at('2026-11-08')).toEqual({ current: 'Q2', closing: 'Q1', final: null });
    expect(at('2026-11-09')).toEqual({ current: 'Q2', closing: 'Q1', final: null });
    expect(at('2026-11-12')).toEqual({ current: 'Q2', closing: 'Q1', final: null });
    expect(at('2026-11-13')).toEqual({ current: 'Q2', closing: null, final: 'Q1' });
    expect(at('2026-11-19')).toEqual({ current: 'Q2', closing: null, final: 'Q1' });
    expect(at('2026-11-20')).toEqual({ current: 'Q2', closing: null, final: null });
    // No close dates (an older payload): no window at all, and nothing on a gap day.
    expect(at.call(null, '2026-11-08') && JSON.parse(JSON.stringify(M.quarterPhase(OLD_CONFIG_QUARTERS, '2026-11-08'))))
      .toEqual({ current: null, closing: null, final: null });
    expect(JSON.parse(JSON.stringify(M.quarterPhase(null, '2026-11-09')))).toEqual({ current: null, closing: null, final: null });
  });

  it('D8: a quarter /grade reports closed (closed: true) is final at once; without it the dates still decide', () => {
    const at = (quarters, d) => JSON.parse(JSON.stringify(M.quarterPhase(quarters, d)));
    const closedQ1 = { ...CONFIG_QUARTERS, Q1: { ...CONFIG_QUARTERS.Q1, closed: true } };
    // Closed on Thu Nov 12 (before the date rule says so): final, never "closes Thu".
    expect(at(closedQ1, '2026-11-12')).toEqual({ current: 'Q2', closing: null, final: 'Q1' });
    expect(at(closedQ1, '2026-11-09')).toEqual({ current: 'Q2', closing: null, final: 'Q1' });
    // Not closed on the server yet on Fri Nov 13: final by the date, as before.
    expect(at(CONFIG_QUARTERS, '2026-11-13')).toEqual({ current: 'Q2', closing: null, final: 'Q1' });
    // Final only through finalUntil, closed or not; a quarter still running is never closed.
    expect(at(closedQ1, '2026-11-20')).toEqual({ current: 'Q2', closing: null, final: null });
    expect(at(closedQ1, '2026-11-06')).toEqual({ current: 'Q1', closing: null, final: null });
    // The choke point and the snapshot follow the same rule.
    const L = lessons();
    const rows = [{ lessonKey: '2.1', kind: 'worksheet' }, { lessonKey: '4.2', kind: 'quiz' }];
    expect(M.openQuarterRows(rows, L, 'B', '2026-11-12', closedQ1).map((r) => r.lessonKey)).toEqual(['4.2']);
    expect(M.openQuarterRows(rows, L, 'B', '2026-11-12', CONFIG_QUARTERS)).toBe(rows);
    expect(M.closedQuarterOf(L, '2.1', 'B', '2026-11-12', closedQ1, 'worksheet')).toBe('Q1');
    expect(M.closedQuarterOf(L, '2.1', 'B', '2026-11-06', closedQ1, 'worksheet')).toBeNull();
  });

  it('openQuarterRows: the one choke point keeps every row until the close, then drops the closed quarter’s rows', () => {
    const L = lessons();
    const rows = [{ lessonKey: '2.1', kind: 'worksheet' }, { lessonKey: '4.1', kind: 'blooket' }, { lessonKey: '4.2', kind: 'quiz' }, { lessonKey: '9.9', kind: 'worksheet' }];
    expect(M.openQuarterRows(rows, L, 'B', '2026-11-12', CONFIG_QUARTERS)).toBe(rows);   // before the close: untouched
    expect(M.openQuarterRows(rows, L, 'B', '2026-11-13', CONFIG_QUARTERS).map((r) => r.lessonKey)).toEqual(['4.2', '9.9']);
    // Period E: 4.1 counts in Quarter 2 there, so it stays.
    expect(M.openQuarterRows(rows, L, 'E', '2026-11-13', CONFIG_QUARTERS).map((r) => r.lessonKey)).toEqual(['4.1', '4.2', '9.9']);
    // An older payload (no quarter fields) or no close dates: rows pass unchanged.
    expect(M.openQuarterRows(rows, lessons({ withQuarters: false }), 'B', '2026-11-13', CONFIG_QUARTERS)).toEqual(rows);
    expect(M.openQuarterRows(rows, L, 'B', '2026-11-13', OLD_CONFIG_QUARTERS)).toBe(rows);
    expect(M.openQuarterRows(null, L, 'B', '2026-11-13', CONFIG_QUARTERS)).toEqual([]);
  });

  it('lessonQuarters and closedQuarterOf: a shared worksheet is final only when every lesson of its group is', () => {
    const L = lessons();
    expect(JSON.parse(JSON.stringify(M.lessonQuarters(L, 'B')['4.2']))).toEqual({ quarter: 'Q2', lift: 'Q1' });
    expect(JSON.parse(JSON.stringify(M.lessonQuarters(L, 'E')['4.1']))).toEqual({ quarter: 'Q2', lift: 'Q1' });
    expect(M.lessonQuarters(lessons({ withQuarters: false }), 'B')).toEqual({});
    expect(M.closedQuarterOf(L, '2.1', 'B', '2026-11-13', CONFIG_QUARTERS, 'worksheet')).toBe('Q1');
    expect(M.closedQuarterOf(L, '2.1', 'B', '2026-11-12', CONFIG_QUARTERS, 'worksheet')).toBeNull();   // not closed yet
    expect(M.closedQuarterOf(L, '4.1', 'B', '2026-11-13', CONFIG_QUARTERS, 'worksheet')).toBeNull();   // 4.2 (Q2) shares it
    expect(M.closedQuarterOf(L, '4.1', 'B', '2026-11-13', CONFIG_QUARTERS, 'quiz')).toBe('Q1');
    expect(M.closedQuarterOf(L, '4.1', 'E', '2026-11-13', CONFIG_QUARTERS, 'worksheet')).toBeNull();
  });

  it('zeroWarnings / pastDueWork keep their pinned row shapes when the rows carry quarter fields', () => {
    const warn = M.zeroWarnings(lessons(), 'B', '2026-11-09', 3);
    for (const row of warn) expect(Object.keys(row)).toEqual(['lessonKey', 'kind', 'zeroDate', 'daysLeft', 'past']);
    const later = M.pastDueWork(lessons(), 'B', '2026-11-09', 3);
    for (const row of later) expect(Object.keys(row)).toEqual(['lessonKey', 'kind', 'dueDate', 'zeroDate', 'unit', 'worksheetKey']);
    expect(warn.map((w) => w.lessonKey + ':' + w.kind)).toEqual(['2.1:worksheet', '4.1:blooket', '4.2:quiz', '4.2:blooket', '4.3:worksheet']);
    expect(later.map((w) => w.lessonKey + ':' + w.kind)).toEqual(['4.6:worksheet']);
  });
});

// ── 2. The Desk mirror and the calendar ─────────────────────────────────────────────────────────
describe('QUARTER_WINDOWS mirrors grade-config.js (close dates included); quarterOfDate unchanged', () => {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (ymd) => (ymd ? ymd[0] + '-' + pad(ymd[1]) + '-' + pad(ymd[2]) : undefined);
  const windows = new Function(declaration('QUARTER_WINDOWS', '[', ']') + '\nreturn QUARTER_WINDOWS;')();

  it('start / end / close / finalUntil equal PHASE3_CONFIG.quarters, quarter by quarter', () => {
    expect(windows.map((w) => 'Q' + w.q)).toEqual(Object.keys(PHASE3_CONFIG.quarters));
    for (const w of windows) {
      const server = PHASE3_CONFIG.quarters['Q' + w.q];
      expect({ start: iso(w.start), end: iso(w.end), close: iso(w.close), finalUntil: iso(w.finalUntil) }, 'Q' + w.q)
        .toEqual({ start: server.start, end: server.end, close: server.close, finalUntil: server.finalUntil });
    }
    expect(iso(windows[0].close)).toBe('2026-11-12');
    expect(iso(windows[0].finalUntil)).toBe('2026-11-19');
  });

  it('quarterOfDate still returns 0 on the gap days (pinned by calendar-polish too)', () => {
    const q = new Function(declaration('QUARTER_WINDOWS', '[', ']') + '\n' + fnBody('quarterOfDate') + '\nreturn quarterOfDate;')();
    expect(q(new Date(2026, 10, 6))).toBe(1);
    expect(q(new Date(2026, 10, 7))).toBe(0);
    expect(q(new Date(2026, 10, 8))).toBe(0);
    expect(q(new Date(2026, 10, 9))).toBe(2);
  });
});

// Review D6 (2026-11-08): the close day is typed into start-here (QUARTER_CLOSE_LABEL and the help
// prose) and into the Desk's help modal. Tie every copy to grade-config, like QUARTER_WINDOWS above,
// so moving PHASE3_CONFIG.quarters.Q1.close fails here instead of leaving the copy lying.
describe('the typed close day (start-here, the Desk help) equals grade-config quarters.Q1.close', () => {
  const START = read('start-here.html');
  const DESK_HTML = deskHtml();
  const dayText = new Function(fnBody('_quarterDayText') + '\nreturn _quarterDayText;')();
  const close = dayText(PHASE3_CONFIG.quarters.Q1.close);   // 'Thu Nov 12'
  const end = dayText(PHASE3_CONFIG.quarters.Q1.end);       // 'Fri Nov 6'
  const DAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{1,2}';
  // Every "closes <day>" / "by <day>" (bold or not) in a text, as the day it names.
  const closeDays = (text) => [...text.matchAll(new RegExp('(?:closes|by) (?:<strong>|<b>)?(' + DAY + ')', 'g'))].map((m) => m[1]);
  // The Desk help modal's paragraph about missing work (HTML, not a script).
  const deskHelp = (() => {
    const at = DESK_HTML.indexOf('<b>Missing work becomes a 0</b>');
    const from = DESK_HTML.lastIndexOf('<p', at);
    return DESK_HTML.slice(from, DESK_HTML.indexOf('</p>', at) + 4);
  })();

  it('start-here: QUARTER_CLOSE_LABEL, the Progress Check heading and both help paragraphs name the configured close day', () => {
    expect(START).toContain("var QUARTER_CLOSE_LABEL = { Q1: 'closes " + close + "' };");
    const days = closeDays(START);
    expect(days.length).toBeGreaterThanOrEqual(5);   // label, heading, retake paragraph, the 0-date paragraph (twice)
    expect(new Set(days)).toEqual(new Set([close]));
    expect(START).toContain('Quarter 1 ended ' + end + ':');
  });

  it('the Desk help modal names the configured close day (twice) and end day', () => {
    expect(deskHelp).toContain('Quarter 1 ended ' + end + ':');
    const days = closeDays(deskHelp);
    expect(days).toHaveLength(2);
    expect(new Set(days)).toEqual(new Set([close]));
  });
});

describe('calendar (js/desk-calendar.js, §3.4): band text, the two marks, the Pico week badge', () => {
  function calendar() {
    const dom = new JSDOM('<div id="cell"></div>', { runScripts: 'outside-only' });
    opened.push(dom.window);
    const win = dom.window;
    win.eval(declaration('QUARTER_WINDOWS', '[', ']') + '\n' + declaration('QUARTER_BAND_LABEL', '{', '}'));
    win.eval('var MN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];');
    win.eval(/var CAL_DOW_SHORT = \[[^\]]*\];/.exec(CALENDAR)[0]);
    win.eval(['_calWindowKey', '_calDateKey', '_calWindowDate', '_calDayText', '_calQuarterBandText', '_calQuarterMark',
      '_calPaintQuarterMark', '_quarterWeekBadge'].map((name) => fnBodyOf(CALENDAR, name)).join('\n'));
    return win;
  }

  it('the Quarter 2 band names Quarter 1’s close only while it is closing', () => {
    const win = calendar();
    const band = (y, m, d) => win._calQuarterBandText(2, new win.Date(y, m - 1, d));
    expect(band(2026, 11, 6)).toBe('Quarter 2  (Nov 9 – Jan 22)');
    expect(band(2026, 11, 8)).toBe('Quarter 2  (Nov 9 – Jan 22) · Quarter 1 closes Thu Nov 12');
    expect(band(2026, 11, 12)).toBe('Quarter 2  (Nov 9 – Jan 22) · Quarter 1 closes Thu Nov 12');
    expect(band(2026, 11, 13)).toBe('Quarter 2  (Nov 9 – Jan 22)');
    expect(win._calQuarterBandText(1, new win.Date(2026, 10, 9))).toBe('Quarter 1  (Sep 2 – Nov 6)');
    expect(win._calQuarterBandText(3, new win.Date(2027, 0, 23))).toBe('Quarter 3  (Jan 25 – Apr 14)');   // Q2 has no close date
    // D8: once the Desk's phase says Quarter 1 is final (its close reported), the band stops saying "closes".
    win._deskQuarterPhase = () => ({ current: 'Q2', closing: null, final: 'Q1' });
    expect(band(2026, 11, 12)).toBe('Quarter 2  (Nov 9 – Jan 22)');
    win._deskQuarterPhase = () => ({ current: 'Q2', closing: 'Q1', final: null });
    expect(band(2026, 11, 12)).toBe('Quarter 2  (Nov 9 – Jan 22) · Quarter 1 closes Thu Nov 12');
  });

  it('marks Fri Nov 6 "Quarter 1 ends" and Thu Nov 12 "Quarter 1 closes", appended after the cell content', () => {
    const win = calendar();
    expect(win._calQuarterMark(new win.Date(2026, 10, 6))).toBe('Quarter 1 ends');
    expect(win._calQuarterMark(new win.Date(2026, 10, 12))).toBe('Quarter 1 closes');
    expect(win._calQuarterMark(new win.Date(2026, 10, 9))).toBe('');
    expect(win._calQuarterMark(new win.Date(2027, 0, 22))).toBe('');   // no close date for Q2 yet
    const cell = win.document.getElementById('cell');
    cell.innerHTML = '<div class="dn">Nov 12</div><div class="tl">2.6 · Conditional Probability</div>';
    win._calPaintQuarterMark(cell, new win.Date(2026, 10, 12));
    expect(cell.lastElementChild.className).toBe('cal-qmark');
    expect(cell.lastElementChild.textContent).toBe('Quarter 1 closes');
    expect(cell.querySelector('.tl').textContent).toBe('2.6 · Conditional Probability');   // the label Pico parses
    expect(cell.dataset.qmark).toBe('Quarter 1 closes');
  });

  it('Pico week badge: "Q1 ENDS FRI" on the week of Nov 2, "Q2 · Q1 CLOSES THU" on the week of Nov 9, else nothing', () => {
    const win = calendar();
    expect(win._quarterWeekBadge(new win.Date(2026, 10, 2))).toBe('Q1 ENDS FRI');
    expect(win._quarterWeekBadge(new win.Date(2026, 10, 9))).toBe('Q2 · Q1 CLOSES THU');
    expect(win._quarterWeekBadge(new win.Date(2026, 9, 5))).toBe('');
    expect(win._quarterWeekBadge(new win.Date(2026, 10, 16))).toBe('');
    expect(win._quarterWeekBadge(null)).toBe('');
  });

  it('rCal calls the helpers typeof-guarded, after htm(), and keeps its pinned pieces', () => {
    const body = fnBodyOf(CALENDAR, 'rCal');
    expect(body).toContain("typeof _calQuarterBandText==='function'");
    expect(body).toContain("if(typeof _calPaintQuarterMark==='function')_calPaintQuarterMark(c,dt);");
    expect(body.indexOf('c.innerHTML=htm(inf,ds)')).toBeLessThan(body.indexOf('_calPaintQuarterMark(c,dt)'));
    expect(body).toMatch(/QUARTER_BAND_LABEL/);
    expect(body).toMatch(/quarterOfDate\(/);
    expect(fnBodyOf(CALENDAR, 'htm')).not.toMatch(/qmark|Quarter 1/);
  });
});

// ── 3. Do Now pills and the missing pill (§3.1) ─────────────────────────────────────────────────
describe('Do Now: the closing / final pill first, the current pill by role, the missing pill after the last pill', () => {
  it('closing (Mon Nov 9): "Quarter 1 · 92.4 · official · closes Thu Nov 12", data-quarter / data-role, fixable title', () => {
    const win = desk();
    const phase = win._deskQuarterPhase();
    expect(JSON.parse(JSON.stringify(phase))).toEqual({ current: 'Q2', closing: 'Q1', final: null });
    const pill = win._doNowSidePill('Q1', win._gradeQuartersCache.Q1, OFFICIAL_Q1, phase);
    expect(pill.dataset.quarter).toBe('Q1');
    expect(pill.dataset.role).toBe('closing');
    expect(texts(pill.children)).toEqual(['Quarter 1', '92.4', 'official · closes Thu Nov 12']);
    expect(pill.title).toMatch(/^Quarter 1 ended Fri Nov 6\. Its 0s are fixable until Thu Nov 12, then this grade is final\./);
    const engine = win._doNowSidePill('Q1', win._gradeQuartersCache.Q1, null, phase);
    expect(texts(engine.children)).toEqual(['Quarter 1', '92', 'closes Thu Nov 12']);
    pill.click();
    expect(win.__opened).toBe(1);
  });

  it('final (Fri Nov 13): "Quarter 1 final 92.4" — the frozen grade, never below the official one', () => {
    const win = desk({ today: '2026-11-13' });
    const phase = win._deskQuarterPhase();
    const closed = { ...win._gradeQuartersCache.Q1, closed: { grade: 91.9, at: '2026-11-12T22:00:00Z', bonusApplied: null } };
    const pill = win._doNowSidePill('Q1', closed, OFFICIAL_Q1, phase);
    expect(pill.dataset.role).toBe('final');
    expect(texts(pill.children)).toEqual(['Quarter 1 final', '92.4']);
    expect(texts(win._doNowSidePill('Q1', closed, null, phase).children)).toEqual(['Quarter 1 final', '91.9']);
    expect(win._quarterFinalGrade('Q1', { closed: { grade: 95 } }, OFFICIAL_Q1)).toBe(95);
    expect(win._quarterFinalGrade('Q1', {}, null)).toBeNull();
  });

  it('D8: a close /grade reports flips every surface to "final" at once (Thu Nov 12); unreported, Fri Nov 13 is final by the date', () => {
    const closedQuarters = GRADE_QUARTERS();
    closedQuarters.Q1.closed = { grade: 91.9, at: '2026-11-12T21:00:00Z', bonusApplied: null };
    const thu = desk({ today: '2026-11-12', quarters: closedQuarters, officialByQuarter: { Q1: OFFICIAL_Q1 } });
    const phase = thu._deskQuarterPhase();
    expect(JSON.parse(JSON.stringify(phase))).toEqual({ current: 'Q2', closing: null, final: 'Q1' });
    const pill = thu._doNowSidePill('Q1', closedQuarters.Q1, OFFICIAL_Q1, phase);
    expect(pill.dataset.role).toBe('final');
    expect(texts(pill.children)).toEqual(['Quarter 1 final', '92.4']);   // never "closes Thu"
    expect(thu._walletOtherQuarterLine('Q2')).toBe('Quarter 1 final: 92.4%');
    expect(thu._zeroCurrentWarnings().map((w) => w.lessonKey)).not.toContain('2.1');   // its 0s left the Do Now
    expect(thu._gradebookTabLabel('Q1')).toBe('Quarter 1 · final');
    expect(thu._coachMissingList().map((m) => m.lesson)).not.toContain('2.1');
    // The cached config itself is never changed (a copy carries closed: true).
    expect(thu._gradeConfigCache.quarters.Q1.closed).toBeUndefined();
    // Not reported closed: Thu Nov 12 is still closing; Fri Nov 13 is final by the date, its number
    // the higher of the frozen grade and the official one, or none at all.
    expect(desk({ today: '2026-11-12' })._deskQuarterPhase().closing).toBe('Q1');
    const fri = desk({ today: '2026-11-13', officialByQuarter: { Q1: OFFICIAL_Q1 } });
    const friPhase = fri._deskQuarterPhase();
    expect(friPhase.final).toBe('Q1');
    expect(texts(fri._doNowSidePill('Q1', fri._gradeQuartersCache.Q1, OFFICIAL_Q1, friPhase).children)).toEqual(['Quarter 1 final', '92.4']);
    expect(texts(fri._doNowSidePill('Q1', fri._gradeQuartersCache.Q1, null, friPhase).children)).toEqual(['Quarter 1 final', '—']);
    // The wiring: the snapshots are cached with the dates, and cleared on an identity switch.
    expect(fnBody('renderDoNowGrades')).toContain('_gradeClosedCache = _gradeClosedQuarters(data.quarters);');
    expect(fnBody('_resetGradeStateForIdentitySwitch')).toContain('_gradeClosedCache = null;');
  });

  it('D3: the ended quarter’s official is asked for once per school day and per viewer; a missing one is asked again', async () => {
    const win = desk({ today: '2026-11-09' });
    const calls = [];
    win._fetchOfficialGrade = async (base, token, q) => {
      calls.push(token + ':' + q);
      return token === 'none' ? null : { quarter: q, grade: 92.4 };
    };
    expect((await win._fetchSideOfficialGrade('b', 'tok', 'Q1')).grade).toBe(92.4);
    await win._fetchSideOfficialGrade('b', 'tok', 'Q1');
    // Two renders at once share the request in flight.
    await Promise.all([win._fetchSideOfficialGrade('b', 'tok2', 'Q1'), win._fetchSideOfficialGrade('b', 'tok2', 'Q1')]);
    expect(calls).toEqual(['tok:Q1', 'tok2:Q1']);
    // Nothing published (or a failed request): the next render asks again.
    expect(await win._fetchSideOfficialGrade('b', 'none', 'Q1')).toBeNull();
    await win._fetchSideOfficialGrade('b', 'none', 'Q1');
    expect(calls.filter((c) => c === 'none:Q1')).toHaveLength(2);
    // A teacher viewing another student never gets the cached one.
    win._viewAsContext = () => ({ studentId: 'stu_b' });
    await win._fetchSideOfficialGrade('b', 'tok', 'Q1');
    expect(calls.filter((c) => c === 'tok:Q1')).toHaveLength(2);
    win._viewAsContext = () => null;
    // A new school day asks again.
    win.tdy = () => new win.Date('2026-11-10T00:00:00');
    await win._fetchSideOfficialGrade('b', 'tok', 'Q1');
    expect(calls.filter((c) => c === 'tok:Q1')).toHaveLength(3);
  });

  it('the new quarter reads "starts Mon Nov 9" until it starts (Sunday), nothing once it has', () => {
    expect(desk({ today: '2026-11-08' })._quarterStartsText('Q2')).toBe('starts Mon Nov 9');
    expect(desk({ today: '2026-11-09' })._quarterStartsText('Q2')).toBe('');
  });

  it('renderDoNowGrades wires both pills, the per-quarter cache and the side official (source pins)', () => {
    const body = fnBody('renderDoNowGrades');
    // Review D3: one Promise.all; the ended quarter's official through its per-day cache.
    expect(body).toContain('var officials = await Promise.all([');
    expect(body).toContain('_fetchOfficialGrade(baseUrl, token, curQ)');
    expect(body).toContain('_fetchSideOfficialGrade(baseUrl, token, sideQ)');
    expect(body).not.toContain('_fetchOfficialGrade(baseUrl, token, sideQ)');
    expect(body).toContain('_officialGradeByQuarter[sideQ] = sideOfficial;');
    expect(body).toContain("pill.dataset.role = 'current';");
    expect(body).toContain('host.appendChild(_doNowSidePill(sideQ, quarters[sideQ], sideOfficial, phase));');
    expect(body.indexOf('_doNowSidePill(sideQ')).toBeLessThan(body.indexOf('host.appendChild(pill)'));
    expect(body).toContain("keySpan.textContent = sideQ ? 'Quarter ' + curQ.slice(1) : curQ;");
    expect(body).toContain('_gradeConfigCache = (data.config');
    expect(body).not.toMatch(/quarterOfDate\(new Date\(\)\)/);   // tdy(): tests can pin the date
  });

  it('the missing pill sits after the LAST quarter pill and speaks per quarter while rows are grouped', () => {
    const win = desk();
    const host = win.document.getElementById('donow-grades');
    host.innerHTML = '<span class="qpill" data-role="closing">Quarter 1 92</span><span class="qpill" data-role="current">Quarter 2 85</span>';
    win._updateDoNowMissingPill();
    const pill = host.querySelector('.qpill-missing');
    expect(host.querySelectorAll('.qpill-missing')).toHaveLength(1);
    expect(pill.previousElementSibling.dataset.role).toBe('current');
    expect(pill.textContent).toBe('Quarter 1: 2 are 0s now, fix by Thu 11/12 · Quarter 2: 2 are 0s now · 1 more by Mon 11/9');
    expect(pill.classList.contains('qpill-now')).toBe(true);
    win._updateDoNowMissingPill();   // a refresh keeps the one pill in place
    expect(host.querySelectorAll('.qpill-missing')).toHaveLength(1);
  });

  it('degrades: an older payload (no close dates, no quarter fields) keeps the one plain sentence', () => {
    const win = desk({ withQuarters: false, config: OLD_CONFIG_QUARTERS });
    expect(win._deskQuarterPhase()).toBeNull();
    const host = win.document.getElementById('donow-grades');
    host.innerHTML = '<span class="qpill">Q2 85</span>';
    win._updateDoNowMissingPill();
    expect(host.querySelector('.qpill-missing').textContent).toBe('2 are 0s now');
    expect(host.querySelector('.qpill-missing').previousElementSibling.textContent).toBe('Q2 85');
  });
});

// ── 4. My Ledger / My Grade rows (§3.2) and the choke point (§3.3) ──────────────────────────────
describe('My Ledger Missing-work card: every row once, under the quarter it counts in', () => {
  const lift = 'finishing it by Thu can also raise Quarter 1 (never lower)';

  it('Mon Nov 9 (B): Quarter 1 heading + its 0s, Quarter 2 heading + its rows, lift notes, a status per quarter', () => {
    const win = desk({ officialByQuarter: { Q1: OFFICIAL_Q1 } });
    const host = win.document.getElementById('wallet-content');
    win._walletPrependZeroCard(host);
    const card = host.querySelector('.wallet-zero-card');
    expect([...card.children].map((c) => c.className)).toEqual([
      'wz-status geneva',
      'wz-quarter-head geneva', 'wz-row wz-past', 'wz-row wz-past wz-blooket',
      'wz-quarter-head geneva', 'wz-row wz-past wz-quiz wz-has-lift', 'wz-row wz-past wz-blooket wz-has-lift', 'wz-row wz-has-lift',
      'wz-later-head geneva', 'wz-row wz-later wz-has-lift',
    ]);
    expect(texts(card.querySelectorAll('.wz-quarter-head'))).toEqual(['Quarter 1 (closes Thu Nov 12)', 'Quarter 2 (0 dates after Fri Nov 6)']);
    expect(card.querySelector('.wz-later-head').textContent).toBe('Past due — not counting yet');
    // Every row once: no lesson + track twice.
    const keys = [...card.querySelectorAll('.wz-row')].map((r) => r.dataset.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['2.1:worksheet', '4.1:blooket', '4.2:quiz', '4.2:blooket', '4.3:worksheet', '4.6:worksheet:later']);
    // Lift notes only on rows taught in Quarter 1 that count in Quarter 2.
    expect(texts(card.querySelectorAll('.wz-lift'))).toEqual([lift, lift, lift, lift]);
    expect(card.querySelector('.wz-row[data-key="2.1:worksheet"] .wz-lift')).toBeNull();
    expect(card.querySelector('.wz-status').textContent).toBe(
      'Quarter 1 so far: 92.4% (closes Thu Nov 12). The 2 items below count as 0 — finishing them is the fastest way up. '
      + 'Quarter 2 so far: 85%. 2 items below are 0s now, 1 more becomes a 0 by Mon 11/9 — finishing them is the fastest way up.');
    expect(card.querySelector('.wz-status').textContent).not.toMatch(/\bQ[1-4]\b/);   // never "Q1" (quartiles)
    expect(card.textContent).not.toContain('Late — never a 0');
  });

  it('the signature carries the grouping: the same rows rebuild when the close is crossed', () => {
    const win = desk({ today: '2026-11-12' });
    // Only Quarter 2 work is missing, so the rows are the same on Thu Nov 12 and Fri Nov 13.
    win._gradeLessonsCache = lessons().map((L) => (L.lessonKey === '2.1' ? { ...L, Cws: 80, lessonGradeNoQuiz: 80 }
      : L.lessonKey === '4.1' ? { ...L, blooket: 90 } : L));
    const host = win.document.getElementById('wallet-content');
    win._walletPrependZeroCard(host);
    const before = host.querySelector('.wallet-zero-card');
    expect(texts(before.querySelectorAll('.wz-quarter-head'))).toEqual(['Quarter 2 (0 dates after Fri Nov 6)']);
    win._walletPrependZeroCard(host);
    expect(host.querySelector('.wallet-zero-card')).toBe(before);   // same rows, same grouping: kept
    const rowsBefore = [...before.querySelectorAll('.wz-row')].map((r) => r.dataset.key);
    win.tdy = () => new win.Date('2026-11-13T00:00:00');
    win._walletPrependZeroCard(host);
    const after = host.querySelector('.wallet-zero-card');
    expect(after).not.toBe(before);
    expect([...after.querySelectorAll('.wz-row')].map((r) => r.dataset.key)).toEqual(rowsBefore);
    expect(after.querySelector('.wz-quarter-head')).toBeNull();
    expect(after.querySelector('.wz-lift')).toBeNull();
  });

  it('after the close (Fri Nov 13) Quarter 1 rows leave the card, the pill and the badge list; Quarter 2 rows stay', () => {
    const win = desk({ today: '2026-11-13' });
    expect(win._zeroCurrentWarnings().map((w) => w.lessonKey + ':' + w.kind)).toEqual(['4.2:quiz', '4.2:blooket', '4.3:worksheet']);
    const host = win.document.getElementById('wallet-content');
    win._walletPrependZeroCard(host);
    const card = host.querySelector('.wallet-zero-card');
    expect(card.querySelector('.wz-quarter-head')).toBeNull();   // one quarter left, none closing: one list
    expect([...card.querySelectorAll('.wz-row')].map((r) => r.dataset.key))
      .toEqual(['4.2:quiz', '4.2:blooket', '4.3:worksheet', '4.6:worksheet:later', '4.8:worksheet:later', '4.8:quiz:later']);
    expect(card.querySelector('.wz-lift')).toBeNull();   // Quarter 1 is closed: nothing can raise it now
  });

  it('degrades: an older payload keeps today’s card (no headings, no lift notes, "late · no 0" rows)', () => {
    const win = desk({ withQuarters: false, config: OLD_CONFIG_QUARTERS });
    const host = win.document.getElementById('wallet-content');
    win._walletPrependZeroCard(host);
    const card = host.querySelector('.wallet-zero-card');
    expect(card.querySelector('.wz-quarter-head')).toBeNull();
    expect(card.querySelector('.wz-lift')).toBeNull();
    expect(texts(card.querySelectorAll('.wz-later-head'))).toEqual(['Late — never a 0']);
    expect(card.querySelector('.wz-status').textContent).toMatch(/^Quarter 2 so far: 85%\./);   // review D4: never "Q2"
  });

  it('Period E: 2.2 and 2.3 Day 1 count in Quarter 2 there (lift notes), E’s 2.1 Day 1 in Quarter 1', () => {
    const win = desk({ period: 'E', today: '2026-11-09' });
    const view = win._zeroQuarterView(win._zeroCurrentWarnings().concat(win._pastDueCurrentWork()));
    expect(view.quarterOf({ lessonKey: '2.1' })).toBe('Q1');
    expect(view.quarterOf({ lessonKey: '4.1' })).toBe('Q2');
    expect(view.lift({ lessonKey: '4.1' })).toBe(lift);
    expect(view.lift({ lessonKey: '2.1' })).toBe('');
  });
});

describe('balance card scoping (§3.2): the number speaks for the quarter shown; Quarter 1 in its own line', () => {
  it('only the shown quarter’s rows colour the number and feed the drop sentence', () => {
    const win = desk();
    const warns = win._zeroCurrentWarnings();
    expect(win._zeroRowsInQuarter(warns, 'Q2').map((w) => w.lessonKey + ':' + w.kind)).toEqual(['4.2:quiz', '4.2:blooket', '4.3:worksheet']);
    expect(win._zeroRowsInQuarter(warns, 'Q1').map((w) => w.lessonKey)).toEqual(['2.1', '4.1']);
    // An older payload: no fields, every row stays (today's behaviour).
    const old = desk({ withQuarters: false, config: OLD_CONFIG_QUARTERS });
    expect(old._zeroRowsInQuarter(old._zeroCurrentWarnings(), 'Q2')).toHaveLength(old._zeroCurrentWarnings().length);
    const paint = fnBody('_walletPaint');
    expect(paint).toContain('_walletGradeDropText(shownWarns)');
    expect(paint).toContain('_walletApplyZeroTint(card, warns);');   // the tint keeps every open 0
  });

  it('the other-quarter line: closing, final (read-only for the week), and nothing after Nov 19', () => {
    const closing = desk({ officialByQuarter: { Q1: OFFICIAL_Q1 } });
    expect(closing._walletOtherQuarterLine('Q2')).toBe('Quarter 1: 92.4% official · closes Thu Nov 12. Its 0s can still be fixed until then.');
    const quarters = GRADE_QUARTERS();
    quarters.Q1.closed = { grade: 92, at: '2026-11-12T22:00:00Z', bonusApplied: null };
    expect(desk({ today: '2026-11-13', quarters })._walletOtherQuarterLine('Q2')).toBe('Quarter 1 final: 92%');
    expect(desk({ today: '2026-11-20', quarters })._walletOtherQuarterLine('Q2')).toBe('');
    // Sunday with no Quarter 2 grade yet the card itself shows Quarter 1: only the close is named.
    const sunday = GRADE_QUARTERS(); sunday.Q2.quarterGrade = null;
    const sun = desk({ today: '2026-11-08', quarters: sunday });
    expect(sun._walletCurrentQuarter().quarter).toBe('Q1');
    expect(sun._walletOtherQuarterLine('Q1')).toBe('Quarter 1 closes Thu Nov 12. Its 0s can still be fixed until then.');
  });

  it('per-quarter official cache: Q1’s official answers for Q1, never for Q2 (and the alias wins for its own quarter)', () => {
    const win = desk({ official: { ...OFFICIAL_Q1, quarter: 'Q2', grade: 86.1 }, officialByQuarter: { Q1: OFFICIAL_Q1 } });
    expect(win._walletCurrentGrade()).toMatchObject({ pct: 86.1, q: 'Q2' });
    expect(win._walletQuarterGrade('Q1')).toMatchObject({ pct: 92.4, q: 'Q1', official: OFFICIAL_Q1, estimate: 92 });
    expect(win._officialGradeFor('Q3')).toBeNull();
    const sunday = GRADE_QUARTERS(); sunday.Q2.quarterGrade = null;
    const sun = desk({ today: '2026-11-08', quarters: sunday, official: null, officialByQuarter: { Q1: OFFICIAL_Q1, Q2: null } });
    expect(sun._walletCurrentGrade()).toMatchObject({ pct: 92.4, q: 'Q1' });
  });

  it('Finding R6b: a quarter that has not started shows no official grade, even a cached one; once it starts, it does', () => {
    // Sun Nov 8: a nightly pass published Quarter 2's 80 before Quarter 2 starts (the engine has no Q2 grade).
    const OFFICIAL_Q2 = { quarter: 'Q2', grade: 80, asOf: '2026-11-08T21:50:00.000Z', parts: { work: 80, rule: 'work' } };
    const sunday = GRADE_QUARTERS(); sunday.Q2.quarterGrade = null;
    const sun = desk({ today: '2026-11-08', quarters: sunday, official: OFFICIAL_Q2, officialByQuarter: { Q1: OFFICIAL_Q1, Q2: OFFICIAL_Q2 } });
    expect(sun._officialGradeFor('Q2')).toBeNull();
    expect(sun._walletQuarterGrade('Q2')).toEqual({ pct: null, q: 'Q2' });
    expect(sun._quarterStatusLead('Q2', sun._deskQuarterPhase())).toBe('Quarter 2: ');
    // Quarter 1 (ended, closing) is unaffected.
    expect(sun._officialGradeFor('Q1')).toBe(OFFICIAL_Q1);
    expect(sun._walletCurrentGrade()).toMatchObject({ pct: 92.4, q: 'Q1', official: OFFICIAL_Q1 });
    // No quarter with a grade at all: the balance card shows no number rather than Quarter 2's 80.
    const empty = { Q1: { quarterGrade: null }, Q2: { quarterGrade: null }, Q3: { quarterGrade: null }, Q4: { quarterGrade: null } };
    const none = desk({ today: '2026-11-08', quarters: empty, official: OFFICIAL_Q2, officialByQuarter: { Q2: OFFICIAL_Q2 } });
    expect(none._walletCurrentGrade()).toEqual({ pct: null, q: null });
    // Mon Nov 9: Quarter 2 has started, so the same official leads exactly as before.
    const mon = desk({ today: '2026-11-09', official: OFFICIAL_Q2, officialByQuarter: { Q1: OFFICIAL_Q1, Q2: OFFICIAL_Q2 } });
    expect(mon._officialGradeFor('Q2')).toBe(OFFICIAL_Q2);
    expect(mon._walletCurrentGrade()).toMatchObject({ pct: 80, q: 'Q2', official: OFFICIAL_Q2, estimate: 85 });
    expect(mon._quarterStatusLead('Q2', mon._deskQuarterPhase())).toBe('Quarter 2 so far: 80%. ');
  });
});

// ── 5. Coach, bonus, snapshot, notice (§3.7, §3.8, §3.11, §3.9) ─────────────────────────────────
describe('coach (§3.7): one quarter at a time; the closing quarter gets its own line', () => {
  it('tags items by quarter, keeps Quarter 2’s for the Quarter 2 explanation, counts Quarter 1’s fixable 0s', () => {
    const win = desk();
    expect(win._coachMissingList().map((m) => m.lesson + ':' + m.quarter)).toEqual(['2.1:Q1', '4.1:Q1', '4.2:Q2', '4.2:Q2', '4.3:Q2']);
    const ctx = { missing: win._coachMissingList('Q2') };
    expect(ctx.missing.map((m) => m.lesson)).toEqual(['4.2', '4.2', '4.3']);
    win._coachQuarterLine(ctx, 'Q2');
    expect(ctx.quarterLine).toBe('Quarter 1 closes Thu Nov 12: 2 zeros still fixable.');
    const q1 = { missing: win._coachMissingList('Q1') };
    win._coachQuarterLine(q1, 'Q1');   // explaining the closing quarter itself: no extra line
    expect(q1.missing.map((m) => m.lesson)).toEqual(['2.1', '4.1']);
    expect(q1.quarterLine).toBeUndefined();
    expect(fnBody('_buildCoachContext')).toContain('ctx.missing = _coachMissingList(curQ);');
    expect(fnBody('_buildCoachContext')).toContain('_coachQuarterLine(ctx, curQ)');
    expect(fnBody('_renderCoachPanel')).toContain('ctx.quarterLine');
  });

  it('an older payload: items carry no quarter and nothing is filtered', () => {
    const win = desk({ withQuarters: false, config: OLD_CONFIG_QUARTERS });
    const ctx = { missing: win._coachMissingList('Q2') };
    expect(ctx.missing.every((m) => !('quarter' in m))).toBe(true);
    expect(ctx.missing).toHaveLength(2);
    win._coachQuarterLine(ctx, 'Q2');
    expect(ctx.quarterLine).toBeUndefined();
    expect(win._coachLessonFilter('Q2')).toBeNull();   // nothing to filter the lesson lists by
  });

  // Review D2 (2026-11-08): 15 Quarter 1 zeros (the oldest zero dates) and 5 Quarter 2 items. Before
  // the fix the 12-item cut ran first, so the Quarter 2 coach saw none of its own items.
  function coachDesk(today) {
    const win = desk({ today });
    const P2 = (q) => ({ B: q, E: q });
    const q1Keys = Array.from({ length: 15 }, (_, i) => '1.' + (i + 1));
    const q2Keys = ['4.2', '4.3', '4.4', '4.5', '4.6'];
    win._gradeLessonsCache = [
      ...q1Keys.map((key) => ({ lessonKey: key, quarter: P2('Q1'), liftQuarter: P2(null) })),
      ...q2Keys.map((key) => ({ lessonKey: key, quarter: P2('Q2'), liftQuarter: P2('Q1') })),
    ];
    const pad = (n) => String(n).padStart(2, '0');
    win._zeroCurrentWarnings = () => [
      ...q1Keys.map((key, i) => ({ lessonKey: key, kind: 'worksheet', zeroDate: '2026-10-' + pad(10 + i), past: true })),
      ...q2Keys.map((key, i) => ({ lessonKey: key, kind: 'quiz', zeroDate: '2026-11-' + pad(8 + i), past: 8 + i < 9 })),
    ];
    return win;
  }

  it('D2: 15 Quarter 1 + 5 Quarter 2 warnings — the Quarter 2 coach lists its 5; the closing line counts all 15', () => {
    const win = coachDesk('2026-11-09');
    const ctx = { missing: win._coachMissingList('Q2') };
    expect(ctx.missing.map((m) => m.lesson)).toEqual(['4.2', '4.3', '4.4', '4.5', '4.6']);
    win._coachQuarterLine(ctx, 'Q2');
    expect(ctx.quarterLine).toBe('Quarter 1 closes Thu Nov 12: 15 zeros still fixable.');
    // Explaining Quarter 1 (Sunday, no Quarter 2 grade yet): its own 15, cut to 12.
    expect(win._coachMissingList('Q1')).toHaveLength(12);
    expect(win._coachMissingList('Q1').every((m) => m.quarter === 'Q1')).toBe(true);
  });

  it('D2: the flashcard and weak-lesson lists speak for the quarter explained; a closed quarter never comes back', () => {
    const P2 = (q) => ({ B: q, E: q });
    const row = (key, quarter, lift, extra) => ({ lessonKey: key, quarter: P2(quarter), liftQuarter: P2(lift),
      hasBlooket: true, Cws: 90, blooket: 60, lessonGrade: 50, lessonGradeNoQuiz: 90, quizTotal: 0, ...extra });
    const rows = () => [
      row('1.3', 'Q1', null, { lessonGrade: 41, Cws: 41 }),   // Quarter 1 work: the old biggest win (worksheet under 60: no deck line)
      row('1.5', 'Q1', null),
      row('4.2', 'Q2', 'Q1', { lessonGrade: 70 }),           // taught in Quarter 1, counts in Quarter 2
      row('4.8', 'Q2', null, { lessonGrade: 72 }),           // a Quarter 2 lesson
    ];
    const coach = (today, quarter) => {
      const win = desk({ today });
      win._gradeLessonsCache = rows();
      const ctx = win._buildCoachContext(quarter, win._gradeQuartersCache[quarter]);
      return { keys: ctx.flashcardGate.map((g) => g.lesson), weak: ctx.weakLessons.map((w) => w.lesson), win: ctx.biggestWin && ctx.biggestWin.lesson };
    };
    // Mon Nov 9, Quarter 2 explained: no Quarter 1 deck, no Quarter 1 biggest win.
    expect(coach('2026-11-09', 'Q2')).toEqual({ keys: ['4.2', '4.8'], weak: ['4.2', '4.8'], win: '4.2' });
    // Sunday, Quarter 1 explained while it is closing: its own lessons AND the lift-only ones.
    expect(coach('2026-11-08', 'Q1')).toEqual({ keys: ['1.5', '4.2'], weak: ['1.3', '1.5', '4.2'], win: '1.3' });
    // Fri Nov 13, after the close: only Quarter 2 lessons, even if asked about Quarter 1.
    expect(coach('2026-11-13', 'Q2')).toEqual({ keys: ['4.2', '4.8'], weak: ['4.2', '4.8'], win: '4.2' });
    expect(coach('2026-11-13', 'Q1')).toEqual({ keys: [], weak: [], win: undefined });
    // An older payload (no quarter fields): every lesson, as before.
    const old = desk({ today: '2026-11-09', withQuarters: false, config: OLD_CONFIG_QUARTERS });
    old._gradeLessonsCache = rows().map(({ quarter, liftQuarter, ...rest }) => rest);
    expect(old._buildCoachContext('Q2', old._gradeQuartersCache.Q2).flashcardGate.map((g) => g.lesson)).toEqual(['1.5', '4.2', '4.8']);
  });

  it('D2 / D4: the coach header names the quarter in words ("Your Quarter 2 grade is …"); ctx.quarter stays the key', () => {
    const win = desk();
    const ctx = win._buildCoachContext('Q2', win._gradeQuartersCache.Q2);
    expect(ctx.quarter).toBe('Q2');   // the AI coach reads the key
    const panel = win.document.createElement('div');
    win._coachAsk = () => {};
    win._renderCoachPanel(panel, ctx);
    expect(panel.querySelector('.wsl-head').textContent).toMatch(/^Your Quarter 2 grade is 84\.6%/);
  });
});

describe('bonus (§3.8): never "Q0" on a gap day; a closing quarter’s bonus is added at Thursday’s close', () => {
  const sheet = { src: 'bonus', i: 'BONUS-screen', sc: 3, response: JSON.stringify({ quarter: 'Q1', grade: 'P', title: 'Screen Time' }) };
  it('Sunday in the window: Quarter 1’s sheet, "added at Thursday\'s close"', () => {
    const win = desk({ today: '2026-11-08' });
    const summary = win._bonusSummary([sheet]);
    expect(summary.quarter).toBe('Q1');
    expect(summary.closeDay).toBe('Thursday');
    expect(win._doNowBonusText(summary)).toBe('Bonus banked: Screen Time P (+4.5) = +4.5, added at Thursday\'s close');
    expect(win._walletBonusBlock([sheet]).lastChild.textContent).toBe('Added at Thursday\'s close to whichever track helps you more.');
  });
  it('a gap day without close dates falls back to a real quarter (never "Q0"); after the close it is Quarter 2', () => {
    const old = desk({ today: '2026-11-08', withQuarters: false, config: OLD_CONFIG_QUARTERS });
    expect(old._bonusSummary([sheet]).quarter).toBe('Q1');
    expect(old._bonusSummary([]) === null || old._bonusSummary([]).quarter !== 'Q0').toBe(true);
    const after = desk({ today: '2026-11-13' });
    expect(after._bonusSummary([sheet])).toBeNull();   // a Q1 sheet is not Quarter 2's
    expect(fnBody('_bonusSummary')).not.toMatch(/'Q' \+ quarterOfDate\(new Date\(\)\)/);
  });
});

describe('Class Snapshot (§3.11): after the close, no "Do this next" for a closed quarter’s assignment', () => {
  const A21 = { key: '2.1:worksheet', lessonKey: '2.1', track: 'worksheet', title: '2.1 Day 1 Follow-Along', zeroDate: '2026-11-01', values: [0, 80, 90, 95, 100], zeros: 1 };
  const B42 = { key: '4.2:quiz', lessonKey: '4.2', track: 'quiz', title: '2.3 Day 2 Quiz', zeroDate: '2026-11-08', values: [0, 67, 100, 100, 100], zeros: 1 };
  const W41 = { key: '4.1:worksheet', lessonKey: '4.1', track: 'worksheet', title: '2.3 Follow-Along', zeroDate: '2026-11-05', values: [0, 90, 100], zeros: 1 };
  function snap(today) {
    const win = desk({ today });
    win.ClassSnapshot = { fiveNumber: () => ({ q1: 80, median: 95, q3: 100 }) };
    return win;
  }
  it('labels the closed quarter’s 0 "Quarter 1 final", with no action; open quarters keep their advice', () => {
    const win = snap('2026-11-13');
    const lessonsB = win._gradeLessonsCache;
    expect(win._snapClosedQuarterFor(A21, 'PeriodB', lessonsB)).toBe('Q1');
    expect(win._snapClosedQuarterFor(B42, 'PeriodB', lessonsB)).toBeNull();
    expect(win._snapClosedQuarterFor(W41, 'PeriodB', lessonsB)).toBeNull();   // the shared worksheet still counts via 4.2
    expect(win._snapClosedQuarterFor(A21, 'PeriodB', lessonsB) && win._snapAdvice(A21, null, undefined, false, 'Q1'))
      .toEqual({ text: 'Quarter 1 final — this 0 no longer changes.' });
    expect(win._snapAdvice(A21, 95, undefined, false, 'Q1')).toEqual({ text: 'You have 95 here. Quarter 1 final — it no longer changes.' });
    expect(win._snapAdvice(B42, null, undefined, false, null).text).toMatch(/^Do this next\./);
    expect(win._snapFocus([A21, B42], [null, null], undefined, [false, false], ['Q1', null])).toEqual({ index: 1, clear: false });
    expect(win._snapFocus([A21], [null], undefined, [false], ['Q1'])).toEqual({ index: 0, clear: true });
    expect(win._snapFocus([A21, B42], [null, null], undefined, [false, false])).toEqual({ index: 0, clear: false });   // no flags: as before
  });
  it('during the window (Thu Nov 12) nothing is final yet', () => {
    const win = snap('2026-11-12');
    expect(win._snapClosedQuarterFor(A21, 'PeriodB', win._gradeLessonsCache)).toBeNull();
  });
});

describe('one-time notice (§3.9): Sun Nov 8 – Tue Nov 10, dismissable', () => {
  it('B on Sunday: 2.3 Day 2 and 2.4; one lesson reads exactly as the spec', () => {
    const win = desk({ today: '2026-11-08' });
    expect(win._quarterNoticeLessons()).toEqual(['4.2', '4.3']);
    expect(win._quarterNoticeText(['4.2'])).toBe('Quarter 1 ended Friday. 2.3 Day 2 counts for Quarter 2 and its 0 date is today; finish it to clear it.');
    expect(win._quarterNoticeText(['4.2', '4.3'])).toBe('Quarter 1 ended Friday. 2.3 Day 2 (0 date today) and 2.4 (0 date Mon 11/9) count for Quarter 2; finish them to clear them.');
  });
  it('E on Sunday: 2.3 Day 1 (its 0 date is today); on Monday it "was Sun 11/8"; 2.4 (0 date Tue) is not named', () => {
    const sun = desk({ period: 'E', today: '2026-11-08' });
    expect(sun._quarterNoticeLessons()).toEqual(['4.1']);
    expect(sun._quarterNoticeText(['4.1'])).toBe('Quarter 1 ended Friday. 2.3 Day 1 counts for Quarter 2 and its 0 date is today; finish it to clear it.');
    const mon = desk({ period: 'E', today: '2026-11-09' });
    expect(mon._quarterNoticeText(['4.1'])).toBe('Quarter 1 ended Friday. 2.3 Day 1 counts for Quarter 2 and its 0 date was Sun 11/8; finish it to clear it.');
  });
  it('renders on the Do Now, dismisses once per student, and is gone after Tue Nov 10', () => {
    const win = desk({ today: '2026-11-09' });
    win.rosterClient = { current: () => ({ username: 'alpha_otter' }) };
    win._renderQuarterNotice();
    const host = win.document.getElementById('donow-notice');
    expect(host.style.display).toBe('flex');
    expect(host.querySelector('.donow-notice-text').textContent).toBe(
      'Quarter 1 ended Friday. 2.3 Day 2 (0 date Sun 11/8) and 2.4 (0 date today) count for Quarter 2; finish them to clear them.');
    host.querySelector('button').click();
    expect(host.style.display).toBe('none');
    expect(win.localStorage.getItem('apstats_quarter_notice_Q1_alpha_otter')).toBe('1');
    win._renderQuarterNotice();
    expect(host.style.display).toBe('none');
    expect(desk({ today: '2026-11-11' })._quarterNoticeLessons()).toEqual([]);
    expect(desk({ today: '2026-11-08', withQuarters: false, config: OLD_CONFIG_QUARTERS })._quarterNoticeLessons()).toEqual([]);
  });
});

// ── 6. My Gradebook (§3.5) and the Schoology tag ────────────────────────────────────────────────
describe('My Gradebook (§3.5): the closing quarter opens first; tab labels; lift-only columns; MP-aware tag', () => {
  const col = (key, extra = {}) => ({ key, kind: key.split(':')[0] === 'QUIZ' ? 'quiz' : 'followalong', category: key.startsWith('QUIZ') ? 'Quizzes' : 'Lesson',
    title: key, unit: 4, topicKeys: [key.split(':')[1].split('-')[0]], ...extra });
  const gradebook = () => ({ weights: { Lesson: 15, Quizzes: 15 }, quarters: {
    Q1: { columns: [col('FA:4.1-2', { topicKeys: ['4.1', '4.2'], schoologyTitle: '2.3 Follow-Along' }),
      col('QUIZ:4.2', { liftOnly: true, topicKeys: ['4.2'], schoologyTitle: '2.3 Day 2 Quiz' })],
    cells: { 'FA:4.1-2': 90 }, categoryAverages: {}, v3Total: 92, schoologyTotal: 90 },
    Q2: { columns: [col('FA:4.1-2', { topicKeys: ['4.1', '4.2'], schoologyTitle: '2.3 Follow-Along' }),
      col('QUIZ:4.2', { topicKeys: ['4.2'], schoologyTitle: '2.3 Day 2 Quiz' })],
    cells: { 'FA:4.1-2': 90 }, categoryAverages: {}, v3Total: 85, schoologyTotal: 80 },
  } });

  it('opens on the closing quarter in the window, on the current one otherwise; tabs carry the rule', () => {
    expect(desk({ today: '2026-11-09' })._firstGradebookQuarter(gradebook())).toBe('Q1');
    expect(desk({ today: '2026-11-13' })._firstGradebookQuarter(gradebook())).toBe('Q2');
    expect(desk({ today: '2026-11-09', withQuarters: false, config: OLD_CONFIG_QUARTERS })._firstGradebookQuarter(gradebook())).toBe('Q2');
    const win = desk({ today: '2026-11-09' });
    expect(['Q1', 'Q2', 'Q3', 'Q4'].map(win._gradebookTabLabel)).toEqual(['Quarter 1 · closes Thu Nov 12', 'Quarter 2 · 0 dates after Nov 6', 'Quarter 3', 'Quarter 4']);
    expect(desk({ today: '2026-11-13' })._gradebookTabLabel('Q1')).toBe('Quarter 1 · final');
    expect(desk({ today: '2026-11-20' })._gradebookTabLabel('Q1')).toBe('Quarter 1');   // review D4: never "Q1"
    expect(desk({ today: '2026-11-09', withQuarters: false, config: OLD_CONFIG_QUARTERS })._gradebookTabLabel('Q2')).toBe('Quarter 2');
  });

  it('a lift-only column says "can raise Quarter 1", is never owed, and a column without the flag is an ordinary one', () => {
    const win = desk({ today: '2026-11-09', html: '<div id="my-gradebook-body"></div><div id="my-gradebook-qtabs"></div>' });
    win._activeGradebook = gradebook();
    win.renderMyGradebook('Q1');
    const body = win.document.getElementById('my-gradebook-body');
    expect(body.querySelector('.mgb-lift').textContent).toBe('can raise Quarter 1');
    expect(body.textContent).not.toMatch(/due, not done yet/);   // the lift-only quiz is not owed
    expect(texts(win.document.getElementById('my-gradebook-qtabs').children)).toEqual(['Quarter 1 · closes Thu Nov 12', 'Quarter 2 · 0 dates after Nov 6', 'Quarter 3', 'Quarter 4']);
    expect(body.firstChild.textContent).toMatch(/^Quarter 1 · closes Thu Nov 12 — /);
    win.renderMyGradebook('Q2');
    expect(body.querySelector('.mgb-lift')).toBeNull();
    expect(body.textContent).toMatch(/1 thing is due, not done yet/);   // the regular Q2 quiz is owed
  });

  it('D5: outside a close window a lift-only column "counts in Quarter 2"; in the last quarter it "can still raise Quarter 4 (never a 0)"', () => {
    const html = '<div id="my-gradebook-body"></div><div id="my-gradebook-qtabs"></div>';
    const later = desk({ today: '2026-11-20', html });
    later._activeGradebook = gradebook();
    later.renderMyGradebook('Q1');
    expect(later.document.querySelector('#my-gradebook-body .mgb-lift').textContent).toBe('counts in Quarter 2');
    const june = desk({ today: '2027-06-10', html });
    june._activeGradebook = { weights: {}, quarters: { Q4: { columns: [col('QUIZ:9.6', { liftOnly: true, topicKeys: ['9.6'] })],
      cells: {}, categoryAverages: {}, v3Total: 90, schoologyTotal: 90 } } };
    june.renderMyGradebook('Q4');
    expect(june.document.querySelector('#my-gradebook-body .mgb-lift').textContent).toBe('can still raise Quarter 4 (never a 0)');
    expect(june.document.getElementById('my-gradebook-body').textContent).not.toContain('Quarter 5');
    expect(june._gradebookHasNextQuarter('Q3')).toBe(true);
    // Without /grade dates: Q1–Q3 have a next quarter, Q4 does not.
    const old = desk({ withQuarters: false, config: null });
    expect(['Q1', 'Q2', 'Q3', 'Q4'].map(old._gradebookHasNextQuarter)).toEqual([true, true, true, false]);
  });

  it('D7: a column whose Schoology copy is in another marking period is dimmed, tagged "(MP1)", never owed, never tinted "in Schoology"', () => {
    const html = '<div id="my-gradebook-body"></div><div id="my-gradebook-qtabs"></div>';
    const straddle = () => {
      const gb = gradebook();
      gb.quarters.Q2.columns = [
        col('FA:4.1-2', { topicKeys: ['4.2'], schoologyTitle: '2.3 Follow-Along', schoologyQuarter: 'Q1', due: true }),
        col('QUIZ:4.2', { topicKeys: ['4.2'], schoologyTitle: '2.3 Day 2 Quiz', due: true }),
      ];
      gb.quarters.Q2.cells = {};
      return gb;
    };
    const win = desk({ today: '2026-11-09', html });
    win._activeGradebook = straddle();
    win.renderMyGradebook('Q2');
    const body = win.document.getElementById('my-gradebook-body');
    const dim = body.querySelectorAll('.mgb-elsewhere');
    expect(dim).toHaveLength(1);
    expect(dim[0].style.opacity).toBe('0.6');
    expect(dim[0].querySelector('.mgb-elsewhere-tag').textContent).toBe('Schoology: 2.3 Follow-Along (MP1)');
    expect(body.textContent).toMatch(/1 thing is due, not done yet/);   // only the regular quiz is owed
    // Scored: its number shows, but never the blue-grey "in your Schoology grade" tint.
    win._activeGradebook.quarters.Q2.cells = { 'FA:4.1-2': 90 };
    win.renderMyGradebook('Q2');
    const scored = body.querySelector('.mgb-elsewhere');
    expect(scored.textContent).toContain('90.0');
    expect(scored.title).toBe('This column is in Schoology MP1, not in this quarter\'s Schoology gradebook.');
    expect(body.querySelector('.mgb-cell-schoology')).toBeNull();
    // A column stamped with its own tab's quarter, or without the flag, is an ordinary column.
    win._activeGradebook = straddle();
    win._activeGradebook.quarters.Q2.columns[0].schoologyQuarter = 'Q2';
    win.renderMyGradebook('Q2');
    expect(body.querySelector('.mgb-elsewhere')).toBeNull();
    expect(body.textContent).toMatch(/2 things are due, not done yet/);
    // The ledger row's tag names the marking period the column really sits in.
    const ledger = desk({ gradebook: straddle() });
    expect(ledger._gradebookSchoologyPeriod('2.3 Follow-Along')).toBe('MP1');
    expect(ledger._zeroSchoologyLabel({ lessonKey: '4.2', kind: 'worksheet', unit: 4, worksheetKey: '1-2' })).toBe('Schoology MP1: 2.3 Follow-Along');
  });

  it('the Schoology tag names MP2 when a title sits in two tabs and one copy is lift-only; a straddling group stays plain', () => {
    const win = desk({ gradebook: gradebook() });
    expect(win._gradebookSchoologyPeriod('2.3 Day 2 Quiz')).toBe('MP2');
    expect(win._gradebookSchoologyPeriod('2.3 Follow-Along')).toBeNull();
    expect(win._zeroSchoologyLabel({ lessonKey: '4.2', kind: 'quiz' })).toBe('Schoology MP2: 2.3 Day 2 Quiz');
    expect(win._zeroSchoologyTag({ lessonKey: '4.2', kind: 'worksheet', unit: 4, worksheetKey: '1-2' }).textContent).toBe('Schoology: 2.3 Follow-Along');
    expect(desk({ gradebook: null })._zeroSchoologyLabel({ lessonKey: '4.2', kind: 'quiz' })).toBe('Schoology: 2.3 Day 2 Quiz');
  });
});

// ── 7. The phone page (§3.10) ───────────────────────────────────────────────────────────────────
describe('mobile-home.html (§3.10): never Quarter 2 alone while Quarter 1 is fixable', () => {
  const fn = (name) => fnBodyOf(MOBILE, name);
  // who: the student signed in now (_fcStudent); _gradeOwner: whose /grade is on screen.
  function phone(today, { who = null } = {}) {
    const dom = new JSDOM('<div id="gradepill" style="display:none"></div>',
      { runScripts: 'outside-only', url: 'https://robjohncolson.github.io/apstats-live-worksheet/mobile-home.html' });
    opened.push(dom.window);
    const win = dom.window;
    win.Date = fixedDate(win, today);
    win.__who = who;
    win.eval('var _gradeByTopic = {}, _lastLessons = [], _gradeOwner = null, _endedOfficial = null, _lastGradePayload = null;'
      + ' function render() {} function _fcStudent() { return window.__who; }\n'
      + /var OFFICIAL_KEY = '[^']+';/.exec(MOBILE)[0] + '\n'
      + ['_normTopic', '_schoolTodayIso', '_quarterDayText', '_endedQuarter', '_endedOfficialGrade', '_quarterWindowLine',
        '_loadEndedOfficial', '_repaintQuarterLine', '_applyGradeData'].map(fn).join('\n'));
    return win;
  }
  // The official grade the phone has cached for Quarter 1, stamped with its owner.
  const cacheOfficial = (win, grade, owner = 'kid') => {
    win._endedOfficial = { owner, quarter: 'Q1', official: { quarter: 'Q1', grade } };
  };
  const payload = (extra = {}) => ({ lessons: [], config: { quarters: CONFIG_QUARTERS }, quarters: { ...GRADE_QUARTERS(), ...extra } });
  const pill = (win) => win.document.getElementById('gradepill').textContent;

  it('closing: "Quarter 1 92% · closes Thu Nov 12 · Quarter 2 85%"; Sunday without a Q2 grade: "starts Mon Nov 9"', () => {
    const mon = phone('2026-11-09');
    mon._applyGradeData(payload(), false);
    expect(pill(mon)).toBe('📊 Quarter 1 92% · closes Thu Nov 12 · Quarter 2 85%');
    const sun = phone('2026-11-08');
    sun._applyGradeData(payload({ Q2: { quarterGrade: null } }), false);
    expect(pill(sun)).toBe('📊 Quarter 1 92% · closes Thu Nov 12 · Quarter 2 starts Mon Nov 9');
  });

  it('Finding R6b: Sunday with a cached official, Quarter 2 still reads "starts Mon Nov 9" with no number; Monday shows its number', () => {
    const line = (win, g) => { win._applyGradeData(g, false); return pill(win); };
    const signedIn = (today) => { const win = phone(today, { who: 'kid' }); win._gradeOwner = 'kid'; return win; };
    // The phone's only official cache, here holding a Quarter 2 official (owner-stamped, as the boot reads it).
    const cacheQ2 = (win) => { win._endedOfficial = { owner: 'kid', quarter: 'Q2', official: { quarter: 'Q2', grade: 80 } }; };
    const sunday = payload({ Q2: { quarterGrade: null } });
    const sun = signedIn('2026-11-08');
    cacheQ2(sun);
    expect(line(sun, sunday)).toBe('\u{1F4CA} Quarter 1 92% \u00b7 closes Thu Nov 12 \u00b7 Quarter 2 starts Mon Nov 9');
    // Quarter 1 (closing) keeps its own official.
    cacheOfficial(sun, 94.4);
    expect(line(sun, sunday)).toBe('\u{1F4CA} Quarter 1 94% \u00b7 closes Thu Nov 12 \u00b7 Quarter 2 starts Mon Nov 9');
    // Mon Nov 9: Quarter 2 has started; its number is today's grade, as before (the phone never shows a Quarter 2 official).
    const mon = signedIn('2026-11-09');
    cacheQ2(mon);
    expect(line(mon, payload())).toBe('\u{1F4CA} Quarter 1 92% \u00b7 closes Thu Nov 12 \u00b7 Quarter 2 85%');
  });
  it('final week: "Quarter 1 final 92%" from the closed grade; after Nov 19 and without close dates: the one-quarter line', () => {
    const fri = phone('2026-11-13');
    fri._applyGradeData(payload({ Q1: { quarterGrade: 91.6, closed: { grade: 92.4 } } }), false);
    expect(pill(fri)).toBe('📊 Quarter 1 final 92% · Quarter 2 85%');
    // Not closed yet on the server: no number is called "final".
    const unclosed = phone('2026-11-13');
    unclosed._applyGradeData(payload(), false);
    expect(pill(unclosed)).toBe('📊 Quarter 1 final · Quarter 2 85%');
    const later = phone('2026-11-20');
    later._applyGradeData(payload(), false);
    expect(pill(later)).toBe('📊 Current grade: 85% · Quarter 2');   // review D4: never "Q2"
    const old = phone('2026-11-09');
    old._applyGradeData({ lessons: [], quarters: GRADE_QUARTERS() }, false);
    expect(pill(old)).toBe('📊 Current grade: 85% · Quarter 2');
  });

  it('D1: "final" is the higher of the frozen grade and the official one; either alone; neither: no number; never another student’s', () => {
    const frozen = (grade) => payload({ Q1: { quarterGrade: 79, closed: grade == null ? null : { grade } } });
    const fri = ({ official = null, who = 'kid', owner = 'kid' } = {}) => {
      const win = phone('2026-11-13', { who });
      win._gradeOwner = owner;
      if (official != null) cacheOfficial(win, official);
      return win;
    };
    const line = (win, g) => { win._applyGradeData(g, false); return pill(win); };
    expect(line(fri({ official: 92 }), frozen(80))).toBe('📊 Quarter 1 final 92% · Quarter 2 85%');
    expect(line(fri({ official: 78 }), frozen(80))).toBe('📊 Quarter 1 final 80% · Quarter 2 85%');   // never lower
    expect(line(fri(), frozen(80))).toBe('📊 Quarter 1 final 80% · Quarter 2 85%');                    // official missing
    expect(line(fri({ official: 92 }), frozen(null))).toBe('📊 Quarter 1 final 92% · Quarter 2 85%');   // not closed yet
    expect(line(fri(), frozen(null))).toBe('📊 Quarter 1 final · Quarter 2 85%');                       // both missing
    // A shared phone: another student signed in, the grade on screen is someone else's, or signed out.
    expect(line(fri({ official: 92, who: 'other_kid', owner: 'other_kid' }), frozen(80))).toBe('📊 Quarter 1 final 80% · Quarter 2 85%');
    expect(line(fri({ official: 92, owner: 'other_kid' }), frozen(80))).toBe('📊 Quarter 1 final 80% · Quarter 2 85%');
    expect(line(fri({ official: 92, who: null }), frozen(80))).toBe('📊 Quarter 1 final 80% · Quarter 2 85%');
    // While Quarter 1 is closing the official grade leads too, as on the Desk's pill.
    const mon = phone('2026-11-09', { who: 'kid' });
    mon._gradeOwner = 'kid';
    cacheOfficial(mon, 94.4);
    expect(line(mon, payload())).toBe('📊 Quarter 1 94% · closes Thu Nov 12 · Quarter 2 85%');
  });

  it('D8: a close /grade reports is final at once, even on Thu Nov 12; unreported, the dates decide', () => {
    const thu = phone('2026-11-12');
    thu._applyGradeData(payload({ Q1: { quarterGrade: 91.6, closed: { grade: 91 } } }), false);
    expect(pill(thu)).toBe('📊 Quarter 1 final 91% · Quarter 2 85%');
    const open = phone('2026-11-12');
    open._applyGradeData(payload(), false);
    expect(pill(open)).toBe('📊 Quarter 1 92% · closes Thu Nov 12 · Quarter 2 85%');
    const after = phone('2026-11-20');
    after._applyGradeData(payload({ Q1: { quarterGrade: 91.6, closed: { grade: 91 } } }), false);
    expect(pill(after)).toBe('📊 Current grade: 85% · Quarter 2');   // the final week is over
  });

  it('D1: in the window the phone fetches the ended quarter’s official with the Bearer token, caches it owner-stamped, repaints the pill', async () => {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const win = phone('2026-11-13', { who: 'kid' });
    win._gradeOwner = 'kid';
    const calls = [];
    win.fetch = async (url, init) => {
      calls.push({ url, auth: init && init.headers ? init.headers.Authorization : null });
      return { ok: true, json: async () => ({ ok: true, official: { quarter: 'Q1', grade: 93.2 } }) };
    };
    const g = payload({ Q1: { quarterGrade: 79, closed: { grade: 80 } } });
    win._lastGradePayload = g;
    win._applyGradeData(g, false);
    expect(pill(win)).toBe('📊 Quarter 1 final 80% · Quarter 2 85%');
    win._loadEndedOfficial('https://roster.test', 'tok-kid', 'kid', g);
    await flush();
    expect(calls).toEqual([{ url: 'https://roster.test/official-grade?quarter=Q1', auth: 'Bearer tok-kid' }]);   // never in the URL
    expect(JSON.parse(win.localStorage.getItem('apstats_mobile_official_v1')))
      .toEqual({ owner: 'kid', quarter: 'Q1', official: { quarter: 'Q1', grade: 93.2 } });
    expect(pill(win)).toBe('📊 Quarter 1 final 93% · Quarter 2 85%');
    // A failed request keeps the cached entry; outside the window nothing is asked for.
    win.fetch = async () => ({ ok: false, status: 503 });
    win._loadEndedOfficial('https://roster.test', 'tok-kid', 'kid', g);
    await flush();
    expect(win._endedOfficial.official.grade).toBe(93.2);
    const later = phone('2026-11-20', { who: 'kid' });
    const none = [];
    later.fetch = async (url) => { none.push(url); return { ok: false }; };
    later._loadEndedOfficial('https://roster.test', 'tok', 'kid', payload());
    expect(none).toEqual([]);
  });
  it('the quarter dates are cached in their own key (the owner-stamped grade cache keeps its pinned shape), so the line works offline', () => {
    expect(fn('loadGrade')).toContain('JSON.stringify({ lessons: g.lessons, quarters: g.quarters, owner: owner })');
    expect(fn('loadGrade')).toContain('localStorage.setItem(GRADE_CONFIG_KEY, JSON.stringify({ quarters: g.config.quarters }))');
    expect(MOBILE).toContain("var GRADE_CONFIG_KEY = 'apstats_mobile_grade_config_v1';");
    expect(MOBILE).toContain('if (_cgp && _cgc && _cgc.quarters) _cgp.config = _cgc;');
  });
  it('D1 wiring: loadGrade fetches the official after the grade is applied (fire-and-forget); the boot reads the owner-stamped cache first', () => {
    const load = fn('loadGrade');
    expect(load.indexOf('_applyGradeData(g, true);')).toBeLessThan(load.indexOf('try { _loadEndedOfficial(base, token, owner, g); } catch (_) {}'));
    expect(MOBILE).toContain("var OFFICIAL_KEY = 'apstats_mobile_official_v1';");
    const bootAt = MOBILE.indexOf("_cgo = JSON.parse(localStorage.getItem(OFFICIAL_KEY) || 'null')");
    expect(bootAt).toBeGreaterThan(-1);
    expect(bootAt).toBeLessThan(MOBILE.indexOf('_applyGradeData(_cgp, false);'));
    expect(fn('_loadEndedOfficial')).not.toMatch(/token=/);
    expect(fn('_loadEndedOfficial')).toContain("{ headers: { Authorization: 'Bearer ' + token } }");
  });
});
