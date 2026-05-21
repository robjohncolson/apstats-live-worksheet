// desk-lesson-gate.test.js — the Desk calendar gates lessons sequentially:
// a lesson is locked until the prior lesson is complete (worksheet + Blooket
// Done) OR its scheduled date arrives. Teachers and not-signed-in visitors
// bypass. The video Done button is gone — the video shows a checkmark once
// the worksheet is done.
//
// Static parse of the Desk HTML + real-execution smoke tests of the pure
// gate helpers (LESSON_GATE_BUILD.md).
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

describe('Desk: sequential lesson gate', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: gate helpers exist', () => {
    expect(DESK).toMatch(/function\s+_deskIsTeacher\s*\(/);
    expect(DESK).toMatch(/function\s+_isLessonComplete\s*\(/);
    expect(DESK).toMatch(/function\s+_isLessonUnlocked\s*\(/);
    expect(DESK).toMatch(/function\s+_showLessonLockedDialog\s*\(/);
  });

  it('02: _isLessonUnlocked fails OPEN (catch returns true — a bug never hard-locks)', () => {
    const body = fnBody(DESK, '_isLessonUnlocked');
    expect(body).toMatch(/catch\s*\(_\)\s*\{\s*return true;\s*\}/);
  });

  it('03: _isLessonUnlocked checks all five unlock conditions', () => {
    const body = fnBody(DESK, '_isLessonUnlocked');
    expect(body).toMatch(/signedIn/);              // not signed in → open
    expect(body).toMatch(/_deskIsTeacher\s*\(/);   // teacher → open
    expect(body).toMatch(/prevTopic/);             // first lesson → open
    expect(body).toMatch(/lessonDate/);            // date passed → open
    expect(body).toMatch(/_isLessonComplete\s*\(/);// prior complete → open
  });

  it('04: rCal applies the gate — _isLessonUnlocked + cell-locked + _prevLessonTopic', () => {
    const body = fnBody(DESK, 'rCal');
    expect(body).toMatch(/_isLessonUnlocked\s*\(/);
    expect(body).toMatch(/cell-locked/);
    expect(body).toMatch(/_prevLessonTopic/);
    // Only dot-form topic cells are gated (Review/etc. stay click-through).
    expect(body).toMatch(/\^\\d\+\\\.\\d\+/);
    // The locked branch shows the lock dialog, not the resource panel.
    expect(body).toMatch(/_showLessonLockedDialog\s*\(/);
    // ORDER: the unlock check must read _prevLessonTopic BEFORE it is
    // reassigned to the current cell — else a lesson would gate on itself.
    const checkIdx = body.indexOf('_isLessonUnlocked(');
    const assignIdx = body.indexOf('_prevLessonTopic = inf.t');
    expect(checkIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(-1);
    expect(checkIdx, 'unlock check must run before _prevLessonTopic is reassigned').toBeLessThan(assignIdx);
  });

  it('04b: the locked-cell onclick captures per-iteration consts (no closure bug)', () => {
    const body = fnBody(DESK, 'rCal');
    // The locked onclick must reference captured per-iteration consts, not
    // the mutating loop variable _prevLessonTopic (classic loop-closure bug).
    // The three values are captured in one const statement before the onclick.
    expect(body).toMatch(/const\s+_lockTopic\s*=\s*inf\.t\s*,\s*_lockPrev\s*=\s*_prevLessonTopic\s*,\s*_lockDs\s*=\s*ds/);
    expect(body).toMatch(/_showLessonLockedDialog\s*\(\s*_lockTopic\s*,\s*_lockPrev\s*,\s*_lockDs\s*\)/);
  });

  it('05: _studentMarkSave re-renders the calendar so the next lesson unlocks live', () => {
    const body = fnBody(DESK, '_studentMarkSave');
    expect(body).toMatch(/rCal\s*\(\s*\)/);
  });

  it('06: .cell-locked CSS rule exists', () => {
    expect(DESK).toMatch(/\.cell-locked\s*\{/);
  });

  // ── video Done button removed ─────────────────────────────────────────────
  it('07: video no longer renders a Done button or a visited tag', () => {
    // The video render loop must NOT call _doneBtn('video') / _visitedTag('video').
    expect(DESK).not.toMatch(/_doneBtn\(\s*['"]video['"]\s*\)/);
    expect(DESK).not.toMatch(/_visitedTag\(\s*['"]video['"]\s*\)/);
  });

  it('08: _videoDoneTag exists and is rendered in the video loop', () => {
    expect(DESK).toMatch(/function\s+_videoDoneTag\s*\(/);
    const body = fnBody(DESK, '_videoDoneTag');
    // Keys off the worksheet mark — video completion derives from the worksheet.
    expect(body).toMatch(/worksheet/);
    expect(body).toMatch(/\.ts/);
    // It is invoked when building the lesson HTML for videos.
    expect(DESK).toMatch(/lessonHtml\s*\+=\s*_videoDoneTag\s*\(\s*\)/);
  });

  // ── _isLessonComplete real-execution smoke tests ──────────────────────────
  function makeIsLessonComplete() {
    const src = fnBody(DESK, '_isLessonComplete');
    const getRegistryEntry = (topic) => {
      if (topic === 'both') return { urls: { worksheet: 'w', blooket: 'b' } };
      if (topic === 'wsonly') return { urls: { worksheet: 'w' } };
      if (topic === 'none') return { urls: {} };
      return null;
    };
    // eslint-disable-next-line no-new-func
    return new Function('getRegistryEntry', 'return (' + src + ');')(getRegistryEntry);
  }

  it('09: _isLessonComplete — worksheet + Blooket both Done → complete', () => {
    const fn = makeIsLessonComplete();
    expect(fn('both', { 'both|worksheet': { ts: 1 }, 'both|blooket': { ts: 1 } })).toBe(true);
  });

  it('10: _isLessonComplete — worksheet Done but Blooket NOT → incomplete', () => {
    const fn = makeIsLessonComplete();
    expect(fn('both', { 'both|worksheet': { ts: 1 } })).toBe(false);
  });

  it('11: _isLessonComplete — a lesson with no Blooket is complete on the worksheet alone', () => {
    const fn = makeIsLessonComplete();
    expect(fn('wsonly', { 'wsonly|worksheet': { ts: 1 } })).toBe(true);
  });

  it('12: _isLessonComplete — no marks at all → incomplete', () => {
    const fn = makeIsLessonComplete();
    expect(fn('both', {})).toBe(false);
  });

  // ── _isLessonUnlocked real-execution smoke tests ──────────────────────────
  function makeIsLessonUnlocked({ teacher = false, complete = false } = {}) {
    const src = fnBody(DESK, '_isLessonUnlocked');
    const _deskIsTeacher = () => teacher;
    const _isLessonComplete = () => complete;
    // eslint-disable-next-line no-new-func
    return new Function('_deskIsTeacher', '_isLessonComplete', 'return (' + src + ');')(
      _deskIsTeacher, _isLessonComplete
    );
  }
  const TODAY = new Date(2026, 6, 1);
  const PAST = new Date(2026, 5, 1);
  const FUTURE = new Date(2026, 7, 1);

  it('13: _isLessonUnlocked — not signed in → unlocked (no gate without identity)', () => {
    const fn = makeIsLessonUnlocked();
    expect(fn('1.2', FUTURE, '1.1', TODAY, {}, false)).toBe(true);
  });

  it('14: _isLessonUnlocked — teacher → unlocked (bypass)', () => {
    const fn = makeIsLessonUnlocked({ teacher: true });
    expect(fn('1.2', FUTURE, '1.1', TODAY, {}, true)).toBe(true);
  });

  it('15: _isLessonUnlocked — first lesson (no prevTopic) → unlocked', () => {
    const fn = makeIsLessonUnlocked();
    expect(fn('1.1', FUTURE, null, TODAY, {}, true)).toBe(true);
  });

  it('16: _isLessonUnlocked — date passed → unlocked even if the prior is incomplete', () => {
    const fn = makeIsLessonUnlocked({ complete: false });
    expect(fn('1.2', PAST, '1.1', TODAY, {}, true)).toBe(true);
  });

  it('17: _isLessonUnlocked — future date + prior incomplete → LOCKED', () => {
    const fn = makeIsLessonUnlocked({ complete: false });
    expect(fn('1.2', FUTURE, '1.1', TODAY, {}, true)).toBe(false);
  });

  it('18: _isLessonUnlocked — future date but prior complete → unlocked', () => {
    const fn = makeIsLessonUnlocked({ complete: true });
    expect(fn('1.2', FUTURE, '1.1', TODAY, {}, true)).toBe(true);
  });

  // ── _deskIsTeacher real-execution smoke ───────────────────────────────────
  it('19: _deskIsTeacher reads apstats_user_role from localStorage', () => {
    const src = fnBody(DESK, '_deskIsTeacher');
    const mk = (role) => {
      const localStorage = { getItem: (k) => (k === 'apstats_user_role' ? role : null) };
      // eslint-disable-next-line no-new-func
      return new Function('localStorage', 'return (' + src + ');')(localStorage);
    };
    expect(mk('teacher')()).toBe(true);
    expect(mk('student')()).toBe(false);
    expect(mk(null)()).toBe(false);
  });

  it('20: _isLessonComplete — a lesson with neither worksheet nor blooket is vacuously complete', () => {
    // Contract edge case: a lesson with no gradeable artifact must NOT
    // permanently block the next one — both checks are vacuously satisfied.
    const fn = makeIsLessonComplete();
    expect(fn('none', {})).toBe(true);
  });

  it('21: _isLessonUnlocked — lesson date EQUAL to today → unlocked (today is open)', () => {
    // Pins the <= compare: the current day's lesson must be open, not locked.
    const fn = makeIsLessonUnlocked({ complete: false });
    expect(fn('1.2', TODAY, '1.1', TODAY, {}, true)).toBe(true);
  });
});
