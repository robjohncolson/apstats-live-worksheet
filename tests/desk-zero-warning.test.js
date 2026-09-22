// tests/desk-zero-warning.test.js
//
// ZERO_WARNING (teacher 2026-09-18): a worksheet with no work becomes a 0 in
// the Desk grade and on Schoology after lesson.zeroDate[period] (class day +
// config.dueLagDays). The Desk must warn BEFORE that: a pulsing count on the
// My Ledger icon and a card at the top of the ledger window listing what to
// finish. Runs the real Desk helpers in a jsdom sandbox.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');

function fnSrc(name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(html);
  if (!m) throw new Error('missing ' + name);
  let depth = 0;
  for (let i = html.indexOf('{', m.index); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(m.index, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

const LESSONS = [
  { lessonKey: '1.1', zeroDate: { B: '2026-09-21', E: '2026-09-22' }, lessonGradeNoQuiz: 95, Cws: 100 },          // done
  { lessonKey: '1.2', zeroDate: { B: '2026-09-23', E: '2026-09-24' }, lessonGradeNoQuiz: null, Cws: null },        // 2 days out
  { lessonKey: '1.3', zeroDate: { B: '2026-09-24', E: '2026-09-27' }, lessonGradeNoQuiz: null, Cws: null },        // 3 days out
  { lessonKey: '1.4', zeroDate: { B: '2026-09-27', E: '2026-09-28' }, lessonGradeNoQuiz: null, Cws: null },        // 6 days out: quiet
  { lessonKey: '1.0', zeroDate: { B: '2026-09-18', E: '2026-09-19' }, lessonGradeNoQuiz: null, Cws: null },        // already a 0
  { lessonKey: '1.10', zeroDate: { B: null, E: null }, lessonGradeNoQuiz: null, Cws: null },                        // bonus: never
  { lessonKey: '9.9', lessonGradeNoQuiz: null },                                                                    // old server: no zeroDate
];

function sandbox({ lessons = LESSONS, period = 'B', today = '2026-09-21' } = {}) {
  const dom = new JSDOM(`<div class="app-icon" data-app="wallet"><div class="icon-img"></div></div><div id="wallet-content"><div class="old">receipts</div></div>`);
  const s = {
    document: dom.window.document, window: dom.window, console,
    _gradeLessonsCache: lessons, cP: period,
    tdy: () => new Date(today + 'T00:00:00'),
    cedLabel: k => ({ text: 'Topic ' + k }),
    S: [[2026, 8, 22, { t: '1.2', n: 'x' }, 'noclass']],
    opened: [], showResourcePanel(cell) { s.opened.push(cell.t); },
    decks: [], openBlooketFlashcards(btn, topic) { s.decks.push(topic); },
    getRegistryEntry: () => ({ urls: { worksheet: 'u1_lesson2_live.html' } }),
  };
  createContext(s);
  runInContext('var ZERO_WARN_DAYS = 3;\n' + ['_zeroWarnings', '_zeroTodayIso', '_zeroCurrentWarnings', '_zeroWhenText', '_zeroCountText', '_updateZeroWarningBadge', '_zeroOpenFlashcards', '_zeroOpenLesson', '_walletPrependZeroCard']
    .map(fnSrc).join('\n'), s);
  return { s, dom, close: () => dom.window.close() };
}

describe('ZERO_WARNING — pure selection', () => {
  it('warns for no-work lessons whose zero date is within 3 days or already passed, in date order', () => {
    const { s, close } = sandbox();
    try {
      const w = s._zeroWarnings(LESSONS, 'B', '2026-09-21');
      expect(w.map(x => x.lessonKey)).toEqual(['1.0', '1.2', '1.3']);
      expect(w[0]).toMatchObject({ past: true, daysLeft: -3 });
      expect(w[1]).toMatchObject({ past: false, daysLeft: 2 });
    } finally { close(); }
  });
  it('uses the OTHER period column for Period E and stays quiet when nothing is near', () => {
    const { s, close } = sandbox();
    try {
      expect(s._zeroWarnings(LESSONS, 'E', '2026-09-21').map(x => x.lessonKey)).toEqual(['1.0', '1.2']);
      expect(s._zeroWarnings(LESSONS, 'B', '2026-09-10')).toEqual([]);
      expect(s._zeroWarnings(null, 'B', '2026-09-21')).toEqual([]);
      expect(s._zeroWarnings(LESSONS, null, '2026-09-21')).toEqual([]);
    } finally { close(); }
  });
  it('a lesson with any recorded work never warns, even past its zero date', () => {
    const { s, close } = sandbox();
    try {
      const done = [{ lessonKey: '1.0', zeroDate: { B: '2026-09-01' }, lessonGradeNoQuiz: null, Cws: 12 }];
      expect(s._zeroWarnings(done, 'B', '2026-09-21')).toEqual([]);
    } finally { close(); }
  });
});

describe('ZERO_WARNING — My Ledger icon badge', () => {
  it('paints a pulsing count with an accessible label, and removes it when clear', () => {
    const { s, dom, close } = sandbox();
    try {
      s._updateZeroWarningBadge();
      const badge = dom.window.document.querySelector('.wallet-zero-badge');
      expect(badge.textContent).toBe('3');
      expect(badge.getAttribute('aria-label')).toBe('3 worksheets about to become a 0');
      expect(dom.window.document.querySelector('.app-icon').getAttribute('data-zero-warn')).toBe('3');
      expect(html).toMatch(/\.wallet-zero-badge\s*\{[^}]*animation:\s*zero-pulse/);
      expect(html).toMatch(/prefers-reduced-motion[^}]*\.wallet-zero-badge\s*\{\s*animation:\s*none/);
      s._gradeLessonsCache = [];
      s._updateZeroWarningBadge();
      expect(dom.window.document.querySelector('.wallet-zero-badge')).toBeNull();
      expect(dom.window.document.querySelector('.app-icon').hasAttribute('data-zero-warn')).toBe(false);
    } finally { close(); }
  });
  it('is refreshed by the readiness icon pass, which runs after every fresh /grade lands', () => {
    expect(fnSrc('updateWalletReadinessIcon')).toContain('_updateZeroWarningBadge()');
    const rdg = fnSrc('renderDoNowGrades');
    const cacheAt = rdg.indexOf('_gradeLessonsCache = Array.isArray(data.lessons)');
    expect(cacheAt).toBeGreaterThan(-1);
    expect(rdg.indexOf('updateWalletReadinessIcon()', cacheAt)).toBeGreaterThan(cacheAt);
  });
});

describe('ZERO_WARNING — ledger card', () => {
  it('prepends a card listing each lesson with its deadline and an Open button that opens the lesson', () => {
    const { s, dom, close } = sandbox();
    try {
      const host = dom.window.document.getElementById('wallet-content');
      s._walletPrependZeroCard(host);
      const card = host.firstChild;
      expect(card.className).toBe('wallet-zero-card');
      expect(card.querySelector('h4').textContent).toContain('About to become a 0');
      const rows = [...card.querySelectorAll('.wz-row')];
      expect(rows.map(r => r.querySelector('button').textContent)).toEqual(['Open Topic 1.0', 'Open Topic 1.2', 'Open Topic 1.3']);
      expect(rows[0].querySelector('.wz-when').textContent).toContain('already a 0');
      expect(rows[1].querySelector('.wz-when').textContent).toBe('0 after Wed 9/23 11:59 PM');
      rows[1].querySelector('button').onclick();
      expect(s.opened).toEqual(['1.2']);
      // repaint replaces, never duplicates
      s._walletPrependZeroCard(host);
      expect(host.querySelectorAll('.wallet-zero-card').length).toBe(1);
      expect(host.querySelector('.old')).not.toBeNull();
    } finally { close(); }
  });
  it('shows nothing when there is nothing to warn about, and renderWallet re-prepends after every paint', () => {
    const { s, dom, close } = sandbox({ today: '2026-09-10', lessons: LESSONS.filter(l => l.lessonKey !== '1.0') });
    try {
      const host = dom.window.document.getElementById('wallet-content');
      s._walletPrependZeroCard(host);
      expect(host.querySelector('.wallet-zero-card')).toBeNull();
      const rw = fnSrc('renderWallet');
      expect((rw.match(/_walletPrependZeroCard\(host\)/g) || []).length).toBe(3);
    } finally { close(); }
  });
  it('the "tonight" wording is used on the zero date itself', () => {
    const { s, close } = sandbox({ today: '2026-09-23' });
    try {
      const w = s._zeroWarnings(LESSONS, 'B', '2026-09-23').find(x => x.lessonKey === '1.2');
      expect(s._zeroWhenText(w)).toBe('0 after TONIGHT 11:59 PM');
    } finally { close(); }
  });
});

describe('ZERO_WARNING — unplayed Blooket decks (2026-09-22, lesson gate gone)', () => {
  const MIXED = [
    { lessonKey: '1.1', zeroDate: { B: '2026-09-21' }, lessonGradeNoQuiz: 95, hasBlooket: true, blooket: null },   // worksheet done, deck unplayed, already a 0
    { lessonKey: '1.2', zeroDate: { B: '2026-09-23' }, lessonGradeNoQuiz: null, hasBlooket: true, blooket: null }, // both missing
    { lessonKey: '1.3', zeroDate: { B: '2026-09-24' }, lessonGradeNoQuiz: null, hasBlooket: true, blooket: 80 },   // deck done
    { lessonKey: '1.4', zeroDate: { B: '2026-09-24' }, lessonGradeNoQuiz: null, hasBlooket: false, blooket: null }, // no deck exists
  ];
  it('warns per kind: an unplayed deck warns on the lesson zero date, a lesson with no deck never does', () => {
    const { s, close } = sandbox({ lessons: MIXED });
    try {
      const w = s._zeroWarnings(MIXED, 'B', '2026-09-22');
      expect(w.map(x => x.lessonKey + ':' + x.kind)).toEqual(['1.1:blooket', '1.2:worksheet', '1.2:blooket', '1.3:worksheet', '1.4:worksheet']);
      expect(w[0].past).toBe(true);
      expect(s._zeroCountText(w)).toBe('3 worksheets and 2 flashcard decks');
      expect(s._zeroCountText(w.filter(x => x.kind === 'blooket').slice(0, 1))).toBe('1 flashcard deck');
    } finally { close(); }
  });
  it('badge counts both kinds and the card opens the flashcard deck for a Blooket row', () => {
    const { s, dom, close } = sandbox({ lessons: MIXED, today: '2026-09-22' });
    try {
      s._updateZeroWarningBadge();
      const badge = dom.window.document.querySelector('.wallet-zero-badge');
      expect(badge.textContent).toBe('5');
      expect(badge.getAttribute('aria-label')).toBe('3 worksheets and 2 flashcard decks about to become a 0');
      const host = dom.window.document.getElementById('wallet-content');
      s._walletPrependZeroCard(host);
      const rows = [...host.querySelectorAll('.wz-row')];
      expect(rows[0].classList.contains('wz-blooket')).toBe(true);
      expect(rows[0].querySelector('button').textContent).toBe('Flashcards Topic 1.1');
      rows[0].querySelector('button').onclick();
      expect(s.decks).toEqual(['1.1']);
      expect(s.opened).toEqual([]);
      rows[1].querySelector('button').onclick();      // 1.2 worksheet row still opens the lesson
      expect(s.opened).toEqual(['1.2']);
    } finally { close(); }
  });
});
