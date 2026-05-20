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

  it('02: BLOOKET_GATE_MS is 15 minutes', () => {
    expect(DESK).toMatch(/const\s+BLOOKET_GATE_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
  });

  it('03: deskDoneGateMs(artifact) returns BLOOKET_GATE_MS for blooket', () => {
    const body = fnBody(DESK, 'deskDoneGateMs');
    expect(body).toMatch(/artifact\s*===\s*['"]blooket['"]/);
    expect(body).toMatch(/BLOOKET_GATE_MS/);
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

  it('14: closeBlooketFlashcards clears _bfState (no leak across attempts)', () => {
    const body = fnBody(DESK, 'closeBlooketFlashcards');
    expect(body).toMatch(/_bfState\.topic\s*=\s*null/);
    expect(body).toMatch(/_bfState\.deck\s*=\s*\[\]/);
  });

  it('15: flashcard modal markup exists and is default-hidden', () => {
    expect(DESK).toMatch(/id="bf-overlay"[^>]*class="dialog-overlay"[^>]*display:none/);
    expect(DESK).toMatch(/id="bf-question"/);
    expect(DESK).toMatch(/id="bf-choices"/);
    expect(DESK).toMatch(/id="bf-result"/);
  });
});
