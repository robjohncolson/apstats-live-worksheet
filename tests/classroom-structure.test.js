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

  it('Green Light button calls boardHandle.greenLight with opts (v1c)', () => {
    expect(COCKPIT).toMatch(/boardHandle\.greenLight/);
    // v1c: greenLight is now called with an opts object ({ startVideo }).
    expect(COCKPIT).toMatch(/greenLight\(\s*\{/);
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

// =============================================================
// r3 structure pins -- lifted files + hue wiring
// =============================================================

describe('Live Classroom r3 - lifted engine files exist', () => {
  it('canvas_engine.js exists in the repo root', () => {
    const path = resolve(repo, 'canvas_engine.js');
    expect(existsSync(path), 'canvas_engine.js must exist').toBe(true);
  });

  it('sprite_sheet.js exists in the repo root', () => {
    const path = resolve(repo, 'sprite_sheet.js');
    expect(existsSync(path), 'sprite_sheet.js must exist').toBe(true);
  });

  it('sprite.png exists in the repo root', () => {
    const path = resolve(repo, 'sprite.png');
    expect(existsSync(path), 'sprite.png must exist').toBe(true);
  });
});

describe('Live Classroom r3 - cockpit loads engine scripts', () => {
  it('teacher-classroom.html loads canvas_engine.js before classroom-board.js', () => {
    expect(COCKPIT).toMatch(/<script\s+src=["']canvas_engine\.js["']/i);
  });

  it('teacher-classroom.html loads sprite_sheet.js before classroom-board.js', () => {
    expect(COCKPIT).toMatch(/<script\s+src=["']sprite_sheet\.js["']/i);
  });

  it('canvas_engine.js and sprite_sheet.js appear before classroom-board.js in document order', () => {
    // Use the <script src="..."> tag positions to avoid matching comments.
    const idxEngine = COCKPIT.indexOf('src="canvas_engine.js"');
    const idxSprite = COCKPIT.indexOf('src="sprite_sheet.js"');
    const idxBoard  = COCKPIT.indexOf('src="classroom-board.js"');
    expect(idxEngine).toBeGreaterThan(-1);
    expect(idxSprite).toBeGreaterThan(-1);
    expect(idxBoard).toBeGreaterThan(-1);
    expect(idxEngine).toBeLessThan(idxBoard);
    expect(idxSprite).toBeLessThan(idxBoard);
  });
});

describe('Live Classroom r3 - hue opt in mount call', () => {
  it('classroom-board.js mount accepts a hue opt (hue: present in mount source)', () => {
    expect(BOARD).toMatch(/opts\.hue/);
  });

  it('classroom_join message includes hue in board source', () => {
    expect(BOARD).toMatch(/hue\s*:/);
    expect(BOARD).toMatch(/classroom_join/);
  });

  it('teacher-classroom.html mountBoard passes hue from session.spriteHue', () => {
    expect(COCKPIT).toMatch(/spriteHue/);
    expect(COCKPIT).toMatch(/hue\s*:/);
  });

  it('_reduce WireMember carries hue field (additive)', () => {
    // The _reduce source must reference member.hue for both classroom_state
    // and classroom_member_update handlers.
    expect(BOARD).toMatch(/m\.hue/);
    expect(BOARD).toMatch(/upd\.hue/);
  });

  it('Desk _mountClassroomBoard passes hue from rosterClient.current().spriteHue', () => {
    const body = fnBody(DESK, '_mountClassroomBoard');
    expect(body).toMatch(/hue\s*:/);
    expect(body).toMatch(/spriteHue/);
  });
});

describe('Live Classroom r3 - Desk loads engine scripts', () => {
  it('the Desk loads canvas_engine.js and sprite_sheet.js before classroom-board.js', () => {
    const idxEngine = DESK.indexOf('src="canvas_engine.js"');
    const idxSprite = DESK.indexOf('src="sprite_sheet.js"');
    const idxBoard  = DESK.indexOf('src="classroom-board.js"');
    expect(idxEngine).toBeGreaterThan(-1);
    expect(idxSprite).toBeGreaterThan(-1);
    expect(idxBoard).toBeGreaterThan(-1);
    expect(idxEngine).toBeLessThan(idxBoard);
    expect(idxSprite).toBeLessThan(idxBoard);
  });
});

describe('Live Classroom r3 - board bridges engine classes onto window', () => {
  // canvas_engine.js / sprite_sheet.js are verbatim cr copies: bare top-level
  // `class` declarations. As classic <script>s a top-level class is a global
  // LEXICAL binding, NOT a window property -- so mount()'s
  // `new root.CanvasEngine(...)` would throw and the board would silently
  // never render (engineReady=false). classroom-board.js must bridge the
  // lexical bindings onto root at IIFE entry. (Regression guard: this bug
  // shipped in r3 because classroom-board.test.js injects CanvasEngine as a
  // window PROPERTY, masking the lexical-binding reality of a real browser.)
  it('classroom-board.js copies CanvasEngine onto root', () => {
    expect(BOARD).toMatch(/root\.CanvasEngine\s*=\s*CanvasEngine/);
  });

  it('classroom-board.js copies SpriteSheet onto root', () => {
    expect(BOARD).toMatch(/root\.SpriteSheet\s*=\s*SpriteSheet/);
  });

  it('the bridge is typeof-guarded so a missing engine file does not throw', () => {
    expect(BOARD).toMatch(/typeof\s+CanvasEngine\s*!==\s*['"]undefined['"]/);
    expect(BOARD).toMatch(/typeof\s+SpriteSheet\s*!==\s*['"]undefined['"]/);
  });

  it('the bridge runs before mount() reads root.CanvasEngine', () => {
    const idxBridge = BOARD.search(/root\.CanvasEngine\s*=\s*CanvasEngine/);
    // The real call site is `engine = new root.CanvasEngine(canvasId)` inside
    // mount() -- matched specifically so the regex cannot hit the prose
    // `new root.CanvasEngine(...)` in the bridge's own comment above.
    const idxUse    = BOARD.search(/engine\s*=\s*new\s+root\.CanvasEngine/);
    expect(idxBridge).toBeGreaterThan(-1);
    expect(idxUse).toBeGreaterThan(-1);
    expect(idxBridge).toBeLessThan(idxUse);
  });
});

// =============================================================
// v2 structure pins -- cockpit poll section
// =============================================================

describe('Live Classroom v2 - cockpit poll section exists', () => {
  it('has a poll section element (id=poll-section)', () => {
    expect(COCKPIT).toMatch(/id=["']poll-section["']/);
  });

  it('has a poll question input (id=poll-question-input)', () => {
    expect(COCKPIT).toMatch(/id=["']poll-question-input["']/);
  });

  it('has a poll options list container (id=poll-options-list)', () => {
    expect(COCKPIT).toMatch(/id=["']poll-options-list["']/);
  });

  it('has option input elements with class poll-option-input', () => {
    expect(COCKPIT).toMatch(/class=["']poll-option-input["']/);
  });

  it('has an add-option button (id=poll-add-option)', () => {
    expect(COCKPIT).toMatch(/id=["']poll-add-option["']/);
  });

  it('has a Blind checkbox (id=poll-blind-checkbox)', () => {
    expect(COCKPIT).toMatch(/id=["']poll-blind-checkbox["']/);
    expect(COCKPIT).toMatch(/type=["']checkbox["']/);
  });

  it('has an Open Poll button (id=btn-open-poll)', () => {
    expect(COCKPIT).toMatch(/id=["']btn-open-poll["']/);
    expect(COCKPIT).toMatch(/Open Poll/);
  });

  it('has a Close Poll button (id=btn-close-poll)', () => {
    expect(COCKPIT).toMatch(/id=["']btn-close-poll["']/);
    expect(COCKPIT).toMatch(/Close Poll/);
  });

  it('has a Reveal button (id=btn-reveal-poll)', () => {
    expect(COCKPIT).toMatch(/id=["']btn-reveal-poll["']/);
    expect(COCKPIT).toMatch(/Reveal/);
  });

  it('has a poll result canvas (id=poll-result-canvas)', () => {
    expect(COCKPIT).toMatch(/id=["']poll-result-canvas["']/);
  });

  it('has a poll tally label (id=poll-tally-label)', () => {
    expect(COCKPIT).toMatch(/id=["']poll-tally-label["']/);
  });
});

describe('Live Classroom v2 - cockpit poll button wiring', () => {
  it('Open Poll button calls boardHandle.openPoll', () => {
    expect(COCKPIT).toMatch(/boardHandle\.openPoll/);
  });

  it('Close Poll button calls boardHandle.closePoll', () => {
    expect(COCKPIT).toMatch(/boardHandle\.closePoll/);
  });

  it('Reveal button calls boardHandle.reveal', () => {
    expect(COCKPIT).toMatch(/boardHandle\.reveal/);
  });

  it('Open Poll is guarded disabled while gate is armed (mode exclusivity)', () => {
    expect(COCKPIT).toMatch(/btn-open-poll/);
    // The guard disables the button; check that disabled assignment is present.
    expect(COCKPIT).toMatch(/btn\.disabled\s*=\s*gateArmed/);
  });

  it('renderPollTally is called from onStateChange', () => {
    expect(COCKPIT).toMatch(/renderPollTally\s*\(\s*summary\s*\)/);
  });

  it('renderPollTally calls Ti84Plot.drawBarChart with labels and counts', () => {
    expect(COCKPIT).toMatch(/Ti84Plot\.drawBarChart/);
    expect(COCKPIT).toMatch(/labels\s*:/);
    expect(COCKPIT).toMatch(/counts\s*:/);
  });
});

describe('Live Classroom v2 - ti84-plot.js script load', () => {
  it('teacher-classroom.html loads ti84-plot.js as a sibling script', () => {
    expect(COCKPIT).toMatch(/<script\s+src=["']ti84-plot\.js["']/i);
  });

  it('ti84-plot.js appears after classroom-board.js in document order', () => {
    const idxBoard = COCKPIT.indexOf('src="classroom-board.js"');
    const idxPlot  = COCKPIT.indexOf('src="ti84-plot.js"');
    expect(idxBoard).toBeGreaterThan(-1);
    expect(idxPlot).toBeGreaterThan(-1);
    expect(idxPlot).toBeGreaterThan(idxBoard);
  });

  it('ti84-plot.js file exists in the repo root', () => {
    const path = resolve(repo, 'ti84-plot.js');
    // This will be true after U3 (ti84-plot.js) is integrated.
    // We pin the expectation now so the integrated suite enforces it.
    expect(existsSync(path), 'ti84-plot.js must exist (built by U3)').toBe(true);
  });

  it('window.Ti84Plot is referenced in the cockpit source', () => {
    expect(COCKPIT).toMatch(/window\.Ti84Plot/);
  });
});

// =============================================================
// v1c structure pins -- synchronized video start
// =============================================================

describe('Live Classroom v1c - synchronized video start', () => {
  it('cockpit has a Sync video start checkbox (id=sync-video-start)', () => {
    expect(COCKPIT).toMatch(/id=["']sync-video-start["']/);
    expect(COCKPIT).toMatch(/type=["']checkbox["']/);
  });

  it('cockpit Green Light passes startVideo read from the checkbox', () => {
    expect(COCKPIT).toMatch(/greenLight\(\s*\{/);
    expect(COCKPIT).toMatch(/startVideo\s*:/);
    expect(COCKPIT).toMatch(/sync-video-start/);
  });

  it('the board greenLight accepts an opts object and sends startVideo/videoRef', () => {
    expect(BOARD).toMatch(/greenLight\s*:\s*function\s*\(\s*opts\s*\)/);
    expect(BOARD).toMatch(/startVideo\s*:/);
    expect(BOARD).toMatch(/videoRef\s*:/);
  });

  it('the board mount reads an optional onStartVideo opt', () => {
    expect(BOARD).toMatch(/opts\.onStartVideo/);
  });

  it('Desk _mountClassroomBoard passes onStartVideo into the board mount', () => {
    const body = fnBody(DESK, '_mountClassroomBoard');
    expect(body).toMatch(/onStartVideo\s*:/);
  });

  it('Desk _focusTodayLessonVideo opens the resource panel directly (no synthetic click)', () => {
    expect(DESK).toMatch(/function\s+_focusTodayLessonVideo\s*\(/);
    const body = fnBody(DESK, '_focusTodayLessonVideo');
    // Codex F3 MAJOR: must call showResourcePanel directly, NOT cell.click()
    // -- a synthetic click re-enters the lock-dialog / Do-Now-bump guards.
    expect(body).toMatch(/showResourcePanel\s*\(/);
    expect(body).not.toMatch(/\.click\s*\(\s*\)/);
  });
});

// ==========================================================================
// F4 code-review structural pins
// ==========================================================================

describe('F4 code-review -- Finding 4: Reveal button disabled for non-blind polls', () => {
  it('updateOpenPollGuard in cockpit checks poll.blind and disables the Reveal button', () => {
    // The function body must reference btn-reveal-poll and poll.blind.
    const body = fnBody(COCKPIT, 'updateOpenPollGuard');
    expect(body).toMatch(/btn-reveal-poll/);
    expect(body).toMatch(/poll\.blind/);
    // The button must be disabled when the poll is not blind.
    expect(body).toMatch(/revealBtn\.disabled/);
  });

  it('cockpit updateOpenPollGuard is called from onStateChange', () => {
    // The onStateChange callback in mountBoard must call updateOpenPollGuard.
    expect(COCKPIT).toMatch(/updateOpenPollGuard\s*\(/);
  });
});

describe('F4 code-review -- Finding 2: Blind-poll secrecy on non-vote broadcasts', () => {
  it('classroom-board.js _reduce classroom_poll resets status to present', () => {
    // The classroom_poll case must set status to "present" (not preserve it).
    const pollCaseEnd = BOARD.split("case 'classroom_poll':")[1] || '';
    const caseBody = pollCaseEnd.split("case 'classroom_poll_closed':")[0];
    // The fix sets status: 'present' explicitly.
    expect(caseBody).toMatch(/status\s*:\s*['"]present['"]/);
  });

  it('classroom-board.js _reduce classroom_poll also resets vote to null', () => {
    const pollCaseEnd = BOARD.split("case 'classroom_poll':")[1] || '';
    const caseBody = pollCaseEnd.split("case 'classroom_poll_closed':")[0];
    expect(caseBody).toMatch(/vote\s*:\s*null/);
  });
});

describe('F4 code-review -- Finding 1: Optimistic self-vote on option click', () => {
  it('classroom-board.js vote button onclick calls applyMessage before safeSend', () => {
    // The vote button onclick must call applyMessage with a synthetic
    // classroom_member_update BEFORE calling safeSend / classroom_vote.
    const onclickSection = BOARD.split('btn.onclick = function ()')[1] || '';
    const fnBody2 = onclickSection.split('};')[0];
    expect(fnBody2).toMatch(/applyMessage/);
    expect(fnBody2).toMatch(/classroom_member_update/);
    expect(fnBody2).toMatch(/status.*voted|voted.*status/);
    // safeSend also present (sends the real WS message).
    expect(fnBody2).toMatch(/safeSend/);
    expect(fnBody2).toMatch(/classroom_vote/);
    // applyMessage must appear before safeSend in the source.
    expect(fnBody2.indexOf('applyMessage')).toBeLessThan(fnBody2.indexOf('safeSend'));
  });
});

// ==========================================================================
// KEYBOARD_AVATAR Phase 1 -- local controller wiring (KEYBOARD_AVATAR_SPEC.md)
// ==========================================================================

describe('KEYBOARD_AVATAR Phase 1 -- player controller wiring', () => {
  it('classroom-board.js defines PlayerSprite', () => {
    expect(BOARD).toMatch(/function\s+PlayerSprite\s*\(\s*spriteSheet\s*,\s*opts\s*\)/);
  });

  it('PlayerSprite inherits from BoardSprite', () => {
    expect(BOARD).toMatch(/PlayerSprite\.prototype\s*=\s*Object\.create\(\s*BoardSprite\.prototype\s*\)/);
  });

  it('exposes _PlayerSprite on the public API for tests', () => {
    expect(BOARD).toMatch(/_PlayerSprite\s*:\s*PlayerSprite/);
  });

  it('defines the kinematics constants (JUMP_V0, GRAVITY, PUSH_DELTA)', () => {
    expect(BOARD).toMatch(/var\s+JUMP_V0\s*=\s*-280/);
    expect(BOARD).toMatch(/var\s+GRAVITY\s*=\s*800/);
    expect(BOARD).toMatch(/var\s+PUSH_DELTA\s*=\s*0\.6/);
  });

  it('mount() declares the shared playerInput state object', () => {
    expect(BOARD).toMatch(/var\s+playerInput\s*=\s*\{\s*left:\s*false/);
  });

  it('handlePlayerUp sends classroom_checkin when in the gate-door hitbox + gate armed', () => {
    expect(BOARD).toMatch(/function\s+handlePlayerUp/);
    // The guard pattern + the safeSend call.
    expect(BOARD).toMatch(/state\.gate\s*\.\s*armed/);
    expect(BOARD).toMatch(/safeSend\(\s*\{\s*type\s*:\s*['"]classroom_checkin['"]\s*\}\s*\)/);
  });

  it('input gating: skips when an input/textarea is focused or a modal is open', () => {
    expect(BOARD).toMatch(/function\s+_isInputFocused/);
    expect(BOARD).toMatch(/function\s+_isModalOpen/);
    // Maps the 3 used arrow keys (Down is reserved per spec).
    expect(BOARD).toMatch(/['"]ArrowLeft['"]/);
    expect(BOARD).toMatch(/['"]ArrowRight['"]/);
    expect(BOARD).toMatch(/['"]ArrowUp['"]/);
  });

  it('attaches keydown + keyup listeners on the document', () => {
    expect(BOARD).toMatch(/doc\.addEventListener\(\s*['"]keydown['"]/);
    expect(BOARD).toMatch(/doc\.addEventListener\(\s*['"]keyup['"]/);
  });

  it('addSprite branches on isLocal student to create a PlayerSprite', () => {
    expect(BOARD).toMatch(/var\s+isLocal\s*=\s*\(\s*member\.username\s*===\s*username\s*&&\s*role\s*===\s*['"]student['"]\s*\)/);
    expect(BOARD).toMatch(/new\s+PlayerSprite\s*\(/);
  });

  it('repositionSprites skips any sprite that has moved (_moved flag)', () => {
    // Phase 2 unified the check across both sprite classes (PlayerSprite OR
    // a peer BoardSprite that received a classroom_pos broadcast). Appears
    // twice -- once in the no-poll branch, once in the poll-unvoted branch.
    var matches = (BOARD.match(/\w+\._moved\s*\)\s*\{\s*continue/g) || []);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('destroy() detaches the keyboard listeners', () => {
    expect(BOARD).toMatch(/doc\.removeEventListener\(\s*['"]keydown['"]/);
    expect(BOARD).toMatch(/doc\.removeEventListener\(\s*['"]keyup['"]/);
  });

  it("Desk has the keyboard help-text strip below the board mount", () => {
    expect(DESK).toMatch(/id=["']classroom-board-controls["']/);
    expect(DESK).toMatch(/Arrows walk/);
    expect(DESK).toMatch(/Space jump/);
    expect(DESK).toMatch(/Up to check in/);
  });
});

// =============================================================
// Pre-existing onDrained bug -- guard added in the Phase 1 fold
// =============================================================
//
// onDrained was firing unconditionally on walkTo arrival. v2 added the
// poll-voted column walk via walkTo WITHOUT going through startDrain
// (which sets the draining[uname] flag) -- so the voter's sprite would
// have been removed at the column. The Phase 1 fold guards onDrained to
// only act on actual drains.
describe('onDrained guard -- only removes on an actual drain', () => {
  it('the closure rejects when draining[uname] is falsy', () => {
    expect(BOARD).toMatch(/if\s*\(\s*!\s*draining\[\s*uname\s*\]\s*\)\s*\{?\s*return/);
  });
});

// ==========================================================================
// KEYBOARD_AVATAR Phase 1.5 -- direction-aware frames + stackable platforms
// ==========================================================================

describe('KEYBOARD_AVATAR Phase 1.5 -- direction + stackable head-jumping', () => {
  it('defines JUMP_FRAME constant (= 5; cr-matching airborne pose)', () => {
    expect(BOARD).toMatch(/var\s+JUMP_FRAME\s*=\s*5/);
  });

  it('BoardSprite._directedFrame applies the +11 offset for left-facing', () => {
    expect(BOARD).toMatch(/BoardSprite\.prototype\._directedFrame\s*=\s*function/);
    expect(BOARD).toMatch(/this\.facingRight\s*\?\s*baseFrame\s*:\s*baseFrame\s*\+\s*11/);
  });

  it('BoardSprite.walkTo sets facingRight from walkDir', () => {
    expect(BOARD).toMatch(/this\.facingRight\s*=\s*\(\s*this\.walkDir\s*>\s*0\s*\)/);
  });

  it('_updateIdle and _updateWalk route frames through _directedFrame', () => {
    expect(BOARD).toMatch(/this\.frameIndex\s*=\s*this\._directedFrame\(\s*IDLE_FRAMES/);
    expect(BOARD).toMatch(/this\.frameIndex\s*=\s*this\._directedFrame\(\s*WALK_FRAMES/);
  });

  it('PlayerSprite tracks _spriteHeight for collision math', () => {
    expect(BOARD).toMatch(/this\._spriteHeight\s*=\s*SPRITE_H\s*\*/);
  });

  it('PlayerSprite._onFloor checks ground + each peer head', () => {
    expect(BOARD).toMatch(/PlayerSprite\.prototype\._onFloor\s*=\s*function/);
  });

  it('PlayerSprite._horizontalOverlap and _sameLevel exist', () => {
    expect(BOARD).toMatch(/PlayerSprite\.prototype\._horizontalOverlap/);
    expect(BOARD).toMatch(/PlayerSprite\.prototype\._sameLevel/);
  });

  it('stack landing: floor candidate is peer.y - spriteHeight, gated on prevY <= landingY && y >= landingY', () => {
    expect(BOARD).toMatch(/landingY\s*=\s*p\.y\s*-\s*this\._spriteHeight/);
    expect(BOARD).toMatch(/prevY\s*<=\s*landingY\s*&&\s*this\.y\s*>=\s*landingY/);
  });

  it('side collision is gated on _sameLevel so it cannot kick off peer heads', () => {
    // Phase 2.1 reshaped the soft-push inline-AND into a guard early-return,
    // but the predicate is the same: only act when on the same level AND
    // horizontally overlapping. Match both the OLD (Phase 1.5) and NEW
    // (Phase 2.1) forms so the contract is the invariant, not the syntax.
    var newForm = /!\s*this\._sameLevel\(\s*pp\s*\)\s*\|\|\s*!\s*this\._horizontalOverlap\(\s*pp\s*\)/;
    var oldForm = /this\._sameLevel\(\s*pp\s*\)\s*&&\s*this\._horizontalOverlap\(\s*pp\s*\)/;
    expect(newForm.test(BOARD) || oldForm.test(BOARD)).toBe(true);
  });
});

// ==========================================================================
// KEYBOARD_AVATAR Phase 2 -- cross-client position broadcast
// ==========================================================================

describe('KEYBOARD_AVATAR Phase 2 -- position broadcast wiring', () => {
  it('defines POS_RATE_TABLE (size -> interval, ms) replacing POS_RATE_MS', () => {
    expect(BOARD).toMatch(/var\s+POS_RATE_TABLE\s*=\s*\[/);
    expect(BOARD).toMatch(/\[\s*8\s*,\s*100\s*\]/);
    expect(BOARD).toMatch(/\[\s*20\s*,\s*200\s*\]/);
    expect(BOARD).toMatch(/\[\s*40\s*,\s*300\s*\]/);
    expect(BOARD).toMatch(/\[\s*Infinity\s*,\s*500\s*\]/);
    // The pre-scaling constant must be GONE -- no transitional alias.
    expect(BOARD).not.toMatch(/var\s+POS_RATE_MS\b/);
  });

  it('PlayerSprite carries onPos + an injectable _now clock', () => {
    expect(BOARD).toMatch(/this\.onPos\s*=\s*\(\s*typeof\s+opts\.onPos\s*===\s*['"]function['"]\s*\)/);
    expect(BOARD).toMatch(/this\._now\s*=\s*\(\s*typeof\s+opts\.now\s*===\s*['"]function['"]\s*\)/);
  });

  it('PlayerSprite.update emits at the room-size-scaled cadence + one rest snapshot', () => {
    // Emit gate reads the threshold-mapped interval; rest-snapshot rule unchanged.
    expect(BOARD).toMatch(/now\s*-\s*this\._lastPosMs\s*>=\s*_currentEmitRateMs\(\s*this\._getMemberCount\(\)\s*\)/);
    expect(BOARD).toMatch(/this\._restEmitted\s*=\s*true/);
  });

  it('exposes _currentEmitRateMs(memberCount) -> intervalMs helper', () => {
    expect(BOARD).toMatch(/function\s+_currentEmitRateMs\s*\(\s*memberCount\s*\)/);
  });

  it('PlayerSprite reads opts.getMemberCount (default returns 1)', () => {
    expect(BOARD).toMatch(/this\._getMemberCount\s*=\s*\(\s*typeof\s+opts\.getMemberCount\s*===\s*['"]function['"]\s*\)/);
  });

  it('addSprite wires baseOpts.getMemberCount on the local PlayerSprite branch', () => {
    expect(BOARD).toMatch(/baseOpts\.getMemberCount\s*=\s*function\s*\(\s*\)\s*\{\s*\n?\s*return\s+Object\.keys\(\s*state\.members\s*\)\.length\s*;\s*\}/);
  });

  it('mount() wires onPos -> safeSend({type: classroom_pos, ...})', () => {
    expect(BOARD).toMatch(/safeSend\(\s*\{\s*\n?\s*type:\s*['"]classroom_pos['"]/);
  });

  it('applyMessage dispatches classroom_pos to applyPos (transient, NOT reduced)', () => {
    expect(BOARD).toMatch(/msg\.type\s*===\s*['"]classroom_pos['"]/);
    expect(BOARD).toMatch(/function\s+applyPos/);
  });

  it('applyPos ignores self echoes and overwriting the local PlayerSprite', () => {
    expect(BOARD).toMatch(/msg\.username\s*===\s*username/);
    expect(BOARD).toMatch(/peer\s+instanceof\s+PlayerSprite/);
  });

  it('applyPos uses walkTo for x chase and the _yTarget chase for y (Phase 2.2)', () => {
    expect(BOARD).toMatch(/peer\.walkTo\(\s*msg\.x\s*\)/);
    // Phase 2 originally did `peer.y = msg.y`; Phase 2.2 switched to a
    // chased target via _yTarget so peer jumps render as a smooth arc.
    expect(BOARD).toMatch(/peer\._yTarget\s*=\s*msg\.y/);
  });

  it('addSprite restores member.pos to the new sprite (join-snapshot late peer)', () => {
    expect(BOARD).toMatch(/member\.pos\s*&&\s*typeof\s+member\.pos\.x\s*===\s*['"]number['"]/);
  });

  it('_reduce threads pos through classroom_state and classroom_member_update', () => {
    expect(BOARD).toMatch(/pos:\s*m\.pos\s*!=\s*null\s*\?\s*m\.pos\s*:\s*null/);
    expect(BOARD).toMatch(/pos:\s*upd\.pos\s*!=\s*null/);
  });
});

// ==========================================================================
// KEYBOARD_AVATAR Phase 2.1 -- solid side collision + carry-while-standing
// ==========================================================================

describe('KEYBOARD_AVATAR Phase 2.1 -- side collision + carry', () => {
  it('PlayerSprite carries standingOn + _standingOnLastX state', () => {
    expect(BOARD).toMatch(/this\.standingOn\s*=\s*null/);
    expect(BOARD).toMatch(/this\._standingOnLastX\s*=\s*null/);
  });

  it('carry: applies (standingOn.x - _standingOnLastX) as a horizontal delta', () => {
    expect(BOARD).toMatch(/this\.standingOn\.x\s*-\s*this\._standingOnLastX/);
  });

  it('floor check tracks the landing peer as the new standingOn', () => {
    expect(BOARD).toMatch(/landingPeer\s*=\s*p/);
    expect(BOARD).toMatch(/this\.standingOn\s*=\s*landingPeer/);
  });

  it('jumping clears standingOn (hops off the carrier)', () => {
    expect(BOARD).toMatch(/this\.state\s*=\s*['"]jumping['"];\s*\n?\s*this\.standingOn\s*=\s*null/);
  });

  it('solid side collision snaps player to the peer edge (not soft-push)', () => {
    // The snap-to-edge form: this.x = pp.x - this._spriteSize (right-hit)
    // and this.x = pp.x + this._spriteSize (left-hit). Both must appear.
    expect(BOARD).toMatch(/this\.x\s*=\s*pp\.x\s*-\s*this\._spriteSize/);
    expect(BOARD).toMatch(/this\.x\s*=\s*pp\.x\s*\+\s*this\._spriteSize/);
  });

  it('side collision is skipped while airborne (state !== "jumping" gate)', () => {
    // The gate appears before the side-collision loop.
    expect(BOARD).toMatch(/if\s*\(\s*this\.state\s*!==\s*['"]jumping['"]\s*\)\s*\{[\s\S]*?_sameLevel/);
  });

  it('Phase 2 emit includes the "being carried" signal (peer.state === walking)', () => {
    expect(BOARD).toMatch(/this\.standingOn\.state\s*===\s*['"]walking['"]/);
  });

  it('Phase 2 emit ALSO triggers on _carriedThisTick (the precise carry signal)', () => {
    // The 'walking'-state heuristic alone misses the 'arrived' window between
    // the carrier's broadcasts; _carriedThisTick fires whenever the peer's x
    // actually moved this tick, keeping the passenger broadcasting at 10 Hz.
    expect(BOARD).toMatch(/this\._carriedThisTick\s*=\s*true/);
    expect(BOARD).toMatch(/\|\|\s*this\._carriedThisTick/);
  });

  it('cache update at tick end: _standingOnLastX = standingOn?.x : null', () => {
    expect(BOARD).toMatch(/this\._standingOnLastX\s*=\s*this\.standingOn\s*\?\s*this\.standingOn\.x\s*:\s*null/);
  });

  it('Phase 2.4: jump trigger is gated by _someoneOnTop() (no jump while ridden)', () => {
    // A peer standing on the player's head blocks the jump -- otherwise the
    // peer would fall through (Mario one-way platforms do not carry upward).
    // The check can be inline-bang (`!_someoneOnTop()`) OR a nested if/else
    // (refusal branch sets the twitch timer) -- either form is valid.
    expect(BOARD).toMatch(/PlayerSprite\.prototype\._someoneOnTop\s*=\s*function/);
    expect(BOARD).toMatch(/this\._someoneOnTop\(\s*\)/);
  });

  it('Phase 2.4: a refused jump arms _blockedTwitchMs for the visual jitter', () => {
    expect(BOARD).toMatch(/this\._blockedTwitchMs\s*=\s*150/);
    // Render override applies a sine-based y offset while the timer is alive.
    expect(BOARD).toMatch(/PlayerSprite\.prototype\.render\s*=\s*function/);
    expect(BOARD).toMatch(/this\._blockedTwitchMs\s*>\s*0/);
  });
});

// ==========================================================================
// KEYBOARD_AVATAR Phase 2.2 -- peer y interpolation (smooth jumps)
// ==========================================================================

describe('KEYBOARD_AVATAR Phase 2.2 -- peer y interpolation', () => {
  it('defines Y_CHASE_SPEED (px/s)', () => {
    expect(BOARD).toMatch(/var\s+Y_CHASE_SPEED\s*=\s*600/);
  });

  it('BoardSprite initializes _yTarget to null', () => {
    expect(BOARD).toMatch(/this\._yTarget\s*=\s*null/);
  });

  it('BoardSprite.update calls _chaseY every tick (after the state branch)', () => {
    expect(BOARD).toMatch(/this\._chaseY\s*\(\s*dt\s*\)/);
  });

  it('_chaseY exists and steps at Y_CHASE_SPEED * dt toward the target', () => {
    expect(BOARD).toMatch(/BoardSprite\.prototype\._chaseY\s*=\s*function/);
    expect(BOARD).toMatch(/Y_CHASE_SPEED\s*\*\s*dt/);
  });
});

// ==========================================================================
// KEYBOARD_AVATAR Phase 2.3 -- platform velocity on jump (Mario-style)
// ==========================================================================

describe('KEYBOARD_AVATAR Phase 2.3 -- platform velocity on jump', () => {
  it('PlayerSprite initializes _jumpInheritedVx to 0', () => {
    expect(BOARD).toMatch(/this\._jumpInheritedVx\s*=\s*0/);
  });

  it('jump-from-carrier captures (peer.x - lastX) / dt as _jumpInheritedVx', () => {
    expect(BOARD).toMatch(/this\._jumpInheritedVx\s*=\s*\(\s*this\.standingOn\.x\s*-\s*this\._standingOnLastX\s*\)\s*\/\s*dt/);
  });

  it('airborne motion adds _jumpInheritedVx * dt to x', () => {
    expect(BOARD).toMatch(/this\.x\s*\+=\s*this\._jumpInheritedVx\s*\*\s*dt/);
  });

  it('landing clears _jumpInheritedVx (arc ends)', () => {
    // After bestFloor lands and state was 'jumping', _jumpInheritedVx is 0.
    expect(BOARD).toMatch(/this\._jumpInheritedVx\s*=\s*0/);
  });
});

// ==========================================================================
// LIVE_CLASSROOM_V3 P1+P2 -- live state structure pins
// ==========================================================================
// LIVE_CLASSROOM_V3_P12_BUILD.md C4: _reduce gains a classroom_live_state
// case, emptyState seeds live:false, and buildSummary carries state.live.
// These are source-level pins; behavior tests live in tests/classroom-board.test.js.

describe('LIVE_CLASSROOM_V3 P1+P2 -- live state pins', () => {
  it('emptyState seeds the live field to false', () => {
    // The literal in emptyState() at classroom-board.js line 450 includes
    // `live: false` as the last field. The regex tolerates surrounding
    // commas/whitespace so re-ordering fields stays green.
    expect(BOARD).toMatch(/live:\s*false/);
  });

  it('_reduce has a classroom_live_state case', () => {
    expect(BOARD).toMatch(/case\s+['"]classroom_live_state['"]/);
  });

  it('buildSummary carries state.live in the returned object', () => {
    expect(BOARD).toMatch(/live:\s*state\.live/);
  });
});
