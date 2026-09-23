// tests/desk-flashcard-outcome.test.js
//
// Teacher 2026-09-23: after finishing a timed deck the last screen showed only
// "Cancel" (→ "did I lose my work?"), and the My Ledger "about to become a 0"
// card kept listing the deck until the next /grade poll (→ re-opening the deck
// from the card). The finish screen must now SAY what happened to the grade
// and offer "Done"; the commit must patch the grade cache and repaint the
// ledger card + badge at once; every fresh /grade must repaint an open ledger.
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

function sandbox({ walletOpen = true } = {}) {
  const dom = new JSDOM(`
    <div class="app-icon" data-app="wallet"><div class="icon-img"></div></div>
    <div id="app-wallet-overlay" style="display:${walletOpen ? 'block' : 'none'}"><div id="wallet-content"><div class="old">receipts</div></div></div>
    <div id="bf-result" style="display:none"></div>
    <div id="bf-actions"><button id="bf-next">Next</button><button>Cancel</button></div>`);
  const s = {
    document: dom.window.document, window: dom.window, console,
    cP: 'B',
    tdy: () => new Date('2026-09-22T00:00:00'),
    cedLabel: k => ({ text: 'Topic ' + k }),
    closed: 0, closeBlooketFlashcards() { s.closed++; },
    S: [], showResourcePanel() {}, getRegistryEntry: () => ({ urls: {} }),
    _gradeLessonsCache: [
      { lessonKey: '1.1', zeroDate: { B: '2026-09-21' }, lessonGradeNoQuiz: 95, hasBlooket: true, blooket: null },
      { lessonKey: '1.2', zeroDate: { B: '2026-09-23' }, lessonGradeNoQuiz: null, hasBlooket: true, blooket: null },
    ],
  };
  createContext(s);
  runInContext('var ZERO_WARN_DAYS = 3;\n' + ['_zeroWarnings', '_zeroTodayIso', '_zeroCurrentWarnings', '_zeroWhenText', '_zeroCountText',
    '_updateZeroWarningBadge', '_zeroOpenFlashcards', '_zeroOpenLesson', '_walletPrependZeroCard',
    '_ftRenderOutcome', '_blooketPatchGradeCache', '_walletRefreshZeroCard'].map(fnSrc).join('\n'), s);
  return { s, dom, close: () => dom.window.close() };
}

describe('finish screen outcome', () => {
  it('says the run was saved and replaces the buttons with a single Done that closes the deck', () => {
    const { s, dom, close } = sandbox();
    try {
      s._ftRenderOutcome('1.1', 92.3, { saved: true, best: 92.3 });
      const doc = dom.window.document;
      const line = doc.querySelector('#bf-result .bf-outcome');
      expect(line.textContent).toContain('Saved to your grade');
      expect(line.textContent).toContain('Topic 1.1 flashcards: 92.3%');
      expect(doc.getElementById('bf-result').style.display).toBe('block');
      const buttons = [...doc.querySelectorAll('#bf-actions button')];
      expect(buttons.map(b => b.textContent)).toEqual(['Done']);
      buttons[0].onclick();
      expect(s.closed).toBe(1);
    } finally { close(); }
  });

  it('explains best-wins when the run did not beat the recorded score, and read-only when nothing is recorded', () => {
    const { s, dom, close } = sandbox();
    try {
      s._ftRenderOutcome('1.1', 70, { saved: false, best: 88 });
      expect(dom.window.document.querySelector('.bf-outcome').textContent).toBe('Recorded. Your best for Topic 1.1 stays at 88.0% (this run: 70.0%).');
      s._ftRenderOutcome('1.1', 70, null);
      const lines = dom.window.document.querySelectorAll('.bf-outcome');
      expect(lines.length).toBe(1);                       // re-render replaces, never stacks
      expect(lines[0].textContent).toContain('Not recorded');
      s._ftRenderOutcome('1.1', 70, { saved: false, error: true });
      expect(dom.window.document.querySelector('.bf-outcome').textContent).toContain('Could not save');
      expect(dom.window.document.querySelectorAll('#bf-actions button').length).toBe(1);
    } finally { close(); }
  });

  it('_ftFinish renders the outcome after the commit, and _blooketCommit reports it', () => {
    const finish = fnSrc('_ftFinish');
    const commitAt = finish.indexOf('_blooketCommit(');
    expect(commitAt).toBeGreaterThan(-1);
    expect(finish.indexOf('_ftRenderOutcome(topic, score, outcome)')).toBeGreaterThan(commitAt);
    expect(finish).toMatch(/!_mayScore\(\)\) \{ _ftRenderOutcome\(topic, score, null\); return; \}/);
    const commit = fnSrc('_blooketCommit');
    expect(commit).toMatch(/return \{ saved: saved, best: saved \? score : floor \};/);
    expect(commit.indexOf('_blooketPatchGradeCache(')).toBeGreaterThan(commit.indexOf('_studentMarkSave('));
    expect(commit.indexOf('_walletRefreshZeroCard()')).toBeGreaterThan(commit.indexOf('_blooketPatchGradeCache('));
  });
});

describe('ledger follows the deck at once', () => {
  it('patching the grade cache drops the deck from the warning card and badge while the window is open', () => {
    const { s, dom, close } = sandbox();
    try {
      const doc = dom.window.document;
      s._updateZeroWarningBadge();
      s._walletPrependZeroCard(doc.getElementById('wallet-content'));
      expect(doc.querySelector('.wallet-zero-badge').textContent).toBe('3');
      expect([...doc.querySelectorAll('.wz-row button')].map(b => b.textContent)).toEqual(['Flashcards Topic 1.1', 'Open Topic 1.2', 'Flashcards Topic 1.2']);

      s._blooketPatchGradeCache('1.1', 92.3);
      expect(s._gradeLessonsCache[0].blooket).toBe(92.3);
      s._walletRefreshZeroCard();
      expect(doc.querySelector('.wallet-zero-badge').textContent).toBe('2');
      expect([...doc.querySelectorAll('.wz-row button')].map(b => b.textContent)).toEqual(['Open Topic 1.2', 'Flashcards Topic 1.2']);
      expect(doc.querySelectorAll('.wallet-zero-card').length).toBe(1);
      expect(doc.querySelector('.old')).not.toBeNull();

      s._blooketPatchGradeCache('1.1', 50);               // never lowers what is cached
      expect(s._gradeLessonsCache[0].blooket).toBe(92.3);
    } finally { close(); }
  });

  it('only the badge repaints when the ledger window is closed', () => {
    const { s, dom, close } = sandbox({ walletOpen: false });
    try {
      s._walletRefreshZeroCard();
      expect(dom.window.document.querySelector('.wallet-zero-badge').textContent).toBe('3');
      expect(dom.window.document.querySelector('.wallet-zero-card')).toBeNull();
    } finally { close(); }
  });

  it('every fresh /grade repaints an open ledger', () => {
    const rdg = fnSrc('renderDoNowGrades');
    const cacheAt = rdg.indexOf('_gradeLessonsCache = Array.isArray(data.lessons)');
    expect(rdg.indexOf('_walletRefreshZeroCard()', cacheAt)).toBeGreaterThan(cacheAt);
  });
});
