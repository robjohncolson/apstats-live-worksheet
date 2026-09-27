// tests/desk-ledger-grade-agreement.test.js — LEDGER_GRADE_AGREEMENT_SPEC.md (teacher 2026-09-27:
// "the Do Now is yellow but the ledger shows the grade in a green box — which is it?").
// The My Ledger balance card carries the same zero state as the Do Now card, and one sentence
// under the big grade says the number will drop.
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
// ZERO_TINT is a top-level `var`, not a function: extract the one statement.
function zeroTintSrc() {
  const m = /var ZERO_TINT = \{[^;]*\};/.exec(html);
  if (!m) throw new Error('missing ZERO_TINT');
  return m[0];
}

// Today is Sat 9/26 (fixtures shared with tests/desk-ledger-calm.test.js).
const PAST_WS = { lessonKey: '1.1', kind: 'worksheet', zeroDate: '2026-09-20', daysLeft: -6, past: true };
const PAST_QZ = { lessonKey: '1.2', kind: 'quiz', zeroDate: '2026-09-21', daysLeft: -5, past: true };
const SOON_BL = { lessonKey: '1.3', kind: 'blooket', zeroDate: '2026-09-26', daysLeft: 0, past: false };
const SOON_WS = { lessonKey: '1.4', kind: 'worksheet', zeroDate: '2026-09-27', daysLeft: 1, past: false };
const SOON_LATE = { lessonKey: '1.5', kind: 'worksheet', zeroDate: '2026-09-29', daysLeft: 3, past: false };

const HELPERS = ['_zeroDayText', '_zeroEarliestSoonDay', '_zeroAnyPast', '_walletGradeDropText', '_walletApplyZeroTint', '_walletApplyWindowReadiness'];

function sandbox({ warns = [], readiness = { state: 'eligible', hue: 110 }, withWarnFn = true } = {}) {
  const dom = new JSDOM('<div class="app-window"><div id="wallet-content"></div></div>');
  const s = {
    document: dom.window.document, window: dom.window, console,
    warns, readiness,
    _walletCurrentGrade() { return { pct: 94, q: 'Q1' }; },
    _walletDisplayReadiness() { return s.readiness; },
    _walletComputePoints() { return { total: 0, today: 0 }; },
    _walletSeeClassButton() { return null; },
    _walletEsc(x) { return String(x); },
    _walletEffortBlock() { return null; },
    _walletCountingNote() { return dom.window.document.createElement('div'); },
    _phase2InputsKey() { return null; },
    _phase2VerifySummary: null,
    _walletBonusBlock() { return null; },
    _gradeGradebookCache: null,
    _walletRenderGroupedReceipts() {},
  };
  if (withWarnFn) s._zeroCurrentWarnings = function () { return s.warns; };
  createContext(s);
  runInContext(zeroTintSrc() + '\n' + HELPERS.concat(['_walletPaint']).map(fnSrc).join('\n'), s);
  const doc = dom.window.document;
  const host = () => doc.getElementById('wallet-content');
  const paint = () => { s._walletPaint(host(), [], false); return host().firstChild; };
  const win = () => doc.querySelector('.app-window');
  return { s, doc, host, paint, win, close: () => dom.window.close() };
}
const zeroClasses = (el) => ['wallet-zeros-soon', 'wallet-zeros-now'].filter(c => el.classList.contains(c));
// Balance card children: [who, gradeRow, ...]; gradeRow = [gradeBig, gradeLbl].
const gradeBig = (card) => card.children[1].children[0];
const gradeLabel = (card) => card.children[1].children[1];
// jsdom normalises colours; compare hsl() values through a probe element.
const norm = (doc, css) => { const p = doc.createElement('div'); p.style.backgroundColor = css; return p.style.backgroundColor; };

describe('_zeroEarliestSoonDay (§1)', () => {
  it('the smallest zeroDate among the not-yet-counting warnings; all past gives empty', () => {
    const t = sandbox();
    try {
      expect(t.s._zeroEarliestSoonDay([SOON_LATE, SOON_WS, PAST_WS])).toBe('Sun 9/27');
      expect(t.s._zeroEarliestSoonDay([PAST_WS, PAST_QZ])).toBe('');
    } finally { t.close(); }
  });
});

