// desk-timed-deck.test.js — the full timed-deck flashcard mode (a rigorous
// Blooket substitute): credit ladder (miss = −⅓, re-queue, 3 strikes = 0/removed),
// deck score = Σ credit / total, "review your misses" recap, per-card logging,
// colored score chip, best-wins commit. The credit/queue logic is pure (_ft*)
// and executed for real here; the rest is static-parsed.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { deskSource, deskHtml } from './helpers/desk-source.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'ap_stats_roadmap_square_mode.html');
const DESK = existsSync(deskPath) ? deskSource() + '\n' + deskHtml() : null;

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

// Pull the pure round functions out of the source and run them for real.
function loadFt() {
  const names = ['_ftCreateRound', '_ftCurrentIdx', '_ftRecordOutcome', '_ftScore', '_ftMisses', '_ftDone'];
  const src = names.map((n) => fnBody(DESK, n)).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(src + '\nreturn {' + names.map((n) => n + ':' + n).join(',') + '};')();
}
function deck3() {
  return [
    { qnum: 1, q: 'A?', choices: ['a', 'b'], correctIdx: 0 },
    { qnum: 2, q: 'B?', choices: ['a', 'b'], correctIdx: 0 },
    { qnum: 3, q: 'C?', choices: ['a', 'b'], correctIdx: 0 }
  ];
}

describe('Timed deck — pure credit/queue logic', () => {
  it('00: Desk file loads', () => { expect(DESK).toBeTypeOf('string'); });

  it('01: all correct on the first try → 100%, no misses', () => {
    const ft = loadFt();
    let r = ft._ftCreateRound(deck3());
    while (!ft._ftDone(r)) ft._ftRecordOutcome(r, 'correct', 1000);
    expect(ft._ftScore(r)).toBeCloseTo(100, 6);
    expect(ft._ftMisses(r)).toEqual([]);
  });

  it('02: a miss costs ⅓ and RE-QUEUES the card (does not drop it)', () => {
    const ft = loadFt();
    let r = ft._ftCreateRound(deck3());        // order [0,1,2]
    const front = ft._ftCurrentIdx(r);         // 0
    ft._ftRecordOutcome(r, 'wrong', 500);
    // card 0 left the front and went to the back; still 3 cards in play
    expect(r.order.length).toBe(3);
    expect(r.order[r.order.length - 1]).toBe(front);
    expect(r.order[0]).not.toBe(front);
    expect(r.status[front].misses).toBe(1);
    expect(r.status[front].resolved).toBe(false);
  });

  it('03: correct after 1 miss earns ⅔; after 2 misses earns ⅓', () => {
    const ft = loadFt();
    // One card, miss it twice then get it right → earns 1/3.
    const one = [{ qnum: 7, q: 'Q', choices: ['a', 'b'], correctIdx: 0 }];
    let r = ft._ftCreateRound(one);
    ft._ftRecordOutcome(r, 'wrong', 100);    // miss 1 → re-queue
    ft._ftRecordOutcome(r, 'timeout', 100);  // miss 2 (timeout counts) → re-queue
    ft._ftRecordOutcome(r, 'correct', 100);  // correct → earns 1 - 2/3 = 1/3
    expect(ft._ftScore(r)).toBeCloseTo(33.333, 2);
    expect(r.status[0].earned).toBeCloseTo(1 / 3, 6);
  });

  it('04: 3 misses → 0 credit AND removed from the round (not re-queued)', () => {
    const ft = loadFt();
    const one = [{ qnum: 9, q: 'Q', choices: ['a', 'b'], correctIdx: 0 }];
    let r = ft._ftCreateRound(one);
    ft._ftRecordOutcome(r, 'wrong', 100);
    ft._ftRecordOutcome(r, 'wrong', 100);
    ft._ftRecordOutcome(r, 'wrong', 100);    // 3rd miss → struck out
    expect(ft._ftDone(r)).toBe(true);         // removed, round over
    expect(r.status[0].earned).toBe(0);
    expect(ft._ftScore(r)).toBe(0);
    const misses = ft._ftMisses(r);
    expect(misses).toHaveLength(1);
    expect(misses[0].struck).toBe(true);
    expect(misses[0].correctAnswer).toBe('a');
  });

  it('05: deck score = Σ earned / total (mixed outcomes)', () => {
    const ft = loadFt();
    let r = ft._ftCreateRound(deck3());
    // card 1 (front) wrong once then later correct (⅔); cards 2,3 correct (1 each)
    ft._ftRecordOutcome(r, 'wrong', 100);     // card1 → re-queue; order [1,2,0]
    ft._ftRecordOutcome(r, 'correct', 100);   // card2 → 1
    ft._ftRecordOutcome(r, 'correct', 100);   // card3 → 1
    ft._ftRecordOutcome(r, 'correct', 100);   // card1 → ⅔
    expect(ft._ftDone(r)).toBe(true);
    // (2/3 + 1 + 1) / 3 * 100 = 88.888…
    expect(ft._ftScore(r)).toBeCloseTo(88.889, 2);
    const misses = ft._ftMisses(r);
    expect(misses).toHaveLength(1);
    expect(misses[0].struck).toBe(false);
    expect(misses[0].earned).toBeCloseTo(2 / 3, 6);
  });

  it('06: every answer is logged with the SRS shape {qnum,correct,latencyMs,wasTimeout,missIndex}', () => {
    const ft = loadFt();
    const one = [{ qnum: 5, q: 'Q', choices: ['a', 'b'], correctIdx: 0 }];
    let r = ft._ftCreateRound(one);
    ft._ftRecordOutcome(r, 'timeout', 40000);
    ft._ftRecordOutcome(r, 'correct', 1200);
    expect(r.log).toHaveLength(2);
    expect(r.log[0]).toMatchObject({ qnum: 5, correct: false, wasTimeout: true, latencyMs: 40000, missIndex: 0 });
    expect(r.log[1]).toMatchObject({ qnum: 5, correct: true, wasTimeout: false, latencyMs: 1200, missIndex: 1 });
  });

  it('07: empty deck → score 0, done immediately', () => {
    const ft = loadFt();
    const r = ft._ftCreateRound([]);
    expect(ft._ftDone(r)).toBe(true);
    expect(ft._ftScore(r)).toBe(0);
  });
});

