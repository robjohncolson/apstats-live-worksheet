// desk-signin-wall.test.js — NO guest mode on the Desk. The sign-in modal
// auto-opens on load when nobody is signed in and is non-dismissable
// (Cancel hidden, outside-click no-op) until a successful sign-in. Teachers
// pass it via teacher sign-in. The wall fails OPEN (a bug never hard-locks).
//
// Static parse of the Desk HTML + a real-execution smoke test of
// _deskAccessGranted (SIGNIN_WALL_BUILD.md §2/§5).
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

describe('Desk: no-guest-mode sign-in wall', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: _deskAccessGranted exists and fails OPEN', () => {
    expect(DESK).toMatch(/function\s+_deskAccessGranted\s*\(/);
    const body = fnBody(DESK, '_deskAccessGranted');
    expect(body).toMatch(/getStudentEmail\s*\(/);
    expect(body).toMatch(/_deskIsTeacher\s*\(/);
    // catch returns true — a broken check must never hard-lock the Desk.
    expect(body).toMatch(/catch\s*\(_\)\s*\{\s*return true;\s*\}/);
  });

  it('02: _signinWallActive flag is declared', () => {
    expect(DESK).toMatch(/var\s+_signinWallActive\s*=\s*false/);
  });

  it('03: the Cancel button carries id="signin-cancel-btn"', () => {
    expect(DESK).toMatch(/id="signin-cancel-btn"[^>]*onclick="closeSignInModal\(\)"/);
  });

  it('04: openSignInModal sets the wall flag + toggles the Cancel button', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/_signinWallActive\s*=/);
    expect(body).toMatch(/!_deskAccessGranted\s*\(\s*\)/);
    // typeof-guarded so the desk-roster-signin vm-test sandbox keeps passing.
    expect(body).toMatch(/typeof\s+_deskAccessGranted\s*===\s*'function'/);
    expect(body).toMatch(/signin-cancel-btn/);
    // Cancel is hidden ('none') when the wall is mandatory.
    expect(body).toMatch(/_signinWallActive\s*\?\s*['"]none['"]/);
  });

  it('05: closeSignInModal refuses to dismiss while the wall is up + not signed in', () => {
    const body = fnBody(DESK, 'closeSignInModal');
    // typeof-guarded form: _signinWallActive && typeof guard && !granted → return.
    expect(body).toMatch(/_signinWallActive\s*&&\s*typeof\s+_deskAccessGranted\s*===\s*'function'\s*&&\s*!_deskAccessGranted\s*\(\s*\)\s*\)\s*return/);
  });

  it('06: the boot splash dismissal opens the sign-in wall when not signed in', () => {
    // After the boot-overlay click-to-start is dismissed, the wall opens.
    expect(DESK).toMatch(/if\s*\(\s*!_deskAccessGranted\s*\(\s*\)\s*\)\s*openSignInModal\s*\(\s*\)/);
  });

  // ── _deskAccessGranted real-execution smoke tests ─────────────────────────
  function makeAccessGranted({ email = null, teacher = false, throwEmail = false } = {}) {
    const src = fnBody(DESK, '_deskAccessGranted');
    const getStudentEmail = () => { if (throwEmail) throw new Error('boom'); return email; };
    const _deskIsTeacher = () => teacher;
    // eslint-disable-next-line no-new-func
    return new Function('getStudentEmail', '_deskIsTeacher', 'return (' + src + ');')(
      getStudentEmail, _deskIsTeacher
    );
  }

  it('07: _deskAccessGranted — signed-in student → granted', () => {
    expect(makeAccessGranted({ email: 'ada@roster.local' })()).toBe(true);
  });

  it('08: _deskAccessGranted — teacher → granted', () => {
    expect(makeAccessGranted({ email: null, teacher: true })()).toBe(true);
  });

  it('09: _deskAccessGranted — neither student nor teacher → NOT granted', () => {
    expect(makeAccessGranted({ email: null, teacher: false })()).toBe(false);
  });

  it('10: _deskAccessGranted — a thrown error fails OPEN (granted)', () => {
    expect(makeAccessGranted({ throwEmail: true })()).toBe(true);
  });
});
