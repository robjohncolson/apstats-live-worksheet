// tests/desk-past-due-work.test.js — PAST_DUE_WORK (teacher 2026-09-30).
// Schoology marks an item "missing" the day after its due date; the Desk only warned
// ZERO_WARN_DAYS before the zero date (due + 13). The My Ledger Missing-work card now also
// lists the in-between items as quiet grey rows, each tagged with its Schoology column title
// (Schoology keeps the OLD lesson key: "3.1 Follow-Along"). Nothing else reads the new list:
// the Do Now tint + pill, the badge, the coach and the calendar keep using _zeroCurrentWarnings.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'node:vm';
import { deskSource, deskHtml } from './helpers/desk-source.js';

const html = deskHtml();
const html_SRC = deskSource(); // the Desk's JS incl. js/desk-*.js modules: code pins read this
const missingWorkSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../js/desk-missing-work.js'), 'utf8');
function fnSrc(name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(html_SRC);
  if (!m) throw new Error('missing ' + name);
  let depth = 0;
  for (let i = html_SRC.indexOf('{', m.index); i < html_SRC.length; i++) {
    if (html_SRC[i] === '{') depth++;
    if (html_SRC[i] === '}' && --depth === 0) return html_SRC.slice(m.index, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

// Today is Wed 9/30, Period E.
const TODAY = '2026-09-30';
const d = (due, zero) => ({ due: { B: null, E: due }, zeroDate: { B: null, E: zero } });
const LESSONS = [
  // Past due, 0 is 8 days away → grey (worksheet + quiz + deck all missing).
  { lessonKey: '3.1', ...d('2026-09-25', '2026-10-08'), lessonGradeNoQuiz: null, Cws: null, quizTotal: 5, Q: null, hasBlooket: true, blooket: null },
  // Past due, 0 is 6 days away → grey, sorts first.
  { lessonKey: '3.0', ...d('2026-09-23', '2026-10-06'), lessonGradeNoQuiz: null, Cws: null },
  // Already a 0 → warning list only.
  { lessonKey: '3.2', ...d('2026-09-15', '2026-09-28'), lessonGradeNoQuiz: null, Cws: null },
  // 0 in 2 days → warning list only.
  { lessonKey: '3.3', ...d('2026-09-19', '2026-10-02'), lessonGradeNoQuiz: null, Cws: null },
  // 0 in exactly 3 days → warning list only (the boundary).
  { lessonKey: '3.9', ...d('2026-09-20', '2026-10-03'), lessonGradeNoQuiz: null, Cws: null },
  // Not yet due → nowhere.
  { lessonKey: '3.4', ...d('2026-10-01', '2026-10-14'), lessonGradeNoQuiz: null, Cws: null },
  // Due TODAY → not past due yet.
  { lessonKey: '3.8', ...d('2026-09-30', '2026-10-13'), lessonGradeNoQuiz: null, Cws: null },
  // Completed → nowhere.
  { lessonKey: '3.5', ...d('2026-09-24', '2026-10-07'), lessonGradeNoQuiz: 90, Cws: 100 },
  // Bonus deck unplayed, worksheet done → nowhere.
  { lessonKey: '3.6', ...d('2026-09-24', '2026-10-07'), lessonGradeNoQuiz: 80, Cws: 100, hasBlooket: true, blooketBonus: true, blooket: null },
  // quizTotal 0 with Q null, worksheet done → nowhere.
  { lessonKey: '3.7', ...d('2026-09-24', '2026-10-07'), lessonGradeNoQuiz: 80, Cws: 100, quizTotal: 0, Q: null },
  // Old server row without due → nowhere (never throws).
  { lessonKey: '9.9', zeroDate: { E: '2026-10-08' }, lessonGradeNoQuiz: null },
];
// /grade rows carry unit + worksheetKey; solo lessons here have worksheetKey = the lesson number.
for (const L of LESSONS) if (L.lessonKey.startsWith('3.')) { L.unit = 3; L.worksheetKey = L.lessonKey.slice(2); }

const CARD_FNS = ['_quarterName', '_zeroWarnings', '_zeroTodayIso', '_zeroCurrentWarnings', '_pastDueWork', '_pastDueCurrentWork',
  '_zeroSchoologyTitle', '_zeroLessonByKey', '_zeroSchoologyTag', '_pastDueWhenText', '_pastDueCardRow', '_zeroCardActionButton',
  '_zeroDayText', '_zeroWhenText', '_zeroLatestSoonDay', '_zeroStatusText', '_zeroCardStatus', '_zeroLateStatusText', '_zeroCardRow',
  '_walletPrependZeroCard', '_zeroPillText', '_donowApplyZeroState', '_updateDoNowMissingPill'];

function sandbox({ lessons = LESSONS, period = 'E', today = TODAY, grade = { pct: 81, q: 'Q1' } } = {}) {
  const dom = new JSDOM(`<div id="wallet-content"><div class="old">balance</div></div>
    <div id="donow-card" class="donow-todo"><div id="donow-grades"><span class="qpill">Q1: 81</span></div></div>`);
  const s = {
    document: dom.window.document, window: dom.window, console,
    _gradeLessonsCache: lessons, cP: period, grade, work: [],
    tdy: () => new Date(today + 'T00:00:00'),
    cedLabel: k => ({ text: 'CED ' + k }),
    _walletCurrentGrade() { return s.grade; },
    _zeroOpenLesson(k) { s.work.push(['worksheet', k]); },
    _zeroOpenQuiz(k) { s.work.push(['quiz', k]); },
    _zeroOpenFlashcards(_b, k) { s.work.push(['blooket', k]); },
    _snapOpenAssignment() {},
    _zeroCardAttachScores() {},
    openWallet() {},
  };
  createContext(s);
  runInContext(missingWorkSource, s);
  runInContext('var ZERO_WARN_DAYS = 3;\n' + CARD_FNS.map(fnSrc).join('\n'), s);
  const doc = dom.window.document;
  const host = () => doc.getElementById('wallet-content');
  const card = () => host().querySelector('.wallet-zero-card');
  return { s, doc, host, card, close: () => dom.window.close() };
}
const plain = (x) => JSON.parse(JSON.stringify(x));

describe('_pastDueWork — pure selection', () => {
  it('lists exactly the past-due items whose 0 is more than ZERO_WARN_DAYS away, by zero date then worksheet/quiz/blooket', () => {
    const t = sandbox();
    try {
      expect(plain(t.s._pastDueWork(LESSONS, 'E', TODAY))).toEqual([
        { lessonKey: '3.0', kind: 'worksheet', dueDate: '2026-09-23', zeroDate: '2026-10-06', unit: 3, worksheetKey: '0' },
        { lessonKey: '3.1', kind: 'worksheet', dueDate: '2026-09-25', zeroDate: '2026-10-08', unit: 3, worksheetKey: '1' },
        { lessonKey: '3.1', kind: 'quiz', dueDate: '2026-09-25', zeroDate: '2026-10-08', unit: 3, worksheetKey: '1' },
        { lessonKey: '3.1', kind: 'blooket', dueDate: '2026-09-25', zeroDate: '2026-10-08', unit: 3, worksheetKey: '1' },
      ]);
    } finally { t.close(); }
  });
  it('an item within 3 days (or already a 0) is in the warning list, never in the grey list', () => {
    const t = sandbox();
    try {
      const grey = t.s._pastDueWork(LESSONS, 'E', TODAY).map(w => w.lessonKey);
      const warn = t.s._zeroWarnings(LESSONS, 'E', TODAY).map(w => w.lessonKey);
      expect(warn).toEqual(['3.2', '3.3', '3.9']);
      for (const k of warn) expect(grey).not.toContain(k);
    } finally { t.close(); }
  });
  it('not-yet-due, due-today, completed, bonus-deck and quizTotal-0 items are absent', () => {
    const t = sandbox();
    try {
      const keys = t.s._pastDueWork(LESSONS, 'E', TODAY).map(w => w.lessonKey + ':' + w.kind);
      for (const k of ['3.4:worksheet', '3.8:worksheet', '3.5:worksheet', '3.6:blooket', '3.6:worksheet', '3.7:quiz', '3.7:worksheet', '9.9:worksheet']) {
        expect(keys).not.toContain(k);
      }
    } finally { t.close(); }
  });
  it('reads the period\'s own dates and never throws', () => {
    const t = sandbox();
    try {
      expect(plain(t.s._pastDueWork(LESSONS, 'B', TODAY))).toEqual([]);   // B has no dates in the fixture
      expect(plain(t.s._pastDueWork(null, 'E', TODAY))).toEqual([]);
      expect(plain(t.s._pastDueWork(LESSONS, null, TODAY))).toEqual([]);
      expect(plain(t.s._pastDueWork(LESSONS, 'E', null))).toEqual([]);
      expect(plain(t.s._pastDueWork([null, { lessonKey: 'x', due: 5, zeroDate: 7 }], 'E', TODAY))).toEqual([]);
    } finally { t.close(); }
  });
  it('uses the same missing-track rules before and inside the warning window', () => {
    const t = sandbox();
    try {
      const lessons = [
        { lessonKey: 'missing', ...d('2026-09-20', '2026-10-08'), quizTotal: 5, hasBlooket: true },
        { lessonKey: 'zero-counts', ...d('2026-09-20', '2026-10-08'), Cws: 0, quizTotal: 5, Q: 0, hasBlooket: true, blooket: 0 },
        { lessonKey: 'quiz-only', ...d('2026-09-20', '2026-10-08'), lessonGrade: 100, quizTotal: 5, Q: 100 },
        { lessonKey: 'bonus', ...d('2026-09-20', '2026-10-08'), Cws: 80, hasBlooket: true, blooketBonus: true },
      ];
      const kinds = rows => Array.from(rows, row => row.lessonKey + ':' + row.kind);
      const expected = ['missing:worksheet', 'quiz-only:worksheet', 'missing:quiz', 'missing:blooket'];
      expect(kinds(t.s._pastDueWork(lessons, 'E', '2026-09-30'))).toEqual(expected);
      expect(kinds(t.s._zeroWarnings(lessons, 'E', '2026-10-05'))).toEqual(expected);
    } finally { t.close(); }
  });
});

describe('_zeroWarnings output is unchanged', () => {
  it('fixture output, byte for byte', () => {
    const t = sandbox();
    try {
      expect(JSON.stringify(t.s._zeroWarnings(LESSONS, 'E', TODAY))).toBe(JSON.stringify([
        { lessonKey: '3.2', kind: 'worksheet', zeroDate: '2026-09-28', daysLeft: -2, past: true },
        { lessonKey: '3.3', kind: 'worksheet', zeroDate: '2026-10-02', daysLeft: 2, past: false },
        { lessonKey: '3.9', kind: 'worksheet', zeroDate: '2026-10-03', daysLeft: 3, past: false },
      ]));
    } finally { t.close(); }
  });
});

describe('Missing-work card — grey past-due rows', () => {
  it('grey rows sit below the warning rows, with dates, a Schoology tag and the same verb buttons', () => {
    const t = sandbox();
    try {
      t.s._walletPrependZeroCard(t.host());
      const card = t.card();
      expect(card.classList.contains('wz-calm')).toBe(false);   // a 0 is counting: red frame stays
      const kids = [...card.children].map(c => c.className);
      expect(kids).toEqual(['wz-status geneva', 'wz-row wz-past', 'wz-row', 'wz-row',
        'wz-later-head geneva', 'wz-row wz-later', 'wz-row wz-later', 'wz-row wz-later', 'wz-row wz-later']);
      expect(card.querySelector('.wz-later-head').textContent).toBe('Past due — not counting yet');
      const grey = [...card.querySelectorAll('.wz-later')];
      const r = grey[1];   // 3.1 worksheet
      expect(r.querySelector('button').textContent).toBe('Open');
      expect(r.querySelector('.wz-label').textContent).toBe('CED 3.1');
      expect(r.querySelector('.wz-when').textContent).toBe('due Fri 9/25 · not a 0 until after Thu 10/8');
      expect(grey.map(g => g.querySelector('.wz-sgy').textContent)).toEqual([
        'Schoology: 3.0 Follow-Along', 'Schoology: 3.1 Follow-Along', 'Schoology: 3.1 Quiz', 'Schoology: 3.1 Blooket']);
      expect(grey.map(g => g.querySelector('button').textContent)).toEqual(['Open', 'Open', 'Quiz', 'Flashcards']);
      grey.forEach(g => g.querySelector('button').onclick());
      expect(t.s.work).toEqual([['worksheet', '3.0'], ['worksheet', '3.1'], ['quiz', '3.1'], ['blooket', '3.1']]);
      expect(r.querySelector('.wz-see')).toBeNull();   // quiet: no graph link
    } finally { t.close(); }
  });
  it('the existing warning rows carry the Schoology tag too', () => {
    const t = sandbox();
    try {
      t.s._walletPrependZeroCard(t.host());
      const warnRows = [...t.card().querySelectorAll('.wz-row:not(.wz-later)')];
      expect(warnRows.map(w => w.querySelector('.wz-sgy').textContent)).toEqual([
        'Schoology: 3.2 Follow-Along', 'Schoology: 3.3 Follow-Along', 'Schoology: 3.9 Follow-Along']);
      expect([...warnRows[0].children].map(c => c.className)).toEqual(['s7btn', 'wz-label', 'wz-sgy', 'wz-when', 'wz-see']);
    } finally { t.close(); }
  });
  it('renders with ONLY grey rows: grey frame, calm status, never claims a 0 is coming', () => {
    const only = LESSONS.filter(L => L.lessonKey === '3.1');
    const t = sandbox({ lessons: only });
    try {
      t.s._walletPrependZeroCard(t.host());
      const card = t.card();
      expect(card).not.toBeNull();
      expect(t.host().firstChild).toBe(card);
      expect(card.classList.contains('wz-calm')).toBe(true);
      expect(card.classList.contains('wz-soon')).toBe(false);
      const status = card.querySelector('.wz-status').textContent;
      // Re-pinned 2026-11-08 (review D4): "Quarter 1 so far", never "Q1".
      expect(status).toBe('Quarter 1 so far: 81%. 3 items below are past due. They are not counting yet — finishing them now keeps it that way.');
      expect(status).not.toMatch(/becomes? a 0|count as 0|0s now|is a 0/);
      expect(card.querySelectorAll('.wz-row:not(.wz-later)')).toHaveLength(0);
      expect(card.querySelectorAll('.wz-later')).toHaveLength(3);
    } finally { t.close(); }
  });
  it('singular calm status, no grade clause before a grade exists', () => {
    const only = [LESSONS[1]];   // 3.0 worksheet only
    const t = sandbox({ lessons: only, grade: { pct: null, q: null } });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect(t.card().querySelector('.wz-status').textContent).toBe('1 item below is past due. It is not counting yet — finishing it now keeps it that way.');
    } finally { t.close(); }
  });
  it('nothing owed at all: no card', () => {
    const t = sandbox({ lessons: [LESSONS[7]] });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect(t.card()).toBeNull();
      expect(t.host().querySelector('.old')).not.toBeNull();
    } finally { t.close(); }
  });
  it('the repaint signature includes the grey rows: same list keeps the node, a grey change rebuilds it', () => {
    const lessons = plain(LESSONS);
    const t = sandbox({ lessons });
    try {
      t.s._walletPrependZeroCard(t.host());
      const first = t.card();
      expect(first.dataset.sig).toContain('#later:3.0:worksheet|3.1:worksheet|3.1:quiz|3.1:blooket');
      t.s._walletPrependZeroCard(t.host());
      expect(t.card()).toBe(first);
      lessons[0].Q = 70;   // 3.1 quiz taken: only a grey row changes
      t.s._walletPrependZeroCard(t.host());
      expect(t.card()).not.toBe(first);
      expect(t.card().dataset.sig).not.toContain('3.1:quiz');
      expect(t.host().querySelectorAll('.wallet-zero-card')).toHaveLength(1);
    } finally { t.close(); }
  });
  it('warn-only signature is exactly the old format (no grey suffix)', () => {
    const t = sandbox({ lessons: [LESSONS[2]] });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect(t.card().dataset.sig).toBe('3.2:worksheet:1');
    } finally { t.close(); }
  });
  it('a grey-only card refreshes its calm status on a same-signature repaint', () => {
    const t = sandbox({ lessons: [LESSONS[1]] });
    try {
      t.s._walletPrependZeroCard(t.host());
      t.s.grade = { pct: 85, q: 'Q1' };
      t.s._walletPrependZeroCard(t.host());
      expect(t.card().querySelector('.wz-status').textContent).toMatch(/^Quarter 1 so far: 85%\. 1 item below is past due\./);
    } finally { t.close(); }
  });
});