describe('_walletGradeDropText (§3 table)', () => {
  const TAIL = ' Finished work counts the same day.';
  it('soon only, 1 item', () => {
    const t = sandbox();
    try {
      expect(t.s._walletGradeDropText([SOON_LATE])).toBe('This number drops on Tue 9/29 unless the 1 item above is finished.' + TAIL);
    } finally { t.close(); }
  });
  it('soon only, N items: the EARLIEST day', () => {
    const t = sandbox();
    try {
      expect(t.s._walletGradeDropText([SOON_LATE, SOON_WS, SOON_BL])).toBe('This number starts dropping on Sat 9/26 unless the 3 items above are finished.' + TAIL);
    } finally { t.close(); }
  });
  it('now only: N zeros and 1 zero', () => {
    const t = sandbox();
    try {
      expect(t.s._walletGradeDropText([PAST_WS, PAST_QZ])).toBe('This number already includes 2 zeros. Finish the 2 items above and it goes back up the same day.');
      expect(t.s._walletGradeDropText([PAST_WS])).toBe('This number already includes 1 zero. Finish the 1 item above and it goes back up the same day.');
    } finally { t.close(); }
  });
  it('mixed: "starts dropping again" for N soon, "drops again" for 1 soon', () => {
    const t = sandbox();
    try {
      expect(t.s._walletGradeDropText([PAST_WS, SOON_LATE, SOON_WS])).toBe('This number already includes 1 zero and starts dropping again on Sun 9/27 unless the 2 more items above are finished.' + TAIL);
      expect(t.s._walletGradeDropText([PAST_WS, PAST_QZ, SOON_LATE])).toBe('This number already includes 2 zeros and drops again on Tue 9/29 unless the 1 more item above is finished.' + TAIL);
    } finally { t.close(); }
  });
});

describe('_walletPaint balance card follows the zero state (§2, §3)', () => {
  it('soon: yellow card, "Grade today", the drop sentence with the earliest day, dark-yellow grade', () => {
    const t = sandbox({ warns: [SOON_WS, SOON_LATE] });
    try {
      const card = t.paint();
      expect(zeroClasses(card)).toEqual(['wallet-zeros-soon']);
      expect(card.style.backgroundColor).toBe('rgb(255, 243, 176)');
      expect(card.style.borderColor).toBe('rgb(217, 180, 0)');
      expect(gradeLabel(card).textContent).toBe('Grade today');
      expect(gradeBig(card).style.color).toBe('rgb(122, 92, 0)');
      const drop = card.querySelector('.wallet-grade-drop');
      expect(drop.className).toBe('wallet-grade-drop geneva');
      expect(drop.style.fontWeight).toBe('bold');
      expect(drop.textContent).toBe('This number starts dropping on Sun 9/27 unless the 2 items above are finished. Finished work counts the same day.');
      expect(drop.previousSibling).toBe(card.children[1]);   // directly after the grade row
    } finally { t.close(); }
  });
  it('now: red card, red grade, the 1-zero sentence', () => {
    const t = sandbox({ warns: [PAST_WS] });
    try {
      const card = t.paint();
      expect(zeroClasses(card)).toEqual(['wallet-zeros-now']);
      expect(card.style.backgroundColor).toBe('rgb(247, 201, 201)');
      expect(card.style.borderColor).toBe('rgb(204, 0, 0)');
      expect(gradeLabel(card).textContent).toBe('Grade today');
      expect(gradeBig(card).style.color).toBe('rgb(163, 0, 0)');
      expect(card.querySelector('.wallet-grade-drop').textContent).toBe('This number already includes 1 zero. Finish the 1 item above and it goes back up the same day.');
    } finally { t.close(); }
  });
  it('nothing owed: the green readiness path is untouched', () => {
    const t = sandbox({ warns: [] });
    try {
      const card = t.paint();
      expect(zeroClasses(card)).toEqual([]);
      expect(gradeLabel(card).textContent).toBe('Grade');
      expect(card.querySelector('.wallet-grade-drop')).toBeNull();
      expect(card.style.backgroundColor).toBe(norm(t.doc, 'hsl(110, 60%, 88%)'));
    } finally { t.close(); }
  });
  it('no _zeroCurrentWarnings in scope: the typeof guard makes it a no-op', () => {
    const t = sandbox({ withWarnFn: false });
    try {
      const card = t.paint();
      expect(zeroClasses(card)).toEqual([]);
      expect(gradeLabel(card).textContent).toBe('Grade');
      expect(card.querySelector('.wallet-grade-drop')).toBeNull();
    } finally { t.close(); }
  });
  it('a non-array from _zeroCurrentWarnings (null, undefined, a string) is treated as nothing owed (Codex review)', () => {
    for (const bad of [null, undefined, 'oops']) {
      const t = sandbox({ warns: bad });
      try {
        const card = t.paint();
        expect(zeroClasses(card)).toEqual([]);
        expect(gradeLabel(card).textContent).toBe('Grade');
        expect(card.querySelector('.wallet-grade-drop')).toBeNull();
        expect(card.style.backgroundColor).toBe(norm(t.doc, 'hsl(110, 60%, 88%)'));
        t.s._walletApplyWindowReadiness({ state: 'eligible', hue: 110 });
        expect(t.win().style.backgroundColor).toBe(norm(t.doc, 'hsl(110, 55%, 92%)'));
      } finally { t.close(); }
    }
  });
  it('_walletApplyZeroTint clears stale classes when the list empties, and never throws on a missing card', () => {
    const t = sandbox({ warns: [PAST_WS] });
    try {
      const card = t.paint();
      t.s._walletApplyZeroTint(card, []);
      expect(zeroClasses(card)).toEqual([]);
      expect(() => t.s._walletApplyZeroTint(null, [PAST_WS])).not.toThrow();
    } finally { t.close(); }
  });
});

