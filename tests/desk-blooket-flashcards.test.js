// desk-blooket-flashcards.test.js — Blooket Done now opens a flashcard
// quiz sourced from the same Blooket CSV. Single pass ≥ 80% → auto-mark
// Done. Below 80% → retry. Done click NEVER writes a Done mark without
// passing the flashcards first.
//
// Static parse of the Desk HTML source — no DOM execution.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'ap_stats_roadmap_square_mode.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Desk: Blooket flashcard verification', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: BLOOKET_PASS_THRESHOLD is 0.80', () => {
    expect(DESK).toMatch(/const\s+BLOOKET_PASS_THRESHOLD\s*=\s*0\.80/);
  });

  it('02: blooket Done opens the flashcard quiz with NO visit timer', () => {
    // 2026-05-20: the 15-min visit timer was removed — the flashcard quiz
    // IS the completion gate, so the timer was a redundant weak proxy.
    expect(DESK, 'the BLOOKET_GATE_MS constant must be gone').not.toMatch(/BLOOKET_GATE_MS/);
    const body = fnBody(DESK, '_doneBtn');
    expect(body).toMatch(/artifact\s*===\s*['"]blooket['"]/);
    expect(body).toMatch(/Done \(flashcards\)/);
  });

  it('03: the blooket branch fires BEFORE the deskDoneGateMs timer (blooket skips it)', () => {
    const body = fnBody(DESK, '_doneBtn');
    const blooketIdx = body.indexOf("artifact === 'blooket'");
    const gateIdx = body.indexOf('deskDoneGateMs');
    expect(blooketIdx, 'blooket branch present in _doneBtn').toBeGreaterThan(-1);
    expect(gateIdx, 'deskDoneGateMs still used for video/quiz').toBeGreaterThan(-1);
    expect(blooketIdx, 'blooket branch must return before the timer').toBeLessThan(gateIdx);
  });

  it('04: studentMark routes blooket to openBlooketFlashcards (NOT the inline score prompt)', () => {
    const body = fnBody(DESK, 'studentMark');
    // Branch on blooket BEFORE the quiz branch and returns early.
    expect(body).toMatch(/artifact\s*===\s*['"]blooket['"]/);
    expect(body).toMatch(/openBlooketFlashcards\s*\(\s*btn\s*,\s*topicId\s*\)/);
    // The blooket branch is BEFORE quiz (so blooket doesn't fall through).
    const blooketIdx = body.indexOf("artifact === 'blooket'");
    const quizIdx = body.indexOf("artifact === 'quiz'");
    expect(blooketIdx, 'blooket branch must be in studentMark').toBeGreaterThan(-1);
    expect(quizIdx, 'quiz branch must still be in studentMark').toBeGreaterThan(-1);
    expect(blooketIdx, 'blooket branch must precede the quiz branch').toBeLessThan(quizIdx);
  });

  it('05: openBlooketFlashcards function exists and accepts (btn, topicId)', () => {
    expect(DESK).toMatch(/async\s+function\s+openBlooketFlashcards\s*\(\s*btn\s*,\s*topicId\s*\)/);
  });

  it('06: CSV path resolver maps topic to u{U}_l{key}_blooket.csv via the registry', () => {
    expect(DESK).toMatch(/function\s+_bfCsvPath\s*\(/);
    const body = fnBody(DESK, '_bfCsvPath');
    expect(body).toMatch(/getRegistryEntry/);
    expect(body).toMatch(/_blooket\.csv/);
    // Combined-worksheet keys (1-2) must map to underscores (l1_l2).
    expect(body).toMatch(/replace\s*\(\s*\/-\/g\s*,\s*['"]_l['"]/);
  });

  it('07: CSV parser handles quoted fields with embedded commas + newlines', () => {
    expect(DESK).toMatch(/function\s+_bfParseCsv\s*\(/);
    const body = fnBody(DESK, '_bfParseCsv');
    // Tracks an inQuote flag for proper RFC-4180 parsing.
    expect(body).toMatch(/inQuote/);
    // Handles the doubled-quote escape ("") inside a quoted field.
    expect(body).toMatch(/text\[i\+1\]\s*===\s*['"]"['"]/);
  });

  it('08: deck builder skips template/header rows and reads Q# / question text / 4 answers / correct#', () => {
    expect(DESK).toMatch(/function\s+_bfRowsToDeck\s*\(/);
    const body = fnBody(DESK, '_bfRowsToDeck');
    // The Blooket CSV puts the correct-answer number in column 7 (0-indexed).
    expect(body).toMatch(/parseInt\s*\(\s*\(r\[7\]/);
    // Answers in cols 2..5.
    expect(body).toMatch(/j\s*<=\s*5/);
    // Must skip rows whose col 0 isn't a real question number (template rows).
    expect(body).toMatch(/Number\.isFinite\s*\(\s*qnum/);
  });

  it('09: deck is shuffled per-attempt (random order)', () => {
    expect(DESK).toMatch(/function\s+_bfShuffle\s*\(/);
    const body = fnBody(DESK, '_bfShuffle');
    expect(body).toMatch(/Math\.random/);
  });

  it('10: _bfAnswer scores the click and locks the choice buttons (no double-click)', () => {
    const body = fnBody(DESK, '_bfAnswer');
    expect(body).toMatch(/_bfState\.answered/);
    expect(body).toMatch(/_bfState\.score\s*\+=\s*1/);
    expect(body).toMatch(/btns\[i\]\.disabled\s*=\s*true/);
    // Visual feedback: correct + wrong CSS classes.
    expect(body).toMatch(/bf-correct/);
    expect(body).toMatch(/bf-wrong/);
  });

  it('11: _bfFinish gates auto-mark on ≥ 80% pass', () => {
    const body = fnBody(DESK, '_bfFinish');
    expect(body).toMatch(/BLOOKET_PASS_THRESHOLD/);
    expect(body).toMatch(/_studentMarkSave\s*\(\s*btn\s*,\s*topicId\s*,\s*['"]blooket['"]\s*,/);
    // Fail path provides a retry button.
    expect(body).toMatch(/Try again/);
  });

  it('12: _bfFinish only calls _studentMarkSave when passed===true', () => {
    const body = fnBody(DESK, '_bfFinish');
    // The save call must be inside an `if (passed)` block.
    const saveIdx = body.indexOf('_studentMarkSave');
    expect(saveIdx).toBeGreaterThan(-1);
    // Walk backward to find the nearest `if (` — should reference `passed`.
    const slice = body.slice(0, saveIdx);
    const lastIf = slice.lastIndexOf('if (passed');
    expect(lastIf, 'save must be guarded by if (passed)').toBeGreaterThan(-1);
  });

  it('13: blooket Done button label hints at the flashcard quiz', () => {
    // The _doneBtn function emits "Done (flashcards)" for blooket so students
    // know the click won't immediately mark them done.
    const body = fnBody(DESK, 'showResourcePanel');
    expect(body).toMatch(/Done\s*\(flashcards\)/);
  });

  it('14: _bfCloseUI clears _bfState (called by both close + finish; no leak)', () => {
    // 2026-05-20: close path was refactored into closeBlooketFlashcards
    // (which saves progress first) + _bfCloseUI (which clears in-memory
    // state without touching localStorage). The state-clearing lives in
    // _bfCloseUI now.
    const body = fnBody(DESK, '_bfCloseUI');
    expect(body).toMatch(/_bfState\.topic\s*=\s*null/);
    expect(body).toMatch(/_bfState\.deck\s*=\s*\[\]/);
  });

  it('15: flashcard modal markup exists and is default-hidden', () => {
    expect(DESK).toMatch(/id="bf-overlay"[^>]*class="dialog-overlay"[^>]*display:none/);
    expect(DESK).toMatch(/id="bf-question"/);
    expect(DESK).toMatch(/id="bf-choices"/);
    expect(DESK).toMatch(/id="bf-result"/);
  });

  // ── 2026-05-20: flashcard progress persistence ─────────────────────────────
  it('16: progress storage helpers (_bfSaveProgress/_bfLoadProgress/_bfClearProgress) exist', () => {
    expect(DESK).toMatch(/function\s+_bfSaveProgress\s*\(/);
    expect(DESK).toMatch(/function\s+_bfLoadProgress\s*\(/);
    expect(DESK).toMatch(/function\s+_bfClearProgress\s*\(/);
  });

  it('17: openBlooketFlashcards tries to resume saved progress before fetching CSV', () => {
    const body = fnBody(DESK, 'openBlooketFlashcards');
    expect(body).toMatch(/_bfLoadProgress\s*\(\s*topicId\s*\)/);
    // The fetch must be in an else / fallback branch — saved progress
    // bypasses it entirely.
    const loadIdx = body.indexOf('_bfLoadProgress');
    const fetchIdx = body.indexOf('await fetch');
    expect(loadIdx, 'load attempt before fetch').toBeLessThan(fetchIdx);
  });

  it('18: _bfNext saves progress after each advance', () => {
    const body = fnBody(DESK, '_bfNext');
    expect(body).toMatch(/_bfSaveProgress\s*\(\s*\)/);
    // Must increment idx and save together.
    expect(body).toMatch(/_bfState\.idx\s*\+=\s*1/);
  });

  it('19: closeBlooketFlashcards saves progress (Cancel preserves resume state)', () => {
    const body = fnBody(DESK, 'closeBlooketFlashcards');
    expect(body).toMatch(/_bfSaveProgress\s*\(\s*\)/);
  });

  it('20: _bfFinish clears progress on pass (deck complete) before auto-mark', () => {
    const body = fnBody(DESK, '_bfFinish');
    expect(body).toMatch(/_bfClearProgress\s*\(\s*topicId\s*\)/);
    // The clear must be inside the if(passed) block (before the auto-mark
    // setTimeout). Walk backward from the clear call to confirm.
    const clearIdx = body.indexOf('_bfClearProgress');
    const slice = body.slice(0, clearIdx);
    expect(slice.lastIndexOf('if (passed')).toBeGreaterThan(-1);
  });

  it('21: storage key is scoped per student email', () => {
    const body = fnBody(DESK, '_bfStorageKey');
    expect(body).toMatch(/getStudentEmail/);
    expect(body).toMatch(/apstats_desk_bf_progress_/);
  });

  it('22: load defensively returns null if saved idx is past deck length (corruption guard)', () => {
    const body = fnBody(DESK, '_bfLoadProgress');
    // Must check that idx < deck.length before returning the entry.
    expect(body).toMatch(/entry\.deck\.length/);
    expect(body).toMatch(/idx\s*\|\|\s*0\s*\)\s*>=\s*entry\.deck\.length/);
  });

  it('23: retry button clears + reshuffles + saves new shuffle (fresh start)', () => {
    const body = fnBody(DESK, '_bfFinish');
    // Retry handler must reshuffle, reset idx/score, and save.
    expect(body).toMatch(/_bfShuffle\s*\(\s*_bfState\.deck\s*\)/);
    expect(body).toMatch(/_bfSaveProgress\s*\(\s*\)/);
  });

  // ── 2026-05-20: difficulty-aware top-10 deck trim ──────────────────────────
  it('24: _bfRowsToDeck carries qnum on each card (for tag lookup)', () => {
    const body = fnBody(DESK, '_bfRowsToDeck');
    // qnum must be on the pushed card.
    expect(body).toMatch(/deck\.push\s*\(\s*\{\s*qnum\s*:\s*qnum/);
  });

  it('25: _bfLoadDifficultyTags fetches data/blooket-difficulty.json + caches', () => {
    expect(DESK).toMatch(/async\s+function\s+_bfLoadDifficultyTags\s*\(/);
    const body = fnBody(DESK, '_bfLoadDifficultyTags');
    expect(body).toMatch(/data\/blooket-difficulty\.json/);
    expect(body).toMatch(/_bfDifficultyTags/);
    // Caches: returns existing value if already set.
    expect(body).toMatch(/_bfDifficultyTags\s*!==\s*null/);
  });

  it('26: _bfSelectTop10 function exists and targets 10 cards', () => {
    expect(DESK).toMatch(/function\s+_bfSelectTop10\s*\(/);
    const body = fnBody(DESK, '_bfSelectTop10');
    expect(body).toMatch(/TARGET\s*=\s*10/);
  });

  it('27: _bfSelectTop10 orders hard → med → easy → untagged then slices to TARGET', () => {
    const body = fnBody(DESK, '_bfSelectTop10');
    // Buckets present.
    expect(body).toMatch(/hard\s*=\s*\[\]/);
    expect(body).toMatch(/med\s*=\s*\[\]/);
    expect(body).toMatch(/easy\s*=\s*\[\]/);
    expect(body).toMatch(/untagged\s*=\s*\[\]/);
    // Concat order: hard first, then med, then easy, then untagged.
    expect(body).toMatch(/hard\.concat\s*\(\s*med\s*,\s*easy\s*,\s*untagged\s*\)/);
    // Slice to TARGET at the end.
    expect(body).toMatch(/\.slice\s*\(\s*0\s*,\s*TARGET\s*\)/);
  });

  it('28: _bfSelectTop10 returns all cards when deck.length <= 10', () => {
    const body = fnBody(DESK, '_bfSelectTop10');
    expect(body).toMatch(/allCards\.length\s*<=\s*TARGET/);
  });

  it('29: _bfSelectTop10 falls back to first-TARGET when tagsForFile is empty', () => {
    const body = fnBody(DESK, '_bfSelectTop10');
    expect(body).toMatch(/Object\.keys\s*\(\s*tagsForFile\s*\)\.length\s*===\s*0/);
    // The fallback returns allCards.slice(0, TARGET).
    expect(body).toMatch(/allCards\.slice\s*\(\s*0\s*,\s*TARGET\s*\)/);
  });

  it('30: openBlooketFlashcards calls _bfSelectTop10 in the fresh-load branch', () => {
    const body = fnBody(DESK, 'openBlooketFlashcards');
    expect(body).toMatch(/_bfLoadDifficultyTags\s*\(/);
    expect(body).toMatch(/_bfSelectTop10\s*\(/);
    // Selection happens BEFORE the shuffle.
    const selIdx = body.indexOf('_bfSelectTop10');
    const shufIdx = body.indexOf('_bfShuffle(deck)');
    expect(selIdx).toBeGreaterThan(-1);
    expect(shufIdx).toBeGreaterThan(-1);
    expect(selIdx).toBeLessThan(shufIdx);
  });

  it('31: _bfSelectTop10 smoke-test — hard-first ordering on synthetic input', () => {
    // Pull the function body out of the source and run it for real.
    const src = fnBody(DESK, '_bfSelectTop10');
    // eslint-disable-next-line no-new-func
    const factory = new Function('return (' + src + ');');
    const _bfSelectTop10 = factory();

    const allCards = [];
    for (let i = 1; i <= 12; i++) allCards.push({ qnum: i, q: 'Q' + i });

    const tags = {
      '1': { difficulty: 'easy' },
      '2': { difficulty: 'easy' },
      '3': { difficulty: 'easy' },
      '4': { difficulty: 'easy' },
      '5': { difficulty: 'med' },
      '6': { difficulty: 'med' },
      '7': { difficulty: 'med' },
      '8': { difficulty: 'med' },
      '9': { difficulty: 'med' },
      '10': { difficulty: 'hard' },
      '11': { difficulty: 'hard' },
      '12': { difficulty: 'hard' }
    };

    const picked = _bfSelectTop10(allCards, 'foo.csv', tags);
    expect(picked).toHaveLength(10);

    // First 3 must be the hard cards (qnum 10, 11, 12 in some order).
    const firstThreeQnums = picked.slice(0, 3).map(c => c.qnum).sort();
    expect(firstThreeQnums).toEqual([10, 11, 12]);

    // Next 5 must be the med cards (qnum 5-9).
    const nextFiveQnums = picked.slice(3, 8).map(c => c.qnum).sort();
    expect(nextFiveQnums).toEqual([5, 6, 7, 8, 9]);

    // Last 2 are easy.
    const lastTwoQnums = picked.slice(8, 10).map(c => c.qnum).sort();
    expect(lastTwoQnums[0]).toBeGreaterThanOrEqual(1);
    expect(lastTwoQnums[1]).toBeLessThanOrEqual(4);
  });

  it('32: _bfSelectTop10 smoke-test — fewer than 10 cards returned unchanged', () => {
    const src = fnBody(DESK, '_bfSelectTop10');
    // eslint-disable-next-line no-new-func
    const factory = new Function('return (' + src + ');');
    const _bfSelectTop10 = factory();

    const allCards = [{ qnum: 1 }, { qnum: 2 }, { qnum: 3 }];
    const picked = _bfSelectTop10(allCards, 'small.csv', { '1': { difficulty: 'hard' } });
    expect(picked).toHaveLength(3);
    expect(picked.map(c => c.qnum)).toEqual([1, 2, 3]);
  });

  it('33: _bfSelectTop10 smoke-test — empty tags falls back to first-10', () => {
    const src = fnBody(DESK, '_bfSelectTop10');
    // eslint-disable-next-line no-new-func
    const factory = new Function('return (' + src + ');');
    const _bfSelectTop10 = factory();

    const allCards = [];
    for (let i = 1; i <= 15; i++) allCards.push({ qnum: i });
    const picked = _bfSelectTop10(allCards, 'untagged.csv', {});
    expect(picked).toHaveLength(10);
    expect(picked.map(c => c.qnum)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  // ── 2026-05-20: keyboard navigation in the flashcard modal ────────────────
  it('34: _bfKeydownHandler function exists', () => {
    expect(DESK).toMatch(/function\s+_bfKeydownHandler\s*\(/);
  });

  it('35: keydown handler has active-element guard (INPUT/TEXTAREA/SELECT/contentEditable)', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    expect(body).toMatch(/tag\s*===\s*['"]INPUT['"]/);
    expect(body).toMatch(/tag\s*===\s*['"]TEXTAREA['"]/);
    expect(body).toMatch(/tag\s*===\s*['"]SELECT['"]/);
    expect(body).toMatch(/isContentEditable/);
  });

  it('36: keydown handler has modifier guard (ctrl/meta/alt/shift)', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    expect(body).toMatch(/e\.ctrlKey/);
    expect(body).toMatch(/e\.metaKey/);
    expect(body).toMatch(/e\.altKey/);
    expect(body).toMatch(/e\.shiftKey/);
  });

  it('37: keydown handler maps letters a-d to choice indices 0-3', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    // Letter map present.
    expect(body).toMatch(/['"]abcd['"]\.indexOf\s*\(\s*key\s*\)/);
  });

  it('38: keydown handler maps numbers 1-4 to choice indices', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    expect(body).toMatch(/key\s*===\s*['"]1['"]/);
    expect(body).toMatch(/parseInt\s*\(\s*key\s*,\s*10\s*\)\s*-\s*1/);
  });

  it('39: keydown handler advances on Enter when already answered + next visible', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    expect(body).toMatch(/_bfState\.answered/);
    expect(body).toMatch(/key\s*===\s*['"]enter['"]/);
    expect(body).toMatch(/bf-next/);
    expect(body).toMatch(/nextBtn\.click/);
  });

  it('40: openBlooketFlashcards attaches keydown listener after rendering', () => {
    const body = fnBody(DESK, 'openBlooketFlashcards');
    expect(body).toMatch(/addEventListener\s*\(\s*['"]keydown['"]\s*,\s*_bfKeydownHandler\s*\)/);
    // Attach AFTER first render call (so initial card is showing).
    const renderIdx = body.indexOf('_bfRenderCard()');
    const attachIdx = body.indexOf("addEventListener('keydown'");
    expect(renderIdx).toBeGreaterThan(-1);
    expect(attachIdx).toBeGreaterThan(renderIdx);
  });

  it('41: _bfCloseUI detaches keydown listener (no leak between modal opens)', () => {
    const body = fnBody(DESK, '_bfCloseUI');
    expect(body).toMatch(/removeEventListener\s*\(\s*['"]keydown['"]\s*,\s*_bfKeydownHandler\s*\)/);
  });

  it('42: progress text in _bfRenderCard mentions the keyboard shortcut hint', () => {
    const body = fnBody(DESK, '_bfRenderCard');
    expect(body).toMatch(/a-d\s+or\s+1-4/);
  });

  // ── difficulty JSON sanity ────────────────────────────────────────────────
  it('43: data/blooket-difficulty.json exists with valid schema + per-file tags', () => {
    const diffPath = resolve(repo, 'data', 'blooket-difficulty.json');
    expect(existsSync(diffPath), 'blooket-difficulty.json must exist').toBe(true);
    const raw = readFileSync(diffPath, 'utf8');
    const data = JSON.parse(raw);
    expect(data.version, 'version is a positive integer').toBeGreaterThanOrEqual(1);
    expect(data.tags).toBeTypeOf('object');
    const files = Object.keys(data.tags);
    expect(files.length, 'should cover ~67 CSVs in repo').toBeGreaterThanOrEqual(60);
    // Every entry across every file has a valid difficulty + a non-empty rationale.
    let totalEntries = 0;
    for (const f of files) {
      const entries = data.tags[f];
      for (const k of Object.keys(entries)) {
        totalEntries++;
        expect(['hard', 'med', 'easy'], `${f}#${k} difficulty`).toContain(entries[k].difficulty);
        expect(typeof entries[k].rationale, `${f}#${k} rationale`).toBe('string');
        expect(entries[k].rationale.length, `${f}#${k} rationale non-empty`).toBeGreaterThan(0);
        // ASCII-only rationale (no smart quotes / em-dashes).
        // eslint-disable-next-line no-control-regex
        expect(/^[\x00-\x7F]*$/.test(entries[k].rationale), `${f}#${k} rationale ASCII`).toBe(true);
      }
    }
    expect(totalEntries, 'corpus has thousands of tagged questions').toBeGreaterThan(1500);
  });

  it('44: no CSV is tagged all-one-difficulty (lazy-tagging guard)', () => {
    const diffPath = resolve(repo, 'data', 'blooket-difficulty.json');
    const data = JSON.parse(readFileSync(diffPath, 'utf8'));
    const offenders = [];
    for (const f of Object.keys(data.tags)) {
      const diffs = Object.values(data.tags[f]).map(e => e.difficulty);
      if (diffs.length >= 5 && new Set(diffs).size === 1) offenders.push(f);
    }
    expect(offenders, 'CSVs tagged a single difficulty for every question').toEqual([]);
  });

  // ── 2026-05-20: _bfSelectTop10 edge-case smoke tests ──────────────────────
  it('45: _bfSelectTop10 smoke — deck with ZERO hard cards still yields 10', () => {
    const src = fnBody(DESK, '_bfSelectTop10');
    // eslint-disable-next-line no-new-func
    const _bfSelectTop10 = new Function('return (' + src + ');')();

    const allCards = [];
    for (let i = 1; i <= 14; i++) allCards.push({ qnum: i });
    const tags = {};
    for (let i = 1; i <= 8; i++) tags[String(i)] = { difficulty: 'med' };
    for (let i = 9; i <= 14; i++) tags[String(i)] = { difficulty: 'easy' };

    const picked = _bfSelectTop10(allCards, 'nohard.csv', tags);
    expect(picked).toHaveLength(10);
    // First 8 are the med cards; last 2 come from easy.
    const firstEight = picked.slice(0, 8).map(c => c.qnum).sort((a, b) => a - b);
    expect(firstEight).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const lastTwo = picked.slice(8, 10).map(c => c.qnum);
    for (const q of lastTwo) expect(q).toBeGreaterThanOrEqual(9);
  });

  it('46: _bfSelectTop10 smoke — untagged qnums sink to the end, never dropped', () => {
    const src = fnBody(DESK, '_bfSelectTop10');
    // eslint-disable-next-line no-new-func
    const _bfSelectTop10 = new Function('return (' + src + ');')();

    const allCards = [];
    for (let i = 1; i <= 12; i++) allCards.push({ qnum: i });
    // Only 3 of 12 are tagged (all hard); the other 9 have no tag entry.
    const tags = {
      '5': { difficulty: 'hard' },
      '9': { difficulty: 'hard' },
      '11': { difficulty: 'hard' }
    };
    const picked = _bfSelectTop10(allCards, 'sparse.csv', tags);
    expect(picked).toHaveLength(10);
    // The 3 hard cards lead.
    const firstThree = picked.slice(0, 3).map(c => c.qnum).sort((a, b) => a - b);
    expect(firstThree).toEqual([5, 9, 11]);
    // The remaining 7 are untagged cards (in original order) — none of them is
    // a tagged qnum, and the deck did not shrink below 10.
    const rest = picked.slice(3).map(c => c.qnum);
    for (const q of rest) expect([5, 9, 11]).not.toContain(q);
  });

  // ── 2026-05-20: _bfKeydownHandler real-execution tests ────────────────────
  // The handler closes over `document`, `_bfState`, `_bfAnswer`. We extract its
  // source and instantiate it with injected fakes so the real branch logic runs.
  function makeKeyHandler({ overlayDisplay = 'block', activeTag = null,
                            isContentEditable = false, answered = false,
                            nextDisplay = 'inline-block',
                            deck = [{ choices: ['c0', 'c1', 'c2', 'c3'], correctIdx: 0 }] } = {}) {
    const calls = { answered: [], nextClicked: 0 };
    const fakeDoc = {
      activeElement: activeTag ? { tagName: activeTag, isContentEditable } : null,
      getElementById(id) {
        if (id === 'bf-overlay') return { style: { display: overlayDisplay } };
        if (id === 'bf-next') return { style: { display: nextDisplay }, click() { calls.nextClicked++; } };
        return null;
      }
    };
    const fakeState = { answered, idx: 0, deck };
    const fakeAnswer = (i) => calls.answered.push(i);
    const src = fnBody(DESK, '_bfKeydownHandler');
    // eslint-disable-next-line no-new-func
    const handler = new Function('document', '_bfState', '_bfAnswer',
      'return (' + src + ');')(fakeDoc, fakeState, fakeAnswer);
    return { handler, calls };
  }

  function ev(key) {
    let prevented = false;
    return { obj: { key, preventDefault() { prevented = true; } }, get prevented() { return prevented; } };
  }

  it('47: keydown smoke — letter b selects choice index 1', () => {
    const { handler, calls } = makeKeyHandler();
    const e = ev('b');
    handler(e.obj);
    expect(calls.answered).toEqual([1]);
    expect(e.prevented).toBe(true);
  });

  it('48: keydown smoke — number 3 selects choice index 2', () => {
    const { handler, calls } = makeKeyHandler();
    handler(ev('3').obj);
    expect(calls.answered).toEqual([2]);
  });

  it('49: keydown smoke — modifier key (ctrl) is a no-op', () => {
    const { handler, calls } = makeKeyHandler();
    handler({ key: 'a', ctrlKey: true, preventDefault() {} });
    expect(calls.answered).toEqual([]);
  });

  it('50: keydown smoke — focus in an INPUT is a no-op', () => {
    const { handler, calls } = makeKeyHandler({ activeTag: 'INPUT' });
    handler(ev('a').obj);
    expect(calls.answered).toEqual([]);
  });

  it('51: keydown smoke — hidden overlay is a no-op', () => {
    const { handler, calls } = makeKeyHandler({ overlayDisplay: 'none' });
    handler(ev('a').obj);
    expect(calls.answered).toEqual([]);
  });

  it('52: keydown smoke — Enter when answered clicks the Next button', () => {
    const { handler, calls } = makeKeyHandler({ answered: true });
    handler(ev('Enter').obj);
    expect(calls.nextClicked).toBe(1);
    expect(calls.answered).toEqual([]);
  });

  it('53: keydown smoke — d on a 3-choice card is a no-op (idx out of range)', () => {
    const { handler, calls } = makeKeyHandler({
      deck: [{ choices: ['c0', 'c1', 'c2'], correctIdx: 0 }]
    });
    handler(ev('d').obj);
    expect(calls.answered).toEqual([]);
  });

  it('54: keydown smoke — letter a still selects on that 3-choice card', () => {
    const { handler, calls } = makeKeyHandler({
      deck: [{ choices: ['c0', 'c1', 'c2'], correctIdx: 0 }]
    });
    handler(ev('a').obj);
    expect(calls.answered).toEqual([0]);
  });
});
