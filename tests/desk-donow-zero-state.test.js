// tests/desk-donow-zero-state.test.js — LEDGER_CALM_SPEC.md §1 (teacher 2026-09-26: "the Do Now
// colour needs to reflect incoming zeroes so it's not a shock"). The Do Now card turns yellow while
// zeros are coming and red once one is counting; the grade pill says it in plain words.
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

// Today is Sat 9/26. Past = already a 0; not past = becomes a 0 on zeroDate.
const NOW_1 = { lessonKey: '1.1', kind: 'worksheet', zeroDate: '2026-09-20', daysLeft: -6, past: true };
const NOW_2 = { lessonKey: '1.2', kind: 'quiz', zeroDate: '2026-09-21', daysLeft: -5, past: true };
const SOON_1 = { lessonKey: '1.4', kind: 'worksheet', zeroDate: '2026-09-27', daysLeft: 1, past: false };
const SOON_2 = { lessonKey: '1.3', kind: 'blooket', zeroDate: '2026-09-26', daysLeft: 0, past: false };

function sandbox({ warns = [], mode = 'todo' } = {}) {
  const dom = new JSDOM(`<div id="donow-card" class="donow-${mode}"><div class="donow-body">
    <div id="donow-grades"><span class="qpill">Q1: 80</span></div></div></div>`);
  const s = {
    document: dom.window.document, window: dom.window, console,
    warns, opened: 0,
    _zeroCurrentWarnings() { return s.warns; },
    openWallet() { s.opened++; },
  };
  createContext(s);
  runInContext(['_zeroDayText', '_zeroWhenText', '_zeroLatestSoonDay', '_zeroPillText', '_zeroCountText', '_donowApplyZeroState', '_updateDoNowMissingPill']
    .map(fnSrc).join('\n'), s);
  const doc = dom.window.document;
  return { s, doc, card: () => doc.getElementById('donow-card'), pill: () => doc.querySelector('.qpill-missing'), close: () => dom.window.close() };
}
const zeroClasses = (card) => ['donow-zeros-soon', 'donow-zeros-now'].filter(c => card.classList.contains(c));

describe('Do Now card colour (§1.1)', () => {
  it('no warnings: no zero state and no pill', () => {
    const t = sandbox();
    try {
      t.s._updateDoNowMissingPill();
      expect(zeroClasses(t.card())).toEqual([]);
      expect(t.card().classList.contains('donow-todo')).toBe(true);
      expect(t.pill()).toBeNull();
    } finally { t.close(); }
  });
  it('only tentative: yellow card, "2 become a 0 by <latest day>"', () => {
    const t = sandbox({ warns: [SOON_2, SOON_1] });
    try {
      t.s._updateDoNowMissingPill();
      expect(zeroClasses(t.card())).toEqual(['donow-zeros-soon']);
      expect(t.pill().textContent).toBe('2 become a 0 by Sun 9/27');
      expect(t.pill().classList.contains('qpill-soon')).toBe(true);
      expect(t.pill().classList.contains('qpill-now')).toBe(false);
      expect(t.pill().title).toBe('Tap to see what to finish');
    } finally { t.close(); }
  });
  it('only past: red card, "1 is a 0 now" / "2 are 0s now"', () => {
    const t = sandbox({ warns: [NOW_1] });
    try {
      t.s._updateDoNowMissingPill();
      expect(zeroClasses(t.card())).toEqual(['donow-zeros-now']);
      expect(t.pill().textContent).toBe('1 is a 0 now');
      expect(t.pill().classList.contains('qpill-now')).toBe(true);
      t.s.warns = [NOW_1, NOW_2];
      t.s._updateDoNowMissingPill();
      expect(t.pill().textContent).toBe('2 are 0s now');
    } finally { t.close(); }
  });
  it('both: red card, "1 is a 0 now · 2 more by Sun 9/27"', () => {
    const t = sandbox({ warns: [NOW_1, SOON_2, SOON_1] });
    try {
      t.s._updateDoNowMissingPill();
      expect(zeroClasses(t.card())).toEqual(['donow-zeros-now']);
      expect(t.pill().textContent).toBe('1 is a 0 now · 2 more by Sun 9/27');
      expect(t.doc.querySelectorAll('.qpill-missing')).toHaveLength(1);
      expect(t.pill().previousElementSibling.textContent).toBe('Q1: 80');
    } finally { t.close(); }
  });
  it('singular tentative: "1 becomes a 0 by …"; no icon anywhere', () => {
    const t = sandbox({ warns: [SOON_1] });
    try {
      t.s._updateDoNowMissingPill();
      expect(t.pill().textContent).toBe('1 becomes a 0 by Sun 9/27');
      expect(t.pill().textContent).not.toContain('⚠');
    } finally { t.close(); }
  });
  it('clearing the warnings clears the state and the pill; the pill click still opens the ledger', () => {
    const t = sandbox({ warns: [NOW_1] });
    try {
      t.s._updateDoNowMissingPill();
      t.pill().click();
      expect(t.s.opened).toBe(1);
      t.s.warns = [];
      t.s._updateDoNowMissingPill();
      expect(zeroClasses(t.card())).toEqual([]);
      expect(t.pill()).toBeNull();
    } finally { t.close(); }
  });
  it('a mode repaint (card.className = "donow-done") followed by _donowApplyZeroState() restores the state class', () => {
    const t = sandbox({ warns: [SOON_1] });
    try {
      t.s._updateDoNowMissingPill();
      t.card().className = 'donow-done';
      expect(zeroClasses(t.card())).toEqual([]);
      t.s._donowApplyZeroState();
      expect(t.card().className).toBe('donow-done donow-zeros-soon');
    } finally { t.close(); }
  });
  it('the signed-out card never shows a zero state', () => {
    const t = sandbox({ warns: [NOW_1], mode: 'signin' });
    try {
      t.s._donowApplyZeroState();
      expect(zeroClasses(t.card())).toEqual([]);
    } finally { t.close(); }
  });
});

describe('wiring pins (§1.1)', () => {
  it('renderDoNow re-applies the zero state right after it sets the base mode class, guarded by typeof', () => {
    const src = fnSrc('renderDoNow');
    const at = src.indexOf("card.className = 'donow-' + (mode || 'signin');");
    expect(at).toBeGreaterThan(-1);
    const next = src.slice(at).split('\n')[1].trim();
    expect(next).toBe("if (typeof _donowApplyZeroState === 'function') _donowApplyZeroState();");
    expect(fnSrc('_updateDoNowMissingPill')).toContain("if (typeof _donowApplyZeroState === 'function') _donowApplyZeroState();");
  });
  it('CSS: yellow / red card tints, and the zero state wins over the green "done" tint', () => {
    expect(html).toContain('#donow-card.donow-zeros-soon{background:#fff3b0}');
    expect(html).toContain('#donow-card.donow-zeros-now{background:#f7c9c9}');
    expect(html).toContain('#donow-card.donow-done.donow-zeros-soon{background:#fff3b0}');
    expect(html).toContain('#donow-card.donow-done.donow-zeros-now{background:#f7c9c9}');
    expect(html).toMatch(/#donow-grades \.qpill-missing\.qpill-soon\{/);
    expect(html).toMatch(/#donow-grades \.qpill-missing\.qpill-now\{/);
  });
});
