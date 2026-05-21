/**
 * tests/worksheet-completion-tracker.test.js
 *
 * Verifies the WORKSHEET_COMPLETION_GATE_BUILD.md §3-§4 completion-tracker
 * block was correctly wired into every u*_lesson*_live.html by
 * scripts/wire-completion-tracker.mjs.
 *
 * Pins the per-worksheet contract:
 *   - `function updateWorksheetCompletion` exists (exactly one).
 *   - The block writes the `apstats_ws_completion` localStorage key.
 *   - The `input` listener + the MutationObserver are wired.
 *   - The block appears AFTER `hydratePriorAnswers`.
 *   - The eligibility rule is `eligible = allE || pct >= 0.80` (source match).
 *   - File EOL is consistent (no CRLF/LF mixing).
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const WORKSHEETS = readdirSync(ROOT)
  .filter((f) => /^u\d+_lesson.+_live\.html$/.test(f))
  .sort();

describe('worksheet-completion-tracker — file discovery', () => {
  it('finds the expected 69 worksheets', () => {
    expect(WORKSHEETS.length).toBe(69);
  });
});

describe.each(WORKSHEETS)('%s — completion-tracker block', (file) => {
  const html = readFileSync(resolve(ROOT, file), 'utf8');

  it('contains function updateWorksheetCompletion exactly once', () => {
    const matches = html.match(/function updateWorksheetCompletion/g) || [];
    expect(matches.length).toBe(1);
  });

  it('contains the _wsCompletionKey + _wsStudentKey + _wsReflectionTextareas helpers', () => {
    expect(html).toContain('function _wsCompletionKey');
    expect(html).toContain('function _wsStudentKey');
    expect(html).toContain('function _wsReflectionTextareas');
  });

  it('writes the apstats_ws_completion localStorage key', () => {
    // The Desk reads this exact key — pin both the read (getItem) and the
    // write (setItem) so the shared §3 contract can't drift.
    expect(html).toContain("localStorage.setItem('apstats_ws_completion'");
    expect(html).toContain("localStorage.getItem('apstats_ws_completion'");
  });

  it('keys the store by the worksheet filename', () => {
    // §3: the worksheet writes its own filename key via location.pathname.
    expect(html).toContain("(location.pathname || '').split('/').pop()");
  });

  it('store is student-scoped — nested by studentKey, never global', () => {
    // The MAJOR shared-browser fix: completion is keyed per student so one
    // student's progress never leaks to the next on a shared device.
    expect(html).toContain('var studentKey = _wsStudentKey();');
    expect(html).toContain('store[studentKey][key] =');
    // No identity → no write (the Desk only gates signed-in students).
    expect(html).toContain('if (!studentKey) return;');
  });

  it('_wsStudentKey mirrors the Desk identity (legacy email OR rosterClient username)', () => {
    expect(html).toContain("localStorage.getItem('apstats_desk_student_email')");
    expect(html).toContain("who.username + '@roster.local'");
  });

  it("wires the 'input' listener for manual typing", () => {
    expect(html).toContain("document.addEventListener('input', _wsCompDebounced)");
  });

  it('wires a MutationObserver for class / data-restored mutations', () => {
    // Reflection grading (graded-E) + hydration (data-restored) are attribute
    // mutations, not input events — the observer must catch them.
    const idxComp = html.indexOf('function updateWorksheetCompletion');
    const body = html.slice(idxComp, idxComp + 4000);
    expect(body).toContain('new MutationObserver(_wsCompDebounced)');
    expect(body).toContain("attributeFilter: ['class', 'data-restored']");
  });

  it('fires an initial compute on load plus a delayed pass', () => {
    const idxComp = html.indexOf('function updateWorksheetCompletion');
    const body = html.slice(idxComp, idxComp + 4000);
    expect(body).toContain("addEventListener('DOMContentLoaded', updateWorksheetCompletion)");
    expect(body).toContain('setTimeout(updateWorksheetCompletion, 2500)');
  });

  it('completion block appears AFTER hydratePriorAnswers', () => {
    const idxHyd  = html.indexOf('function hydratePriorAnswers');
    const idxComp = html.indexOf('function updateWorksheetCompletion');
    expect(idxHyd).toBeGreaterThan(0);
    expect(idxComp).toBeGreaterThan(idxHyd);
  });

  it('pins the eligibility rule: eligible = allE || pct >= 0.80', () => {
    // §1/§3 — eligibility is "all reflections E" OR ">= 80% attempted".
    // Pin the full expression by source match so the threshold can't drift.
    expect(html).toContain('var eligible = allE || pct >= 0.80;');
    // Pin the 80% gate term and the OR with the all-E term independently.
    expect(html).toContain('pct >= 0.80');
    expect(html).toContain('allE || ');
  });

  it('computes pct from filled / total with a zero-total guard', () => {
    // §3: pct = total > 0 ? filled / total : 0.
    expect(html).toContain('var pct = total > 0 ? filled / total : 0;');
  });

  it('reflectionsAllE is false when there are zero reflections', () => {
    // §3: when a worksheet has zero reflections, allE must NOT be a free
    // pass — it is seeded from `reflectionsTotal > 0`.
    expect(html).toContain('var allE = reflectionsTotal > 0;');
  });

  it('detects all-E reflections via the graded-E CSS class', () => {
    expect(html).toContain("contains('graded-E')");
  });

  it('excludes appeal-form textareas from the reflection set', () => {
    // _wsReflectionTextareas must skip appeal-form boxes so an appeal
    // textarea is never counted as an un-filled reflection.
    expect(html).toContain("ta.closest('.appeal-form')");
  });

  it('completion block has consistent EOL with the rest of the file', () => {
    const hasCRLF = html.indexOf('\r\n') >= 0;
    const hasLoneLF = /(?<!\r)\n/.test(html);
    // Either all CRLF or all LF — never mixed.
    expect(hasCRLF && hasLoneLF).toBe(false);
  });

  it('is read-only on the network (pure localStorage, no record())', () => {
    // The tracker must NEVER write to the gradebook — it is a pure
    // localStorage computation. Pin the block does not invoke record().
    const idxComp = html.indexOf('function updateWorksheetCompletion');
    const body = html.slice(idxComp, idxComp + 4000);
    expect(body).not.toContain('gradebookClient.record');
  });
});
