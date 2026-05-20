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

  it('07: signin modal has the access-code input (type=text) + dedicated teacher button', () => {
    // 2026-05-20 v5: removed the confusing greyed-out checkbox.
    // Replaced with a dedicated "Sign in as teacher" button next to OK.
    expect(DESK).toMatch(/<input\s+type="text"\s+id="signin-teacher-code"/);
    expect(DESK).toMatch(/id="signin-teacher-btn"[^>]*onclick="submitTeacherSignIn\(\)"/);
    expect(DESK).toMatch(/id="signin-teacher-status"/);
  });

  it('08: submitTeacherSignIn validates code-only (no roster, no username/password)', () => {
    expect(DESK).toMatch(/function\s+submitTeacherSignIn\s*\(/);
    const body = fnBody(DESK, 'submitTeacherSignIn');
    // Reads the access code input.
    expect(body).toMatch(/getElementById\s*\(\s*['"]signin-teacher-code['"]/);
    // Trim + case-insensitive compare to _teacherAccessCode().
    expect(body).toMatch(/\.trim\s*\(\s*\)/);
    expect(body).toMatch(/toLowerCase\s*\(\s*\)/);
    expect(body).toMatch(/_teacherAccessCode\s*\(\s*\)/);
    // Promotes role + sets synthetic identity.
    expect(body).toMatch(/setItem\s*\(\s*['"]apstats_user_role['"]\s*,\s*['"]teacher['"]/);
    expect(body).toMatch(/teacher@desk\.local/);
    // Does NOT call rosterClient.signIn.
    expect(body).not.toMatch(/rosterClient\.signIn/);
  });

  it('09: openSignInModal wires the teacher-code input + Enter-key submits as teacher', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/cInp\.value\s*=\s*['"]['"]/);
    // The code field's Enter key triggers submitTeacherSignIn, not submitSignIn.
    expect(body).toMatch(/submitTeacherSignIn\s*\(/);
  });

  it('10: submitSignIn TEACHER FAST-PATH runs BEFORE rosterClient.signIn (v4 tolerant matching)', () => {
    // 2026-05-20 v4: the fast-path checks ALL three input fields
    // (teacher-code, password, username) for the access code. Trim + case-
    // insensitive. Removes the "wrong field" footgun — paste the code
    // anywhere in the modal and it works.
    const body = fnBody(DESK, 'submitSignIn');
    expect(body).toMatch(/expectedCode\s*=/);
    expect(body).toMatch(/_teacherAccessCode\s*\(\s*\)/);
    // Iterates fieldsToCheck over the three input refs.
    expect(body).toMatch(/fieldsToCheck/);
    expect(body).toMatch(/signin-teacher-code/);
    // Tolerant matching: trim + toLowerCase BOTH sides.
    expect(body).toMatch(/\.trim\s*\(\s*\)\s*\.toLowerCase\s*\(\s*\)/);
    // Sets role on match.
    expect(body).toMatch(/setItem\s*\(\s*['"]apstats_user_role['"]\s*,\s*['"]teacher['"]/);
    expect(body).toMatch(/teacher@desk\.local/);
    // Closes the modal + early-returns before the roster auth path.
    expect(body).toMatch(/closeSignInModal\s*\(\s*\)[\s\S]{0,400}return\s*;/);
    // The fast-path must come BEFORE the rosterClient.signIn check.
    const fastIdx = body.search(/matchField/);
    const rosterIdx = body.search(/rosterClient\.signIn/);
    expect(fastIdx, 'fast-path must exist').toBeGreaterThan(-1);
    expect(rosterIdx, 'roster signIn must exist').toBeGreaterThan(-1);
    expect(fastIdx, 'fast-path must precede roster signIn').toBeLessThan(rosterIdx);
  });

  it('10c: fast-path logs the match attempt to console (self-diagnosing for remote-debug)', () => {
    const body = fnBody(DESK, 'submitSignIn');
    // Looks for a console.log line that mentions the submit attempt.
    expect(body).toMatch(/console\.log\s*\([^)]*submitSignIn/);
  });

  it('10a: makeMeTeacher DevTools helper exists for cache-stuck cases', () => {
    // Workaround for users whose browser cache is stuck on an old version
    // and the sign-in flow misbehaves. Paste `makeMeTeacher()` in the
    // console → role promoted + menu shown.
    expect(DESK).toMatch(/window\.makeMeTeacher\s*=\s*function\s+makeMeTeacher/);
    expect(DESK).toMatch(/apstats_user_role['"]\s*,\s*['"]teacher['"]/);
  });

  it('10b: updateStudentMenu shows "Teacher:" prefix when role=teacher (status surfaces role)', () => {
    const body = fnBody(DESK, 'updateStudentMenu');
    expect(body).toMatch(/apstats_user_role/);
    expect(body).toMatch(/Teacher:/);
  });

  it('13a: openSignInModal binds multiple event types for the access-code input (visual feedback resilience)', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/cInp\.oninput\s*=\s*_onTeacherCodeInput/);
    expect(body).toMatch(/addEventListener\s*\(\s*['"]input['"]\s*,\s*_onTeacherCodeInput/);
    expect(body).toMatch(/addEventListener\s*\(\s*['"]change['"]\s*,\s*_onTeacherCodeInput/);
    expect(body).toMatch(/addEventListener\s*\(\s*['"]keyup['"]\s*,\s*_onTeacherCodeInput/);
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
