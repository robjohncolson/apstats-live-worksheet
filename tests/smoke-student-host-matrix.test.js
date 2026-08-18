// smoke-student-host-matrix.test.js — static pins on the W0 host-matrix smoke script.
// The script imports playwright-core (a teacher-run tool, not a test dependency), so we
// read its SOURCE instead of importing it, and pin the flashcard asset checks textually.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(repo, 'scripts/smoke-student-host-matrix.mjs'), 'utf8');

describe('student host matrix — flashcard assets (static)', () => {
  it('declares the Vercel mirror origin', () => {
    expect(SRC).toMatch(/WS_MIRROR:\s*'https:\/\/apstats-live-worksheet\.vercel\.app\/'/);
  });

  it('checks flashcards.js and a representative deck on GH Pages', () => {
    expect(SRC).toMatch(/host: 'GH_Pages_Desk', resource: 'flashcards_js', url: LESSON\.flashcardsJs/);
    expect(SRC).toMatch(/host: 'GH_Pages_Desk', resource: 'flashcards_deck_u1_l1', url: LESSON\.flashcardsDeckU1L1/);
    expect(SRC).toMatch(/flashcardsDeckU1L1: `\$\{WS\}\/u1_l1_blooket\.csv`/);
  });

  it('checks flashcards.js and a representative deck on the Vercel mirror', () => {
    expect(SRC).toMatch(/host: 'Vercel_Mirror', resource: 'flashcards_js', url: `\$\{WS_MIRROR\}\/flashcards\.js`/);
    expect(SRC).toMatch(/host: 'Vercel_Mirror', resource: 'flashcards_deck_u1_l1', url: `\$\{WS_MIRROR\}\/u1_l1_blooket\.csv`/);
  });
});
