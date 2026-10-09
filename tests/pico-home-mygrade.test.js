// @vitest-environment node
/**
 * tests/pico-home-mygrade.test.js
 *
 * Teacher 2026-10-08: My Grade's CONTENT in the Pico style. With the flag on, pico-home.js draws
 * the ledger's grade surfaces (status line, Missing-work rows, balance card, bonus bank) as Pico
 * tiles, badges and sub-panels, from the SAME Desk functions the System 7 window calls.
 *
 * Never change a number: the same Desk state is rendered through the System 7 window (flag off)
 * and through the Pico window (flag on), and every grade number, badge / pill label, row count,
 * row colour class, "Schoology:" tag, status line, effort line and bonus line must be identical.
 *
 * The Desk state is set by replacing the Desk's DATA sources (the warnings lists, the official
 * grade fetch, the effort facts, the bonus receipts) on window — both windows read them through
 * the same global names, so both render the same state.
 */

import { describe, it, expect, vi } from 'vitest';
import { bootDesk, DESK_URL } from './journeys/harness.js';

const NOW = '2026-10-07T14:00:00.000Z';   // Wed Oct 7 2026 (Q1)

function gradeFixture() {
  return {
    ok: true, asOf: NOW, units: [], completion: {}, lessons: [], gradebook: {},
    quarters: { Q1: { quarterGrade: 87.5, pcAvg: 82, workAvg: 87.5, lessonsDue: 7, lessonsGraded: 5, lessonsTotal: 10 } },
  };
}

// Two 0s now, one 0 soon, one past-due row that is not counting yet; an official grade; both
// effort lines; one banked bonus sheet.
const MIXED = {
  warns: [
    { lessonKey: '1.2', kind: 'worksheet', past: true, zeroDate: '2026-10-01', dueDate: '2026-09-18', unit: 1, worksheetKey: '2' },
    { lessonKey: '1.3', kind: 'quiz', past: true, zeroDate: '2026-10-03', dueDate: '2026-09-21' },
    { lessonKey: '1.5', kind: 'blooket', past: false, zeroDate: '2026-10-09', dueDate: '2026-09-25', unit: 1, worksheetKey: '5' },
  ],
  later: [
    { lessonKey: '1.6', kind: 'worksheet', dueDate: '2026-10-02', zeroDate: '2026-10-15', unit: 1, worksheetKey: '6' },
  ],
  official: { grade: 91.24, quarter: 'Q1', asOf: '2026-10-07T02:00:00.000Z', parts: { work: 87.5, pc: 91.2, rule: 'PC' } },
  effort: {
    pc: { unit: 1 },
    pcText: 'Your Unit 1 Progress Check is on file: 91%.',
    ahead: [{ lessonKey: '1.7' }],
    aheadText: 'You finished 1.7 ahead of the calendar — it already counts here.',
    projection: null,
  },
  bonus: [
    { src: 'bonus', i: 'BONUS-screen-time', sc: 3, response: JSON.stringify({ quarter: 'Q1', title: 'Screen Time', grade: 'P' }) },
  ],
};

// Nothing missing, no official grade yet, no effort lines, no bonus: the calm (readiness-hue) card.
const CALM = { warns: [], later: [], official: null, effort: { pc: null, pcText: '', ahead: [], aheadText: '', projection: null }, bonus: [] };

// Only "soon" rows (yellow frame).
const SOON_ONLY = {
  ...CALM,
  warns: [{ lessonKey: '1.4', kind: 'worksheet', past: false, zeroDate: '2026-10-08', dueDate: '2026-09-24', unit: 1, worksheetKey: '4' }],
};

function setState(win, state) {
  const copy = (list) => list.map((w) => ({ ...w }));
  win._zeroCurrentWarnings = () => copy(state.warns);
  win._pastDueCurrentWork = () => copy(state.later);
  win._fetchOfficialGrade = async () => state.official;
  win._officialGradeCache = state.official;
  win._effortFacts = () => ({ ...state.effort });
  win._effortAheadProjectionSentence = () => '';
  win._walletFetchBonusReceipts = async () => state.bonus.map((r) => ({ ...r }));
  win._snapFetchAssignments = () => null;   // no class picture: the "graph" links stay disabled
}

