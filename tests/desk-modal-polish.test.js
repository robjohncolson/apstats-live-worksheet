// desk-modal-polish.test.js — Task #8 DESK_MODAL_POLISH structure pins.
// 2026-05-20 rewrite: stripped the keyboard-nav pins (letter/number badges +
// modal-scoped keydown handler) since the UX was removed per teacher feedback.
// Kept: inline quiz score input (prong A) + visit-gate preservation + AI-tutor
// button preservation + removal regression guards.
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
    const savedIdx = body.indexOf("btn.textContent = '✓ Saved'");
    expect(savedIdx, "optimistic '✓ Saved' assignment must exist in _studentMarkSave").toBeGreaterThan(-1);
    const awaitIdx = body.indexOf('await recordProgress');
    expect(awaitIdx, 'await recordProgress must exist in _studentMarkSave').toBeGreaterThan(-1);
    expect(savedIdx, 'optimistic mutation must appear BEFORE await recordProgress').toBeLessThan(awaitIdx);
  });

  it('pin 04: quiz Done button is wrapped in a span.desk-quiz-done-slot', () => {
    expect(DESK).toMatch(/class="desk-quiz-done-slot"/);
    expect(DESK).toMatch(/data-artifact="quiz"/);
  });

  it('pin 05: _studentMarkQuizSave helper exists and is referenced from the inline Save onclick', () => {
    expect(DESK).toMatch(/function\s+_studentMarkQuizSave\s*\(/);
    expect(DESK).toMatch(/_studentMarkQuizSave\s*\(/);
  });

  it('pin 06: _studentMarkQuizSave rejects blank input BEFORE the Number() coercion', () => {
    const body = fnBody(DESK, '_studentMarkQuizSave')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(body).toMatch(/\.trim\s*\(\s*\)/);
    expect(body).toMatch(/raw\s*===\s*['"]['"]/);
    const trimIdx = body.indexOf('.trim(');
    const numberIdx = body.search(/Number\s*\(\s*raw\s*\)/);
    expect(trimIdx, 'trim() must exist').toBeGreaterThan(-1);
    expect(numberIdx, 'Number(raw) must exist').toBeGreaterThan(-1);
    expect(trimIdx, 'blank-input check must precede Number() coercion').toBeLessThan(numberIdx);
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
});
