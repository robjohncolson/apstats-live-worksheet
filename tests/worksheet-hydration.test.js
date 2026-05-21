/**
 * tests/worksheet-hydration.test.js
 *
 * Verifies the PERSISTENT_ANSWERS_BUILD.md §5 hydration block was correctly
 * wired into every u*_lesson*_live.html by scripts/wire-hydration.mjs.
 *
 * Pins the per-worksheet contract:
 *   - `function hydratePriorAnswers` exists (exactly one).
 *   - `function _markRestored` exists (exactly one).
 *   - DOMContentLoaded or immediate-fire trigger is present.
 *   - The block appears AFTER `function recordReflectionToGradebook`.
 *   - The block uses `gbWsPrefix()` (matches the DN2b write-side vocabulary).
 *   - File EOL is consistent (no CRLF/LF mixing).
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const WORKSHEETS = readdirSync(ROOT)
  .filter((f) => /^u\d+_lesson.+_live\.html$/.test(f))
  .sort();

describe('worksheet-hydration — file discovery', () => {
  it('finds the expected 69 worksheets', () => {
    expect(WORKSHEETS.length).toBe(69);
  });
});

describe.each(WORKSHEETS)('%s — hydration block', (file) => {
  const html = readFileSync(resolve(ROOT, file), 'utf8');

  it('contains function hydratePriorAnswers exactly once', () => {
    const matches = html.match(/function hydratePriorAnswers/g) || [];
    expect(matches.length).toBe(1);
  });

  it('contains function _markRestored exactly once', () => {
    const matches = html.match(/function _markRestored/g) || [];
    expect(matches.length).toBe(1);
  });

  it('contains DOMContentLoaded hydration trigger', () => {
    // The IIFE registers hydratePriorAnswers on DOMContentLoaded OR fires it
    // immediately via setTimeout(hydratePriorAnswers, 0) if the doc is ready.
    expect(html).toContain("addEventListener('DOMContentLoaded', hydratePriorAnswers)");
    expect(html).toContain('setTimeout(hydratePriorAnswers, 0)');
  });

  it('contains storage-event re-hydration trigger', () => {
    expect(html).toContain("window.addEventListener('storage'");
    expect(html).toContain('apstats_roster.v1');
  });

  it('hydration block appears AFTER recordReflectionToGradebook', () => {
    const idxRefl = html.indexOf('function recordReflectionToGradebook');
    const idxHyd  = html.indexOf('function hydratePriorAnswers');
    expect(idxRefl).toBeGreaterThan(0);
    expect(idxHyd).toBeGreaterThan(idxRefl);
  });

  it('hydration uses gbWsPrefix() (matches DN2b write-side vocabulary)', () => {
    // The hydration block must call gbWsPrefix() so the read-prefix matches
    // the write-prefix recordReflectionToGradebook / recordBlankToGradebook
    // use. Otherwise restored answers will land in the wrong items.
    const idxHyd  = html.indexOf('function hydratePriorAnswers');
    const idxClose = html.indexOf('function _markRestored');
    expect(idxClose).toBeGreaterThan(idxHyd);
    const body = html.slice(idxHyd, idxClose);
    expect(body).toContain('gbWsPrefix()');
    expect(body).toContain('window.gradebookClient.fetchPrior');
  });

  it('hydration calls fetchPrior (read-only — no record() inside)', () => {
    // The hydration block must NEVER write — it's read-only on purpose.
    // Find the block and ensure it does not invoke gradebookClient.record(...).
    const idxHyd  = html.indexOf('function hydratePriorAnswers');
    const idxClose = html.indexOf('function _markRestored');
    const body = html.slice(idxHyd, idxClose);
    expect(body).toContain('fetchPrior');
    expect(body).not.toContain('gradebookClient.record');
  });

  it('hydration block has consistent EOL with the rest of the file', () => {
    const hasCRLF = html.indexOf('\r\n') >= 0;
    const hasLoneLF = /(?<!\r)\n/.test(html);
    // Either all CRLF or all LF — never mixed.
    expect(hasCRLF && hasLoneLF).toBe(false);
  });

  it('marks restored elements with a ↻ badge', () => {
    // The badge UX is part of the §5 contract (so students see what changed).
    const idxHyd  = html.indexOf('function hydratePriorAnswers');
    const idxClose = html.indexOf('function _markRestored');
    expect(idxClose).toBeGreaterThan(idxHyd);
    // Look INSIDE the markRestored body to be robust to source layout.
    const tailStart = html.indexOf('function _markRestored');
    const tail = html.slice(tailStart, tailStart + 2000);
    expect(tail).toContain('restored-badge');
    expect(tail).toContain('↻ restored');
  });
});
