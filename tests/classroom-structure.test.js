// Live Classroom v1a -- structure pins for the Desk integration (work
// item D) and the cross-file wiring to the board component (B) and the
// teacher cockpit (C). Behavior is covered by tests/classroom-board.test.js
// and tests/classroom.test.js; this file pins the structural contract.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => {
  const full = resolve(repo, p);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
};

const DESK = read('ap_stats_roadmap_square_mode.html');
const COCKPIT = read('teacher-classroom.html');
const BOARD = read('classroom-board.js');

// Extract a top-level function body by brace matching.
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  const i = src.indexOf('{', m.index);
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

describe('Live Classroom v1a - Desk integration', () => {
  it('the Desk file exists', () => {
    expect(DESK, 'ap_stats_roadmap_square_mode.html must exist').toBeTypeOf('string');
  });

  it('D1: loads classroom-board.js as a sibling script', () => {
    expect(DESK).toMatch(/<script\s+src=["']classroom-board\.js["']><\/script>/i);
  });

  it('D2: has the classroom board mount point', () => {
    expect(DESK).toMatch(/id=["']classroom-board-mount["']/);
  });

  it('D3: the Teacher menu has a Live Classroom item opening teacher-classroom.html', () => {
    expect(DESK).toMatch(/window\.open\(\s*['"]teacher-classroom\.html['"]/);
  });

  it('D4: defines _mountClassroomBoard and calls it typeof-guarded', () => {
    expect(DESK).toMatch(/function\s+_mountClassroomBoard\s*\(/);
    expect(DESK).toMatch(
      /typeof\s+_mountClassroomBoard\s*===\s*['"]function['"]\s*\)\s*_mountClassroomBoard\(\)/
    );
  });

  it('D4: the mount helper guards on session + the optional component', () => {
    const body = fnBody(DESK, '_mountClassroomBoard');
    expect(body).toMatch(/rosterClient/);
    expect(body).toMatch(/typeof\s+window\.ClassroomBoard/);
    expect(body).toMatch(/ClassroomBoard\.mount/);
    // The Desk embed is the student board (BUILD D4): role is the
    // literal 'student', never derived from the teacher-role flag.
    expect(body).toMatch(/role\s*:\s*['"]student['"]/);
    expect(body).not.toMatch(/apstats_user_role/);
  });

  it('D5: _periodToSection never returns null, maps bare letters, defaults to PeriodX', () => {
    // Strip line comments first so comment prose cannot trip the code
    // assertions below.
    const code = fnBody(DESK, '_periodToSection').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/return\s+null/);
    expect(code).toMatch(/return\s+['"]PeriodX['"]/);
    // A bare period letter maps to Period<LETTER> for future periods.
    expect(code).toMatch(/['"]Period['"]\s*\+\s*period/);
  });
});

describe('Live Classroom v1a - cockpit page', () => {
  it('teacher-classroom.html exists', () => {
    expect(COCKPIT, 'teacher-classroom.html must exist').toBeTypeOf('string');
  });

  it('loads roster_config.js, roster-client.js, and classroom-board.js', () => {
    expect(COCKPIT).toMatch(/<script\s+src=["']roster_config\.js["']/i);
    expect(COCKPIT).toMatch(/<script\s+src=["']roster-client\.js["']/i);
    expect(COCKPIT).toMatch(/<script\s+src=["']classroom-board\.js["']/i);
  });

  it('mounts the board in teacher mode', () => {
    expect(COCKPIT).toMatch(/ClassroomBoard\.mount/);
    expect(COCKPIT).toMatch(/role\s*:\s*['"]teacher['"]/);
  });

  it('fetches the section roster for the real-name map', () => {
    expect(COCKPIT).toMatch(/\/roster\/section\//);
  });
});

describe('Live Classroom v1a - board component', () => {
  it('classroom-board.js exists and exposes window.ClassroomBoard', () => {
    expect(BOARD, 'classroom-board.js must exist').toBeTypeOf('string');
    expect(BOARD).toMatch(/window\.ClassroomBoard/);
  });
});

// =============================================================
// v1b structure pins - cockpit control strip + checked-in panel
// =============================================================

describe('Live Classroom v1b - cockpit control strip', () => {
  it('has an Arm Gate button (id=btn-arm-gate)', () => {
    expect(COCKPIT).toMatch(/id=["']btn-arm-gate["']/);
    // The label must say "Arm Gate"
    expect(COCKPIT).toMatch(/Arm Gate/);
  });

  it('has a Green Light button (id=btn-green-light)', () => {
    expect(COCKPIT).toMatch(/id=["']btn-green-light["']/);
    expect(COCKPIT).toMatch(/Green Light/);
  });

  it('has a Reset button (id=btn-reset)', () => {
    expect(COCKPIT).toMatch(/id=["']btn-reset["']/);
    expect(COCKPIT).toMatch(/Reset/);
  });

  it('Arm Gate button calls boardHandle.armGate(theme)', () => {
    expect(COCKPIT).toMatch(/boardHandle\.armGate/);
    expect(COCKPIT).toMatch(/armGate\(theme\)/);
  });

  it('Green Light button calls boardHandle.greenLight()', () => {
    expect(COCKPIT).toMatch(/boardHandle\.greenLight/);
    expect(COCKPIT).toMatch(/greenLight\(\)/);
  });

  it('Reset button calls boardHandle.reset()', () => {
    expect(COCKPIT).toMatch(/boardHandle\.reset/);
    expect(COCKPIT).toMatch(/reset\(\)/);
  });

  it('theme is computed deterministically from the current date (todayTheme)', () => {
    expect(COCKPIT).toMatch(/function\s+todayTheme/);
    // Theme must not rely on random() - only Date-based math.
    const themeBlock = (() => {
      const re = /function\s+todayTheme\s*\(\)/;
      const m = re.exec(COCKPIT);
      if (!m) return '';
      const i = COCKPIT.indexOf('{', m.index);
      let depth = 0;
      for (let j = i; j < COCKPIT.length; j++) {
        if (COCKPIT[j] === '{') depth++;
        else if (COCKPIT[j] === '}') { depth--; if (depth === 0) return COCKPIT.slice(i, j + 1); }
      }
      return '';
    })();
    expect(themeBlock).toMatch(/new Date/);
    expect(themeBlock).not.toMatch(/Math\.random/);
  });
});

describe('Live Classroom v1b - greenlight indicator', () => {
  it('has a greenlight dot element (id=greenlight-dot)', () => {
    expect(COCKPIT).toMatch(/id=["']greenlight-dot["']/);
  });

  it('has a greenlight label element (id=greenlight-label)', () => {
    expect(COCKPIT).toMatch(/id=["']greenlight-label["']/);
  });

  it('defines setGreenlightIndicator, driven by the broadcast onStateChange summary', () => {
    expect(COCKPIT).toMatch(/function\s+setGreenlightIndicator/);
    // The indicator mirrors summary.greenlight (broadcast-driven), so it
    // lights for a remote teacher's GO and never lies on a failed local click.
    expect(COCKPIT).toMatch(/setGreenlightIndicator\(!!summary\.greenlight\)/);
    // No optimistic light-on-click: a literal setGreenlightIndicator(true)
    // must NOT appear (the corrected design removed it from the click handler).
    expect(COCKPIT).not.toMatch(/setGreenlightIndicator\(true\)/);
  });
});

describe('Live Classroom v1b - checked-in panel', () => {
  it('has a checked-in count element (id=checkin-count)', () => {
    expect(COCKPIT).toMatch(/id=["']checkin-count["']/);
  });

  it('has a checked-in list element (id=checkin-list)', () => {
    expect(COCKPIT).toMatch(/id=["']checkin-list["']/);
  });

  it('defines renderCheckinPanel and calls it from onStateChange', () => {
    expect(COCKPIT).toMatch(/function\s+renderCheckinPanel/);
    expect(COCKPIT).toMatch(/renderCheckinPanel\(summary/);
  });

  it('renderCheckinPanel filters by role student and status checkedIn', () => {
    const re = /function\s+renderCheckinPanel\s*\(/;
    const m = re.exec(COCKPIT);
    if (!m) throw new Error('renderCheckinPanel not found');
    const i = COCKPIT.indexOf('{', m.index);
    let depth = 0, body = '';
    for (let j = i; j < COCKPIT.length; j++) {
      if (COCKPIT[j] === '{') depth++;
      else if (COCKPIT[j] === '}') { depth--; if (depth === 0) { body = COCKPIT.slice(i, j + 1); break; } }
    }
    expect(body).toMatch(/role\s*===\s*['"]student['"]/);
    expect(body).toMatch(/status\s*===\s*['"]checkedIn['"]/);
  });

  it('renderCheckinPanel displays count as N / M in format', () => {
    // The count text must contain the fraction pattern.
    expect(COCKPIT).toMatch(/checkedIn\.length\s*\+\s*['"]\s*\/\s*['"]|'\/'\s*\+|'\/ '\s*\+|\/.*in/);
  });

  it('passes onStateChange callback into ClassroomBoard.mount', () => {
    expect(COCKPIT).toMatch(/onStateChange\s*:/);
    expect(COCKPIT).toMatch(/onStateChange\s*:\s*function/);
  });

  it('onStateChange maps username to real name via nameMap', () => {
    expect(COCKPIT).toMatch(/nameMap\[m\.username\]|nameMap && nameMap\[m\.username\]/);
  });
});
