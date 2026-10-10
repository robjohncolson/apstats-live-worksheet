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
import { beforeAll } from 'vitest';
let C;
beforeAll(async () => { await import('../lib/class-snapshot.js'); C = globalThis.ClassSnapshot; });

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
    get ClassSnapshot() { return C; },
    _snapApp: { amode: null },
    _snapModes() { return { available: ['dot', 'stem', 'hist'], default: 'stem', tabs: true }; },
  };
  createContext(s);
  runInContext(['_zeroDayText', '_zeroWhenText', '_zeroLatestSoonDay', '_zeroStatusText', '_zeroCardStatus', '_zeroCardActionButton', '_zeroCardRow', '_walletPrependZeroCard', '_walletSeeClassButton', '_zeroCardAttachScores', '_zeroCardToggleGraph', '_snapScoreList', '_snapListKey', '_snapAssignmentPlot', '_snapTentativeLegend']
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
  it('each row has a tiny "graph" link, disabled until the class picture has loaded', () => {
    const t = sandbox({ warns: [PAST_QZ, SOON_BL] });
    try {
      t.s._walletPrependZeroCard(t.host());
      const sees = [...t.card().querySelectorAll('button.wz-see')];
      expect(sees.map(b => b.textContent)).toEqual(['graph', 'graph']);
      expect(sees.map(b => b.disabled)).toEqual([true, true]);
      expect(sees[0].title).toBe('The graphs of the class on this one (no names)');
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
    t.s._snapFetchAssignments = (section) => { t.s.fetched = section; return Promise.resolve({ ok: true, section: 'all', sections: ['PeriodB', 'PeriodE'], assignments: [A11, W14] }); };
    try {
      t.s._walletPrependZeroCard(t.host());
      await tick(); await tick();
      expect(t.s.fetched).toBe('all');
      const rows = [...t.card().querySelectorAll('.wz-row')];
      expect(rows.map(r => r.dataset.key)).toEqual(['1.1:worksheet', '1.4:worksheet']);
      const past = rows[0].nextSibling;
      expect(past.className).toContain('snap-alist');
      // EFFORT_VISIBILITY_V2_SPEC §2: the lead names both periods from the payload's `sections`.
      expect(past.querySelector('.snap-alist-lead').textContent).toBe('7 students’ scores from Period B and Period E together for 1.1 Follow-Along:');
      expect([...past.querySelectorAll('.snap-alist-seq span')].map(x => x.textContent).join(' ')).toBe('0 0 85 90 100 100 100');
      expect(past.querySelectorAll('.snap-alist-you').length).toBe(1);
      expect(past.querySelectorAll('.snap-alist-tentative').length).toBe(0);
      const soon = rows[1].nextSibling;
      expect(soon.querySelector('.snap-alist-lead').textContent).toBe('10 students’ scores from Period B and Period E together for 1.4 Follow-Along (3 tentative):');
      const chips = [...soon.querySelectorAll('.snap-alist-seq span')];
      expect(chips.slice(0, 3).map(c => c.className)).toEqual(['snap-alist-tentative', 'snap-alist-tentative', 'snap-alist-you']);
      expect(soon.querySelector('.snap-alist-foot').textContent).toBe('7 of 10 students across both periods have a score here. 3 haven\u2019t yet — a tentative 0 until Sun 9/27. Every 0 on this list can still be replaced.'.replace('\u2019', "'"));
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

describe('score list key + per-assignment graph (teacher 2026-09-26: "does not explain what the yellow or the red means … a graph button ONLY for that assignment")', () => {
  const tick = () => new Promise(r => setTimeout(r, 0));
  const W14 = { key: '1.4:worksheet', title: '1.4 Follow-Along', values: [88, 92, 95, 100, 100, 100, 102], tentativeZeros: 3, zeros: 0 };
  const A12 = { key: '1.2:quiz', title: '1.2 Quiz', values: [0, 0, 67, 100, 100, 100, 100], tentativeZeros: 0, zeros: 2 };
  function paintable(t) {
    // jsdom has no canvas: give every canvas a recording 2d context
    t.s.window.HTMLCanvasElement.prototype.getContext = function () {
      const ctx = { calls: [], font: '', fillStyle: '', strokeStyle: '', textAlign: '', textBaseline: '', lineWidth: 1, measureText: (s) => ({ width: String(s).length * 6 }) };
      ['clearRect', 'fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'fillText', 'closePath'].forEach(k => { ctx[k] = (...a) => ctx.calls.push([k, ...a]); });
      return ctx;
    };
  }
  it('the key names red, yellow and black in words; no yellow line when nothing is tentative', async () => {
    const t = sandbox({ warns: [PAST_QZ, SOON_WS] });
    t.s._snapFetchAssignments = () => Promise.resolve({ ok: true, section: 'all', sections: ['PeriodB', 'PeriodE'], assignments: [A12, W14] });
    try {
      t.s._walletPrependZeroCard(t.host());
      await tick(); await tick();
      const keys = [...t.card().querySelectorAll('.snap-alist-key')].map(k => k.textContent);
      expect(keys[0]).toBe('0 = you · 97 = every other number is one student in Period B or E');
      expect(keys[1]).toBe('0 = you · 0 = a 0 that is not counting yet · 97 = every other number is one student in Period B or E');
      expect(t.card().querySelectorAll('.snap-alist-key .snap-key-tent').length).toBe(1);
      expect(t.card().querySelectorAll('.snap-alist-key .snap-alist-you').length).toBe(0);   // the key never inflates the real chip counts
    } finally { t.close(); }
  });
  it('"graph" opens the graphs for that assignment only, in the learned forms, with the caption; click again hides', async () => {
    const t = sandbox({ warns: [PAST_QZ, SOON_WS] });
    paintable(t);
    t.s._snapFetchAssignments = () => Promise.resolve({ ok: true, assignments: [A12, W14] });
    try {
      t.s._walletPrependZeroCard(t.host());
      await tick(); await tick();
      const sees = [...t.card().querySelectorAll('button.wz-see')];
      expect(sees.map(b => b.disabled)).toEqual([false, false]);
      sees[1].onclick();
      const list = t.card().querySelectorAll('.wz-scores')[1];
      const panel = list.querySelector('.wz-graph');
      expect(panel).not.toBeNull();
      expect([...panel.querySelectorAll('.snap-amodes button')].map(b => b.textContent)).toEqual(['Dot plot', 'Stem-and-leaf', 'Histogram']);
      expect(panel.querySelector('canvas')).not.toBeNull();
      // D = [0,0,0,88,92,95,100,100,100,102]: median 93.5, Q1 0 (three tentative zeros are a quarter+), Q3 100
      expect(panel.querySelector('.snap-caption').textContent).toBe('Median 93.5 · IQR 100 · 0 zeros + 3 tentative (real after Sun 9/27). You: 0 (tentative) — inside the box only because at least a quarter of the class is also at 0, so Q1 itself is 0.');
      expect(panel.querySelector('.snap-legend')).not.toBeNull();
      expect(sees[1].textContent).toBe('hide graph');
      // the other row's list is untouched — the graph is for THIS assignment only
      expect(t.card().querySelectorAll('.wz-graph').length).toBe(1);
      panel.querySelectorAll('.snap-amodes button')[2].onclick();          // Histogram
      expect(list.querySelector('.snap-amodes button[aria-pressed="true"]').textContent).toBe('Histogram');
      expect(t.s._snapApp.amode).toBe('hist');
      sees[1].onclick();
      expect(list.querySelector('.wz-graph')).toBeNull();
      expect(sees[1].textContent).toBe('graph');
    } finally { t.close(); }
  });
});

describe('Balance card effort lines (EFFORT_VISIBILITY_SPEC §3: "they don’t feel that I’m misplacing their effort")', () => {
  let EF;
  beforeAll(async () => { await import('../lib/effort-facts.js'); EF = globalThis.EffortFacts; });
  // The Desk calendar row shape: [y, month0, d, cellB, cellE]. Unit 1 PC Day 2: B Tue 10/13, E Fri 10/16.
  const CAL = [
    [2026, 9, 12, { t: 'U1-PC1', kind: 'pc', admin: 1, u: 1 }, { t: '1.9', u: 1 }],
    [2026, 9, 13, { t: 'U1-PC2', kind: 'pc', admin: 2, u: 1 }, { t: '3.1', u: 1 }],
    [2026, 9, 16, { t: '3.1', u: 1 }, { t: 'U1-PC2', kind: 'pc', admin: 2, u: 1 }],
  ];
  const LESSONS = [
    { lessonKey: '1.2', due: { B: '2026-09-09', E: '2026-09-10' }, lessonGradeNoQuiz: 70 },
    { lessonKey: '1.6', due: { B: '2026-10-05', E: '2026-10-07' }, lessonGradeNoQuiz: 100, Q: 67 },
    { lessonKey: '3.1', due: { B: '2026-10-16', E: '2026-10-13' }, blooket: 90 },
  ];
  function effortSandbox({ units = { U1: { pcRawPct: 66.7 } }, lessons = LESSONS, workAvg = 31, today = [2026, 8, 27], lib = true, gradebook = null } = {}) {
    const dom = new JSDOM('<div></div>');
    const s = {
      document: dom.window.document, window: dom.window, console,
      S: CAL, cP: 'B',
      tdy: () => new Date(today[0], today[1], today[2]),
      _gradeUnitsCache: units, _gradeLessonsCache: lessons, _gradeGradebookCache: gradebook,
      _gradeQuartersCache: { Q1: { quarterGrade: 45, lessonsDue: 9, workAvg, pcUnits: [1, 2] } },
      cedLabel: k => (k === '3.1' ? { mapped: true, id: '1.10', text: '1.10 · Investigative Question' } : { mapped: true, id: k, text: k }),
    };
    if (lib) Object.defineProperty(s, 'EffortFacts', { get: () => EF });
    createContext(s);
    runInContext(['_zeroTodayIso', '_effortPcSchedule', '_effortTopicNumber', '_effortFacts', '_effortGradebookQuarter',
      '_effortAheadProjection', '_effortAheadProjectionSentence', '_walletEffortBlock'].map(fnSrc).join('\n'), s);
    return { s, close: () => dom.window.close() };
  }

  // AHEAD_WORK_PROJECTION_SPEC §2: the ahead line gains what Schoology will read once the ahead cells come due.
  it('ahead line appends the Schoology projection when the gradebook carries it', () => {
    const gradebook = { quarters: { Q1: { schoologyTotal: 83.66, schoologyProjectedTotal: 85.04, aheadCells: 3 } } };
    const t = effortSandbox({ gradebook });
    try {
      expect(t.s._walletEffortBlock('Q1').querySelector('.wallet-effort-ahead').textContent).toBe(
        "Ahead of the calendar: 2 lessons already done (1.6, 1.10). They already count in your Desk grade; Schoology catches up when each lesson's column opens. Once they come due Schoology will read about 85% (today 83.7%).");
    } finally { t.close(); }
  });
  it('no projection sentence when nothing is ahead in the gradebook or the payload is older', () => {
    const plain = "Ahead of the calendar: 2 lessons already done (1.6, 1.10). They already count in your Desk grade; Schoology catches up when each lesson's column opens.";
    for (const gradebook of [null, { quarters: { Q1: { schoologyTotal: 83.7 } } },
      { quarters: { Q1: { schoologyTotal: 83.7, schoologyProjectedTotal: 83.7, aheadCells: 0 } } }]) {
      const t = effortSandbox({ gradebook });
      try {
        expect(t.s._walletEffortBlock('Q1').querySelector('.wallet-effort-ahead').textContent).toBe(plain);
      } finally { t.close(); }
    }
  });

  it('reads PC Day 2 off the Desk calendar in the lesson-schedule shape', () => {
    const t = effortSandbox();
    try {
      expect(JSON.parse(JSON.stringify(t.s._effortPcSchedule()))).toEqual({ progressChecks: { 1: { adminDay2: { B: '2026-10-13', E: '2026-10-16' } } } });
    } finally { t.close(); }
  });
  it('a PC on file and work ahead: a grey PC line (+ strategy) and a green ahead line, under the grade row', () => {
    const t = effortSandbox();
    try {
      const box = t.s._walletEffortBlock('Q1');
      expect(box.className).toBe('wallet-effort geneva');
      const pc = box.querySelector('.wallet-effort-pc');
      const ahead = box.querySelector('.wallet-effort-ahead');
      expect(pc.textContent).toBe('Progress Check so far: 67% (paper) — counts from Tue 10/13. To finish the quarter with your 67%, your Work average has to reach 40% — you are at 31%, so bring it up by at least 9 points. Once both tracks are at least 40%, your grade is the higher one, and yours would be the Progress Check.');
      expect(pc.style.borderLeft).toBe('3px solid rgb(136, 136, 136)');
      expect(ahead.textContent).toBe("Ahead of the calendar: 2 lessons already done (1.6, 1.10). They already count in your Desk grade; Schoology catches up when each lesson's column opens.");
      expect(ahead.style.borderLeft).toBe('3px solid rgb(42, 138, 42)');
      expect([...box.children].map(c => c.className)).toEqual(['wallet-effort-pc', 'wallet-effort-ahead']);
    } finally { t.close(); }
  });
  it('nothing on file and nothing ahead: no block at all', () => {
    const t = effortSandbox({ units: { U1: { pcRawPct: null } }, lessons: LESSONS.slice(0, 1) });
    try {
      expect(t.s._walletEffortBlock('Q1')).toBeNull();
    } finally { t.close(); }
  });
  it('ahead only (nothing missing, no PC yet) still shows the praise; the lib missing never breaks the ledger', () => {
    const t = effortSandbox({ units: null });
    try {
      const box = t.s._walletEffortBlock('Q1');
      expect(box.querySelector('.wallet-effort-pc')).toBeNull();
      expect(box.querySelector('.wallet-effort-ahead')).not.toBeNull();
    } finally { t.close(); }
    const bare = effortSandbox({ lib: false });
    try {
      expect(bare.s._walletEffortBlock('Q1')).toBeNull();
    } finally { bare.close(); }
  });
  it('_walletPaint puts the block in the balance card right after the grade row; the zero card never carries it', () => {
    const paint = fnSrc('_walletPaint');
    const rowAt = paint.indexOf('card.appendChild(gradeRow);');
    const effortAt = paint.indexOf('var effort = _walletEffortBlock(grade.q);');
    expect(rowAt).toBeGreaterThan(-1);
    expect(effortAt).toBeGreaterThan(rowAt);
    expect(paint).toContain('if (effort) card.appendChild(effort);');
    expect(fnSrc('_walletPrependZeroCard')).not.toMatch(/effort/i);
  });
  it('the lib loads beside lib/class-snapshot.js, and the units cache is set and cleared with the others', () => {
    expect(html).toContain('<script src="lib/class-snapshot.js" onerror=""></script>\n<script src="lib/effort-facts.js" onerror=""></script>');
    expect(html).toMatch(/var _gradeUnitsCache = null;/);
    expect(fnSrc('_resetGradeStateForIdentitySwitch')).toContain('_gradeUnitsCache = null;');
    const grades = fnSrc('renderDoNowGrades');
    expect(grades).toContain('_gradeUnitsCache = null;');
    expect(grades).toMatch(/_gradeUnitsCache = \(data\.units && typeof data\.units === 'object'\) \? data\.units : null;/);
  });
  it('counting: the engine pcAvg is the track and the gate reads the UNROUNDED Work average (Codex review 2026-09-27)', () => {
    const low = effortSandbox({ today: [2026, 9, 14] });
    try {
      low.s._gradeQuartersCache.Q1.pcAvg = 30;                       // one unit at 67, the track at 30
      expect(low.s._walletEffortBlock('Q1').querySelector('.wallet-effort-pc').textContent)
        .toBe('Progress Check so far: 67% (paper) — counting in your grade now.');
    } finally { low.close(); }
    const edge = effortSandbox({ units: { U1: { pcRawPct: 100 } }, workAvg: 39.96, today: [2026, 9, 14] });
    try {
      edge.s._gradeQuartersCache.Q1.pcAvg = 100;
      const text = edge.s._walletEffortBlock('Q1').querySelector('.wallet-effort-pc').textContent;
      expect(text).toContain('To keep your 100%, your Work average has to reach 40% — you are at 39.9%, so bring it up by at least 1 point.');
      expect(text).not.toContain('already past');
    } finally { edge.close(); }
  });
});

describe('"How your grade is counted" note + bonus footer wording (teacher 2026-09-27)', () => {
  const NOTE = 'Work is worksheets 50%, quizzes 35%, Blookets 15%. The Desk counts every lesson you have done, ahead of the calendar or not. Schoology is a rolling snapshot of what the class has covered so far, so early work shows up there when its column opens. Bonus sheets (DOK sheets and unit posters) are banked and added at the end of the quarter to whichever track helps you more — they can only raise your grade.';
  function noteSandbox(lib) {
    const dom = new JSDOM('<div></div>');
    const s = { document: dom.window.document, window: dom.window };
    if (lib) s.EffortFacts = lib;
    createContext(s);
    runInContext(fnSrc('_walletCountingNote'), s);
    return { s, close: () => dom.window.close() };
  }
  it('the balance card always carries the note: small grey text, four sentences, even without the lib', async () => {
    await import('../lib/effort-facts.js');
    for (const lib of [globalThis.EffortFacts, null]) {
      const t = noteSandbox(lib);
      try {
        const note = t.s._walletCountingNote();
        expect(note.className).toBe('wallet-counting-note geneva');
        expect(note.style.fontSize).toBe('10px');
        expect(note.style.color).toBe('rgb(102, 102, 102)');
        expect(note.textContent).toBe(NOTE);
      } finally { t.close(); }
    }
  });
  it('_walletPaint adds the note unconditionally, right after the effort block', () => {
    const paint = fnSrc('_walletPaint');
    const effortAt = paint.indexOf('if (effort) card.appendChild(effort);');
    const noteAt = paint.indexOf('card.appendChild(_walletCountingNote());');
    expect(effortAt).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(effortAt);
    expect(noteAt).toBeLessThan(paint.indexOf('card.appendChild(sep);'));
  });
  it('the Bonus banked footer names the higher-track rule', () => {
    // The footer text moved into _walletBonusFooterText (Bonus Bank v2 adds the after-apply placement line).
    expect(fnSrc('_walletBonusBlock')).toContain('_walletBonusFooterText(applied)');
    expect(fnSrc('_walletBonusFooterText')).toContain("'Added at the end of the quarter to whichever track helps you more.'");
    expect(fnSrc('_walletBonusFooterText')).not.toContain('Applied at the end of the quarter.');
  });
});
