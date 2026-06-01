// desk-modal-polish.test.js — Task #8 DESK_MODAL_POLISH structure pins.
// 2026-05-20 rewrite: stripped the keyboard-nav pins (letter/number badges +
// modal-scoped keydown handler) since the UX was removed per teacher feedback.
// 2026-06 rewrite: the inline quiz self-report score input (prong A) was
// REPLACED by an auto score+completion gate — the quiz Done button now reads
// the recorded cr-quiz performance (_quizPerfFor) and unlocks only at
// >=40% answered AND >=40% correct. Pins 05/06/16 updated accordingly.
// Kept: visit-gate preservation (off-pattern worksheets) + AI-tutor button
// preservation + removal regression guards.
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

describe('DESK_MODAL_POLISH — prong A inline quiz score + removal regression pins', () => {

  it('pin 01: the Desk file exists', () => {
    expect(DESK, 'Desk file must exist').toBeTypeOf('string');
  });

  it('pin 02: studentMark no longer contains a non-comment prompt( call', () => {
    const body = fnBody(DESK, 'studentMark');
    const stripped = body.replace(/\/\/[^\n]*/g, '');
    expect(stripped).not.toMatch(/\bprompt\s*\(/);
  });

  it('pin 03: _studentMarkSave contains the optimistic mutation BEFORE the first await recordProgress', () => {
    const body = fnBody(DESK, '_studentMarkSave');
    // 2026-05-20: optimistic latch label is "Completed" (was "Saved").
    const savedIdx = body.indexOf("btn.textContent = '✓ Completed'");
    expect(savedIdx, "optimistic '✓ Completed' assignment must exist in _studentMarkSave").toBeGreaterThan(-1);
    const awaitIdx = body.indexOf('await recordProgress');
    expect(awaitIdx, 'await recordProgress must exist in _studentMarkSave').toBeGreaterThan(-1);
    expect(savedIdx, 'optimistic mutation must appear BEFORE await recordProgress').toBeLessThan(awaitIdx);
  });

  it('pin 04: quiz Done button is wrapped in a span.desk-quiz-done-slot', () => {
    expect(DESK).toMatch(/class="desk-quiz-done-slot"/);
    expect(DESK).toMatch(/data-artifact="quiz"/);
  });

  it('pin 05: quiz Done is gated on recorded performance (_quizPerfFor); self-report input removed', () => {
    expect(DESK, '_quizPerfFor helper must exist').toMatch(/function\s+_quizPerfFor\s*\(/);
    const done = fnBody(DESK, '_doneBtn');
    expect(done, '_doneBtn must consult _quizPerfFor for the quiz gate').toMatch(/_quizPerfFor\s*\(/);
    // The self-report inline score input + its helpers are gone.
    expect(DESK, 'no inline quiz score input').not.toMatch(/desk-quiz-score-input/);
    expect(DESK, '_studentMarkQuizSave removed').not.toMatch(/_studentMarkQuizSave/);
    expect(DESK, '_studentMarkQuizCancel removed').not.toMatch(/_studentMarkQuizCancel/);
  });

  it('pin 06: the quiz Done gate requires BOTH answered>=40% AND scored>=40%', () => {
    const body = fnBody(DESK, '_quizPerfFor');
    expect(body, 'gate reads the score %').toMatch(/scorePct/);
    expect(body, 'gate reads completion %').toMatch(/completionPct/);
    expect(body, 'eligible requires score >= threshold')
      .toMatch(/scorePct\s*>=\s*DESK_QUIZ_DONE_THRESHOLD/);
    expect(body, 'eligible requires completion >= threshold')
      .toMatch(/completionPct\s*>=\s*DESK_QUIZ_DONE_THRESHOLD/);
    expect(DESK, 'threshold constant is 40').toMatch(/DESK_QUIZ_DONE_THRESHOLD\s*=\s*40/);
    // The Done button face shows the score % as "Done (nn% complete)".
    const done = fnBody(DESK, '_doneBtn');
    expect(done, 'quiz Done label shows "% complete)"').toMatch(/% complete\)/);
  });

  it('pin 07: visit-gate (540d168) is preserved — deskDoneGateMs and "Done in ~" are still present', () => {
    expect(DESK).toMatch(/deskDoneGateMs/);
    expect(DESK).toMatch(/Done in ~/);
  });

  it('pin 08: recordProgress body is unchanged (fingerprint: source-of-truth comment + localStorage.setItem + supabase POST)', () => {
    const rpBody = fnBody(DESK, 'recordProgress');
    expect(rpBody).toMatch(/source of truth/);
    expect(rpBody).toMatch(/localStorage\s*\.\s*setItem/);
    expect(rpBody).toMatch(/\/rest\/v1\/student_progress/);
  });

  it('pin 09: AI-tutor buttons (Phase 5/5.1) still render in showResourcePanel', () => {
    const panelBody = fnBody(DESK, 'showResourcePanel');
    expect(panelBody).toMatch(/copyTutorPrompt\s*\(/);
    expect(panelBody).toMatch(/copyTutorPromptPc\s*\(/);
  });

  // ── 2026-05-20: keyboard-nav removal regression guards ─────────────────────
  // The letter+number badges + modal-scoped keydown handler were stripped per
  // teacher feedback ("looks weird, feels weird"). These pins fail if anyone
  // re-introduces them by mistake.

  it('pin 10: NO resource-modal keydown handler (_resourcePanelKeyHandler removed)', () => {
    // The handler variable + attach/detach helpers + _focusedLetter / _setFocusedRow
    // should all be gone from the source. Day-grade modal's _dayGradeKeyHandler
    // stays (separate feature).
    expect(DESK, 'no _resourcePanelKeyHandler').not.toMatch(/_resourcePanelKeyHandler/);
    expect(DESK, 'no _attachResourcePanelKeyHandler').not.toMatch(/_attachResourcePanelKeyHandler/);
    expect(DESK, 'no _detachResourcePanelKeyHandler').not.toMatch(/_detachResourcePanelKeyHandler/);
    expect(DESK, 'no _focusedLetter').not.toMatch(/_focusedLetter/);
    expect(DESK, 'no _setFocusedRow').not.toMatch(/_setFocusedRow/);
  });

  it('pin 11: NO resource-modal letter/number badges in source', () => {
    // The badge classes the decoration code emitted are gone.
    expect(DESK, 'no desk-row-letter-badge').not.toMatch(/desk-row-letter-badge/);
    expect(DESK, 'no desk-row-number-badge').not.toMatch(/desk-row-number-badge/);
    // Also no data-attrs the decoration set.
    expect(DESK, 'no data-desk-row-letter').not.toMatch(/data-desk-row-letter/);
  });

  it('pin 12: closeResourcePanel is a 3-line plain close (no detach side-effects)', () => {
    const body = fnBody(DESK, 'closeResourcePanel');
    // Must NOT call a removed detach helper.
    expect(body).not.toMatch(/_detachResourcePanelKeyHandler/);
    expect(body).not.toMatch(/_focusedLetter/);
    // Must still hide the overlay.
    expect(body).toMatch(/style\.display\s*=\s*['"]none['"]/);
  });

  it('pin 13: day-grade modal still has its own Esc handler (separate feature unaffected)', () => {
    // Day-grade modal is independent of the resource modal and keeps its Esc.
    expect(DESK).toMatch(/_attachDayGradeKeyHandler/);
    expect(DESK).toMatch(/_detachDayGradeKeyHandler/);
  });

  // ── 2026-05-20 v2: Blooket flashcard verification (stronger chain of custody) ─
  // The earlier inline-score-input for Blooket was self-attest theater.
  // Replaced with a flashcard quiz sourced from the same Blooket CSV;
  // student must score ≥ 80% on a single pass to auto-mark Done.

  it('pin 14: blooket Done button is wrapped in span.desk-quiz-done-slot', () => {
    // Slot wrapping is still present (the studentMark dispatch still needs
    // a slot anchor to find its button), but Blooket no longer swaps in
    // an inline score input — it opens the flashcard modal instead.
    expect(DESK).toMatch(/class="desk-quiz-done-slot"\s+data-topic="[^"]+"\s+data-artifact="blooket"/);
  });

  it('pin 15: studentMark routes blooket to openBlooketFlashcards (NOT the inline score)', () => {
    const body = fnBody(DESK, 'studentMark');
    expect(body).toMatch(/artifact\s*===\s*['"]blooket['"]/);
    expect(body).toMatch(/openBlooketFlashcards\s*\(\s*btn\s*,\s*topicId\s*\)/);
    // Blooket branch must NOT use the inline score input UX.
    // (The "Blooket % correct" label is gone.)
    expect(body).not.toMatch(/Blooket %\s*correct/i);
  });

  it('pin 16: studentMark quiz path marks Done with the recorded score (no inline input)', () => {
    const body = fnBody(DESK, 'studentMark');
    expect(body).toMatch(/artifact\s*===\s*['"]quiz['"]/);
    // Auto score from _quizPerfFor, then _studentMarkSave — no slot swap.
    expect(body).toMatch(/_quizPerfFor\s*\(\s*topicId\s*\)/);
    expect(body).toMatch(/_studentMarkSave\s*\(\s*btn\s*,\s*topicId\s*,\s*artifact\s*,/);
    expect(body, 'no inline score swap in studentMark').not.toMatch(/desk-quiz-score-input/);
  });

  it('pin 17: blooket is STILL excluded from the gradebook ledger (Phase 3 spec §6 preserved)', () => {
    const body = fnBody(DESK, '_studentMarkSave');
    expect(body).toMatch(/artifact\s*!==\s*['"]blooket['"]/);
  });
});
