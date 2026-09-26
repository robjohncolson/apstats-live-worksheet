// tests/desk-ledger-calm.test.js — LEDGER_CALM_SPEC.md §2 (teacher 2026-09-26: "it's overwhelming …
// the kids just want to see the data … the graphs can be a special button off to the side").
// The student's Missing-work card is a one-line status and a short colour-coded list; the ledger
// no longer carries the class picture; one "See the class" button leads to it.
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

// Today is Sat 9/26.
const PAST_WS = { lessonKey: '1.1', kind: 'worksheet', zeroDate: '2026-09-20', daysLeft: -6, past: true };
const PAST_QZ = { lessonKey: '1.2', kind: 'quiz', zeroDate: '2026-09-21', daysLeft: -5, past: true };
const SOON_BL = { lessonKey: '1.3', kind: 'blooket', zeroDate: '2026-09-26', daysLeft: 0, past: false };
const SOON_WS = { lessonKey: '1.4', kind: 'worksheet', zeroDate: '2026-09-27', daysLeft: 1, past: false };

function sandbox({ warns = [], grade = { pct: 78, q: 'Q1' }, teacher = false } = {}) {
  const dom = new JSDOM('<div id="wallet-content"><div class="old">balance</div></div>');
  const s = {
    document: dom.window.document, window: dom.window, console,
    warns, grade, seen: [], work: [], snapshots: 0,
    _zeroCurrentWarnings() { return s.warns; },
    _walletCurrentGrade() { return s.grade; },
    _deskIsTeacher() { return teacher; },
    cedLabel: k => ({ text: 'Topic ' + k }),
    _snapOpenAssignment(k, kind) { s.seen.push([k, kind]); },
    _zeroOpenLesson(k) { s.work.push(['worksheet', k]); },
    _zeroOpenQuiz(k) { s.work.push(['quiz', k]); },
    _zeroOpenFlashcards(_b, k) { s.work.push(['blooket', k]); },
    openSnapshot() { s.snapshots++; },
    Promise,
  };
  createContext(s);
  runInContext(['_zeroDayText', '_zeroWhenText', '_zeroLatestSoonDay', '_zeroStatusText', '_zeroCardRow', '_walletPrependZeroCard', '_walletSeeClassButton', '_zeroCardAttachScores', '_snapScoreList']
    .map(fnSrc).join('\n'), s);
  const host = () => dom.window.document.getElementById('wallet-content');
  const card = () => host().querySelector('.wallet-zero-card');
  return { s, host, card, close: () => dom.window.close() };
}

describe('Missing-work card — a status line, no paragraph, no headings (§2.1, §2.2)', () => {
  it('mixed list: "Q1 so far: 78%. 2 items below are 0s now, 1 more becomes a 0 by Sun 9/27 — …" (Codex review: tentative items are not zeros yet)', () => {
    const t = sandbox({ warns: [PAST_WS, PAST_QZ, SOON_WS] });
    try {
      t.s._walletPrependZeroCard(t.host());
      const card = t.card();
      expect(t.host().firstChild).toBe(card);
      expect(card.children[0].className).toBe('wz-status geneva');
      expect(card.children[0].textContent).toBe('Q1 so far: 78%. 2 items below are 0s now, 1 more becomes a 0 by Sun 9/27 — finishing them is the fastest way up.');
      expect(card.classList.contains('wz-soon')).toBe(false);   // red frame: something is a 0
      expect(card.querySelector('h4')).toBeNull();
      expect(card.querySelector('h5')).toBeNull();
      expect(card.textContent).not.toContain('Each of these');
      expect(card.textContent).not.toContain('see the class');
      expect(card.children.length).toBe(4);   // status + 3 rows, nothing else
    } finally { t.close(); }
  });
  it('nothing counting yet: "… 2 items below become a 0 by <latest day> — finish them first."', () => {
    const t = sandbox({ warns: [SOON_BL, SOON_WS] });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect(t.card().querySelector('.wz-status').textContent).toBe('Q1 so far: 78%. 2 items below become a 0 by Sun 9/27 — finish them first.');
    } finally { t.close(); }
  });
  it('singular wording, and no grade clause before a grade exists', () => {
    const t = sandbox({ warns: [SOON_WS], grade: { pct: null, q: null } });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect(t.card().querySelector('.wz-status').textContent).toBe('1 item below becomes a 0 by Sun 9/27 — finish it first.');
      t.s.warns = [PAST_WS];
      t.s._walletPrependZeroCard(t.host());
      expect(t.card().querySelector('.wz-status').textContent).toBe('The 1 item below counts as 0 — finishing it is the fastest way up.');
    } finally { t.close(); }
  });
  it('never prints a projected "up to" number (§6 is out of scope)', () => {
    expect(fnSrc('_zeroStatusText')).not.toMatch(/up to/i);
  });
});