async function boot(flagOn, state, { teacher = false } = {}) {
  const harness = await bootDesk({
    now: NOW,
    url: DESK_URL + (flagOn ? '?home=park' : ''),
    roster: { grades: gradeFixture() },
  });
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter'),
    { message: 'signed-in identity chip did not render' });
  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog && dialog.style.display !== 'none') harness.document.getElementById('dialog-btn').click();
  if (typeof harness.window.closeNameFinder === 'function') harness.window.closeNameFinder();
  // The harness signs in through the classic form, which leaves the sign-in roster dropdown open;
  // the Desk's Esc closes that first. Close it the Desk's way, as a signed-in student's page would be.
  if (typeof harness.window._closeRosterDropdown === 'function') harness.window._closeRosterDropdown();
  await harness.waitFor(() => harness.document.querySelector('#donow-grades .qpill:not(.qpill-missing) .qgrade'),
    { message: 'Do Now grade pill did not render' });
  setState(harness.window, state);
  if (teacher) harness.window._deskIsTeacher = () => true;
  return harness;
}

const norm = (text) => String(text || '').replace(/\s+/g, ' ').trim();

async function openLedger(harness) {
  const { document: doc, window: win } = harness;
  win.openWallet();
  const watch = () => norm(doc.getElementById('wallet-content').textContent)
    + '|' + norm(doc.getElementById('pico-ledger') ? doc.getElementById('pico-ledger').textContent : '');
  let last = '';
  await harness.waitFor(async () => {
    await new Promise((r) => setTimeout(r, 120));
    const now = watch();
    const stable = now.length > 1 && now === last;
    last = now;
    return stable;
  }, { timeoutMs: 8000, message: 'the ledger never settled' });
}

function colourOf(row) {
  if (row.classList.contains('wz-later')) return 'later';
  return row.classList.contains('wz-past') ? 'now' : 'soon';
}

function rowFacts(row) {
  const verb = row.querySelector('button');
  const sgy = row.querySelector('.wz-sgy');
  const see = row.querySelector('.wz-see');
  return {
    key: row.getAttribute('data-key'),
    colour: colourOf(row),
    kinds: ['wz-blooket', 'wz-quiz'].filter((c) => row.classList.contains(c)),
    verb: norm(verb.textContent),
    verbAria: verb.getAttribute('aria-label'),
    label: norm(row.querySelector('.wz-label').textContent),
    schoology: sgy ? norm(sgy.textContent) : null,
    when: norm(row.querySelector('.wz-when').textContent),
    graph: see ? norm(see.textContent) : null,
  };
}

// What the System 7 window shows (the Desk's own #wallet-content).
function system7(doc) {
  const host = doc.getElementById('wallet-content');
  const zc = host.querySelector('.wallet-zero-card');
  const card = host.querySelector('.wallet-counting-note').parentNode;
  const big = card.querySelector('.chicago');
  const quarterSpan = card.firstElementChild.children[1];
  const quarter = quarterSpan.firstChild && quarterSpan.firstChild.nodeType === 3 ? norm(quarterSpan.firstChild.nodeValue) : '';
  const estimate = card.querySelector('.wallet-grade-estimate');
  const drop = card.querySelector('.wallet-grade-drop');
  const bonus = host.querySelector('.wallet-bonus-block');
  let frame = null;
  if (zc) frame = zc.classList.contains('wz-calm') ? 'calm' : zc.classList.contains('wz-soon') ? 'soon' : 'now';
  return {
    status: zc ? norm(zc.querySelector('.wz-status').textContent) : '',
    frame,
    rows: zc ? [...zc.querySelectorAll('.wz-row')].map(rowFacts) : [],
    laterHead: zc && zc.querySelector('.wz-later-head') ? norm(zc.querySelector('.wz-later-head').textContent) : null,
    name: norm(card.firstElementChild.children[0].textContent),
    quarter,
    grade: norm(big.textContent),
    gradeLabel: norm(big.nextElementSibling.textContent),
    gradeTitle: big.parentNode.title || '',
    gradeColour: big.style.color,
    estimate: estimate ? norm(estimate.textContent) : null,
    drop: drop ? norm(drop.textContent) : null,
    effort: [...card.querySelectorAll('.wallet-effort > div')].map((d) => ({ cls: d.className, text: norm(d.textContent) })),
    note: norm(card.querySelector('.wallet-counting-note').textContent),
    tint: ['wallet-zeros-now', 'wallet-zeros-soon'].filter((c) => card.classList.contains(c)),
    bg: card.style.backgroundColor,
    border: card.style.borderColor,
    seeClass: card.querySelector('.wallet-see-class') ? norm(card.querySelector('.wallet-see-class').textContent) : null,
    bonus: bonus ? [...bonus.children].map((n) => norm(n.textContent)) : null,
  };
}

