// flashcards-engine.test.js — the shared flashcards.js pure engine (used by the
// native mobile launcher flashcards) + a PARITY block that extracts the Desk's inline
// _bf*/_ft* functions and asserts flashcards.js produces byte-identical output, so the
// grade-critical logic (scoring + the BL-…-DESK_DONE item-id) can never drift.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { deskSource } from './helpers/desk-source.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = deskSource();
const ENGINE_SRC = readFileSync(resolve(repo, 'flashcards.js'), 'utf8');
const SLICES = JSON.parse(readFileSync(resolve(repo, 'data/blooket-deck-slices.json'), 'utf8')).slices;

function loadEngine() {
  const win = {};
  runInContext(readFileSync(resolve(repo, 'flashcards.js'), 'utf8'),
    createContext({ window: win, globalThis: win, self: win, Math, String, Number, Array, Object, parseInt, isFinite, JSON }));
  return win.Flashcards;
}

// Extract a Desk inline function body by brace-matching + instantiate it.
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', m.index); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}
function deskFn(name, deps = '') {
  return new Function(deps + '\nreturn (' + fnBody(DESK, name) + ');')();
}

const SAMPLE_CSV = [
  '"Blooket","Import Template"',
  'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct',
  '1,"What is the mean?","average","median","mode","range",20,1',
  '2,"Std dev measures?","center","spread, mostly","shape","n",20,2',
  '3,"Skip me — no choices","only one",,,,20,1',    // dropped (< 2 choices)
  'x,"header-ish row",a,b,,,,',                       // dropped (non-numeric Q#)
  '4,"Correct out of range","a","b","c","d",20,9',   // correctIdx clamps to 0
].join('\n');

let FC;
beforeAll(() => { FC = loadEngine(); });