describe('Missing-work rows (§2.3)', () => {
  it('past first, then by date; verb-only buttons, the lesson in .wz-label, the date in .wz-when, colour by class', () => {
    const t = sandbox({ warns: [PAST_WS, PAST_QZ, SOON_BL, SOON_WS] });
    try {
      t.s._walletPrependZeroCard(t.host());
      const rows = [...t.card().querySelectorAll('.wz-row')];
      expect(rows.map(r => r.querySelector('button').textContent)).toEqual(['Open', 'Quiz', 'Flashcards', 'Open']);
      expect(rows.map(r => r.querySelector('button').className)).toEqual(['s7btn', 's7btn', 's7btn', 's7btn']);
      expect(rows.map(r => r.querySelector('.wz-label').textContent)).toEqual(['Topic 1.1', 'Topic 1.2', 'Topic 1.3', 'Topic 1.4']);
      expect(rows.map(r => r.querySelector('.wz-when').textContent)).toEqual(['0 since Sun 9/20', '0 since Mon 9/21', '0 after Sat 9/26', '0 after Sun 9/27']);
      expect(rows.map(r => r.classList.contains('wz-past'))).toEqual([true, true, false, false]);
      // children in order: verb, label, date, class link
      expect([...rows[0].children].map(c => c.className)).toEqual(['s7btn', 'wz-label', 'wz-when', 'wz-see']);
      rows[0].querySelector('button').onclick();
      rows[1].querySelector('button').onclick();
      rows[2].querySelector('button').onclick();
      expect(t.s.work).toEqual([['worksheet', '1.1'], ['quiz', '1.2'], ['blooket', '1.3']]);
    } finally { t.close(); }
  });
  it('past rows still come first even if handed out of order', () => {
    const t = sandbox({ warns: [SOON_WS, PAST_QZ] });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect([...t.card().querySelectorAll('.wz-label')].map(el => el.textContent)).toEqual(['Topic 1.2', 'Topic 1.4']);
    } finally { t.close(); }
  });
  it('each row has a tiny "class" link that opens the Snapshot app on (lessonKey, kind)', () => {
    const t = sandbox({ warns: [PAST_QZ, SOON_BL] });
    try {
      t.s._walletPrependZeroCard(t.host());
      const sees = [...t.card().querySelectorAll('button.wz-see')];
      expect(sees.map(b => b.textContent)).toEqual(['class', 'class']);
      expect(sees[0].title).toBe('How the class did on this one (no names)');
      sees[0].onclick();
      sees[1].onclick();
      expect(t.s.seen).toEqual([['1.2', 'quiz'], ['1.3', 'blooket']]);
    } finally { t.close(); }
  });
  it('the data-sig guard still keeps the same card node when the list is unchanged, and rebuilds when it changes', () => {
    const t = sandbox({ warns: [PAST_WS, SOON_WS] });
    try {
      t.s._walletPrependZeroCard(t.host());
      const first = t.card();
      t.s._walletPrependZeroCard(t.host());
      expect(t.card()).toBe(first);
      t.s.warns = [PAST_WS];
      t.s._walletPrependZeroCard(t.host());
      expect(t.card()).not.toBe(first);
      expect(t.host().querySelectorAll('.wallet-zero-card')).toHaveLength(1);
      t.s.warns = [];
      t.s._walletPrependZeroCard(t.host());
      expect(t.card()).toBeNull();
      expect(t.host().querySelector('.old')).not.toBeNull();
    } finally { t.close(); }
  });
  it('CSS: red rows for a 0 now, yellow rows for soon', () => {
    expect(html).toMatch(/\.wz-row\.wz-past \{ border-left: 3px solid #cc0000; background: #fff3f3; \}/);
    expect(html).toMatch(/\.wz-row:not\(\.wz-past\) \{ border-left: 3px solid #d9b400; background: #fff9db; \}/);
  });
});

describe('Balance card: the "See the class" button (§2.4) and the ledger chain (§2.1)', () => {
  it('a student gets the button; clicking it opens the Snapshot app', () => {
    const t = sandbox();
    try {
      const btn = t.s._walletSeeClassButton();
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.className).toBe('s7btn wallet-see-class');
      expect(btn.textContent).toBe('See the class');
      expect(btn.style.fontSize).toBe('10px');
      btn.onclick();
      expect(t.s.snapshots).toBe(1);
    } finally { t.close(); }
  });
  it('the teacher gets no button', () => {
    const t = sandbox({ teacher: true });
    try {
      expect(t.s._walletSeeClassButton()).toBeNull();
    } finally { t.close(); }
  });
  it('_walletPaint puts it in the "who" row, right side, before the row is attached', () => {
    const paint = fnSrc('_walletPaint');
    const whoAt = paint.indexOf("who.innerHTML = ");
    const btnAt = paint.indexOf('var seeClass = _walletSeeClassButton();');
    expect(whoAt).toBeGreaterThan(-1);
    expect(btnAt).toBeGreaterThan(whoAt);
    expect(paint).toContain('if (seeClass) who.lastChild.appendChild(seeClass);');
    expect(paint.indexOf('card.appendChild(who);')).toBeGreaterThan(btnAt);
  });
  it('the ledger paint chain no longer prepends the class picture', () => {
    expect(fnSrc('renderWallet')).not.toContain('_walletPrependSnapshot(');
    expect((fnSrc('renderWallet').match(/_walletPrependZeroCard\(host\)/g) || []).length).toBe(3);
    expect(fnSrc('_walletRefreshZeroCard')).not.toContain('_walletPrependSnapshot(');
    expect(fnSrc('_walletRefreshZeroCard')).toContain('_walletPrependZeroCard(host)');
  });
});

describe('Missing-work card — review fixes (Codex 2026-09-26)', () => {
  it('all past: "The N items below count as 0"; all soon: yellow frame', () => {
    const past = sandbox({ warns: [PAST_WS, PAST_QZ] });
    try {
      past.s._walletPrependZeroCard(past.host());
      expect(past.card().querySelector('.wz-status').textContent).toBe('Q1 so far: 78%. The 2 items below count as 0 — finishing them is the fastest way up.');
      expect(past.card().classList.contains('wz-soon')).toBe(false);
    } finally { past.close(); }
    const soon = sandbox({ warns: [SOON_BL, SOON_WS] });
    try {
      soon.s._walletPrependZeroCard(soon.host());
      expect(soon.card().classList.contains('wz-soon')).toBe(true);
    } finally { soon.close(); }
  });
  it('an unchanged list keeps the card (focus-safe) but refreshes the grade in the status line', () => {
    const t = sandbox({ warns: [PAST_WS, SOON_WS] });
    try {
      t.s._walletPrependZeroCard(t.host());
      const first = t.card();
      const firstButton = first.querySelector('button');
      expect(first.querySelector('.wz-status').textContent).toMatch(/^Q1 so far: 78%\. 1 item below is a 0 now, 1 more becomes a 0 by Sun 9\/27/);
      t.s.grade = { pct: 85, q: 'Q1' };
      t.s._walletPrependZeroCard(t.host());
      expect(t.card()).toBe(first);                                   // same node, no repaint
      expect(t.card().querySelector('button')).toBe(firstButton);
      expect(t.card().querySelector('.wz-status').textContent).toMatch(/^Q1 so far: 85%\./);
    } finally { t.close(); }
  });
});

describe('Missing-work rows show the class\u2019s scores inline (teacher 2026-09-26: "on that screen I should see the data points")', () => {
  const tick = () => new Promise(r => setTimeout(r, 0));
  const A11 = { key: '1.1:worksheet', title: '1.1 Follow-Along', values: [0, 0, 85, 90, 100, 100, 100], tentativeZeros: 0, zeros: 2 };
  const W14 = { key: '1.4:worksheet', title: '1.4 Follow-Along', values: [88, 92, 95, 100, 100, 100, 102], tentativeZeros: 3, zeros: 0 };
  it('each row is followed by its score list: a real 0 is the red chip on a counting row, a tentative one on a soon row', async () => {
    const t = sandbox({ warns: [PAST_WS, SOON_WS] });
    t.s._snapFetchAssignments = (section) => { t.s.fetched = section; return Promise.resolve({ ok: true, assignments: [A11, W14] }); };
    try {
      t.s._walletPrependZeroCard(t.host());
      await tick(); await tick();
      expect(t.s.fetched).toBe('all');
      const rows = [...t.card().querySelectorAll('.wz-row')];
      expect(rows.map(r => r.dataset.key)).toEqual(['1.1:worksheet', '1.4:worksheet']);
      const past = rows[0].nextSibling;
      expect(past.className).toContain('snap-alist');
      expect(past.querySelector('.snap-alist-lead').textContent).toBe('All 7 scores for 1.1 Follow-Along:');
      expect([...past.querySelectorAll('.snap-alist-seq span')].map(x => x.textContent).join(' ')).toBe('0 0 85 90 100 100 100');
      expect(past.querySelectorAll('.snap-alist-you').length).toBe(1);
      expect(past.querySelectorAll('.snap-alist-tentative').length).toBe(0);
      const soon = rows[1].nextSibling;
      expect(soon.querySelector('.snap-alist-lead').textContent).toBe('All 10 scores for 1.4 Follow-Along (3 tentative):');
      const chips = [...soon.querySelectorAll('.snap-alist-seq span')];
      expect(chips.slice(0, 3).map(c => c.className)).toEqual(['snap-alist-tentative', 'snap-alist-tentative', 'snap-alist-you']);
      expect(soon.querySelector('.snap-alist-foot').textContent).toBe('7 of 10 classmates have a score here. 3 haven\u2019t yet — a tentative 0 until Sun 9/27. Every 0 on this list can still be replaced.'.replace('\u2019', "'"));
      // an unchanged repaint does not duplicate the lists
      t.s._walletPrependZeroCard(t.host());
      await tick(); await tick();
      expect(t.card().querySelectorAll('.snap-alist').length).toBe(2);
    } finally { t.close(); }
  });
  it('no loader (offline / not signed in) → rows only, no crash', () => {
    const t = sandbox({ warns: [PAST_WS] });
    try {
      t.s._walletPrependZeroCard(t.host());
      expect(t.card().querySelectorAll('.wz-row').length).toBe(1);
      expect(t.card().querySelector('.snap-alist')).toBeNull();
    } finally { t.close(); }
  });
});
