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

  it('07: signin modal has the Teacher checkbox + access-code input (type=text to dodge password autofill)', () => {
    // 2026-05-20 v6 (revert to v4 UX after the dedicated-button detour):
    // user prefers the compact checkbox-and-code design. Visible bug
    // was a typo ("googly" vs "google"), not a UX problem. We kept the
    // v4 type=text on the code field for autofill resistance.
    expect(DESK).toMatch(/<input\s+type="checkbox"\s+id="signin-teacher"\s+disabled/);
    expect(DESK).toMatch(/<input\s+type="text"\s+id="signin-teacher-code"/);
    expect(DESK).toMatch(/id="signin-teacher-status"/);
    // Dedicated button is gone (single OK button now).
    expect(DESK).not.toMatch(/id="signin-teacher-btn"/);
    expect(DESK).not.toMatch(/submitTeacherSignIn/);
  });

  it('08: _onTeacherCodeInput enables the checkbox + green status when code matches (tolerant)', () => {
    const body = fnBody(DESK, '_onTeacherCodeInput');
    // Tolerant: trim + case-insensitive both sides.
    expect(body).toMatch(/\.trim\s*\(\s*\)\s*\.toLowerCase\s*\(\s*\)/);
    expect(body).toMatch(/_teacherAccessCode\s*\(\s*\)/);
    // Enable + check the checkbox on match.
    expect(body).toMatch(/chk\.disabled\s*=\s*!match/);
    expect(body).toMatch(/chk\.checked\s*=\s*true/);
    // Status text updates.
    expect(body).toMatch(/code accepted/);
    expect(body).toMatch(/#1f8b3b/);  // green color
  });

  it('09: openSignInModal resets the teacher fields every open (no state leak)', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/cInp\.value\s*=\s*['"]['"]/);
    expect(body).toMatch(/cInp\.oninput\s*=\s*_onTeacherCodeInput/);
    expect(body).toMatch(/chk\.checked\s*=\s*false/);
    expect(body).toMatch(/chk\.disabled\s*=\s*true/);
    // Enter on the code field submits via the regular submitSignIn flow,
    // which has the v4 fast-path that matches code in ANY field.
    expect(body).toMatch(/cInp\.onkeydown\s*=\s*function[\s\S]{0,150}submitSignIn\s*\(\s*\)/);
  });

  it('10: submitSignIn fast-path only takes the standalone teacher branch when credentials are EMPTY', () => {
    // 2026-05-20 v6: when username+password are also typed, the fast-path
    // FALLS THROUGH to the regular roster signin (so the teacher gets a
    // token for /donow + /grade fetches). Only the code-only case takes
    // the standalone fast-path. Teacher flag still set in the post-signin
    // block when the code matches.
    const body = fnBody(DESK, 'submitSignIn');
    expect(body).toMatch(/expectedCode\s*=/);
    expect(body).toMatch(/_teacherAccessCode\s*\(\s*\)/);
    // Iterates fieldsToCheck over the three input refs.
    expect(body).toMatch(/fieldsToCheck/);
    expect(body).toMatch(/signin-teacher-code/);
    // Tolerant matching: trim + toLowerCase BOTH sides.
    expect(body).toMatch(/\.trim\s*\(\s*\)\s*\.toLowerCase\s*\(\s*\)/);
    // The standalone branch is GUARDED on empty username+password.
    expect(body).toMatch(/if\s*\(\s*!typedUser\s*\|\|\s*!typedPass\s*\)/);
    // Sets role on standalone match.
    expect(body).toMatch(/setItem\s*\(\s*['"]apstats_user_role['"]\s*,\s*['"]teacher['"]/);
    expect(body).toMatch(/teacher@desk\.local/);
    // The fast-path must come BEFORE the rosterClient.signIn check.
    const fastIdx = body.search(/matchField/);
    const rosterIdx = body.search(/rosterClient\.signIn/);
    expect(fastIdx, 'fast-path must exist').toBeGreaterThan(-1);
    expect(rosterIdx, 'roster signIn must exist').toBeGreaterThan(-1);
    expect(fastIdx, 'fast-path must precede roster signIn').toBeLessThan(rosterIdx);
  });

  it('10d: post-signin block also matches code across all 3 fields (tolerant, v6)', () => {
    // The "teacher with a real student account" path: roster signin gives
    // a token, then the code check sets the teacher flag too.
    const body = fnBody(DESK, 'submitSignIn');
    // Find the post-signin code-check block — it's identified by
    // codeMatchAfter / expectedLcAfter / fieldsAfter.
    expect(body).toMatch(/codeMatchAfter/);
    expect(body).toMatch(/expectedLcAfter/);
    expect(body).toMatch(/fieldsAfter/);
    // Iterates the 3 fields (teacher-code, password, username).
    expect(body).toMatch(/getElementById\s*\(\s*['"]signin-teacher-code['"]/);
  });

  it('10e: Do Now sign-in nudge points at the User menu (not the renamed Student menu)', () => {
    // The renderDoNow nudge string was stale: "Student ▸ Gradebook" but
    // the menu is now "User ▸ Sign In". Updated.
    const body = fnBody(DESK, 'renderDoNow');
    expect(body).not.toMatch(/Student\s*▸\s*Gradebook/);
    expect(body).toMatch(/User\s*▸\s*Sign In/);
  });

  // ── 2026-05-20: username datalist autocomplete ─────────────────────────────
  it('11: username field has list="signin-username-list" + the datalist element exists', () => {
    expect(DESK).toMatch(/id="signin-username"[^>]*list="signin-username-list"/);
    expect(DESK).toMatch(/<datalist\s+id="signin-username-list">/);
  });

  it('12: known-user helpers exist (load / add / populate) with sane cap', () => {
    expect(DESK).toMatch(/function\s+_loadKnownUsers\s*\(/);
    expect(DESK).toMatch(/function\s+_addKnownUser\s*\(/);
    expect(DESK).toMatch(/function\s+_populateUsernameDatalist\s*\(/);
    expect(DESK).toMatch(/KNOWN_USERS_KEY\s*=\s*['"]apstats_desk_known_users['"]/);
    expect(DESK).toMatch(/KNOWN_USERS_CAP\s*=\s*20/);
  });

  it('13: _addKnownUser dedupes case-insensitively + caps + skips synthetic teacher identity', () => {
    const body = fnBody(DESK, '_addKnownUser');
    expect(body).toMatch(/teacher@desk\.local/);     // skip synthetic
    expect(body).toMatch(/toLowerCase\s*\(\s*\)/);   // case-insensitive dedupe
    expect(body).toMatch(/unshift/);                  // most-recent first
    expect(body).toMatch(/KNOWN_USERS_CAP/);          // cap applied
  });

  it('14: openSignInModal re-populates the datalist on every open', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/_populateUsernameDatalist\s*\(\s*\)/);
  });

  it('15: both sign-in success paths add to known users (standalone teacher + roster signin)', () => {
    const body = fnBody(DESK, 'submitSignIn');
    // The standalone-teacher branch calls _addKnownUser when a real
    // username (not the synthetic) was typed.
    expect(body).toMatch(/_addKnownUser\s*\(\s*teacherIdent\s*\)/);
    // The roster-signin success path calls _addKnownUser with the legacy key.
    expect(body).toMatch(/_addKnownUser\s*\(\s*legacyKey\s*\)/);
  });

  // ── 2026-05-20 v7: server-backed roster picker dropdown ────────────────────
  it('16: roster dropdown markup exists (#signin-roster-dropdown + #signin-roster-list)', () => {
    expect(DESK).toMatch(/id="signin-roster-dropdown"/);
    expect(DESK).toMatch(/id="signin-roster-list"/);
    // CSS classes are scoped to the dropdown.
    expect(DESK).toMatch(/#signin-roster-dropdown\s+\.sr-row/);
  });

  it('17: _fetchPeriodRoster hits /roster/section/:section with the current period', () => {
    expect(DESK).toMatch(/async\s+function\s+_fetchPeriodRoster\s*\(/);
    const body = fnBody(DESK, '_fetchPeriodRoster');
    expect(body).toMatch(/\/roster\/section\//);
    expect(body).toMatch(/encodeURIComponent\s*\(\s*section\s*\)/);
    // Cache + TTL.
    expect(body).toMatch(/apstats_desk_roster_cache_/);
    expect(body).toMatch(/ROSTER_CACHE_TTL_MS/);
    // Sorts by realName.
    expect(body).toMatch(/realName.*localeCompare/);
  });

  it('18: _periodToSection maps cP letters to roster section strings', () => {
    // _periodToSection is a pure, DOM-free function -- evaluate it in
    // isolation and check the actual mapping. This is more robust than
    // grepping the body, which was generalized in the Live Classroom
    // v1a work (explicit B/E literals -> a bare-letter rule).
    const fn = new Function('return (' + fnBody(DESK, '_periodToSection') + ')')();
    expect(fn('B')).toBe('PeriodB');
    expect(fn('E')).toBe('PeriodE');
    expect(fn('X')).toBe('PeriodX');
    expect(fn('PeriodB')).toBe('PeriodB');
    // Never returns a falsy section (that would empty the roster picker).
    expect(fn('')).toBe('PeriodX');
    expect(fn(null)).toBe('PeriodX');
  });

  it('19: _renderRosterDropdown filters by realName OR username + caps at 50 rows', () => {
    const body = fnBody(DESK, '_renderRosterDropdown');
    expect(body).toMatch(/r\.realName/);
    expect(body).toMatch(/r\.username/);
    expect(body).toMatch(/toLowerCase\s*\(\s*\)/);
    // 50-row cap.
    expect(body).toMatch(/slice\s*\(\s*0\s*,\s*50\s*\)/);
    // Empty state when no data loaded.
    expect(body).toMatch(/No class list loaded/);
  });

  it('20: row click fills the username field and focuses the password field', () => {
    const body = fnBody(DESK, '_renderRosterDropdown');
    // Sets the username input value.
    expect(body).toMatch(/uInp\.value\s*=\s*r\.username/);
    // Closes the dropdown.
    expect(body).toMatch(/_closeRosterDropdown/);
    // Focuses the password field for one-keystroke continuation.
    expect(body).toMatch(/getElementById\s*\(\s*['"]signin-password['"]/);
    expect(body).toMatch(/pInp\.focus/);
  });

  it('21: openSignInModal wires focus + click + input events on the username field', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/uInp\.onfocus\s*=/);
    expect(body).toMatch(/uInp\.onclick\s*=/);
    // The username field's oninput is re-bound to filter the dropdown.
    expect(body).toMatch(/uInp\.oninput\s*=\s*function/);
    expect(body).toMatch(/_renderRosterDropdown/);
  });

  it('22: outside-click closes the dropdown (mousedown listener on document)', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/addEventListener\s*\(\s*['"]mousedown['"]/);
    expect(body).toMatch(/_closeRosterDropdown/);
  });

  it('23: closeSignInModal also closes the roster dropdown', () => {
    const body = fnBody(DESK, 'closeSignInModal');
    expect(body).toMatch(/_closeRosterDropdown/);
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