describe('colour parity with the Do Now CSS (§5 item 6)', () => {
  it('ZERO_TINT equals #donow-card.donow-zeros-soon / .donow-zeros-now', () => {
    const soon = /#donow-card\.donow-zeros-soon\{background:([^ ;]+) !important;border-color:([^ ;]+) !important\}/.exec(html);
    const now = /#donow-card\.donow-zeros-now\{background:([^ ;]+) !important;border-color:([^ ;]+) !important\}/.exec(html);
    expect(soon).not.toBeNull();
    expect(now).not.toBeNull();
    const ctx = {};
    createContext(ctx);
    runInContext(zeroTintSrc(), ctx);
    expect(ctx.ZERO_TINT.soon.bg).toBe(soon[1]);
    expect(ctx.ZERO_TINT.soon.border).toBe(soon[2]);
    expect(ctx.ZERO_TINT.now.bg).toBe(now[1]);
    expect(ctx.ZERO_TINT.now.border).toBe(now[2]);
  });
});

describe('_walletApplyWindowReadiness (§2)', () => {
  it('soon: light yellow window; any past: light red; none: the hue as today', () => {
    const soon = sandbox({ warns: [SOON_WS] });
    try {
      soon.s._walletApplyWindowReadiness({ state: 'eligible', hue: 110 });
      expect(soon.win().style.backgroundColor).toBe('rgb(255, 249, 219)');
    } finally { soon.close(); }
    const now = sandbox({ warns: [SOON_WS, PAST_QZ] });
    try {
      now.s._walletApplyWindowReadiness({ state: 'eligible', hue: 110 });
      expect(now.win().style.backgroundColor).toBe('rgb(255, 243, 243)');
    } finally { now.close(); }
    const none = sandbox({ warns: [] });
    try {
      none.s._walletApplyWindowReadiness({ state: 'eligible', hue: 110 });
      expect(none.win().style.backgroundColor).toBe(norm(none.doc, 'hsl(110, 55%, 92%)'));
      none.s._walletApplyWindowReadiness({ state: 'nodue' });
      expect(none.win().style.backgroundColor).toBe('');
    } finally { none.close(); }
  });
});
