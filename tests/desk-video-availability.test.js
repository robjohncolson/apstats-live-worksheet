// desk-video-availability.test.js — AP Classroom video link is date-aware.
// Before SCHOOL_YEAR_START, AP Classroom is locked → render Drive alt copy
// as primary; if no Drive copy exists, render a locked placeholder.
// After SCHOOL_YEAR_START, render both AP + alt as before.
//
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

describe('Desk: date-aware AP Classroom video links', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: SCHOOL_YEAR_START constant is declared (default 2026-09-01)', () => {
    expect(DESK).toMatch(/const\s+SCHOOL_YEAR_START\s*=\s*['"]2026-09-01['"]/);
  });

  it('02: _isApClassroomAvailable helper exists', () => {
    expect(DESK).toMatch(/function\s+_isApClassroomAvailable\s*\(/);
  });

  it('03: helper compares today vs SCHOOL_YEAR_START lexicographically (YYYY-MM-DD)', () => {
    const body = fnBody(DESK, '_isApClassroomAvailable');
    // Reads new Date(), formats YYYY-MM-DD, compares to SCHOOL_YEAR_START.
    expect(body).toMatch(/new\s+Date\s*\(/);
    expect(body).toMatch(/SCHOOL_YEAR_START/);
    expect(body).toMatch(/today\s*>=\s*SCHOOL_YEAR_START/);
  });

  it('04: helper supports a localStorage override for testing/teacher preview', () => {
    const body = fnBody(DESK, '_isApClassroomAvailable');
    expect(body).toMatch(/apstats_desk_today_override/);
  });

  it('05: helper fails open (returns true on error) — never strands AP-available students', () => {
    const body = fnBody(DESK, '_isApClassroomAvailable');
    // The outer try/catch must end with `return true;`
    expect(body).toMatch(/catch\s*\(/);
    expect(body).toMatch(/return\s+true\s*;[^}]*\}\s*\}/);
  });

  it('06: showResourcePanel video loop branches on _isApClassroomAvailable', () => {
    const body = fnBody(DESK, 'showResourcePanel');
    expect(body).toMatch(/_isApClassroomAvailable\s*\(\s*\)/);
  });

  it('07: pre-cohort branch renders v.altUrl as the PRIMARY "Video" link (no separate AP link)', () => {
    const body = fnBody(DESK, 'showResourcePanel');
    // The else branch path uses v.altUrl as the primary href.
    // Pin the literal pattern: an <a href="' + v.altUrl + '" with the "Video " label
    // (not "(alt)") in that branch.
    expect(body).toMatch(/v\.altUrl[\s\S]{0,300}>Video '/);
  });

  it('08: pre-cohort fallback for videos with no altUrl renders a locked placeholder', () => {
    const body = fnBody(DESK, 'showResourcePanel');
    // Locked span with strike-through, references SCHOOL_YEAR_START in tooltip text.
    expect(body).toMatch(/line-through/);
    expect(body).toMatch(/locked until[\s\S]{0,80}SCHOOL_YEAR_START/);
  });

  it('09: post-cohort branch preserves the existing dual-link render (AP + alt)', () => {
    const body = fnBody(DESK, 'showResourcePanel');
    // The if-branch should still emit "Video N" with v.url and "(alt)" with v.altUrl.
    expect(body).toMatch(/_apAvail/);
    // The (alt) suffix appears specifically in the available branch.
    expect(body).toMatch(/\(alt\)/);
  });
});
