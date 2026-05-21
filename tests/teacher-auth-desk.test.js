// teacher-auth-desk.test.js -- Connected Teacher Auth: WI-5f structure pins.
// Verifies that the retired access-code UI / functions are GONE from the Desk
// and that updateUserRoleUI + teacher-classroom.html read teacher-ness from
// the roster session, not from a local access code.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'ap_stats_roadmap_square_mode.html');
const classroomPath = resolve(repo, 'teacher-classroom.html');

const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;
const CLASSROOM = existsSync(classroomPath) ? readFileSync(classroomPath, 'utf8') : null;

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

describe('WI-5f: retired access-code UI is absent from the Desk', () => {

  it('Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('signin-teacher checkbox is gone', () => {
    expect(DESK).not.toMatch(/id="signin-teacher"/);
  });

  it('signin-teacher-code input is gone', () => {
    expect(DESK).not.toMatch(/id="signin-teacher-code"/);
  });

  it('signin-teacher-status span is gone', () => {
    expect(DESK).not.toMatch(/id="signin-teacher-status"/);
  });

  it('TEACHER_ACCESS_CODE_DEFAULT constant is gone', () => {
    expect(DESK).not.toMatch(/TEACHER_ACCESS_CODE_DEFAULT/);
  });

  it('_teacherAccessCode function is gone', () => {
    expect(DESK).not.toMatch(/function\s+_teacherAccessCode\s*\(/);
  });

  it('_onTeacherCodeInput function is gone', () => {
    expect(DESK).not.toMatch(/function\s+_onTeacherCodeInput\s*\(/);
  });

  it('window.makeMeTeacher is gone', () => {
    expect(DESK).not.toMatch(/window\.makeMeTeacher/);
  });

  it('standalone teacher fast-path variables are gone from submitSignIn', () => {
    const body = fnBody(DESK, 'submitSignIn');
    // These variable names were unique to the standalone fast-path.
    expect(body).not.toMatch(/expectedCode\b/);
    expect(body).not.toMatch(/fieldsToCheck\b/);
    expect(body).not.toMatch(/\bteacherIdent\b/);
    // teacher@desk.local synthetic identity is gone.
    expect(body).not.toMatch(/teacher@desk\.local/);
  });

  it('post-signin access-code re-check variables are gone from submitSignIn', () => {
    const body = fnBody(DESK, 'submitSignIn');
    expect(body).not.toMatch(/codeMatchAfter\b/);
    expect(body).not.toMatch(/expectedLcAfter\b/);
    expect(body).not.toMatch(/fieldsAfter\b/);
  });

});

describe('WI-5f: updateUserRoleUI reads the roster session', () => {

  it('updateUserRoleUI exists', () => {
    expect(DESK).toMatch(/function\s+updateUserRoleUI\s*\(/);
  });

  it('updateUserRoleUI reads rosterClient.current() for the session', () => {
    const body = fnBody(DESK, 'updateUserRoleUI');
    expect(body).toMatch(/rosterClient/);
    expect(body).toMatch(/current\s*\(\s*\)/);
  });

  it('updateUserRoleUI derives isTeacher from session.role === "teacher"', () => {
    const body = fnBody(DESK, 'updateUserRoleUI');
    expect(body).toMatch(/\.role\s*===\s*['"]teacher['"]/);
  });

  it('updateUserRoleUI syncs apstats_user_role cache from the session', () => {
    const body = fnBody(DESK, 'updateUserRoleUI');
    expect(body).toMatch(/apstats_user_role/);
    // Both set and remove must be present (teacher vs non-teacher paths).
    expect(body).toMatch(/setItem\s*\(\s*['"]apstats_user_role['"]/);
    expect(body).toMatch(/removeItem\s*\(\s*['"]apstats_user_role['"]/);
  });

  it('updateUserRoleUI shows/hides menu-item-teacher based on session role', () => {
    const body = fnBody(DESK, 'updateUserRoleUI');
    expect(body).toMatch(/menu-item-teacher/);
    expect(body).toMatch(/style\.display/);
  });

});

describe('WI-5f: teacher-classroom.html currentRole reads from rosterClient', () => {

  it('teacher-classroom.html file loads', () => {
    expect(CLASSROOM).toBeTypeOf('string');
  });

  it('currentRole reads rosterClient.current() instead of localStorage', () => {
    const body = fnBody(CLASSROOM, 'currentRole');
    // Must use rosterClient.current().
    expect(body).toMatch(/rosterClient/);
    expect(body).toMatch(/current\s*\(\s*\)/);
    // Must return the role from the session object.
    expect(body).toMatch(/\.role/);
    // Must NOT read apstats_user_role from localStorage (no getItem call).
    expect(body).not.toMatch(/apstats_user_role/);
    expect(body).not.toMatch(/localStorage\.getItem/);
  });

  it('currentRole returns null when rosterClient is unavailable (safe fallback)', () => {
    const body = fnBody(CLASSROOM, 'currentRole');
    // Defensive check for rosterClient existence.
    expect(body).toMatch(/typeof\s+window\.rosterClient\s*!==\s*['"]undefined['"]/);
    // Returns null on failure.
    expect(body).toMatch(/return\s+null/);
  });

});