describe('Timed deck — UI wiring (static parse)', () => {
  it('10: BLOOKET_FULLDECK_SECONDS is 40', () => {
    expect(DESK).toMatch(/const\s+BLOOKET_FULLDECK_SECONDS\s*=\s*40/);
  });

  it('11: the mode picker is gone — no function, no Quick check offer anywhere', () => {
    expect(DESK).not.toMatch(/function\s+_bfShowModePicker\s*\(/);
    expect(DESK).not.toMatch(/_bfShowModePicker\s*\(/);
    expect(DESK).not.toMatch(/modeBtn\s*\(/);
    expect(fnBody(DESK, '_ftStart')).toMatch(/bf-overlay['"]\)\.style\.display\s*=\s*['"]block['"]/);
  });

  it('12: openBlooketFlashcards goes straight to the timed deck and states the credit rule', () => {
    const body = fnBody(DESK, 'openBlooketFlashcards');
    expect(body).toMatch(/_ftStart\s*\(\s*btn\s*,\s*topicId\s*\)/);
    expect(body).not.toMatch(/_bfStartQuick|_bfShowModePicker/);
    // FLASHCARD_DECK_SLICES_SPEC.md D5: the note also names a sliced deck's day.
    expect(fnBody(DESK, '_ftStart')).toMatch(/_bfCreditNote\(topicId,\s*_ftState\.perDay\)/);
    expect(fnBody(DESK, '_bfCreditNote')).toMatch(/your Blooket grade[\s\S]*point for point[\s\S]*100%[\s\S]*Your best so far/);
  });

  // Re-pinned 2026-11-07 (Codex review, defect 1): the tick reads the seconds off the card's
  // wall-clock deadline instead of counting a number down, so no resume can restart the clock.
  it('13: the timer ticks every second, reads the deadline, and times out the card at 0', () => {
    const start = fnBody(DESK, '_ftStartTimer');
    expect(start).toMatch(/BLOOKET_FULLDECK_SECONDS/);
    expect(start).toMatch(/setInterval/);
    expect(start).toMatch(/_ftState\.remaining\s*=\s*_ftSecondsLeft\(\)/);
    expect(start).not.toMatch(/_ftState\.remaining\s*-=/);
    expect(start).toMatch(/_ftHandle\(\s*['"]timeout['"]\s*\)/);
    expect(fnBody(DESK, '_ftSecondsLeft')).toMatch(/_ftState\.cardStartMs \+ BLOOKET_FULLDECK_SECONDS \* 1000 - Date\.now\(\)/);
    expect(fnBody(DESK, '_ftSecondsLeft')).toMatch(/Math\.max\(0, Math\.ceil\(msLeft \/ 1000\)\)/);
    expect(fnBody(DESK, '_ftClearTimer')).toMatch(/clearInterval/);
  });

  it('14: a miss is NOT revealed (re-queue stays honest) + auto-advances', () => {
    const body = fnBody(DESK, '_ftHandle');
    // Feedback says "comes back" / "too slow" — never prints the correct choice text.
    expect(body).toMatch(/come back/);
    expect(body).toMatch(/Too slow/);
    expect(body).toMatch(/_ftRecordOutcome/);
    expect(body).toMatch(/setTimeout\([^,]*_ftRenderCard/);
    // It must not reveal card.choices[card.correctIdx] during the round.
    expect(body).not.toMatch(/choices\[[^\]]*correctIdx\]/);
  });

  it('15: the recap shows "review your misses" with the correct answers', () => {
    const body = fnBody(DESK, '_ftRenderRecap');
    expect(body).toMatch(/Review your misses/i);
    expect(body).toMatch(/correctAnswer/);
    expect(body).toMatch(/_ftMisses/);
  });

  it('16: per-card log persists to localStorage apstats_srs_log_<email>', () => {
    const body = fnBody(DESK, '_ftLogToStore');
    expect(body).toMatch(/_srsAppendLog\s*\(/);
    expect(body).toMatch(/qnum/);
    expect(body).toMatch(/latencyMs/);
    expect(body).toMatch(/wasTimeout/);
    const appendBody = fnBody(DESK, '_srsAppendLog');
    expect(appendBody).toMatch(/apstats_srs_log_/);
    expect(appendBody).toMatch(/getStudentEmail/);
  });

  // moved to journeys/j5-timed-deck.journey.test.js — J5 Full timed deck rejects a lower re-run and posts one higher best (supersedes desk-timed-deck it 17 “_ftFinish logs, recaps, and commits the score (best-wins)” and it 24 “_blooketCommit only saves a NEW best + refreshes /grade BEFORE the floor”)

  // Re-pinned 2026-11-07 (FLASHCARD_DECK_SLICES_SPEC.md D1): the deck is no longer every
  // card of the CSV but a fresh sample of at most 30 from the topic's pool.
  it('18: _ftStart deals at most 30 from the pool (no top-10 trim) and attaches its own keydown', () => {
    const body = fnBody(DESK, '_ftStart');
    expect(body).not.toMatch(/_bfSelectTop10/);
    expect(DESK).toMatch(/const\s+BLOOKET_DECK_CARDS\s*=\s*30;/);
    expect(body).toMatch(/_ftCardsInRanges\(allCards,\s*ranges\)/);
    expect(body).toMatch(/_ftCreateRound\(_ftDealDeck\(pool,\s*BLOOKET_DECK_CARDS,\s*_bfShuffle\)\)/);
    expect(body).toMatch(/addEventListener\s*\(\s*['"]keydown['"]\s*,\s*_ftKeydownHandler/);
  });

  it('19: _bfCloseUI tears down the timed-deck timer + state too (no leak)', () => {
    const body = fnBody(DESK, '_bfCloseUI');
    expect(body).toMatch(/_ftClearTimer\s*\(\s*\)/);
    expect(body).toMatch(/removeEventListener\s*\(\s*['"]keydown['"]\s*,\s*_ftKeydownHandler\s*\)/);
    expect(body).toMatch(/_ftState\.round\s*=\s*null/);
  });
});

describe('Score color thresholds (executed) + one chip per row', () => {
  function colorFn() {
    // eslint-disable-next-line no-new-func
    return new Function('return (' + fnBody(DESK, '_scoreColor') + ');')();
  }
  it('20: below gate → red; gate..99 → amber; 100 → green; null → null', () => {
    const col = colorFn();
    expect(col(50, 80)).toBe('#B03A2E');   // red — below the 80% gate
    expect(col(85, 80)).toBe('#b8860b');   // amber — passing, not perfect
    expect(col(100, 80)).toBe('#25663F');  // green — perfected
    expect(col(null, 80)).toBe(null);      // no score
    expect(col(40, 40)).toBe('#b8860b');   // exactly at the gate → amber, not red
  });
  it('21: _scoreChip (Blooket inline) renders the colored rounded percentage', () => {
    // eslint-disable-next-line no-new-func
    const fn = new Function(fnBody(DESK, '_scoreColor') + '\nreturn (' + fnBody(DESK, '_scoreChip') + ');')();
    expect(fn(86.7, 80)).toMatch(/>87%<\/span>/);
    expect(fn(50, 80)).toMatch(/#B03A2E/);
    expect(fn(null, 80)).toBe('');
  });
  it('22: both chip renderers color via the shared _scoreColor (single source)', () => {
    expect(fnBody(DESK, '_scoreChip')).toMatch(/_scoreColor/);
    const idx = DESK.indexOf('var _mkGradeChip');
    expect(DESK.slice(idx, idx + 700)).toMatch(/_scoreColor/);
  });
  it('23: NO duplicate chip — worksheet/quiz rows have no inline _scoreChip (only Blooket does)', () => {
    const body = fnBody(DESK, 'showResourcePanel');
    expect(body).toMatch(/_scoreChip\(\s*_blScore\s*,\s*80\s*\)/);     // blooket inline chip
    expect(body, 'worksheet must not also add an inline _scoreChip').not.toMatch(/_scoreChip\([^)]*_getCwsForTopic/);
    // the persistent _mkGradeChip block colors worksheet/quiz against their gates
    // 2026-09-11: the worksheet chip now DISPLAYS the Follow-Along grade (what Schoology shows)
    // and keeps Cws as the completion floor — still colored against the worksheet gate.
    expect(DESK).toMatch(/_mkGradeChip\(_faDetail \? _faDetail\.grade : _faCws, DESK_WORKSHEET_DONE_THRESHOLD, _faDetail\)/);
    expect(DESK).toMatch(/_faCws = _getCwsForTopic\(slot\.getAttribute\('data-topic'\)\)/);
    expect(DESK).toMatch(/scorePct : null, DESK_QUIZ_DONE_THRESHOLD/);
  });
});

// 'Best-wins commit (re-practice never lowers the grade)' its 17 and 24 moved to
// journeys/j5-timed-deck.journey.test.js — J5 Full timed deck rejects a lower re-run
// and posts one higher best.

describe('Review folds — null-round crash guard + cancellable advance', () => {
  it('25: _ftFinish bails on a null round (closed mid auto-advance)', () => {
    const body = fnBody(DESK, '_ftFinish');
    expect(body).toMatch(/if\s*\(\s*!round\s*\)\s*return/);
  });
  it('26: the 800ms auto-advance is cancellable (stored id, cleared on teardown)', () => {
    expect(fnBody(DESK, '_ftHandle')).toMatch(/_ftState\.advanceId\s*=\s*setTimeout/);
    expect(fnBody(DESK, '_ftClearTimer')).toMatch(/clearTimeout\(\s*_ftState\.advanceId\s*\)/);
    expect(DESK).toMatch(/advanceId:\s*null/);   // initialized on _ftState
  });
});

// ── 30-card sittings, per-day slices, save & resume (FLASHCARD_DECK_SLICES_SPEC.md) ──
const SLICES_JSON = readFileSync(resolve(repo, 'data/blooket-deck-slices.json'), 'utf8');
const SLICES = JSON.parse(SLICES_JSON).slices;

function loadDeckHelpers() {
  const names = ['_ftSliceRanges', '_ftCardsInRanges', '_ftDealDeck', '_ftResumeRemaining', '_ftSavedRoundOk', '_ftCreateRound'];
  const src = names.map((n) => fnBody(DESK, n)).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(src + '\nreturn {' + names.map((n) => n + ':' + n).join(',') + '};')();
}
function numberedCards(n) {
  return Array.from({ length: n }, (_, i) => ({ qnum: i + 1, q: 'Q' + (i + 1), choices: ['a', 'b'], correctIdx: 0 }));
}
const reverse = (cards) => cards.slice().reverse();

describe('Timed deck — sittings and slices (pure helpers, executed)', () => {
  it('40: BLOOKET_DECK_CARDS is 30 and a saved run lasts 14 days', () => {
    expect(DESK).toMatch(/const\s+BLOOKET_DECK_CARDS\s*=\s*30;/);
    expect(DESK).toMatch(/const\s+BLOOKET_RESUME_MAX_AGE_MS\s*=\s*14 \* 24 \* 60 \* 60 \* 1000;/);
  });

  it('41: _ftDealDeck deals a fresh sample of at most max cards; a pool of max or fewer is dealt whole', () => {
    const h = loadDeckHelpers();
    const pool = numberedCards(44);
    const dealt = h._ftDealDeck(pool, 30, reverse);
    expect(dealt).toHaveLength(30);
    expect(dealt.map((c) => c.qnum)).toEqual(Array.from({ length: 30 }, (_, i) => 44 - i));   // shuffle first, then take 30
    expect(new Set(dealt.map((c) => c.qnum)).size).toBe(30);
    expect(pool.map((c) => c.qnum)).toEqual(Array.from({ length: 44 }, (_, i) => i + 1));    // the pool is not mutated
    const small = numberedCards(25);
    const whole = h._ftDealDeck(small, 30, reverse);
    expect(whole).toHaveLength(25);
    expect(whole.map((c) => c.qnum).sort((a, b) => a - b)).toEqual(small.map((c) => c.qnum));
    expect(h._ftDealDeck(numberedCards(30), 30, reverse)).toHaveLength(30);
  });

  it('42: _ftCardsInRanges keeps inclusive ranges with gaps; no ranges or no match keeps every card', () => {
    const h = loadDeckHelpers();
    const cards = numberedCards(10);
    expect(h._ftCardsInRanges(cards, [[2, 3], [7, 7]]).map((c) => c.qnum)).toEqual([2, 3, 7]);
    expect(h._ftCardsInRanges(cards, null)).toBe(cards);
    expect(h._ftCardsInRanges(cards, [])).toBe(cards);
    expect(h._ftCardsInRanges(cards, [[50, 60]])).toBe(cards);          // a bad range never deals an empty deck
    expect(h._ftCardsInRanges(cards, ['junk', [10, 10]]).map((c) => c.qnum)).toEqual([10]);
    expect(h._ftCardsInRanges(null, [[1, 2]])).toEqual([]);
  });

  it('43: _ftSliceRanges reads the slices file by CSV then topic; "a+b" uses its first key', () => {
    const h = loadDeckHelpers();
    expect(h._ftSliceRanges(SLICES, 'u4_l7_l8_blooket.csv', '4.7')).toEqual(SLICES['u4_l7_l8_blooket.csv']['4.7']);
    expect(h._ftSliceRanges(SLICES, 'u4_l7_l8_blooket.csv', '4.7+4.8')).toEqual(SLICES['u4_l7_l8_blooket.csv']['4.7']);
    expect(h._ftSliceRanges(SLICES, 'u4_l1_l2_blooket.csv', '4.1-2')).toBeNull();   // an old combined key is not a slice
    expect(h._ftSliceRanges(SLICES, 'u4_l6_blooket.csv', '4.6')).toBeNull();        // a solo deck is dealt whole
    expect(h._ftSliceRanges(SLICES, 'u3_l6_l7_blooket.csv', '3.6')).toBeNull();     // a small combined deck is not sliced
    expect(h._ftSliceRanges({}, 'u4_l7_l8_blooket.csv', '4.7')).toBeNull();
    expect(h._ftSliceRanges(null, 'u4_l7_l8_blooket.csv', '4.7')).toBeNull();
    expect(h._ftSliceRanges(SLICES, 'u4_l7_l8_blooket.csv', null)).toBeNull();
  });

  it('44: _ftResumeRemaining keeps the clock running in wall time (boundaries 0 / 40 / null)', () => {
    const h = loadDeckHelpers();
    const start = 1_000_000;
    expect(h._ftResumeRemaining(null, start, 40)).toBeNull();          // saved between cards
    expect(h._ftResumeRemaining(undefined, start, 40)).toBeNull();
    expect(h._ftResumeRemaining('soon', start, 40)).toBeNull();        // corrupted storage
    expect(h._ftResumeRemaining(start, start, 40)).toBe(40);
    expect(h._ftResumeRemaining(start, start + 999, 40)).toBe(40);
    expect(h._ftResumeRemaining(start, start + 1_000, 40)).toBe(39);
    expect(h._ftResumeRemaining(start, start + 39_999, 40)).toBe(1);
    expect(h._ftResumeRemaining(start, start + 40_000, 40)).toBe(0);
    expect(h._ftResumeRemaining(start, start + 50_000, 40)).toBe(0);   // ran out while closed
    expect(h._ftResumeRemaining(start, start - 5_000, 40)).toBe(40);   // the device clock went backwards
  });

  it('45: _ftSavedRoundOk accepts a stored round and rejects a broken one', () => {
    const h = loadDeckHelpers();
    const round = JSON.parse(JSON.stringify(h._ftCreateRound(numberedCards(3))));
    expect(h._ftSavedRoundOk(round)).toBe(true);
    const broken = (patch) => h._ftSavedRoundOk({ ...JSON.parse(JSON.stringify(round)), ...patch });
    expect(broken({ deck: [] })).toBe(false);
    expect(broken({ total: 4 })).toBe(false);
    expect(broken({ status: round.status.slice(1) })).toBe(false);
    expect(broken({ order: [0, 3] })).toBe(false);
    expect(broken({ order: [0.5] })).toBe(false);
    expect(broken({ log: null })).toBe(false);
    expect(broken({ deck: [{ qnum: 1, q: 'Q', choices: ['a'], correctIdx: 0 }, ...round.deck.slice(1)] })).toBe(false);
    expect(h._ftSavedRoundOk(null)).toBe(false);
  });
});

// ── Save & resume journey: the real _ft* flow + commit in jsdom, on a fake clock ──
// Runs the Desk's own deck functions (start, render, timer, answer, close, resume, Start
// over, finish, _blooketCommit, _studentMarkSave) against the real modal markup, the real
// CSVs and the real slices file. Only the outside world is stubbed: fetch reads the repo,
// recordProgress succeeds, gradebookClient.record is captured, timers are a fake clock.
const SANDBOX_FUNCTIONS = [
  'getStudentEmail', '_srsRoundId', '_mayScore',
  '_bfParseCsv', '_bfRowsToDeck', '_bfShuffle', '_bfLoadDeckSlices', '_bfCreditNote',
  '_bfShowQuizUI', '_bfCloseUI', 'closeBlooketFlashcards', '_rvRestoreActions', 'openBlooketFlashcards',
  '_ftCreateRound', '_ftCurrentIdx', '_ftRecordOutcome', '_ftScore', '_ftMisses', '_ftDone',
  '_ftSliceRanges', '_ftCardsInRanges', '_ftDealDeck', '_ftResumeRemaining', '_ftSavedRoundOk',
  '_ftClearTimer', '_ftRenderTimer', '_ftStartTimer', '_ftSecondsLeft',
  '_ftResumeKey', '_ftResumeFresh', '_ftSaveResume', '_ftLoadResume', '_ftClearResume',
  '_ftResumeLine', '_ftShowStartOver', '_ftStartOver',
  '_ftStart', '_ftRenderCard', '_ftAnswer', '_ftHandle', '_ftKeydownHandler', '_ftFinish',
  '_ftRenderOutcome', '_ftRenderRecap', '_ftLogToStore',
  '_blooketCommit', '_blooketPatchGradeCache', '_studentMarkSave', '_deskDoneRow',
];
const CED_SOURCE = ['js/ced2026-crosswalk.js', 'js/ced2026-labels.js']
  .map((file) => readFileSync(resolve(repo, file), 'utf8')).join('\n');
const EMAIL = 'kid@roster.local';
const RESUME_KEY = 'apstats_desk_ft_resume_' + EMAIL;
const T0 = Date.parse('2026-11-16T14:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function deskConst(name) {
  const m = new RegExp(String.raw`const\s+` + name + String.raw`\s*=\s*([^;]+);`).exec(DESK);
  if (!m) throw new Error('Desk const not found: ' + name);
  return 'var ' + name + ' = ' + m[1] + ';';
}
function deskStateVar(name) {
  const m = new RegExp(String.raw`var\s+` + name + String.raw`\s*=\s*\{[\s\S]*?\n\};`).exec(DESK);
  if (!m) throw new Error('Desk state not found: ' + name);
  return m[0];
}

// A controllable clock: Date.now plus setTimeout/setInterval that only fire on advance().
// jump() moves the time without firing anything: a throttled background tab, whose timers
// run late, so a click can land before the tick that would have timed the card out.
function fakeClock(startMs) {
  let now = startMs;
  let nextId = 1;
  const timers = new Map();
  function add(fn, ms, every) {
    const id = nextId++;
    timers.set(id, { fn, at: now + Math.max(0, ms || 0), every });
    return id;
  }
  function nextDue(limit) {
    let best = null;
    for (const [id, timer] of timers) {
      if (timer.at > limit) continue;
      if (!best || timer.at < best.timer.at) best = { id, timer };
    }
    return best;
  }
  return {
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms, 0),
    setInterval: (fn, ms) => add(fn, ms, ms),
    clear: (id) => { timers.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (let due = nextDue(end); due; due = nextDue(end)) {
        now = due.timer.at;
        if (due.timer.every) due.timer.at += due.timer.every;
        else timers.delete(due.id);
        due.timer.fn();
      }
      now = end;
    },
    jump(ms) { now += ms; },
  };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function modalMarkup() {
  const html = deskHtml();
  const start = html.indexOf('<div id="bf-overlay"');
  const end = html.indexOf('<!-- ═══ Resource Panel', start);
  return html.slice(start, end);
}

// slicesMissing: the slices file does not load, so every deck is dealt from its whole CSV.
async function deskFetch(url, { slicesMissing = false } = {}) {
  const path = String(url);
  if (path === 'data/blooket-deck-slices.json') {
    if (slicesMissing) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(SLICES_JSON) };
  }
  const file = resolve(repo, path);
  if (!/^u\d+_l[\d_l]+_blooket\.csv$/.test(path) || !existsSync(file)) {
    return { ok: false, status: 404, text: async () => '' };
  }
  return { ok: true, status: 200, text: async () => readFileSync(file, 'utf8') };
}

// marks: a local marks store ('<topic>|<artifact>' → { ts, score }) that recordProgress
// writes the way the Desk's does (mark.score unconditionally). best: the Blooket score the
// /grade cache shows per topic (_blooketScoreFor).
function bootTimedDeck({ csvFor, storage = {}, readOnly = false, slicesMissing = false, marks = null, best = null }) {
  const dom = new JSDOM('<!doctype html><body>' + modalMarkup() + '</body>', {
    runScripts: 'outside-only', url: 'https://desk.test/',
  });
  const win = dom.window;
  const clock = fakeClock(T0);
  const records = [];
  win.Date.now = clock.now;
  win.setTimeout = clock.setTimeout;
  win.clearTimeout = clock.clear;
  win.setInterval = clock.setInterval;
  win.clearInterval = clock.clear;
  win.Math.random = seededRandom(7);
  win.localStorage.setItem('apstats_desk_student_email', EMAIL);
  for (const [key, value] of Object.entries(storage)) win.localStorage.setItem(key, JSON.stringify(value));
  if (readOnly) win.__WS_READ_ONLY__ = true;
  win.eval(CED_SOURCE);
  Object.assign(win, {
    fetch: (url) => deskFetch(url, { slicesMissing }),
    _bfCsvPath: (topic) => csvFor[topic] || null,
    showDialog: () => {},
    recordProgress: async (topic, artifact, score) => {
      if (marks) marks[topic + '|' + artifact] = { ts: new Date(clock.now()).toISOString(), score };
      return true;
    },
    _srsAppendLog: () => {},
    _walletRefreshZeroCard: () => {},
    _bfKeydownHandler: () => {},
    gradebookClient: {
      record(row) { records.push(JSON.parse(JSON.stringify(row))); return Promise.resolve({ ok: true }); },
    },
  });
  if (marks) win.getStudentMarks = () => marks;
  if (best) win._blooketScoreFor = (topic) => (typeof best[topic] === 'number' ? best[topic] : null);
  win.eval([
    deskConst('BLOOKET_FULLDECK_SECONDS'), deskConst('BLOOKET_DECK_CARDS'), deskConst('BLOOKET_RESUME_MAX_AGE_MS'),
    deskConst('BLOOKET_START_STALE_MS'),
    deskStateVar('_ftState'), deskStateVar('_bfState'), deskStateVar('_rvState'),
    'var _bfDeckSlices = null, _gradeLessonsCache = null, _lastResourcePanel = null;',
    ...SANDBOX_FUNCTIONS.map((name) => fnBody(DESK, name)),
  ].join('\n'));
  return { dom, win, clock, records, doc: win.document };
}

async function settle() {
  for (let i = 0; i < 10; i += 1) await new Promise((done) => setImmediate(done));
}
async function openDeck(s, topic) {
  s.win.openBlooketFlashcards(null, topic);
  await settle();
}
function frontIdx(s) { return s.win._ftState.round.order[0]; }
function frontCard(s) { return s.win._ftState.round.deck[frontIdx(s)]; }
function clickChoice(s, correct) {
  const card = frontCard(s);
  const buttons = [...s.doc.querySelectorAll('#bf-choices .bf-choice')];
  const pick = buttons.find((b) => (Number(b.getAttribute('data-i')) === card.correctIdx) === correct);
  pick.click();
}
function answer(s, correct) {
  clickChoice(s, correct);
  s.clock.advance(800);   // the auto-advance to the next card
}
async function finishDeck(s) {
  for (let guard = 0; guard < 200; guard += 1) {
    if (s.doc.getElementById('bf-result').style.display === 'block') break;
    answer(s, true);
  }
  await settle();
}
// Plays the deck to its finish screen with an exact score: the first `strikes` cards dealt
// are answered wrong every time they come up (3 misses: out, 0 credit), every other card
// right, so the score is (total - strikes) / total.
async function playDeck(s, strikes) {
  const struck = new Set(s.win._ftState.round.order.slice(0, strikes));
  for (let guard = 0; guard < 400; guard += 1) {
    if (s.doc.getElementById('bf-result').style.display === 'block') break;
    answer(s, !struck.has(frontIdx(s)));
  }
  await settle();
}
// Every outcome _ftFinish hands the finish screen ({ saved, best } from _blooketCommit).
function captureOutcomes(s) {
  const outcomes = [];
  const render = s.win._ftRenderOutcome;
  s.win._ftRenderOutcome = function (topic, score, outcome) {
    outcomes.push(outcome);
    return render.apply(this, arguments);
  };
  return outcomes;
}
function savedRuns(s) { return JSON.parse(s.win.localStorage.getItem(RESUME_KEY) || '{}'); }
function inRanges(qnum, ranges) { return ranges.some(([lo, hi]) => qnum >= lo && qnum <= hi); }
function snapshot(s) {
  const ft = s.win._ftState;
  return JSON.parse(JSON.stringify({ roundId: ft.roundId, total: ft.round.total, order: ft.round.order, status: ft.round.status }));
}

describe('Timed deck — save & resume journey (jsdom, real Desk functions)', () => {
  const SLICED = { '4.7': 'u4_l7_l8_blooket.csv' };

  it('50: a sliced deck is saved after every card, resumes the same run on its clock, and commits DESK_DAY', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    try {
      await openDeck(s, '4.7');
      const ft = s.win._ftState;
      const label = s.win.cedLabel('4.7').text;
      expect(ft.perDay).toBe(true);
      expect(ft.resumed).toBe(false);
      expect(ft.round.total).toBe(30);                               // 44-card slice, capped at 30
      expect(ft.round.deck.every((c) => inRanges(c.qnum, SLICES['u4_l7_l8_blooket.csv']['4.7']))).toBe(true);
      expect(s.doc.getElementById('bf-header').textContent)
        .toBe('Timed deck — ' + label + ' · 30 cards · 40s/card · up to 100%');
      expect(s.doc.getElementById('bf-note').textContent)
        .toContain('This deck covers ' + label + ' only — the other days of this worksheet have their own decks.');
      expect(s.doc.getElementById('bf-startover')).toBeNull();

      answer(s, false);   // one miss: re-queued, a third of its credit gone
      answer(s, true);
      answer(s, true);
      const before = snapshot(s);
      expect(before.order).toHaveLength(28);
      const saved = savedRuns(s)['4.7'];
      expect(saved).toMatchObject({
        v: 1, csv: 'u4_l7_l8_blooket.csv', perDay: true, roundId: before.roundId, cardStartMs: s.clock.now(),
      });
      expect(saved.round.order).toEqual(before.order);

      s.win.closeBlooketFlashcards();
      expect(s.win._ftState.round).toBeNull();
      expect(savedRuns(s)['4.7']).toBeTruthy();                       // closing never clears the save
      s.clock.advance(5_000);                                          // wall time passes while closed

      await openDeck(s, '4.7');
      expect(s.win._ftState.resumed).toBe(true);
      expect(snapshot(s)).toEqual(before);                             // same cards, queue, credits, roundId
      expect(s.doc.getElementById('bf-note').textContent)
        .toContain('Picking up where you left off — 28 of 30 cards left.');
      expect(s.doc.getElementById('bf-startover')).not.toBeNull();
      expect(s.win._ftState.remaining).toBe(35);
      expect(s.doc.getElementById('bf-timer').textContent).toBe('⏱ 35s');
      expect(s.doc.getElementById('bf-question').textContent).toBe(frontCard(s).q);

      await finishDeck(s);
      const expected = Math.round(((29 + 2 / 3) / 30) * 1000) / 10;
      expect(s.doc.getElementById('bf-result').textContent).toContain('You scored ' + expected.toFixed(1) + '%');
      expect(savedRuns(s)['4.7']).toBeUndefined();                    // finishing clears the save
      expect(s.doc.getElementById('bf-startover')).toBeNull();
      expect(s.records).toEqual([{
        source: 'worksheet', itemId: 'BL-U4-L7-DESK_DAY', unit: 'U4', topic: '4.7',
        response: { selfAttest: 'blooket' }, score: expected, attempt: 1,
      }]);
    } finally {
      s.dom.window.close();
    }
  });

  it('51: a card left on screen keeps its wall clock: 50 s later it is a timeout, re-queued, nothing revealed', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    try {
      await openDeck(s, '4.7');
      answer(s, true);
      const card = frontCard(s);
      const idx = frontIdx(s);
      s.win.closeBlooketFlashcards();
      s.clock.advance(50_000);

      await openDeck(s, '4.7');
      const round = s.win._ftState.round;
      const last = round.log[round.log.length - 1];
      expect(last).toMatchObject({ qnum: card.qnum, correct: false, wasTimeout: true, chosenIdx: -1, latencyMs: 40_000 });
      expect(round.status[idx].misses).toBe(1);
      expect(round.order[round.order.length - 1]).toBe(idx);           // back of the queue
      expect(s.doc.getElementById('bf-feedback').textContent).toMatch(/Too slow/);
      expect(s.doc.querySelector('#bf-choices .bf-correct')).toBeNull(); // the answer is not shown
      expect(savedRuns(s)['4.7'].cardStartMs).toBeNull();             // saved between cards

      s.clock.advance(800);
      expect(frontIdx(s)).not.toBe(idx);
      expect(s.win._ftState.remaining).toBe(40);                       // the next card gets a full clock
      expect(s.doc.getElementById('bf-timer').textContent).toBe('⏱ 40s');
    } finally {
      s.dom.window.close();
    }
  });

  it('52: closing inside the 800 ms auto-advance keeps the outcome and resumes on the next card, full clock', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    try {
      await openDeck(s, '4.7');
      const first = frontIdx(s);
      clickChoice(s, true);                                            // answered, auto-advance pending
      expect(savedRuns(s)['4.7'].cardStartMs).toBeNull();
      expect(savedRuns(s)['4.7'].round.log).toHaveLength(1);
      s.win.closeBlooketFlashcards();
      s.clock.advance(120_000);

      await openDeck(s, '4.7');
      const round = s.win._ftState.round;
      expect(round.status[first]).toMatchObject({ resolved: true, earned: 1 });
      expect(round.log).toHaveLength(1);                               // no timeout was added
      expect(round.order).not.toContain(first);
      expect(s.win._ftState.remaining).toBe(40);
    } finally {
      s.dom.window.close();
    }
  });

  it('53: a solo deck over 30 cards deals 30 and commits DESK_DONE exactly as before', async () => {
    const s = bootTimedDeck({ csvFor: { '4.6': 'u4_l6_blooket.csv' } });
    try {
      await openDeck(s, '4.6');
      expect(s.win._ftState.perDay).toBe(false);
      expect(s.win._ftState.round.total).toBe(30);                    // 59 cards in the CSV
      expect(s.doc.getElementById('bf-note').textContent).not.toContain('This deck covers');
      await finishDeck(s);
      expect(s.records).toHaveLength(1);
      expect(s.records[0]).toMatchObject({ itemId: 'BL-U4-L6-DESK_DONE', topic: '4.6', score: 100 });
      expect(savedRuns(s)['4.6']).toBeUndefined();
    } finally {
      s.dom.window.close();
    }
  });

  it('54: Start over drops the saved run and deals a fresh deck', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    try {
      await openDeck(s, '4.7');
      answer(s, true);
      answer(s, false);
      const oldRoundId = s.win._ftState.roundId;
      s.win.closeBlooketFlashcards();
      s.clock.advance(3_000);
      await openDeck(s, '4.7');
      expect(s.win._ftState.resumed).toBe(true);

      s.doc.getElementById('bf-startover').click();
      await settle();
      const ft = s.win._ftState;
      expect(ft.resumed).toBe(false);
      expect(ft.roundId).not.toBe(oldRoundId);
      expect(ft.round.log).toHaveLength(0);
      expect(ft.round.order).toHaveLength(30);
      expect(s.doc.getElementById('bf-startover')).toBeNull();
      expect(s.doc.getElementById('bf-note').textContent).not.toContain('Picking up');
      expect(savedRuns(s)['4.7'].roundId).toBe(ft.roundId);
      expect(s.records).toHaveLength(0);                               // starting over commits nothing
    } finally {
      s.dom.window.close();
    }
  });

  it('55: a save for another CSV, an expired save or a read-only view never resumes; read-only never saves', async () => {
    const stored = (patch) => {
      const deck = [1, 2, 3].map((n) => ({ qnum: n, q: 'Stored ' + n, choices: ['a', 'b'], correctIdx: 0 }));
      const round = { deck, order: [0, 1, 2], status: deck.map(() => ({ misses: 0, resolved: false, earned: 0 })), log: [], total: 3 };
      const entry = { v: 1, csv: 'u4_l7_l8_blooket.csv', perDay: true, roundId: 'desk-1-abcd', cardStartMs: null, savedAt: T0, round };
      return { [RESUME_KEY]: { '4.7': { ...entry, ...patch } } };
    };
    const cases = [
      { name: 'still valid', storage: stored({}), resumes: true },
      { name: 'other CSV', storage: stored({ csv: 'u4_l7_blooket.csv' }), resumes: false },
      { name: 'expired', storage: stored({ savedAt: T0 - 15 * DAY_MS }), resumes: false },
      { name: 'read-only', storage: stored({}), readOnly: true, resumes: false },
    ];
    for (const c of cases) {
      const s = bootTimedDeck({ csvFor: SLICED, storage: c.storage, readOnly: c.readOnly });
      try {
        await openDeck(s, '4.7');
        expect(s.win._ftState.resumed, c.name).toBe(c.resumes);
        expect(s.win._ftState.roundId === 'desk-1-abcd', c.name).toBe(c.resumes);
        if (c.readOnly) {
          answer(s, true);
          expect(savedRuns(s)['4.7'].roundId, 'read-only must not overwrite the save').toBe('desk-1-abcd');
        }
      } finally {
        s.dom.window.close();
      }
    }
  });
});

// ── Codex review 2026-11-07, defect 1: the card clock is wall time ──
// A resumed card keeps its ORIGINAL start, so its deadline is fixed however often the deck
// is closed and reopened; the tick reads the deadline, and an answer after it is a timeout.
describe('Timed deck — the card clock is wall time, whatever the closes and reopens', () => {
  const SLICED = { '4.7': 'u4_l7_l8_blooket.csv' };

  it('56: 60 close/reopen cycles 900 ms apart never restart the clock: the card times out 40 s after it first rendered', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    try {
      await openDeck(s, '4.7');
      const firstRenderAt = s.clock.now();
      const idx = frontIdx(s);
      const card = frontCard(s);
      expect(savedRuns(s)['4.7'].cardStartMs).toBe(firstRenderAt);

      let timedOutAt = null;
      for (let cycle = 0; cycle < 60; cycle += 1) {
        s.win.closeBlooketFlashcards();
        s.clock.advance(900);
        await openDeck(s, '4.7');
        if (timedOutAt !== null) continue;
        if (s.win._ftState.round.log.length) { timedOutAt = s.clock.now(); continue; }
        expect(s.win._ftState.cardStartMs, 'cycle ' + cycle).toBe(firstRenderAt);   // the start never moves
        expect(savedRuns(s)['4.7'].cardStartMs, 'cycle ' + cycle).toBe(firstRenderAt);
      }

      expect(timedOutAt, 'the card never timed out').not.toBeNull();
      expect(timedOutAt - firstRenderAt).toBeGreaterThanOrEqual(40_000);
      expect(timedOutAt - firstRenderAt).toBeLessThanOrEqual(41_000);
      const round = s.win._ftState.round;
      expect(round.log).toHaveLength(1);
      expect(round.log[0]).toMatchObject({ qnum: card.qnum, correct: false, wasTimeout: true, chosenIdx: -1, latencyMs: 40_000 });
      expect(round.status[idx].misses).toBe(1);
      expect(round.order[round.order.length - 1]).toBe(idx);           // re-queued to the back
    } finally {
      s.dom.window.close();
    }
  });

  it('57: reopened 10 s later the card shows 30 s, and an answer at 39.9 s is a normal answer', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    try {
      await openDeck(s, '4.7');
      const card = frontCard(s);
      s.win.closeBlooketFlashcards();
      s.clock.advance(10_000);
      await openDeck(s, '4.7');
      expect(s.win._ftState.remaining).toBe(30);
      expect(s.doc.getElementById('bf-timer').textContent).toBe('⏱ 30s');

      s.clock.advance(29_900);                                         // 39.9 s since it first rendered
      expect(s.doc.getElementById('bf-timer').textContent).toBe('⏱ 1s');
      clickChoice(s, true);
      expect(s.win._ftState.round.log).toHaveLength(1);
      expect(s.win._ftState.round.log[0]).toMatchObject({ qnum: card.qnum, correct: true, wasTimeout: false, latencyMs: 39_900 });
      expect(s.doc.getElementById('bf-feedback').textContent).toBe('✓ Correct');
    } finally {
      s.dom.window.close();
    }
  });

  it('58: an answer that lands after the deadline (the tick ran late) is a timeout and gives nothing away', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    try {
      await openDeck(s, '4.7');
      const idx = frontIdx(s);
      const card = frontCard(s);
      s.win.closeBlooketFlashcards();
      s.clock.advance(10_000);
      await openDeck(s, '4.7');
      expect(s.doc.getElementById('bf-timer').textContent).toBe('⏱ 30s');

      s.clock.jump(30_100);                                            // 40.1 s since it first rendered, no tick ran
      clickChoice(s, true);
      const round = s.win._ftState.round;
      expect(round.log).toHaveLength(1);
      expect(round.log[0]).toMatchObject({ qnum: card.qnum, correct: false, wasTimeout: true, chosenIdx: -1, latencyMs: 40_000 });
      expect(round.status[idx]).toMatchObject({ misses: 1, resolved: false, earned: 0 });
      expect(round.order[round.order.length - 1]).toBe(idx);
      expect(s.doc.querySelector('#bf-choices .bf-correct')).toBeNull();   // the right choice is not shown
      expect(s.doc.querySelector('#bf-choices .bf-wrong')).toBeNull();
      expect(s.doc.getElementById('bf-feedback').textContent).toMatch(/Too slow/);
    } finally {
      s.dom.window.close();
    }
  });
});

// ── Codex review 2026-11-07, defect 2: every finished run sends its own row ──
// The tile can show another item's best (a day deck's 100 on 4.7); a whole-deck run then
// records DESK_DONE, which also credits 4.8. The server keeps each item's best, so the row
// always goes; the floor decides only the local mark and the finish-screen copy.
describe('Timed deck — every finished run sends its row; the floor keeps the local best', () => {
  const SLICED = { '4.7': 'u4_l7_l8_blooket.csv' };
  const EARLIER = new Date(T0 - DAY_MS).toISOString();

  it('60: a whole-deck run below the day deck shown on the tile records its DESK_DONE row and keeps the local best', async () => {
    const marks = { '4.7|blooket': { ts: EARLIER, score: 100 } };     // an earlier DESK_DAY run
    const s = bootTimedDeck({ csvFor: SLICED, slicesMissing: true, marks, best: { '4.7': 100 } });
    const outcomes = captureOutcomes(s);
    try {
      await openDeck(s, '4.7');
      expect(s.win._ftState.perDay).toBe(false);                       // no slices file: the whole CSV
      expect(s.win._ftState.round.total).toBe(30);
      await playDeck(s, 3);                                            // 27 of 30 = 90%
      expect(s.records).toEqual([{
        source: 'worksheet', itemId: 'BL-U4-L7-DESK_DONE', unit: 'U4', topic: '4.7',
        response: { selfAttest: 'blooket' }, score: 90, attempt: 1,
      }]);
      expect(marks['4.7|blooket']).toEqual({ ts: EARLIER, score: 100 }); // the local mark is not lowered
      expect(outcomes).toEqual([{ saved: false, best: 100 }]);
      expect(s.doc.querySelector('#bf-result .bf-outcome').textContent)
        .toBe('Recorded. Your best for ' + s.win.cedLabel('4.7').text + ' stays at 100.0% (this run: 90.0%).');
    } finally {
      s.dom.window.close();
    }
  });

  it('61: a lower run of the same day deck still sends its DESK_DAY row (the server floors it) and keeps the local best', async () => {
    const marks = { '4.7|blooket': { ts: EARLIER, score: 100 } };
    const s = bootTimedDeck({ csvFor: SLICED, marks, best: { '4.7': 100 } });
    const outcomes = captureOutcomes(s);
    try {
      await openDeck(s, '4.7');
      expect(s.win._ftState.perDay).toBe(true);
      await playDeck(s, 6);                                            // 24 of 30 = 80%
      expect(s.records).toEqual([{
        source: 'worksheet', itemId: 'BL-U4-L7-DESK_DAY', unit: 'U4', topic: '4.7',
        response: { selfAttest: 'blooket' }, score: 80, attempt: 1,
      }]);
      expect(marks['4.7|blooket']).toEqual({ ts: EARLIER, score: 100 });
      expect(outcomes).toEqual([{ saved: false, best: 100 }]);
    } finally {
      s.dom.window.close();
    }
  });

  it('62: view-as and a read-only view send no row on either path', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    try {
      s.win._viewAsContext = () => ({ studentId: 'stu_1' });
      await s.win._blooketCommit(null, '4.7', 50, true);
      s.win._deskDoneRow('4.7', 'blooket', 50, true);
      s.win._viewAsContext = () => null;
      s.win.__WS_READ_ONLY__ = true;
      await s.win._blooketCommit(null, '4.7', 50, true);
      s.win._deskDoneRow('4.7', 'blooket', 50, true);
      expect(s.records).toEqual([]);

      s.win.__WS_READ_ONLY__ = false;                                  // the guards, not a broken sandbox
      s.win._deskDoneRow('4.7', 'blooket', 50, true);
      expect(s.records.map((row) => row.itemId)).toEqual(['BL-U4-L7-DESK_DAY']);
    } finally {
      s.dom.window.close();
    }

    const readOnly = bootTimedDeck({ csvFor: SLICED, readOnly: true });
    try {
      await openDeck(readOnly, '4.7');
      await finishDeck(readOnly);
      expect(readOnly.records).toEqual([]);
      expect(readOnly.doc.querySelector('#bf-result .bf-outcome').textContent).toContain('Not recorded');
    } finally {
      readOnly.dom.window.close();
    }
  });
});

// ── Codex review 2026-11-07, defect 3: a pair cell "4.7+4.8" runs its first lesson ──
// The slice of a pair cell is its first key's (_ftSliceRanges); the run topic is normalized
// once in _ftStart, so the header, the note, the save, the card log and the row say 4.7.
describe('Timed deck — a pair cell runs and records its first lesson', () => {
  it('63: _ftStart(btn, "4.7+4.8") deals 4.7’s day, names 4.7 everywhere and records an id the grade engine reads', async () => {
    const s = bootTimedDeck({ csvFor: { '4.7': 'u4_l7_l8_blooket.csv' } });   // the CSV lookup knows only 4.7
    const logged = [];
    s.win._srsAppendLog = (entries) => { logged.push(...entries); };
    try {
      await s.win._ftStart(null, '4.7+4.8');
      await settle();
      const ft = s.win._ftState;
      const label = s.win.cedLabel('4.7').text;
      expect(label).toBe('2.8 · Introduction to Random Variables');
      expect(ft.topic).toBe('4.7');
      expect(ft.perDay).toBe(true);
      expect(ft.round.total).toBe(30);
      expect(ft.round.deck.every((c) => inRanges(c.qnum, SLICES['u4_l7_l8_blooket.csv']['4.7']))).toBe(true);
      expect(s.doc.getElementById('bf-header').textContent)
        .toBe('Timed deck — ' + label + ' · 30 cards · 40s/card · up to 100%');
      expect(s.doc.getElementById('bf-note').textContent).toContain('This deck covers ' + label + ' only');
      expect(Object.keys(savedRuns(s))).toEqual(['4.7']);

      await finishDeck(s);
      expect(s.records).toEqual([{
        source: 'worksheet', itemId: 'BL-U4-L7-DESK_DAY', unit: 'U4', topic: '4.7',
        response: { selfAttest: 'blooket' }, score: 100, attempt: 1,
      }]);
      expect(logged.length).toBe(30);
      expect(logged.every((entry) => entry.topic === '4.7')).toBe(true);
      const { parseItemLesson } = await import('../roster-server/lesson-grade.js');
      expect(parseItemLesson(s.records[0].itemId)).toEqual({ unit: 4, lessonKey: '7' });
    } finally {
      s.dom.window.close();
    }
  });

  it('64: the pair cell still greys from its parts: a "4.7|blooket" mark counts for 4.7', () => {
    // eslint-disable-next-line no-new-func
    const isComplete = new Function('getRegistryEntry', fnBody(DESK, '_isLessonComplete') + '\nreturn _isLessonComplete;')(
      () => ({ urls: { worksheet: 'u4_lesson7-8_live.html', blooket: 'https://b' } }),
    );
    const ts = new Date(T0).toISOString();
    const day = (topic) => ({ [topic + '|worksheet']: { ts }, [topic + '|blooket']: { ts } });
    expect(isComplete('4.7', day('4.7'))).toBe(true);
    expect(isComplete('4.7+4.8', { ...day('4.7'), ...day('4.8') })).toBe(true);
    expect(isComplete('4.7+4.8', day('4.7'))).toBe(false);                 // 4.8 is its own day
    expect(isComplete('4.7+4.8', { ...day('4.8'), '4.7|worksheet': { ts } })).toBe(false);
  });
});

// ── Opus verifiers 2026-11-07: re-entry, a cached slices failure, receipt scores ──
// Puts the sandbox network on a script and logs every URL. slicesFail: the first n slices
// fetches answer 503. csvFail: the first n deck CSV fetches reject. csvHold: the first n
// deck CSV fetches wait for release() (never released = a stalled network).
function scriptFetch(s, { slicesFail = 0, csvFail = 0, csvHold = 0 } = {}) {
  const urls = [];
  const held = [];
  const real = s.win.fetch;
  s.win.fetch = (url) => {
    const path = String(url);
    urls.push(path);
    if (path === 'data/blooket-deck-slices.json' && slicesFail > 0) {
      slicesFail -= 1;
      return Promise.resolve({ ok: false, status: 503, json: async () => null });
    }
    if (!path.endsWith('_blooket.csv')) return real(url);
    if (csvHold > 0) {
      csvHold -= 1;
      return new Promise((done) => { held.push(() => done(real(url))); });
    }
    if (csvFail > 0) {
      csvFail -= 1;
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return real(url);
  };
  return {
    count: (suffix) => urls.filter((url) => url.endsWith(suffix)).length,
    release() { held.splice(0).forEach((go) => go()); },
  };
}
// Counts the run saves (_ftSaveResume calls made by the Desk's own functions).
function countSaves(s) {
  const counter = { count: 0 };
  const save = s.win._ftSaveResume;
  s.win._ftSaveResume = function () {
    counter.count += 1;
    return save.apply(this, arguments);
  };
  return counter;
}
// Records the size of every pool a deck is dealt from.
function recordPools(s) {
  const pools = [];
  const deal = s.win._ftDealDeck;
  s.win._ftDealDeck = function (pool) {
    pools.push(pool.length);
    return deal.apply(this, arguments);
  };
  return pools;
}

// A double click on the launcher used to run _ftStart twice: the deck window opens only
// after the CSV loads, so both calls were in flight, the first dealt and saved, and the
// second found that save and showed the brand-new deck as "Picking up where you left off".
describe('Timed deck — one start at a time', () => {
  const SLICED = { '4.7': 'u4_l7_l8_blooket.csv' };

  it('70: two opens before the CSV loads deal ONE deck, show no resume note or Start over, and save once', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    const net = scriptFetch(s);
    const saves = countSaves(s);
    try {
      s.win.openBlooketFlashcards(null, '4.7');   // a double click: both land before the CSV arrives
      s.win.openBlooketFlashcards(null, '4.7');
      await settle();
      const ft = s.win._ftState;
      expect(net.count('_blooket.csv')).toBe(1);                         // the second start never ran
      expect(ft.resumed).toBe(false);
      expect(ft.loading).toBeNull();                                      // released once the deck opened
      expect(ft.round.total).toBe(30);
      expect(ft.round.log).toHaveLength(0);
      expect(s.doc.querySelector('#bf-note .bf-resume-note')).toBeNull();
      expect(s.doc.getElementById('bf-note').textContent).not.toContain('Picking up');
      expect(s.doc.getElementById('bf-startover')).toBeNull();
      expect(saves.count).toBe(1);
      expect(savedRuns(s)['4.7'].roundId).toBe(ft.roundId);
      const dealt = ft.roundId;

      // A third open after a close works as any reopen does: it resumes the saved run.
      s.win.closeBlooketFlashcards();
      await openDeck(s, '4.7');
      expect(net.count('_blooket.csv')).toBe(2);
      expect(s.doc.getElementById('bf-overlay').style.display).toBe('block');
      expect(s.win._ftState.resumed).toBe(true);
      expect(s.win._ftState.roundId).toBe(dealt);
      expect(s.doc.getElementById('bf-note').textContent).toContain('Picking up where you left off — 30 of 30 cards left.');
      expect(s.doc.getElementById('bf-startover')).not.toBeNull();
    } finally {
      s.dom.window.close();
    }
  });

  it('71: closing while the CSV loads cancels that open — the deck never appears after the close', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    const net = scriptFetch(s, { csvHold: 1 });
    try {
      s.win.openBlooketFlashcards(null, '4.7');
      await settle();
      s.win.closeBlooketFlashcards();                                    // Esc or ✕ before the deck arrived
      net.release();
      await settle();
      expect(s.doc.getElementById('bf-overlay').style.display).toBe('none');
      expect(s.win._ftState.round).toBeNull();
      expect(savedRuns(s)['4.7']).toBeUndefined();                        // nothing dealt, nothing saved

      await openDeck(s, '4.7');                                           // the next open deals normally
      expect(s.doc.getElementById('bf-overlay').style.display).toBe('block');
      expect(s.win._ftState.resumed).toBe(false);
      expect(s.win._ftState.round.total).toBe(30);
    } finally {
      s.dom.window.close();
    }
  });

  it('72: a stalled load cancelled by a close, or a failed load, never blocks the next open', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    const net = scriptFetch(s, { csvHold: 1, csvFail: 1 });
    const dialogs = [];
    s.win.showDialog = (icon, text) => { dialogs.push(text); };
    try {
      s.win.openBlooketFlashcards(null, '4.7');                          // this CSV never arrives
      await settle();
      s.win.closeBlooketFlashcards();
      await openDeck(s, '4.7');                                           // not ignored: this CSV fails
      expect(net.count('_blooket.csv')).toBe(2);
      expect(dialogs).toEqual(['Could not load the flashcard deck. Try again.']);
      expect(s.win._ftState.loading).toBeNull();

      await openDeck(s, '4.7');                                           // and the next one deals
      expect(net.count('_blooket.csv')).toBe(3);
      expect(s.doc.getElementById('bf-overlay').style.display).toBe('block');
      expect(s.win._ftState.round.total).toBe(30);
      expect(s.win._ftState.resumed).toBe(false);
    } finally {
      s.dom.window.close();
    }
  });
});

describe('Timed deck — a stalled start never wedges the launcher', () => {
  const SLICED = { '4.7': 'u4_l7_l8_blooket.csv' };

  it('75: a start stalled for 15 s stops blocking: the next click deals, and the stalled CSV is dropped when it arrives', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    const net = scriptFetch(s, { csvHold: 1 });
    try {
      expect(s.win.BLOOKET_START_STALE_MS).toBe(15_000);
      s.win.openBlooketFlashcards(null, '4.7');                          // this CSV stalls; no window to close yet
      await settle();
      s.clock.jump(14_999);
      await openDeck(s, '4.7');                                           // still loading: the click is ignored
      expect(net.count('_blooket.csv')).toBe(1);
      expect(s.doc.getElementById('bf-overlay').style.display).toBe('none');

      s.clock.jump(1);
      await openDeck(s, '4.7');                                           // 15 s on: this click takes over
      expect(net.count('_blooket.csv')).toBe(2);
      expect(s.doc.getElementById('bf-overlay').style.display).toBe('block');
      const dealt = s.win._ftState.roundId;
      const saves = countSaves(s);

      net.release();                                                      // the stalled CSV finally arrives
      await settle();
      expect(s.win._ftState.roundId).toBe(dealt);                         // dropped: no second deal
      expect(s.win._ftState.resumed).toBe(false);
      expect(s.doc.querySelector('#bf-note .bf-resume-note')).toBeNull();
      expect(saves.count).toBe(0);
    } finally {
      s.dom.window.close();
    }
  });
});

// A failed slices fetch used to be cached ({}) for the rest of the session: every later deck
// was dealt whole and recorded DESK_DONE, which the server shares across a per-day group.
describe('Timed deck — a failed slices fetch is not cached', () => {
  const SLICED = { '4.7': 'u4_l7_l8_blooket.csv' };

  it('73: the slices file fails once, then loads: the next open of 4.7 deals from its 44-card day pool and records DESK_DAY', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    const net = scriptFetch(s, { slicesFail: 1 });
    const pools = recordPools(s);
    const wholeCsv = s.win._bfRowsToDeck(s.win._bfParseCsv(readFileSync(resolve(repo, 'u4_l7_l8_blooket.csv'), 'utf8')));
    try {
      await openDeck(s, '4.7');
      expect(s.win._ftState.perDay).toBe(false);                         // this open had no slices: the whole CSV
      await finishDeck(s);
      s.win.closeBlooketFlashcards();

      await openDeck(s, '4.7');
      const ft = s.win._ftState;
      expect(net.count('blooket-deck-slices.json')).toBe(2);              // the failure was not cached
      expect(pools).toEqual([wholeCsv.length, 44]);
      expect(ft.perDay).toBe(true);
      expect(ft.round.total).toBe(30);
      expect(ft.round.deck.every((c) => inRanges(c.qnum, SLICES['u4_l7_l8_blooket.csv']['4.7']))).toBe(true);
      await finishDeck(s);
      expect(s.records.map((row) => row.itemId)).toEqual(['BL-U4-L7-DESK_DONE', 'BL-U4-L7-DESK_DAY']);
    } finally {
      s.dom.window.close();
    }
  });

  it('74: a slices file that loaded stays cached: two opens fetch it once', async () => {
    const s = bootTimedDeck({ csvFor: SLICED });
    const net = scriptFetch(s);
    try {
      await openDeck(s, '4.7');
      s.win.closeBlooketFlashcards();
      await openDeck(s, '4.7');
      expect(net.count('_blooket.csv')).toBe(2);
      expect(net.count('blooket-deck-slices.json')).toBe(1);
      expect(s.win._ftState.perDay).toBe(true);
    } finally {
      s.dom.window.close();
    }
  });
});

// gradebook-client stores the score a device SENT (sc). Since the server floors a lower run of
// the same deck item to its best, the receipt it returns signs the KEPT score, so the signed
// payload is the one to show. A payload without a score falls back to the stored one.
describe('Receipts show the score the server signed', () => {
  const RECEIPT_FUNCTIONS = [
    '_readDeskReceipts', '_receiptVerifyUrl', '_receiptPayload', '_receiptSourceIcon', '_formatReceiptDate',
    '_isProctoredReceipt', '_renderReceiptQr', '_toggleReceiptQr', 'renderMyReceipts', '_receiptViewUrl', '_walletReceiptRow',
  ];
  const b64url = (text) => Buffer.from(text, 'utf8').toString('base64url');
  const compactFor = (payload) => b64url(JSON.stringify(payload)) + '.' + b64url('sig');

  function bootReceipts(rows) {
    const dom = new JSDOM('<!doctype html><body><div id="my-receipts-body"></div></body>', {
      runScripts: 'outside-only', url: 'https://desk.test/',
    });
    const win = dom.window;
    win.eval(CED_SOURCE);
    win.localStorage.setItem('desk_receipts_v1', JSON.stringify(rows));
    Object.assign(win, { getRegistryEntry: () => null, _walletVerifyAndCheck: () => {}, _reviewByItem: {} });
    win.eval(RECEIPT_FUNCTIONS.map((name) => fnBody(DESK, name)).join('\n'));
    return { dom, win, doc: win.document };
  }
  function shown(rows) {
    const s = bootReceipts(rows);
    try {
      s.win.renderMyReceipts();
      return {
        mine: s.doc.getElementById('my-receipts-body').textContent,
        ledger: s.win._walletReceiptRow(rows[0]).textContent,
      };
    } finally {
      s.dom.window.close();
    }
  }

  it('80: a lower run the server floored shows the KEPT score in My Receipts and My Ledger, not the score sent', () => {
    const signed = { v: 1, t: 'ledger', src: 'worksheet', i: 'BL-U4-L7-DESK_DAY', a: 1, e: 'practice', sc: 100, ts: T0, n: 'abcd' };
    const stored = { id: 'r-floored', compact: compactFor(signed), src: 'worksheet', i: 'BL-U4-L7-DESK_DAY', sc: 80, ts: T0 };
    const { mine, ledger } = shown([stored]);
    expect(mine).toContain('score 100');
    expect(mine).not.toContain('score 80');
    expect(ledger).toContain('score 100');
    expect(ledger).not.toContain('score 80');
  });

  it('81: a receipt whose signed payload carries no score still shows the stored one', () => {
    const signed = { v: 1, t: 'ledger', src: 'worksheet', i: 'BL-U4-L7-DESK_DAY', a: 1, e: 'practice', ts: T0, n: 'abcd' };
    const stored = { id: 'r-unscored', compact: compactFor(signed), src: 'worksheet', i: 'BL-U4-L7-DESK_DAY', sc: 80, ts: T0 };
    const { mine, ledger } = shown([stored]);
    expect(mine).toContain('score 80');
    expect(ledger).toContain('score 80');
  });
});
