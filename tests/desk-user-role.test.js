// desk-user-role.test.js — 2026-05-20: user-role gating on the Desk.
// - "Student" menu label renamed to "User"
// - Teacher menu hidden by default; revealed via updateUserRoleUI() when
//   localStorage.apstats_user_role === 'teacher'
// - Sign-in modal: Teacher checkbox + access-code input. Checkbox is
//   disabled until the entered code matches TEACHER_ACCESS_CODE_DEFAULT
//   (default 'google231'; overridable via localStorage).
// - signOutStudent clears the role.
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

describe('Desk: user-role gating + sign-in teacher checkbox', () => {

  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: title-bar menu label is "User" (renamed from "Student")', () => {
    // The data-menu attr stays "student" for compat with closeMenus / wiring;
    // only the visible label changed.
    expect(DESK).toMatch(/data-menu="student">User\b/);
  });

  it('02: Teacher menu is default-hidden via inline style:display:none', () => {
    expect(DESK).toMatch(/id="menu-item-teacher"[^>]*style="display:none"/);
  });

  it('03: TEACHER_ACCESS_CODE_DEFAULT constant is "google231"', () => {
    expect(DESK).toMatch(/const\s+TEACHER_ACCESS_CODE_DEFAULT\s*=\s*['"]google231['"]/);
  });

  it('04: _teacherAccessCode reads localStorage override before falling back to default', () => {
    const body = fnBody(DESK, '_teacherAccessCode');
    expect(body).toMatch(/apstats_teacher_access_code/);
    expect(body).toMatch(/TEACHER_ACCESS_CODE_DEFAULT/);
  });

  it('05: updateUserRoleUI shows the Teacher menu only when role === "teacher"', () => {
    const body = fnBody(DESK, 'updateUserRoleUI');
    expect(body).toMatch(/apstats_user_role/);
    expect(body).toMatch(/===\s*['"]teacher['"]/);
    expect(body).toMatch(/menu-item-teacher/);
    // Both the show + hide branches must set style.display.
    expect(body).toMatch(/style\.display\s*=\s*['"]['"]/);
    expect(body).toMatch(/style\.display\s*=\s*['"]none['"]/);
  });

  it('06: updateUserRoleUI is called on page init (so the Teacher menu reflects persisted role)', () => {
    // Look for the init-time call site near loadRegistry().
    expect(DESK).toMatch(/loadRegistry\(\);[\s\S]{0,200}updateUserRoleUI\(\)/);
  });

  it('07: signin modal has the Teacher checkbox + access-code input', () => {
    // The checkbox must be present with type=checkbox + disabled, and the
    // access-code input + status span must be there. Attribute order
    // varies across HTML formatters; don't pin order, pin presence.
    expect(DESK).toMatch(/<input\s+type="checkbox"\s+id="signin-teacher"\s+disabled/);
    expect(DESK).toMatch(/id="signin-teacher-code"/);
    expect(DESK).toMatch(/id="signin-teacher-status"/);
  });

  it('08: _onTeacherCodeInput enables the checkbox when the code matches', () => {
    const body = fnBody(DESK, '_onTeacherCodeInput');
    expect(body).toMatch(/_teacherAccessCode\s*\(\s*\)/);
    // Disables when no match, enables (and auto-checks) when match.
    expect(body).toMatch(/chk\.disabled\s*=\s*!match/);
    expect(body).toMatch(/chk\.checked\s*=\s*true/);
  });

  it('09: openSignInModal resets the teacher fields every open (no state leak)', () => {
    const body = fnBody(DESK, 'openSignInModal');
    // Resets the access code value + binds the oninput listener.
    expect(body).toMatch(/cInp\.value\s*=\s*['"]['"]/);
    expect(body).toMatch(/cInp\.oninput\s*=\s*_onTeacherCodeInput/);
    // Resets the checkbox (unchecked + disabled).
    expect(body).toMatch(/chk\.checked\s*=\s*false/);
    expect(body).toMatch(/chk\.disabled\s*=\s*true/);
  });

  it('10: submitSignIn double-validates the code at save time (no DOM-poke promotion)', () => {
    const body = fnBody(DESK, 'submitSignIn');
    // The role-persist block re-reads the input and compares to the
    // configured code; a manual checkbox-toggle without a matching code
    // does not persist 'teacher'.
    expect(body).toMatch(/codeInp\.value\s*===\s*_teacherAccessCode\s*\(\s*\)/);
    expect(body).toMatch(/setItem\s*\(\s*['"]apstats_user_role['"]\s*,\s*['"]teacher['"]/);
    expect(body).toMatch(/removeItem\s*\(\s*['"]apstats_user_role['"]/);
    expect(body).toMatch(/updateUserRoleUI\s*\(\s*\)/);
  });

  it('11: signOutStudent clears the user role + refreshes the menu', () => {
    const body = fnBody(DESK, 'signOutStudent');
    expect(body).toMatch(/removeItem\s*\(\s*['"]apstats_user_role['"]/);
    expect(body).toMatch(/updateUserRoleUI\s*\(\s*\)/);
  });

  it('12: Teacher menu items still point at the right pages (gradebook, roster, codegen)', () => {
    expect(DESK).toMatch(/window\.open\s*\(\s*['"]teacher-dashboard\.html['"]/);
    expect(DESK).toMatch(/window\.open\s*\(\s*['"]teacher-roster-console\.html['"]/);
    expect(DESK).toMatch(/window\.open\s*\(\s*['"]teacher-code-generator\.html['"]/);
  });
});