describe('Other surfaces ignore grey-only items', () => {
  it('Do Now: no tint and no missing pill when everything owed is only past due', () => {
    const t = sandbox({ lessons: LESSONS.filter(L => L.lessonKey === '3.1' || L.lessonKey === '3.0') });
    try {
      t.s._updateDoNowMissingPill();
      const card = t.doc.getElementById('donow-card');
      expect(card.classList.contains('donow-zeros-soon')).toBe(false);
      expect(card.classList.contains('donow-zeros-now')).toBe(false);
      expect(t.doc.querySelector('.qpill-missing')).toBeNull();
    } finally { t.close(); }
  });
  it('only the Missing-work card reads the past-due list', () => {
    const readers = html.split('\n').filter(line => /_pastDueCurrentWork\(\)|_pastDueWork\(/.test(line) && !/^\s*function /.test(line));
    expect(readers.length).toBe(2);
    expect(fnSrc('_walletPrependZeroCard')).toContain('_pastDueCurrentWork()');
    expect(fnSrc('_pastDueCurrentWork')).toContain('_pastDueWork(');
    for (const fn of ['_updateDoNowMissingPill', '_donowApplyZeroState', '_updateZeroWarningBadge', '_zeroStatusText', '_walletGradeDropText']) {
      expect(fnSrc(fn)).not.toMatch(/_pastDue/);
    }
  });
  it('CSS: grey rows override the yellow "soon" row colour', () => {
    expect(html).toMatch(/\.wallet-zero-card \.wz-row\.wz-later \{ border-left: 3px solid #aaa; background: #eee; color: #555; \}/);
    expect(html.indexOf('.wallet-zero-card .wz-row.wz-later {')).toBeGreaterThan(html.indexOf('.wallet-zero-card .wz-row:not(.wz-past) {'));
  });
});

describe('Schoology tag = the Schoology column title (Codex review 2026-09-30)', () => {
  // 3.6 + 3.7 share one worksheet GROUP ("6-7"): Schoology names its Follow-Along and Blooket
  // columns "3.6-7 …" (tools/schoology_components.py group_label); quizzes stay per topic.
  const missingAll = { lessonGradeNoQuiz: null, Cws: null, quizTotal: 4, Q: null, hasBlooket: true, blooket: null };
  const MERGED_WARN = { lessonKey: '3.6', unit: 3, worksheetKey: '6-7', ...d('2026-09-18', '2026-10-01'), ...missingAll };   // 0 in 1 day
  const MERGED_GREY = { lessonKey: '3.7', unit: 3, worksheetKey: '6-7', ...d('2026-09-24', '2026-10-07'), ...missingAll };   // 0 in 7 days
  const tags = (rows) => rows.map(r => { const t = r.querySelector('.wz-sgy'); return t ? t.textContent : null; });

  it('merged group: warning rows and grey rows use "3.6-7 Follow-Along/Blooket", the quiz keeps its topic key', () => {
    const t = sandbox({ lessons: [MERGED_WARN, MERGED_GREY] });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect(tags([...t.card().querySelectorAll('.wz-row:not(.wz-later)')])).toEqual([
        'Schoology: 3.6-7 Follow-Along', 'Schoology: 3.6 Quiz', 'Schoology: 3.6-7 Blooket']);
      expect(tags([...t.card().querySelectorAll('.wz-later')])).toEqual([
        'Schoology: 3.6-7 Follow-Along', 'Schoology: 3.7 Quiz', 'Schoology: 3.6-7 Blooket']);
    } finally { t.close(); }
  });
  it('missing unit / worksheetKey: no Follow-Along or Blooket tag (never guessed); the quiz tag still shows', () => {
    const bare = (L) => { const c = { ...L }; delete c.unit; delete c.worksheetKey; return c; };
    const t = sandbox({ lessons: [bare(MERGED_WARN), bare(MERGED_GREY)] });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect(tags([...t.card().querySelectorAll('.wz-row:not(.wz-later)')])).toEqual([null, 'Schoology: 3.6 Quiz', null]);
      expect(tags([...t.card().querySelectorAll('.wz-later')])).toEqual([null, 'Schoology: 3.7 Quiz', null]);
      // the row is otherwise intact
      expect([...t.card().querySelector('.wz-later').children].map(c => c.className)).toEqual(['s7btn', 'wz-label', 'wz-when']);
    } finally { t.close(); }
  });
  it('_zeroSchoologyTitle: row fields win, else the /grade lesson, else null', () => {
    const t = sandbox({ lessons: [MERGED_WARN] });
    try {
      expect(t.s._zeroSchoologyTitle({ lessonKey: '3.6', kind: 'worksheet' })).toBe('3.6-7 Follow-Along');
      expect(t.s._zeroSchoologyTitle({ lessonKey: '3.6', kind: 'blooket', unit: 5, worksheetKey: '1-2' })).toBe('5.1-2 Blooket');
      expect(t.s._zeroSchoologyTitle({ lessonKey: '3.6', kind: 'quiz' })).toBe('3.6 Quiz');
      expect(t.s._zeroSchoologyTitle({ lessonKey: '8.8', kind: 'worksheet' })).toBeNull();
      t.s._gradeLessonsCache = null;
      expect(t.s._zeroSchoologyTitle({ lessonKey: '3.6', kind: 'worksheet' })).toBeNull();
    } finally { t.close(); }
  });
});

describe('never-zero lessons (QUARTER_ZERO_FREEZE_SPEC, teacher 2026-11-06)', () => {
  // The lesson's quarter closed before its zero date: /grade sends zeroDate null + neverZero true.
  const LATE_TEXT = 'late · no 0 · counts when you finish it';
  const nz = (due) => ({ due: { B: null, E: due }, zeroDate: { B: null, E: null }, neverZero: { B: false, E: true } });
  const LATE = [
    // Everything missing, due 9/22 → three late rows.
    { lessonKey: '4.5', unit: 4, worksheetKey: '5', ...nz('2026-09-22'), lessonGradeNoQuiz: null, Cws: null, quizTotal: 3, Q: null, hasBlooket: true, blooket: null },
    // Worksheet done, quiz missing, due 9/18 → one late row, listed first (older).
    { lessonKey: '4.2', unit: 4, worksheetKey: '2', ...nz('2026-09-18'), lessonGradeNoQuiz: 90, Cws: 100, quizTotal: 3, Q: null },
    // Due TODAY → not late yet.
    { lessonKey: '4.6', unit: 4, worksheetKey: '6', ...nz('2026-09-30'), lessonGradeNoQuiz: null, Cws: null },
    // All done (a bonus deck never counts) → nowhere.
    { lessonKey: '4.7', unit: 4, worksheetKey: '7', ...nz('2026-09-25'), lessonGradeNoQuiz: 80, Cws: 90, hasBlooket: true, blooketBonus: true, blooket: null },
  ];
  const lateRow = (lessonKey, kind, dueDate) => ({ lessonKey, kind, dueDate, zeroDate: null, unit: 4, worksheetKey: lessonKey.slice(2), late: true });

  it('never warns: no 0 is coming', () => {
    const t = sandbox({ lessons: LATE });
    try {
      expect(plain(t.s._zeroWarnings(LATE, 'E', TODAY))).toEqual([]);
      expect(plain(t.s._zeroWarnings(LESSONS.concat(LATE), 'E', TODAY))).toEqual(plain(t.s._zeroWarnings(LESSONS, 'E', TODAY)));
    } finally { t.close(); }
  });

  it('lists past-due never-zero work as late rows after the dated rows, oldest due first, same three rules', () => {
    const t = sandbox({ lessons: LATE });
    try {
      const ordinary = plain(t.s._pastDueWork(LESSONS, 'E', TODAY));
      const rows = plain(t.s._pastDueWork(LESSONS.concat(LATE), 'E', TODAY));
      expect(rows.slice(0, ordinary.length)).toEqual(ordinary);   // dated rows unchanged, and first
      for (const row of ordinary) expect('late' in row).toBe(false);
      expect(rows.slice(ordinary.length)).toEqual([
        lateRow('4.2', 'quiz', '2026-09-18'),
        lateRow('4.5', 'worksheet', '2026-09-22'),
        lateRow('4.5', 'quiz', '2026-09-22'),
        lateRow('4.5', 'blooket', '2026-09-22'),
      ]);
    } finally { t.close(); }
  });

  it('reads only its own period: never-zero for E, an ordinary dated row for B', () => {
    const mixed = [{ lessonKey: '4.3', unit: 4, worksheetKey: '3', due: { B: '2026-09-21', E: '2026-09-23' },
      zeroDate: { B: '2026-10-04', E: null }, neverZero: { B: false, E: true }, lessonGradeNoQuiz: null, Cws: null }];
    const t = sandbox({ lessons: mixed });
    try {
      expect(plain(t.s._pastDueWork(mixed, 'B', TODAY))).toEqual([
        { lessonKey: '4.3', kind: 'worksheet', dueDate: '2026-09-21', zeroDate: '2026-10-04', unit: 4, worksheetKey: '3' },
      ]);
      expect(plain(t.s._pastDueWork(mixed, 'E', TODAY))).toEqual([lateRow('4.3', 'worksheet', '2026-09-23')]);
    } finally { t.close(); }
  });

  it('the late rows read "late · no 0 · counts when you finish it"; the card stays calm', () => {
    const t = sandbox({ lessons: [LATE[0]] });
    try {
      t.s._walletPrependZeroCard(t.host());
      const card = t.card();
      expect(card.classList.contains('wz-calm')).toBe(true);
      const grey = [...card.querySelectorAll('.wz-later')];
      expect(grey.map(g => g.querySelector('.wz-when').textContent)).toEqual([LATE_TEXT, LATE_TEXT, LATE_TEXT]);
      expect(grey.map(g => g.querySelector('button').textContent)).toEqual(['Open', 'Quiz', 'Flashcards']);
      expect(grey.map(g => g.querySelector('.wz-sgy').textContent)).toEqual([
        'Schoology: 4.5 Follow-Along', 'Schoology: 4.5 Quiz', 'Schoology: 4.5 Blooket']);
      expect(card.querySelector('.wz-status').textContent).not.toMatch(/becomes? a 0|count as 0|0s now|is a 0/);
      expect(card.textContent).not.toMatch(/NaN|undefined/);
    } finally { t.close(); }
  });

  it('a late row next to a real warning: the warning keeps the red/yellow frame, the late row stays grey', () => {
    const t = sandbox({ lessons: [LESSONS[2], LATE[1]] });   // 3.2 is a 0 now; 4.2 quiz is late
    try {
      t.s._walletPrependZeroCard(t.host());
      const kids = [...t.card().children].map(c => c.className);
      expect(kids).toEqual(['wz-status geneva', 'wz-row wz-past', 'wz-later-head wz-late-head geneva', 'wz-row wz-later']);
      expect(t.card().querySelector('.wz-late-head').textContent).toBe('Late — never a 0');
      expect(t.card().querySelector('.wz-later .wz-when').textContent).toBe(LATE_TEXT);
    } finally { t.close(); }
  });

  it('a late-only card: its own heading, and a status that never says a 0 is coming', () => {
    const t = sandbox({ lessons: [LATE[0]] });
    try {
      t.s._walletPrependZeroCard(t.host());
      const card = t.card();
      expect([...card.querySelectorAll('.wz-later-head')].map(h => h.textContent)).toEqual(['Late — never a 0']);
      expect(card.querySelector('.wz-status').textContent).toBe('Quarter 1 so far: 81%. 3 items below are late: never a 0, and finishing them still counts.');
    } finally { t.close(); }
    const one = sandbox({ lessons: [LATE[1]] });
    try {
      one.s._walletPrependZeroCard(one.host());
      expect(one.card().querySelector('.wz-status').textContent).toBe('Quarter 1 so far: 81%. 1 item below is late: never a 0, and finishing it still counts.');
    } finally { one.close(); }
  });

  it('past-due rows and late rows together: two headings, and the status names each kind', () => {
    const t = sandbox({ lessons: [LESSONS[1], LATE[0]] });   // 3.0: a 0 after 10/6; 4.5: late
    try {
      t.s._walletPrependZeroCard(t.host());
      const card = t.card();
      expect([...card.children].map(c => c.className)).toEqual(['wz-status geneva',
        'wz-later-head geneva', 'wz-row wz-later',
        'wz-later-head wz-late-head geneva', 'wz-row wz-later', 'wz-row wz-later', 'wz-row wz-later']);
      expect([...card.querySelectorAll('.wz-later-head')].map(h => h.textContent)).toEqual(['Past due — not counting yet', 'Late — never a 0']);
      expect([...card.querySelectorAll('.wz-later .wz-when')].map(w => w.textContent)).toEqual([
        'due Wed 9/23 · not a 0 until after Tue 10/6', LATE_TEXT, LATE_TEXT, LATE_TEXT]);
      expect(card.querySelector('.wz-status').textContent).toBe('Quarter 1 so far: 81%. 1 item below is past due. It is not counting yet — finishing it now keeps it that way. 3 more are late: never a 0, and finishing them still counts.');
    } finally { t.close(); }
  });

  it('only past-due rows: the status is unchanged (no late sentence)', () => {
    const t = sandbox({ lessons: [LESSONS[1]] });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect(t.card().querySelector('.wz-status').textContent).toBe('Quarter 1 so far: 81%. 1 item below is past due. It is not counting yet — finishing it now keeps it that way.');
      expect(t.card().querySelector('.wz-late-head')).toBeNull();
    } finally { t.close(); }
  });

  it('a row that turns late with the same keys rebuilds the card (the signature carries the late flag)', () => {
    // An older /grade (no neverZero) and then the freeze: same lesson, kind and order.
    const dated = { lessonKey: '4.4', unit: 4, worksheetKey: '4', due: { B: null, E: '2026-09-22' }, zeroDate: { B: null, E: '2026-10-05' },
      lessonGradeNoQuiz: null, Cws: null };
    const t = sandbox({ lessons: [dated] });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect(t.card().querySelector('.wz-later .wz-when').textContent).toBe('due Tue 9/22 · not a 0 until after Mon 10/5');
      t.s._gradeLessonsCache = [{ ...dated, zeroDate: { B: null, E: null }, neverZero: { B: false, E: true } }];
      t.s._walletPrependZeroCard(t.host());
      expect(t.host().querySelectorAll('.wallet-zero-card')).toHaveLength(1);
      expect(t.card().querySelector('.wz-later .wz-when').textContent).toBe(LATE_TEXT);
      expect(t.card().querySelector('.wz-late-head').textContent).toBe('Late — never a 0');
    } finally { t.close(); }
  });

  it('Do Now ignores late rows: no tint and no missing pill', () => {
    const t = sandbox({ lessons: LATE });
    try {
      t.s._updateDoNowMissingPill();
      const card = t.doc.getElementById('donow-card');
      expect(card.classList.contains('donow-zeros-soon')).toBe(false);
      expect(card.classList.contains('donow-zeros-now')).toBe(false);
      expect(t.doc.querySelector('.qpill-missing')).toBeNull();
    } finally { t.close(); }
  });

  it('both date-cell helpers give a late row the late words, never a "0 after" date', () => {
    const t = sandbox();
    try {
      expect(t.s._pastDueWhenText({ late: true, dueDate: '2026-09-22', zeroDate: null })).toBe(LATE_TEXT);
      expect(t.s._zeroWhenText({ late: true, zeroDate: null })).toBe(LATE_TEXT);
      expect(t.s._zeroWhenText({ past: false, zeroDate: '2026-10-08' })).toBe('0 after Thu 10/8');
    } finally { t.close(); }
  });
});
