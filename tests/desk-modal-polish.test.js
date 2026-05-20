// desk-modal-polish.test.js — Task #8 DESK_MODAL_POLISH structure pins.
// 20 pins: 17 per DESK_MODAL_POLISH_BUILD.md §3 + 3 Codex MAJOR folds (2026-05-20).
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

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Extract the body of a top-level function (or async function) by name. */
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

// ─── pins ─────────────────────────────────────────────────────────────────────

describe('DESK_MODAL_POLISH — 20 structure pins (17 BUILD + 3 Codex MAJOR folds)', () => {

  it('pin 01: the Desk file exists', () => {
    expect(DESK, 'Desk file must exist').toBeTypeOf('string');
  });

  it('pin 02: studentMark no longer contains a non-comment prompt( call', () => {
    // Strip single-line comments before checking, so the comment that
    // says "// a native prompt()" does not trip the assertion.
    const body = fnBody(DESK, 'studentMark');
    const stripped = body.replace(/\/\/[^\n]*/g, '');
    expect(stripped).not.toMatch(/\bprompt\s*\(/);
  });

  it('pin 03: _studentMarkSave contains the optimistic mutation BEFORE the first await recordProgress', () => {
    // The optimistic mutation must appear before the await in _studentMarkSave.
    const body = fnBody(DESK, '_studentMarkSave');
    const savedIdx = body.indexOf("btn.textContent = '\\u2713 Saved'") >= 0
      ? body.indexOf("btn.textContent = '\\u2713 Saved'")
      : body.indexOf("btn.textContent = '✓ Saved'");
    expect(savedIdx, "optimistic '\\u2713 Saved' assignment must exist in _studentMarkSave").toBeGreaterThan(-1);
    const awaitIdx = body.indexOf('await recordProgress');
    expect(awaitIdx, 'await recordProgress must exist in _studentMarkSave').toBeGreaterThan(-1);
    expect(savedIdx, 'optimistic mutation must appear BEFORE await recordProgress').toBeLessThan(awaitIdx);
  });

  it('pin 04: quiz Done button is wrapped in a span.desk-quiz-done-slot', () => {
    // The panel HTML construction for the quiz row must wrap the Done button
    // in a span with class desk-quiz-done-slot.
    expect(DESK).toMatch(/class="desk-quiz-done-slot"/);
    // The span must carry data-topic and data-artifact attributes.
    expect(DESK).toMatch(/data-artifact="quiz"/);
  });

  it('pin 05: _studentMarkQuizSave helper exists and is referenced from the inline Save onclick', () => {
    // The helper must be declared as a function.
    expect(DESK).toMatch(/function\s+_studentMarkQuizSave\s*\(/);
    // The inline form's onclick must reference it.
    expect(DESK).toMatch(/_studentMarkQuizSave\s*\(/);
  });

  it('pin 06: _attachResourcePanelKeyHandler and _detachResourcePanelKeyHandler are defined', () => {
    expect(DESK).toMatch(/function\s+_attachResourcePanelKeyHandler\s*\(/);
    expect(DESK).toMatch(/function\s+_detachResourcePanelKeyHandler\s*\(/);
  });

  it('pin 07: _attachResourcePanelKeyHandler is called from showResourcePanel AFTER display=block', () => {
    const panelBody = fnBody(DESK, 'showResourcePanel');
    const displayIdx = panelBody.indexOf("style.display = 'block'");
    expect(displayIdx, "display='block' must exist in showResourcePanel").toBeGreaterThan(-1);
    const attachIdx = panelBody.indexOf('_attachResourcePanelKeyHandler');
    expect(attachIdx, '_attachResourcePanelKeyHandler call must exist in showResourcePanel').toBeGreaterThan(-1);
    expect(attachIdx, 'attach call must come AFTER display=block').toBeGreaterThan(displayIdx);
  });

  it('pin 08: _detachResourcePanelKeyHandler is called from closeResourcePanel BEFORE display=none', () => {
    const closeBody = fnBody(DESK, 'closeResourcePanel');
    const detachIdx = closeBody.indexOf('_detachResourcePanelKeyHandler');
    expect(detachIdx, '_detachResourcePanelKeyHandler must be called in closeResourcePanel').toBeGreaterThan(-1);
    const hideIdx = closeBody.indexOf("style.display = 'none'");
    expect(hideIdx, "display='none' must exist in closeResourcePanel").toBeGreaterThan(-1);
    expect(detachIdx, 'detach must come BEFORE display=none').toBeLessThan(hideIdx);
  });

  it('pin 09: keydown handler body contains active-element guard for INPUT|TEXTAREA|SELECT|isContentEditable', () => {
    const attachBody = fnBody(DESK, '_attachResourcePanelKeyHandler');
    // Must check all four.
    expect(attachBody).toMatch(/INPUT/);
    expect(attachBody).toMatch(/TEXTAREA/);
    expect(attachBody).toMatch(/SELECT/);
    expect(attachBody).toMatch(/isContentEditable/);
  });

  it('pin 10: keydown handler body contains modifier-key guard for ctrlKey|metaKey|altKey', () => {
    const attachBody = fnBody(DESK, '_attachResourcePanelKeyHandler');
    expect(attachBody).toMatch(/ctrlKey/);
    expect(attachBody).toMatch(/metaKey/);
    expect(attachBody).toMatch(/altKey/);
  });

  it('pin 11: keydown handler handles Escape and calls closeResourcePanel()', () => {
    const attachBody = fnBody(DESK, '_attachResourcePanelKeyHandler');
    expect(attachBody).toMatch(/['"']Escape['"']/);
    expect(attachBody).toMatch(/closeResourcePanel\s*\(\s*\)/);
  });

  it('pin 12: keydown handler handles number keys 1-3 (digit-range check), no [4] badge rendered', () => {
    const attachBody = fnBody(DESK, '_attachResourcePanelKeyHandler');
    // The handler must distinguish at least keys 1, 2, 3.
    expect(attachBody).toMatch(/num\s*===\s*1|num\s*==\s*1|key\s*===\s*['"]1['"]/);
    expect(attachBody).toMatch(/num\s*===\s*2|num\s*==\s*2|key\s*===\s*['"]2['"]/);
    expect(attachBody).toMatch(/num\s*===\s*3|num\s*==\s*3|key\s*===\s*['"]3['"]/);
    // No [4] badge must be generated by the row-decoration code. Checked by
    // verifying the _decorateResourceRows / _attachResourcePanelKeyHandler
    // code never emits '[4]' as badge text content.
    const decorateIdx = DESK.indexOf('_decorateResourceRows');
    expect(decorateIdx).toBeGreaterThan(-1);
    // The decoration closure must not contain a n4 / '[4]' badge.
    const decorateEnd = DESK.indexOf('_attachResourcePanelKeyHandler();', decorateIdx);
    const decorateBlock = DESK.slice(decorateIdx, decorateEnd > decorateIdx ? decorateEnd : decorateIdx + 3000);
    expect(decorateBlock).not.toMatch(/textContent\s*=\s*'\[4\]'|textContent\s*=\s*"\[4\]"/);
  });

  it('pin 13: letter-key badges use class desk-row-letter-badge', () => {
    // The panel decoration code must emit this class name.
    expect(DESK).toMatch(/desk-row-letter-badge/);
  });

  it('pin 14: number-key badges use class desk-row-number-badge', () => {
    expect(DESK).toMatch(/desk-row-number-badge/);
  });

  it('pin 15: visit-gate (540d168) is preserved — deskDoneGateMs and "Done in ~" are still present', () => {
    expect(DESK).toMatch(/deskDoneGateMs/);
    expect(DESK).toMatch(/Done in ~/);
  });

  it('pin 16: recordProgress body is unchanged (fingerprint: localStorage.setItem first-pass comment)', () => {
    const rpBody = fnBody(DESK, 'recordProgress');
    // The 540d168 refactor comment is the canonical fingerprint.
    expect(rpBody).toMatch(/source of truth/);
    expect(rpBody).toMatch(/localStorage\s*\.\s*setItem/);
    expect(rpBody).toMatch(/\/rest\/v1\/student_progress/);
  });

  it('pin 17: AI-tutor buttons (Phase 5/5.1) still render in showResourcePanel', () => {
    const panelBody = fnBody(DESK, 'showResourcePanel');
    expect(panelBody).toMatch(/copyTutorPrompt\s*\(/);
    expect(panelBody).toMatch(/copyTutorPromptPc\s*\(/);
  });

  // ── Codex MAJOR folds (2026-05-20) ─────────────────────────────────────────
  it('pin 18: _studentMarkQuizSave rejects blank input BEFORE the Number() coercion (Codex MAJOR 1)', () => {
    // Strip single-line + block comments so the prose "Number('') === 0" in
    // the explanation comment doesn't trip the position check.
    const body = fnBody(DESK, '_studentMarkQuizSave')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    // The fix: a string-trim + empty-string check before Number(...). Without
    // this, Number('') === 0 silently records a real zero score.
    expect(body).toMatch(/\.trim\s*\(\s*\)/);
    expect(body).toMatch(/raw\s*===\s*['"]['"]/);
    // The trim/empty check must come BEFORE the Number() conversion of the
    // user input. Match `Number(raw)` specifically — the bare `Number(` in
    // surrounding prose is already stripped, but pin to the real call shape.
    const trimIdx = body.indexOf('.trim(');
    const numberIdx = body.search(/Number\s*\(\s*raw\s*\)/);
    expect(trimIdx, 'trim() must exist').toBeGreaterThan(-1);
    expect(numberIdx, 'Number(raw) must exist').toBeGreaterThan(-1);
    expect(trimIdx, 'blank-input check must precede Number() coercion').toBeLessThan(numberIdx);
  });

  it('pin 19: _focusedLetter is declared at module scope (NOT closure-level inside _attachResourcePanelKeyHandler) (Codex MAJOR 2)', () => {
    // Module-level declaration: a top-level `var _focusedLetter = 'a';` line.
    // Closure-level was the bug: every re-render created a new closure with
    // _focusedLetter='a', wiping the user's selection.
    expect(DESK).toMatch(/^var\s+_focusedLetter\s*=\s*['"]a['"]\s*;/m);
    // Inside _attachResourcePanelKeyHandler there must NOT be a redeclaration
    // (a `var _focusedLetter = ...` inside the function body would shadow
    // the module-level one).
    const attachBody = fnBody(DESK, '_attachResourcePanelKeyHandler');
    expect(attachBody).not.toMatch(/\bvar\s+_focusedLetter\b/);
  });

  it('pin 20: closeResourcePanel resets _focusedLetter to "a" (Codex MAJOR 2 cleanup)', () => {
    const closeBody = fnBody(DESK, 'closeResourcePanel');
    expect(closeBody).toMatch(/_focusedLetter\s*=\s*['"]a['"]/);
  });
});