describe('flashcards.js — deck pipeline', () => {
  it('parseCsv handles quoted commas + newlines', () => {
    const rows = FC.parseCsv(SAMPLE_CSV);
    // the "spread, mostly" cell keeps its comma
    const q2 = rows.find((r) => r[0] === '2');
    expect(q2[3]).toBe('spread, mostly');
  });

  it('rowsToDeck drops headers/short rows, clamps out-of-range correctIdx', () => {
    const deck = FC.rowsToDeck(FC.parseCsv(SAMPLE_CSV));
    expect(deck.map((c) => c.qnum)).toEqual([1, 2, 4]);   // 3 (one choice) + x (header) dropped
    expect(deck[0]).toMatchObject({ q: 'What is the mean?', correctIdx: 0 });
    expect(deck[1].correctIdx).toBe(1);
    expect(deck[2].correctIdx).toBe(0);                    // 9 → clamped
  });

  it('selectTop10 ranks hard>med>easy>untagged, else first-10, else all', () => {
    const cards = Array.from({ length: 14 }, (_, i) => ({ qnum: i + 1, q: 'q' + i, choices: ['a', 'b'], correctIdx: 0 }));
    const tags = { '3': { difficulty: 'hard' }, '7': { difficulty: 'hard' }, '2': { difficulty: 'easy' }, '5': { difficulty: 'med' } };
    const top = FC.selectTop10(cards, tags);
    expect(top.length).toBe(10);
    expect(top.slice(0, 3).map((c) => c.qnum)).toEqual([3, 7, 5]);   // hard, hard, med
    expect(FC.selectTop10(cards, {}).map((c) => c.qnum)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // first-10
    expect(FC.selectTop10(cards.slice(0, 6), tags).length).toBe(6);  // <=10 → all
  });

  it('csvPathFromWorksheet maps the worksheet URL to the deck CSV (combined lessons keep the segment)', () => {
    expect(FC.csvPathFromWorksheet('u4_lesson1-2_live.html')).toBe('u4_l1_l2_blooket.csv');
    expect(FC.csvPathFromWorksheet('https://x/u1_lesson1_live.html')).toBe('u1_l1_blooket.csv');
    expect(FC.csvPathFromWorksheet('nope.html')).toBeNull();
  });
});

describe('flashcards.js — scoring', () => {
  it('quick: caps at 80% via the early-stop count; one-decimal percent', () => {
    expect(FC.quickPassCount(10)).toBe(8);
    expect(FC.quickScorePct(8, 10)).toBe(80);
    expect(FC.quickPassed(8, 10)).toBe(true);
    expect(FC.quickPassed(7, 10)).toBe(false);
    expect(FC.quickScorePct(2, 3)).toBe(66.7);
  });

  it('full timed: miss costs 1/3 + re-queues; 3 misses → 0 + drop; up to 100%', () => {
    const deck = [{ qnum: 1 }, { qnum: 2 }];
    let r = FC.createRound(deck);
    r = FC.recordOutcome(r, 'wrong');       // card0 miss1 → back of queue
    r = FC.recordOutcome(r, 'correct');     // card1 clean → earned 1
    r = FC.recordOutcome(r, 'correct');     // card0 (1 prior miss) → earned 2/3
    expect(FC.fullScorePct(r)).toBe(Math.round(((2 / 3 + 1) / 2 * 100) * 10) / 10);
    // strike-out path
    let s = FC.createRound([{ qnum: 9 }]);
    s = FC.recordOutcome(s, 'wrong'); s = FC.recordOutcome(s, 'timeout'); s = FC.recordOutcome(s, 'wrong');
    expect(FC.fullScorePct(s)).toBe(0);
    expect(s.status[0].resolved).toBe(true);
  });

  it('blooketItemId builds the grade-affecting BL-U{u}-L{key}-DESK_DONE (combined lessons kept)', () => {
    expect(FC.blooketItemId('4.1-2')).toEqual({ unit: 'U4', itemId: 'BL-U4-L1-2-DESK_DONE' });
    expect(FC.blooketItemId('1.10')).toEqual({ unit: 'U1', itemId: 'BL-U1-L10-DESK_DONE' });
    expect(FC.blooketItemId('garbage').itemId).toBe('BL-U?-DESK_DONE');
  });

  it('blooketItemId: a run dealt from a per-day slice records DESK_DAY; the default stays DESK_DONE', () => {
    expect(FC.blooketItemId('4.7', true)).toEqual({ unit: 'U4', itemId: 'BL-U4-L7-DESK_DAY' });
    expect(FC.blooketItemId('4.10', true)).toEqual({ unit: 'U4', itemId: 'BL-U4-L10-DESK_DAY' });
    expect(FC.blooketItemId('4.7', false).itemId).toBe('BL-U4-L7-DESK_DONE');
    expect(FC.blooketItemId('4.7').itemId).toBe('BL-U4-L7-DESK_DONE');
  });

  // Codex review 2026-11-07, defect 3: a pair cell deals its first key's slice, so it records
  // under that lesson (before: BL-U?-…, an id the grade engine rejects, so zero credit).
  it('blooketItemId: a pair cell "4.7+4.8" records under its first key', () => {
    expect(FC.blooketItemId('4.7+4.8', true)).toEqual({ unit: 'U4', itemId: 'BL-U4-L7-DESK_DAY' });
    expect(FC.blooketItemId('4.7+4.8', false)).toEqual({ unit: 'U4', itemId: 'BL-U4-L7-DESK_DONE' });
    expect(FC.blooketItemId('4.10+4.11').itemId).toBe('BL-U4-L10-DESK_DONE');
    expect(FC.blooketItemId('+4.8').itemId).toBe('BL-U?-DESK_DONE');   // no first key: still unparsed
  });
});

describe('flashcards.js — 30-card sittings, per-day slices, resume', () => {
  const cards = (n) => Array.from({ length: n }, (_, i) => ({ qnum: i + 1, q: 'q' + i, choices: ['a', 'b'], correctIdx: 0 }));

  it('DECK_CARDS is 30', () => {
    expect(FC.DECK_CARDS).toBe(30);
  });

  it('sliceRanges + cardsInRanges deal a sliced topic its own day of the real 2.8-2.9 deck', () => {
    const deck = FC.rowsToDeck(FC.parseCsv(readFileSync(resolve(repo, 'u4_l7_l8_blooket.csv'), 'utf8')));
    const day1 = FC.cardsInRanges(deck, FC.sliceRanges(SLICES, 'u4_l7_l8_blooket.csv', '4.7'));
    const day2 = FC.cardsInRanges(deck, FC.sliceRanges(SLICES, 'u4_l7_l8_blooket.csv', '4.8'));
    expect([deck.length, day1.length, day2.length]).toEqual([77, 44, 33]);
    expect(FC.sliceRanges(SLICES, 'u4_l6_blooket.csv', '4.6')).toBeNull();
    expect(FC.cardsInRanges(deck, null)).toBe(deck);
    expect(FC.cardsInRanges(deck, [[900, 999]])).toBe(deck);   // a bad range falls back to the whole CSV
  });

  it('dealDeck samples at most max cards and never mutates the pool', () => {
    const pool = cards(44);
    const dealt = FC.dealDeck(pool, FC.DECK_CARDS, FC.shuffle);
    expect(dealt).toHaveLength(30);
    expect(new Set(dealt.map((c) => c.qnum)).size).toBe(30);
    expect(dealt.every((c) => c.qnum >= 1 && c.qnum <= 44)).toBe(true);
    expect(pool.map((c) => c.qnum)).toEqual(cards(44).map((c) => c.qnum));
    expect(FC.dealDeck(cards(12), FC.DECK_CARDS, FC.shuffle)).toHaveLength(12);
  });

  it('resumeRemaining: null between cards, the wall clock otherwise, floored at 0', () => {
    expect(FC.resumeRemaining(null, 5_000, 40)).toBeNull();
    expect(FC.resumeRemaining(5_000, 5_000, 40)).toBe(40);
    expect(FC.resumeRemaining(5_000, 45_000, 40)).toBe(0);
    expect(FC.resumeRemaining(5_000, 55_000, 40)).toBe(0);
    expect(FC.resumeRemaining(5_000, 17_500, 40)).toBe(28);
  });

  it('savedRoundOk accepts a stored round and rejects a broken one', () => {
    const round = JSON.parse(JSON.stringify(FC.createRound(cards(3))));
    expect(FC.savedRoundOk(round)).toBe(true);
    expect(FC.savedRoundOk({ ...round, order: [7] })).toBe(false);
    expect(FC.savedRoundOk({ ...round, total: 2 })).toBe(false);
    expect(FC.savedRoundOk(undefined)).toBe(false);
  });
});

// ── PARITY vs the Desk's inline copies (the divergence guard) ──────────────────
describe('flashcards.js === the Desk inline engine (parity)', () => {
  it('parseCsv / rowsToDeck / selectTop10 match _bfParseCsv / _bfRowsToDeck / _bfSelectTop10', () => {
    const deskParse = deskFn('_bfParseCsv');
    const deskRows = deskFn('_bfRowsToDeck', 'var Number=globalThis.Number;');
    const deskTop10 = deskFn('_bfSelectTop10');
    expect(FC.parseCsv(SAMPLE_CSV)).toEqual(deskParse(SAMPLE_CSV));
    expect(FC.rowsToDeck(FC.parseCsv(SAMPLE_CSV))).toEqual(deskRows(deskParse(SAMPLE_CSV)));
    const cards = Array.from({ length: 14 }, (_, i) => ({ qnum: i + 1, q: 'q', choices: ['a', 'b'], correctIdx: 0 }));
    const tags = { '3': { difficulty: 'hard' }, '5': { difficulty: 'med' } };
    // Desk _bfSelectTop10(allCards, csvFilename, tagsForFile) — filename arg is unused by the ranking.
    expect(FC.selectTop10(cards, tags)).toEqual(deskTop10(cards, 'x.csv', tags));
  });

  it('recordOutcome / roundScore match _ftRecordOutcome / _ftScore across a mixed round', () => {
    const deskCreate = deskFn('_ftCreateRound');
    const deskRecord = deskFn('_ftRecordOutcome');
    const deskScore = deskFn('_ftScore');
    const deck = [{ qnum: 1 }, { qnum: 2 }, { qnum: 3 }];
    const seq = ['wrong', 'correct', 'timeout', 'correct', 'wrong', 'correct'];
    let mine = FC.createRound(deck), desk = deskCreate(deck);
    for (const o of seq) { mine = FC.recordOutcome(mine, o, 100); desk = deskRecord(desk, o, 100); }
    expect(mine.status).toEqual(desk.status);
    expect(FC.roundScore(mine)).toBe(deskScore(desk));
  });

  it('mulberry32 / permutationFor match the Desk twins across seeds and deck sizes', () => {
    const deskRandom = deskFn('_bfMulberry32');
    const deskPermutation = deskFn(
      '_bfPermutationFor',
      'var _bfMulberry32=' + fnBody(DESK, '_bfMulberry32') + ';',
    );
    for (const seed of [0, 1, 123456789, 0xffffffff]) {
      const mine = FC.mulberry32(seed);
      const desk = deskRandom(seed);
      const mineValues = Array.from({ length: 6 }, () => mine());
      const deskValues = Array.from({ length: 6 }, () => desk());
      expect(mineValues).toEqual(deskValues);
    }
    for (const [seed, n] of [[0, 0], [1, 1], [17, 2], [42, 4], [0xffffffff, 11]]) {
      expect(FC.permutationFor(seed, n)).toEqual(deskPermutation(seed, n));
    }
  });

  it('permSeed matches _bfPermSeed for several identities and rounds', () => {
    const deskSeed = deskFn('_bfPermSeed');
    const cases = [
      ['kid@roster.local', 'desk-100-abcd', 1],
      ['student', 'mobile-999-zzzz', 27],
      ['', '', 0],
      [null, undefined, '4'],
    ];
    for (const args of cases) {
      expect(FC.permSeed(...args)).toBe(deskSeed(...args));
    }
  });

  it('isPermutationUnsafe matches _bfIsPermutationUnsafe', () => {
    const deskUnsafe = deskFn('_bfIsPermutationUnsafe');
    const cases = [
      ['mean', 'median', 'mode'],
      ['All of these', 'only A'],
      ['NONE OF THE ABOVE.', 'choice B'],
      ['all of that', 'none above'],
      [],
    ];
    for (const choices of cases) {
      expect(FC.isPermutationUnsafe(choices)).toBe(deskUnsafe(choices));
    }
  });

  it('the Desk still records via the same BL-…-DESK_DONE shape + threshold this engine encodes', () => {
    // Source pins: the Desk builds the item-id and threshold flashcards.js must match.
    expect(DESK).toContain("'-DESK_DONE'");
    expect(DESK).toContain("'-DESK_DAY'");
    expect(DESK).toMatch(/BLOOKET_PASS_THRESHOLD\s*=\s*0\.80/);
    expect(DESK).toMatch(/BLOOKET_FULLDECK_SECONDS\s*=\s*40/);
    expect(DESK).toMatch(/BLOOKET_DECK_CARDS\s*=\s*30;/);
    expect(FC.PASS_THRESHOLD).toBe(0.80);
    expect(FC.FULLDECK_SECONDS).toBe(40);
    expect(FC.DECK_CARDS).toBe(30);
  });

  // FLASHCARD_DECK_SLICES_SPEC.md §4: the sittings/slices/resume helpers are the SAME text
  // on both surfaces (only the name and the indent differ), and behave the same.
  const SLICE_PAIRS = [
    ['_ftSliceRanges', 'sliceRanges'],
    ['_ftCardsInRanges', 'cardsInRanges'],
    ['_ftDealDeck', 'dealDeck'],
    ['_ftResumeRemaining', 'resumeRemaining'],
    ['_ftSavedRoundOk', 'savedRoundOk'],
  ];
  function sameText(src, name) {
    const body = fnBody(src, name);
    const unnamed = 'function X' + body.slice(body.indexOf('('));
    return unnamed.split('\n').map((line) => line.trim()).join('\n');
  }

  it.each(SLICE_PAIRS)('%s is line for line the text of flashcards.js %s', (deskName, engineName) => {
    expect(sameText(DESK, deskName)).toBe(sameText(ENGINE_SRC, engineName));
  });

  it('the slice / deal / resume helpers return the same results as the Desk copies', () => {
    const desk = {};
    for (const [deskName] of SLICE_PAIRS) desk[deskName] = deskFn(deskName);
    const cards = Array.from({ length: 12 }, (_, i) => ({ qnum: i + 1, q: 'q' + i, choices: ['a', 'b'], correctIdx: 0 }));
    const reverse = (list) => list.slice().reverse();
    for (const args of [[SLICES, 'u4_l7_l8_blooket.csv', '4.8'], [SLICES, 'u4_l1_l2_blooket.csv', '4.1+4.2'], [SLICES, 'nope.csv', '4.7'], [null, 'x', '1.1']]) {
      expect(FC.sliceRanges(...args)).toEqual(desk._ftSliceRanges(...args));
    }
    for (const ranges of [null, [], [[2, 4], [9, 9]], [[40, 50]], ['junk']]) {
      expect(FC.cardsInRanges(cards, ranges)).toEqual(desk._ftCardsInRanges(cards, ranges));
    }
    for (const max of [0, 5, 30]) {
      expect(FC.dealDeck(cards, max, reverse)).toEqual(desk._ftDealDeck(cards, max, reverse));
    }
    for (const [startMs, nowMs] of [[null, 1], [1_000, 1_000], [1_000, 41_000], [1_000, 99_000], [9_000, 1_000]]) {
      expect(FC.resumeRemaining(startMs, nowMs, 40)).toBe(desk._ftResumeRemaining(startMs, nowMs, 40));
    }
    const round = JSON.parse(JSON.stringify(FC.createRound(cards)));
    for (const candidate of [round, { ...round, order: [99] }, { ...round, deck: [] }, null]) {
      expect(FC.savedRoundOk(candidate)).toBe(desk._ftSavedRoundOk(candidate));
    }
  });

  // The Desk builds the BL- item id in _deskDoneRow, which both commit paths use: a new best
  // through _studentMarkSave, any other finished run directly from _blooketCommit. Run each
  // path for real and compare.
  function deskRowSandbox(rows) {
    return new Function(
      'window', 'recordProgress', '_lastResourcePanel',
      fnBody(DESK, '_studentMarkSave') + '\n' + fnBody(DESK, '_deskDoneRow')
        + '\nreturn { save: _studentMarkSave, row: _deskDoneRow };'
    )({ gradebookClient: { record: (row) => { rows.push(row); return null; } } }, async () => true, null);
  }
  async function deskRecordedRow(topic, artifact, perDay) {
    const rows = [];
    await deskRowSandbox(rows).save(null, topic, artifact, 90, perDay);
    return rows[0];
  }
  function deskDirectRow(topic, artifact, perDay) {
    const rows = [];
    deskRowSandbox(rows).row(topic, artifact, 90, perDay);
    return rows[0];
  }

  it('the Desk _studentMarkSave and _deskDoneRow build the same BL- item id as blooketItemId(topic, perDay)', async () => {
    for (const topic of ['4.7', '4.10', '1.1', '4.1-2', '3.6-7', '4.7+4.8', 'garbage']) {
      for (const perDay of [true, false, undefined]) {
        const built = FC.blooketItemId(topic, perDay);
        for (const row of [await deskRecordedRow(topic, 'blooket', perDay), deskDirectRow(topic, 'blooket', perDay)]) {
          expect(row.itemId, topic + ' perDay=' + perDay).toBe(built.itemId);
          expect(row.unit, topic + ' perDay=' + perDay).toBe(built.unit);
        }
      }
    }
    // A pair cell records under its first key on both surfaces (Codex review, defect 3).
    expect((await deskRecordedRow('4.7+4.8', 'blooket', true)).itemId).toBe('BL-U4-L7-DESK_DAY');
    expect(deskDirectRow('4.7+4.8', 'blooket', false)).toMatchObject({ itemId: 'BL-U4-L7-DESK_DONE', unit: 'U4', topic: '4.7' });
  });

  it('perDay never changes a worksheet or quiz Done row (DESK_DAY is flashcards only)', async () => {
    expect((await deskRecordedRow('4.7', 'worksheet', true)).itemId).toBe('WS-U4-L7-DESK_DONE');
    expect((await deskRecordedRow('4.7', 'quiz', true)).itemId).toBe('CR-U4-L7-DESK_DONE');
  });
});
