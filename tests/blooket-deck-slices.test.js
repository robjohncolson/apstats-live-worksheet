// tests/blooket-deck-slices.test.js — the per-day slices of the combined-worksheet Blooket
// decks (FLASHCARD_DECK_SLICES_SPEC.md §2). data/blooket-deck-slices.json maps a deck CSV to
// { oldTopicKey: [[lo, hi], …] } over the CSV's Q# column. These pins keep the file honest:
// every valid card of a sliced CSV belongs to exactly one day; every topic key is a registry
// topic whose worksheet deals that CSV; every big combined deck is sliced; the pool sizes are
// the ones the spec was signed off with; the server's vendored copy is byte-identical.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { deskSource, fnBodyOf } from './helpers/desk-source.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLICES_PATH = resolve(repo, 'data/blooket-deck-slices.json');
const VENDORED_PATH = resolve(repo, 'roster-server/data/blooket-deck-slices.json');
const VENDORED = existsSync(VENDORED_PATH);
const FILE = JSON.parse(readFileSync(SLICES_PATH, 'utf8'));
const ROADMAP = JSON.parse(readFileSync(resolve(repo, 'roadmap-data.json'), 'utf8'));

function loadEngine() {
  const win = {};
  runInContext(readFileSync(resolve(repo, 'flashcards.js'), 'utf8'),
    createContext({ window: win, globalThis: win, self: win, Math, String, Number, Array, Object, parseInt, isFinite, JSON }));
  return win.Flashcards;
}
const FC = loadEngine();

// The Desk's own parser (_bfParseCsv + _bfRowsToDeck): the rules the deck is dealt with.
const DESK = deskSource();
const deskParse = new Function('return (' + fnBodyOf(DESK, '_bfParseCsv') + ');')();
const deskRows = new Function('return (' + fnBodyOf(DESK, '_bfRowsToDeck') + ');')();
function validCards(csv) {
  return deskRows(deskParse(readFileSync(resolve(repo, csv), 'utf8')));
}
function inRanges(qnum, ranges) {
  return ranges.some(([lo, hi]) => qnum >= lo && qnum <= hi);
}

// Registry topics grouped by the deck CSV their worksheet deals (a combined worksheet has 2+).
function worksheetGroups() {
  const groups = new Map();
  for (const [topic, lesson] of Object.entries(ROADMAP.lessons || {})) {
    const worksheet = lesson && lesson.urls && lesson.urls.worksheet;
    const csv = worksheet ? FC.csvPathFromWorksheet(worksheet) : null;
    if (!csv) continue;
    if (!groups.has(csv)) groups.set(csv, []);
    groups.get(csv).push(topic);
  }
  return groups;
}

// The pool sizes the spec table was signed off with (FLASHCARD_DECK_SLICES_SPEC.md §2).
const POOLS = {
  'u4_l1_l2_blooket.csv': { total: 59, pools: { '4.1': 34, '4.2': 25 } },
  'u4_l3_l4_l5_blooket.csv': { total: 55, pools: { '4.3': 23, '4.4': 17, '4.5': 15 } },
  'u4_l7_l8_blooket.csv': { total: 77, pools: { '4.7': 44, '4.8': 33 } },
  'u4_l10_l12_blooket.csv': { total: 80, pools: { '4.10': 27, '4.11': 18, '4.12': 35 } },
};
const SLICED_CSVS = Object.keys(POOLS);

describe('data/blooket-deck-slices.json — the per-day slices of the combined decks', () => {
  it('has the documented shape: version 1, cardsPerDeck 30 (= Desk BLOOKET_DECK_CARDS = Flashcards.DECK_CARDS)', () => {
    expect(FILE.version).toBe(1);
    expect(FILE.cardsPerDeck).toBe(30);
    expect(FC.DECK_CARDS).toBe(FILE.cardsPerDeck);
    expect(DESK).toMatch(/const\s+BLOOKET_DECK_CARDS\s*=\s*30;/);
    expect(Object.keys(FILE.slices).sort()).toEqual(SLICED_CSVS.slice().sort());
    for (const [csv, topics] of Object.entries(FILE.slices)) {
      for (const [topic, ranges] of Object.entries(topics)) {
        expect(Array.isArray(ranges) && ranges.length > 0, csv + ' ' + topic + ' has ranges').toBe(true);
        for (const r of ranges) {
          const wellFormed = Array.isArray(r) && r.length === 2 && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] <= r[1];
          expect(wellFormed, csv + ' ' + topic + ' ' + JSON.stringify(r)).toBe(true);
        }
      }
    }
  });

  it.each(SLICED_CSVS)('%s: every valid card belongs to exactly one day (a partition)', (csv) => {
    const topics = FILE.slices[csv];
    for (const card of validCards(csv)) {
      const owners = Object.keys(topics).filter((topic) => inRanges(card.qnum, topics[topic]));
      expect(owners, csv + ' Q#' + card.qnum).toHaveLength(1);
    }
  });

  it.each(SLICED_CSVS)('%s: the pools match the spec table and each day deals min(30, pool)', (csv) => {
    const cards = validCards(csv);
    expect(cards).toHaveLength(POOLS[csv].total);
    for (const [topic, size] of Object.entries(POOLS[csv].pools)) {
      const pool = FC.cardsInRanges(cards, FC.sliceRanges(FILE.slices, csv, topic));
      expect(pool, csv + ' ' + topic).toHaveLength(size);
      expect(pool.length < cards.length, csv + ' ' + topic + ' is a strict part of the CSV').toBe(true);
      expect(FC.dealDeck(pool, FC.DECK_CARDS, FC.shuffle)).toHaveLength(Math.min(30, size));
    }
  });

  it('every topic key is a registry topic whose worksheet deals that CSV, and every day of it is sliced', () => {
    const groups = worksheetGroups();
    for (const [csv, topics] of Object.entries(FILE.slices)) {
      expect(existsSync(resolve(repo, csv)), csv + ' exists').toBe(true);
      for (const topic of Object.keys(topics)) {
        const lesson = ROADMAP.lessons[topic];
        expect(lesson, 'registry topic ' + topic).toBeTruthy();
        expect(FC.csvPathFromWorksheet(lesson.urls.worksheet), topic).toBe(csv);
      }
      expect(Object.keys(topics).sort(), csv + ': one slice per day of the worksheet').toEqual(groups.get(csv).slice().sort());
    }
  });

  it('every combined worksheet whose deck has more than 36 valid cards has a slices entry', () => {
    const big = [];
    for (const [csv, topics] of worksheetGroups()) {
      if (topics.length < 2) continue;                  // a solo worksheet is never sliced
      if (!existsSync(resolve(repo, csv))) continue;
      if (validCards(csv).length <= 36) continue;       // 3.6-7 (30), 5.1-2 (35), 6.1-2 (35) stay whole
      big.push(csv);
    }
    expect(big.sort()).toEqual(SLICED_CSVS.slice().sort());
    for (const csv of big) expect(FILE.slices[csv], csv).toBeTruthy();
  });

  it.skipIf(!VENDORED)(
    VENDORED
      ? 'the roster-server vendored copy is byte-identical'
      : 'SKIPPED: roster-server/data/blooket-deck-slices.json is not vendored yet (the roster-server lane writes it)',
    () => {
      const vendored = readFileSync(VENDORED_PATH);
      const source = readFileSync(SLICES_PATH);
      expect(vendored.equals(source), 'roster-server/data/blooket-deck-slices.json differs from data/blooket-deck-slices.json').toBe(true);
    },
  );
});
