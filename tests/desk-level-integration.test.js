// desk-level-integration.test.js -- V7 spec C9 Unit E (planner-direct).
// Structural pins for the Desk's V7 wiring: script tag for
// activity-level.js, _activityRendererForType 'level' branch, the
// classroom-board-mount hide/restore on level activity start/end,
// the level + levelKey + lessonKey shipping in updateState's payload.
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
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
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

describe('V7 Desk integration (C7 planner-direct)', () => {

  it('pin 01: the Desk file exists', () => {
    expect(DESK, 'Desk file must exist').toBeTypeOf('string');
  });

  it('pin 02: activity-level.js is loaded via <script src>', () => {
    expect(DESK).toMatch(/<script\s+src="activity-level\.js"><\/script>/);
  });

  it('pin 03: _activityRendererForType has a level -> ActivityLevel branch', () => {
    const body = fnBody(DESK, '_activityRendererForType');
    expect(body).toMatch(/type\s*===\s*['"]level['"]/);
    expect(body).toMatch(/window\.ActivityLevel/);
  });

  it('pin 04: _boardPrevDisplay module-scope variable is declared', () => {
    expect(DESK).toMatch(/var\s+_boardPrevDisplay\s*=\s*null/);
  });

  it('pin 05: _handleActivityState hides classroom-board-mount on type === level', () => {
    const body = fnBody(DESK, '_handleActivityState');
    expect(body).toMatch(/act\.type\s*===\s*['"]level['"]/);
    expect(body).toMatch(/_boardPrevDisplay\s*=/);
    // The hide path sets display='none' on the board.
    expect(body).toMatch(/board\.style\.display\s*=\s*['"]none['"]/);
  });

  it('pin 06: _handleActivityState restores classroom-board-mount when level ends (teardown)', () => {
    const body = fnBody(DESK, '_handleActivityState');
    // The restore path runs at teardown (setTimeout callback) AND
    // in the no-activity else branch. Confirm BOTH restore _boardPrevDisplay.
    var matches = body.match(/_boardPrevDisplay\s*!==\s*null/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // The restore writes the prior display back to the board element.
    expect(body).toMatch(/\.style\.display\s*=\s*_boardPrevDisplay/);
  });

  it('pin 07: updateState payload extended with level + levelKey + lessonKey for level activities', () => {
    const body = fnBody(DESK, '_handleActivityState');
    // The level renderer needs the LevelDef on first call to build the
    // static actor layer. V4/V5/V6 renderers ignore the extra fields.
    expect(body).toMatch(/act\.type\s*===\s*['"]level['"]\s*&&\s*act\.level/);
    expect(body).toMatch(/level:\s*act\.level/);
    expect(body).toMatch(/levelKey/);
    expect(body).toMatch(/lessonKey/);
  });

  it('pin 08: V4/V5/V6 renderers still receive act.state directly (no breakage)', () => {
    const body = fnBody(DESK, '_handleActivityState');
    // The default payload is act.state for non-level activities.
    expect(body).toMatch(/var\s+payloadForRenderer\s*=\s*act\.state/);
  });

  it('pin 09: classroom-board-mount restore happens in the teardown setTimeout AND the no-activity else branch', () => {
    const body = fnBody(DESK, '_handleActivityState');
    // Both teardown paths must run the restore: the setTimeout (post-finished)
    // and the immediate no-activity branch.
    var setTimeoutIdx = body.indexOf('setTimeout');
    expect(setTimeoutIdx).toBeGreaterThan(-1);
    // After setTimeout: there must be a restore block.
    var afterSetTimeout = body.slice(setTimeoutIdx, setTimeoutIdx + 800);
    expect(afterSetTimeout).toMatch(/_boardPrevDisplay/);
  });

  it('pin 10: the level renderer mount call propagates currentUsername and boardHandle (V6 convention)', () => {
    const body = fnBody(DESK, '_handleActivityState');
    expect(body).toMatch(/Renderer\.mount\(\s*_activityMount\s*,\s*\{[\s\S]*currentUsername[\s\S]*boardHandle[\s\S]*\}\s*\)/);
  });
});
