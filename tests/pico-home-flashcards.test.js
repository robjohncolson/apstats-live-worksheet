// @vitest-environment node
/**
 * tests/pico-home-flashcards.test.js
 *
 * Pico Desk: the flashcard decks in the Pico style (teacher 2026-10-10: "also refactor the
 * flashcards!!!"). The Desk's own deck window (#bf-overlay) runs the timed deck, its finish screen
 * and the Review deck; with the flag on pico-home.js only restyles it and adds two read-only
 * pieces (the "n / N" counter and the timer bar). These tests run the SAME deck through both
 * skins (same clock, same random seed, same answers) on the real Desk and assert that the card
 * sequence, the choice order, the timer, the feedback, the recap and outcome text, the actions,
 * the keys, and every call to the log / grade / sync functions are identical.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootDesk, DESK_URL } from './journeys/harness.js';

const NOW = '2026-08-18T12:00:00.000Z';
const NOW_MS = new Date(NOW).getTime();
const OPEN_AT = NOW_MS + 30_000;   // both boots open the deck at this exact fake time
const TOPIC = '1.1';
const CSV_FILE = 'u1_l1_blooket.csv';
const DECK_SECONDS = 40;           // BLOOKET_FULLDECK_SECONDS (checked against the Desk below)

const SPIED = ['_srsAppendLog', '_blooketCommit', '_studentMarkSave', '_blooketPatchGradeCache',
  '_walletRefreshZeroCard', '_srsSyncViaTrainerState', '_srsSyncPull', 'closeBlooketFlashcards'];

function gradeFixture() {
  return {
    ok: true, asOf: NOW, units: [],
    quarters: { Q1: { quarterGrade: 90, ceiling: 100, pcAvg: 88, workAvg: 90, lessonsDue: 1, lessonsGraded: 1, lessonsTotal: 10 } },
    completion: {},
    lessons: [{ lessonKey: TOPIC, Cws: 40, blooket: 50, quizTotal: 0, items: { quiz: [] } }],
    gradebook: {},
  };
}

// Same parser as tests/journeys/j5-timed-deck.journey.test.js (question → correct answer).
function parseDeck(text) {
  const rows = [];
  let cell = '';
  let row = [];
  let inQuote = false;
  const normalized = String(text).replace(/\r\n/g, '\n');
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuote && normalized[i + 1] === '"') { cell += '"'; i += 1; } else { inQuote = !inQuote; }
      continue;
    }
    if (ch === ',' && !inQuote) { row.push(cell); cell = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !inQuote) {
      row.push(cell);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      cell = '';
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.flatMap((columns) => {
    const qnum = Number.parseInt(String(columns[0] || '').trim(), 10);
    const question = String(columns[1] || '').trim();
    const choices = columns.slice(2, 6).map((c) => String(c || '').trim()).filter(Boolean);
    let correctIdx = Number.parseInt(String(columns[7] || '1').trim(), 10) - 1;
    if (!Number.isFinite(qnum) || !question || choices.length < 2) return [];
    if (correctIdx < 0 || correctIdx >= choices.length) correctIdx = 0;
    return [{ qnum, q: question, choices, correctIdx }];
  });
}
const DECK = parseDeck(readFileSync(resolve(__dirname, '..', CSV_FILE), 'utf8'));
const BY_QUESTION = new Map(DECK.map((card) => [card.q, card]));

// A fixed PRNG installed right before the deck opens, in both boots.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let v = s;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

// Plain-data copy of a spied call's arguments (DOM nodes and functions dropped).
function plain(value) {
  return JSON.parse(JSON.stringify(value, (key, v) => {
    if (v && typeof v === 'object' && typeof v.nodeType === 'number') return '[node]';
    if (typeof v === 'function') return '[fn]';
    return v;
  }) ?? 'null');
}

function installSpies(win) {
  const calls = [];
  for (const name of SPIED) {
    const original = win[name];
    if (typeof original !== 'function') continue;
    win[name] = function () {
      calls.push({ name, args: plain([...arguments]) });
      return original.apply(this, arguments);
    };
  }
  return calls;
}

async function boot(flagOn) {
  const harness = await bootDesk({
    now: NOW,
    fakeTimers: true,
    url: DESK_URL + (flagOn ? '?home=park' : ''),
    roster: { grades: gradeFixture() },
  });
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter'),
    { message: 'signed-in identity chip did not render' });
  for (const name of ['closeDialog', 'closeNameFinder', 'closeSignInModal', 'closeDoNowBump']) {
    try { if (typeof harness.window[name] === 'function') harness.window[name](); } catch (_) {}
  }
  await harness.flush(4);
  expect(harness.clock.now(), 'boot took longer than the shared open time').toBeLessThan(OPEN_AT);
  harness.clock.advance(OPEN_AT - harness.clock.now());
  await harness.flush(2);
  return harness;
}

// Flush (never advancing the fake clock) until `predicate` holds.
async function settle(harness, predicate, message) {
  for (let i = 0; i < 400; i += 1) {
    if (predicate()) return;
    await harness.flush(1);
  }
  throw new Error(message);
}

function key(win, target, k) {
  target.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

function inDeck(doc) {
  const active = doc.activeElement;
  return Boolean(active && active !== doc.body && doc.getElementById('bf-overlay').contains(active));
}

// What a student sees of the deck (Desk ids only: identical in both skins).
function deskView(doc) {
  const text = (id) => doc.getElementById(id).textContent;
  return {
    header: doc.getElementById('bf-header').textContent,
    note: text('bf-note'),
    question: text('bf-question'),
    choices: [...doc.querySelectorAll('#bf-choices .bf-choice')].map((b) => [b.textContent, b.dataset.i, b.disabled, b.className]),
    progress: text('bf-progress'),
    timer: [text('bf-timer'), doc.getElementById('bf-timer').style.display, doc.getElementById('bf-timer').style.color],
    feedback: text('bf-feedback'),
    result: [doc.getElementById('bf-result').style.display, text('bf-result')],
    actions: [...doc.querySelectorAll('#bf-actions button')].map((b) => [b.id, b.textContent, b.style.display]),
    // Focus inside the deck is the Desk's. Once the deck closes, the Pico frame returns focus to
    // its opener (Phase 3, tests/pico-home-phase3.test.js), so only "outside" is compared.
    focus: inDeck(doc) ? (doc.activeElement.id || doc.activeElement.textContent) : 'outside the deck',
  };
}

// The Pico additions (flag on): counter and timer bar, checked against the Desk's own state.
function picoView(win, doc) {
  const count = doc.getElementById('pico-fc-count');
  const bar = doc.getElementById('pico-fc-time');
  if (!count) return null;
  return {
    count: count.hidden ? null : count.textContent,
    bar: bar.hidden ? null : [bar.firstChild.style.width, bar.classList.contains('is-low')],
  };
}

function expectedPico(win, doc) {
  const ft = win._ftState;
  const rv = win._rvState;
  let count = null;
  if (rv && rv.current && ['answer', 'rate', 'saving'].includes(rv.stage)) {
    const at = rv.ratings + 1;
    count = at + ' / ' + Math.min(20, at + rv.queue.length);
  } else if (ft && ft.round && ft.round.order.length) {
    count = (ft.round.total - ft.round.order.length) + ' / ' + ft.round.total;
  }
  const timer = doc.getElementById('bf-timer');
  let bar = null;
  if (ft && ft.round && timer.style.display !== 'none') {
    const left = Math.max(0, Math.min(DECK_SECONDS, ft.remaining));
    bar = [(left / DECK_SECONDS) * 100 + '%', left <= 10];
  }
  return { count, bar };
}

function correctButton(doc) {
  const card = BY_QUESTION.get(doc.getElementById('bf-question').textContent.trim());
  if (!card) throw new Error('question not in the CSV: ' + doc.getElementById('bf-question').textContent);
  const buttons = [...doc.querySelectorAll('#bf-choices .bf-choice')];
  const index = buttons.findIndex((b) => Number(b.dataset.i) === card.correctIdx);
  return { card, buttons, index };
}

// One full timed run + finish + Done, then a Review session; returns everything observed.
async function runDecks(flagOn) {
  const harness = await boot(flagOn);
  const { window: win, document: doc } = harness;
  const frames = [];
  const snap = async (label) => {
    await harness.flush(1);   // let the Pico observer repaint (no clock movement)
    const frame = { label, desk: deskView(doc) };
    if (flagOn) {
      frame.pico = picoView(win, doc);
      expect(frame.pico, label).toEqual(expectedPico(win, doc));
    }
    frames.push(frame);
  };
  try {
    expect(win.eval('BLOOKET_FULLDECK_SECONDS')).toBe(DECK_SECONDS);
    const calls = installSpies(win);
    const ledgerBefore = harness.roster.state.requests.length;
    win.Math.random = seeded(0xfc0a5eed);

    // ── Timed deck ──
    win.openBlooketFlashcards(null, TOPIC);
    await settle(harness, () => doc.querySelector('#bf-choices .bf-choice:not(:disabled)'), 'timed deck did not open');
    await snap('open');

    for (let step = 0; step < DECK.length + 4; step += 1) {
      if (doc.getElementById('bf-result').style.display === 'block') break;
      const { card, buttons, index } = correctButton(doc);
      if (step === 0) {
        // Miss: a wrong choice, by pointer.
        buttons.find((b) => Number(b.dataset.i) !== card.correctIdx).click();
      } else if (step === 1) {
        // Timeout: the clock runs out (sampled at 9 s, inside the Desk's red zone).
        harness.clock.advance(31_000);
        await snap('step 1 at 9s');
        harness.clock.advance(9_000);
      } else if (step === 2) {
        // Keyboard: the letter of the correct choice, 3 s into the card.
        harness.clock.advance(3_000);
        await snap('step 2 at 37s');
        key(win, doc.activeElement || doc, 'abcd'[index]);
      } else {
        buttons[index].click();
      }
      await snap('step ' + step + ' answered');
      harness.clock.advance(800);   // the Desk's auto-advance beat
      await settle(harness, () => doc.getElementById('bf-result').style.display === 'block'
        || doc.querySelector('#bf-choices .bf-choice:not(:disabled)'), 'deck did not advance after step ' + step);
      await snap('step ' + step + ' next');
    }
    await settle(harness, () => doc.querySelector('#bf-result .bf-outcome') && doc.getElementById('bf-done'), 'no outcome line');
    await settle(harness, () => harness.roster.state.inflight === 0, 'roster did not settle');
    await snap('finish');
    const ledger = harness.roster.state.requests.slice(ledgerBefore)
      .filter((r) => r.method === 'POST' && r.path === '/ledger/record').map((r) => r.body);
    doc.getElementById('bf-done').click();
    await snap('after Done');
    const timedOverlayClosed = doc.getElementById('bf-overlay').style.display === 'none';

    // ── Review deck (the Review icon's practice deck: same _rv* screens) ──
    win._rvStart(null, TOPIC);
    await settle(harness, () => doc.querySelector('#bf-choices .bf-choice:not(:disabled)'), 'review did not open');
    await snap('review open');
    for (let step = 0; step < 6; step += 1) {
      if (doc.getElementById('bf-result').style.display === 'block') break;
      // Review lists the choices in card order: 1-4 answers by the card's own index.
      const { card } = correctButton(doc);
      key(win, doc.activeElement || doc, String(card.correctIdx + 1));
      await snap('review ' + step + ' rate');
      key(win, doc.activeElement || doc, '1');                 // 1 = the first rate button
      await snap('review ' + step + ' rated');
    }
    // Esc closes it (the Desk's modal rule), in both skins.
    key(win, doc.activeElement || doc, 'Escape');
    await snap('review after Esc');
    const reviewOverlayClosed = doc.getElementById('bf-overlay').style.display === 'none';

    const srsStorage = Object.keys(win.localStorage).filter((k) => /srs|fc|blooket|desk_marks/i.test(k)).sort()
      .map((k) => [k, win.localStorage.getItem(k)]);
    return { frames, calls, ledger, timedOverlayClosed, reviewOverlayClosed, srsStorage };
  } finally {
    harness.teardown();
  }
}

describe('Pico flashcards: one deck through both skins', { timeout: 180_000 }, () => {
  it('same cards, order, timer, feedback, outcome text, keys and store / grade / sync calls', async () => {
    const classic = await runDecks(false);
    const pico = await runDecks(true);

    // The run did what it set out to do (so the comparison is not of two empty runs).
    const finish = classic.frames.find((f) => f.label === 'finish').desk;
    expect(finish.result[1]).toMatch(/You scored [\d.]+% on the full timed deck\./);
    expect(finish.result[1]).toContain('Saved to your grade');
    expect(finish.actions).toEqual([['bf-done', 'Done', '']]);
    expect(classic.frames.find((f) => f.label === 'step 1 at 9s').desk.timer[0]).toBe('⏱ 9s');
    expect(classic.frames.find((f) => f.label === 'step 0 answered').desk.feedback).toMatch(/Not quite/);
    expect(classic.frames.find((f) => f.label === 'step 1 answered').desk.feedback).toMatch(/Too slow/);
    expect(classic.frames.find((f) => f.label === 'step 2 answered').desk.feedback).toBe('✓ Correct');
    expect(classic.ledger).toHaveLength(1);
    expect(classic.calls.filter((c) => c.name === '_blooketCommit')).toHaveLength(1);
    expect(classic.calls.filter((c) => c.name === '_srsAppendLog').length).toBeGreaterThan(1);
    expect(classic.frames.some((f) => f.label.startsWith('review') && /Good|Again/.test(f.desk.actions.map((a) => a[1]).join()))).toBe(true);
    expect(classic.timedOverlayClosed).toBe(true);
    expect(classic.reviewOverlayClosed).toBe(true);

    // Parity: every observed screen, call and write is identical.
    expect(pico.frames.map((f) => f.label)).toEqual(classic.frames.map((f) => f.label));
    pico.frames.forEach((frame, i) => expect(frame.desk, frame.label).toEqual(classic.frames[i].desk));
    expect(pico.calls).toEqual(classic.calls);
    expect(pico.ledger).toEqual(classic.ledger);
    expect(pico.srsStorage).toEqual(classic.srsStorage);
    expect(pico.timedOverlayClosed).toBe(true);
    expect(pico.reviewOverlayClosed).toBe(true);

    // The Pico counter and bar were shown while the deck ran and gone on the finish screen.
    const at = (label) => pico.frames.find((f) => f.label === label).pico;
    expect(at('open').count).toBe('0 / ' + DECK.length);
    expect(at('open').bar).toEqual(['100%', false]);
    expect(at('step 1 at 9s').bar).toEqual([(9 / DECK_SECONDS) * 100 + '%', true]);
    expect(at('step 2 at 37s').bar).toEqual([(37 / DECK_SECONDS) * 100 + '%', false]);
    expect(at('finish')).toEqual({ count: null, bar: null });
    expect(at('review open').count).toMatch(/^1 \/ \d+$/);
    expect(at('review open').bar).toBe(null);
  });
});

describe('Pico flashcards: the skin', { timeout: 120_000 }, () => {
  it('flag on: the deck sits in the Pico frame with the counter and bar before the Desk timer; ✕ = closeBlooketFlashcards', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      const box = doc.querySelector('#bf-overlay .dialog-box');
      expect(box.classList.contains('pico-win')).toBe(true);
      const timer = doc.getElementById('bf-timer');
      expect(timer.previousElementSibling.id).toBe('pico-fc-time');
      expect(timer.previousElementSibling.previousElementSibling.id).toBe('pico-fc-count');
      expect(doc.getElementById('pico-fc-time').getAttribute('aria-hidden')).toBe('true');
      const css = doc.getElementById('pico-home-style').textContent;
      expect(css).toContain('html.pico-home #bf-overlay .bf-modal-header { display: none !important; }');
      expect(css).toMatch(/html\.pico-home #bf-overlay \.bf-choice\.bf-correct \{ --frame-colour: #3DA35D; \}/);
      win.openBlooketFlashcards(null, TOPIC);
      await settle(harness, () => doc.querySelector('#bf-choices .bf-choice:not(:disabled)'), 'timed deck did not open');
      await harness.flush(1);
      expect(box.querySelector('[data-pico-bar]').textContent).toBe(doc.getElementById('bf-header').textContent);
      const original = win.closeBlooketFlashcards;
      let closed = 0;
      win.closeBlooketFlashcards = function () { closed += 1; return original.apply(this, arguments); };
      try {
        box.querySelector('[data-pico-close]').click();
      } finally {
        win.closeBlooketFlashcards = original;
      }
      expect(closed).toBe(1);
      expect(doc.getElementById('bf-overlay').style.display).toBe('none');
      await harness.flush(1);
      expect(doc.getElementById('pico-fc-count').hidden).toBe(true);
      expect(doc.getElementById('pico-fc-time').hidden).toBe(true);
    } finally {
      harness.teardown();
    }
  });

  it('flag off: no Pico node or style in the deck window', async () => {
    const harness = await boot(false);
    try {
      const doc = harness.document;
      expect(doc.getElementById('pico-fc-count')).toBe(null);
      expect(doc.getElementById('pico-fc-time')).toBe(null);
      expect(doc.getElementById('pico-home-style')).toBe(null);
      expect(doc.querySelector('#bf-overlay .pico-win')).toBe(null);
    } finally {
      harness.teardown();
    }
  });
});