// What the Pico window shows (#pico-ledger-status + #pico-ledger).
function pico(doc) {
  const status = doc.getElementById('pico-ledger-status');
  const zero = doc.getElementById('pico-ledger-zero');
  const box = doc.getElementById('pico-ledger-balance');
  const num = box.querySelector('.pl-grade-num');
  const estimate = box.querySelector('.wallet-grade-estimate');
  const drop = box.querySelector('.wallet-grade-drop');
  const bonus = doc.getElementById('pico-ledger-bonus');
  const quarter = box.querySelector('.pl-quarter');
  return {
    status: status.hidden ? '' : norm(status.textContent),
    frame: zero.hidden ? null : zero.getAttribute('data-frame'),
    rows: zero.hidden ? [] : [...zero.querySelectorAll('.pl-tile')].map(rowFacts),
    laterHead: zero.querySelector('.pl-later-head') ? norm(zero.querySelector('.pl-later-head').textContent) : null,
    name: norm(box.querySelector('.pl-name').textContent),
    quarter: quarter ? norm(quarter.textContent) : '',
    grade: norm(num.textContent),
    gradeLabel: norm(box.querySelector('.pl-grade-label').textContent),
    gradeTitle: num.parentNode.title || '',
    gradeColour: num.style.color,
    estimate: estimate ? norm(estimate.textContent) : null,
    drop: drop ? norm(drop.textContent) : null,
    effort: [...box.querySelectorAll('.wallet-effort-pc, .wallet-effort-ahead')].map((d) => ({
      cls: d.className.replace(/\s*pl-line\s*/, '').trim(), text: norm(d.textContent),
    })),
    note: norm(box.querySelector('.wallet-counting-note').textContent),
    tint: ['wallet-zeros-now', 'wallet-zeros-soon'].filter((c) => box.classList.contains(c)),
    bg: box.style.backgroundColor,
    border: box.style.borderColor,
    seeClass: box.querySelector('.wallet-see-class') ? norm(box.querySelector('.wallet-see-class').textContent) : null,
    bonus: bonus.hidden ? null : [...bonus.children].map((n) => norm(n.textContent)),
  };
}

// Render one Desk state through both windows.
async function bothWindows(state, opts) {
  const off = await boot(false, state, opts);
  let classic;
  try {
    await openLedger(off);
    classic = system7(off.document);
    expect(off.document.getElementById('pico-ledger')).toBeNull();
  } finally {
    off.teardown();
  }
  const on = await boot(true, state, opts);
  await openLedger(on);
  return { classic, on };
}

describe('Pico My Grade: the same numbers as the System 7 ledger', { timeout: 180_000 }, () => {
  it('zeros now + soon + past due, official grade, effort lines, bonus: every value identical', async () => {
    const { classic, on } = await bothWindows(MIXED);
    try {
      const doc = on.document;
      const picoView = pico(doc);
      // The fixture really exercised every surface.
      expect(classic.rows.map((r) => r.colour)).toEqual(['now', 'now', 'soon', 'later']);
      expect(classic.rows.map((r) => r.schoology)).toEqual(['Schoology: 1.2 Follow-Along', 'Schoology: 1.3 Quiz', 'Schoology: 1.5 Blooket', 'Schoology: 1.6 Follow-Along']);
      expect(classic.estimate).toMatch(/^Today's estimate: 88% — /);
      expect(classic.gradeLabel).toBe('Official grade (same as Schoology)');
      expect(classic.drop).toBeTruthy();
      expect(classic.effort).toHaveLength(2);
      expect(classic.bonus).toHaveLength(3);
      expect(classic.status).toMatch(/^Q1 so far: 91\.2%\./);
      // Pico = System 7, field by field.
      expect(picoView).toEqual(classic);
      // And the Desk's own (hidden) paint in the Pico run agrees with both.
      expect(system7(doc)).toEqual(classic);
    } finally {
      on.teardown();
    }
  });

  it('nothing missing, no official grade: the plain "Grade" and the readiness tint match', async () => {
    const { classic, on } = await bothWindows(CALM);
    try {
      expect(classic.rows).toEqual([]);
      expect(classic.gradeLabel).toBe('Grade');
      expect(classic.estimate).toBeNull();
      const picoView = pico(on.document);
      expect(picoView).toEqual(classic);
      expect(on.document.getElementById('pico-ledger-status').hidden).toBe(true);
      expect(on.document.getElementById('pico-ledger-zero').hidden).toBe(true);
      expect(on.document.getElementById('pico-ledger-bonus').hidden).toBe(true);
    } finally {
      on.teardown();
    }
  });

  it('only "soon" rows: yellow frame, "Grade today", same drop sentence', async () => {
    const { classic, on } = await bothWindows(SOON_ONLY);
    try {
      expect(classic.frame).toBe('soon');
      expect(classic.gradeLabel).toBe('Grade today');
      expect(classic.tint).toEqual(['wallet-zeros-soon']);
      expect(pico(on.document)).toEqual(classic);
    } finally {
      on.teardown();
    }
  });

  it('teacher (view-as): no See the class, exactly as the Desk', async () => {
    const { classic, on } = await bothWindows(MIXED, { teacher: true });
    try {
      expect(classic.seeClass).toBeNull();
      expect(pico(on.document)).toEqual(classic);
    } finally {
      on.teardown();
    }
  });
});

describe('Pico My Grade: tiles, badges, panels and behaviour', { timeout: 120_000 }, () => {
  it('tiles carry the Do Now ZERO_TINT for red / yellow and the Desk grey for past due', async () => {
    const on = await boot(true, MIXED);
    try {
      await openLedger(on);
      const { document: doc, window: win } = on;
      const css = (value) => { const p = doc.createElement('div'); p.style.backgroundColor = value; return p.style.backgroundColor; };
      const tiles = [...doc.querySelectorAll('#pico-ledger-zero .pl-tile')];
      const want = { now: win.ZERO_TINT.now.bg, soon: win.ZERO_TINT.soon.bg, later: '#eee' };
      for (const tile of tiles) {
        expect(tile.style.backgroundColor, tile.getAttribute('data-key')).toBe(css(want[tile.getAttribute('data-zero')]));
      }
      // ZERO_TINT is still exactly what the Do Now CSS defines.
      expect(win.ZERO_TINT).toEqual({ soon: { bg: '#fff3b0', border: '#d9b400' }, now: { bg: '#f7c9c9', border: '#cc0000' } });
      // The Desk's own card and the drawn top of its balance card are hidden in its content.
      expect(doc.querySelector('#wallet-content .wallet-zero-card')).toBeTruthy();
      const rest = doc.querySelector('#wallet-content .pico-ledger-rest');
      expect(rest).toBeTruthy();
      expect(rest.querySelector('.wallet-counting-note').classList.contains('pico-ledger-drawn')).toBe(true);
      expect(doc.getElementById('pico-ledger-status').closest('.pico-frame')).toBeTruthy();
    } finally {
      on.teardown();
    }
  });

  it('the verb buttons are the Desk\'s own (same handler); "graph" falls back to the Snapshot app', async () => {
    const on = await boot(true, MIXED);
    try {
      await openLedger(on);
      const { document: doc, window: win } = on;
      const openLesson = vi.fn();
      const openQuiz = vi.fn();
      const openAssignment = vi.fn();
      win._zeroOpenLesson = openLesson;
      win._zeroOpenQuiz = openQuiz;
      win._snapOpenAssignment = openAssignment;
      const tile = (key) => doc.querySelector('#pico-ledger-zero .pl-tile[data-key="' + key + '"]');
      tile('1.2:worksheet').querySelector('.pl-verb').click();
      expect(openLesson).toHaveBeenCalledWith('1.2');
      tile('1.3:quiz').querySelector('.pl-verb').click();
      expect(openQuiz).toHaveBeenCalledWith('1.3');
      const see = tile('1.2:worksheet').querySelector('.wz-see');
      expect(see.disabled).toBe(true);   // no class picture loaded (same as the Desk)
      see.disabled = false;
      see.click();
      expect(openAssignment).toHaveBeenCalledWith('1.2', 'worksheet');
      expect(tile('1.6:worksheet:later').querySelector('.wz-see')).toBeNull();
    } finally {
      on.teardown();
    }
  });

  it('See the class opens the Desk\'s Snapshot app, in a Pico frame', async () => {
    const on = await boot(true, MIXED);
    try {
      await openLedger(on);
      const { document: doc } = on;
      doc.querySelector('#pico-ledger-balance .wallet-see-class').click();
      const snap = doc.getElementById('app-snapshot-overlay');
      await on.waitFor(() => snap.style.display === 'block', { message: 'Snapshot app did not open' });
      expect(snap.querySelector('.app-window').classList.contains('pico-win')).toBe(true);
    } finally {
      on.teardown();
    }
  });

  it('Esc closes My Grade', async () => {
    const on = await boot(true, MIXED);
    try {
      await openLedger(on);
      const { document: doc, window: win } = on;
      const overlay = doc.getElementById('app-wallet-overlay');
      expect(overlay.style.display).toBe('block');
      (doc.activeElement || doc.body).dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(overlay.style.display).toBe('none');
    } finally {
      on.teardown();
    }
  });

  it('a grade poll with the same rows keeps the tiles (focus stays) and refreshes the status line', async () => {
    const on = await boot(true, MIXED);
    try {
      await openLedger(on);
      const { document: doc, window: win } = on;
      const first = doc.querySelector('#pico-ledger-zero .pl-tile');
      first.querySelector('.pl-verb').focus();
      win._officialGradeCache = { ...MIXED.official, grade: 92.6 };
      win._walletRefreshZeroCard();
      expect(doc.querySelector('#pico-ledger-zero .pl-tile')).toBe(first);
      expect(doc.activeElement).toBe(first.querySelector('.pl-verb'));
      expect(doc.getElementById('pico-ledger-status').textContent).toMatch(/^Q1 so far: 92\.6%\./);
      expect(doc.getElementById('pico-ledger-status').textContent)
        .toBe(doc.querySelector('#wallet-content .wallet-zero-card .wz-status').textContent);
    } finally {
      on.teardown();
    }
  });

  it('the Pico-built parts carry no System 7 classes, fonts or inline handlers', async () => {
    const on = await boot(true, MIXED);
    try {
      await openLedger(on);
      const { document: doc } = on;
      const SYSTEM7 = /^(s7|chicago|geneva|dialog-|title-bar|game-title-bar|close-box|wallet-zero-card)/;
      const roots = [doc.getElementById('pico-ledger-status'), doc.getElementById('pico-ledger')];
      for (const root of roots) {
        for (const node of [root, ...root.querySelectorAll('*')]) {
          if (node.closest('.snap-alist')) continue;   // the Desk's own score list, attached by _zeroCardAttachScores
          for (const cls of node.classList) expect(cls, cls).not.toMatch(SYSTEM7);
          expect(node.getAttribute('style') || '').not.toMatch(/chicago|geneva/i);
          expect(node.hasAttribute('onclick'), 'inline onclick').toBe(false);
        }
      }
    } finally {
      on.teardown();
    }
  });

  it('flag off: the System 7 window has no Pico ledger and keeps its own layout', async () => {
    const off = await boot(false, MIXED);
    try {
      await openLedger(off);
      const { document: doc } = off;
      expect(doc.getElementById('pico-ledger')).toBeNull();
      expect(doc.getElementById('pico-ledger-status')).toBeNull();
      expect(doc.getElementById('wallet-content').parentElement.classList.contains('app-window')).toBe(true);
      expect(doc.querySelector('#wallet-content .pico-ledger-drawn, #wallet-content .pico-ledger-rest')).toBeNull();
    } finally {
      off.teardown();
    }
  });
});
