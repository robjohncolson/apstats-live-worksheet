// desk-level-integration.test.js -- V7.1 spec (additive overlay).
// Structural pins for the planner-direct Desk wiring AFTER the V7.1
// redesign: the level renderer is an additive overlay on top of the
// classroom-board scene. The classroom-board canvas is NEVER hidden.
// The hide/restore _boardPrevDisplay logic from V7 has been removed.
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

describe('V7.1 Desk integration (additive overlay -- C7 + planner-direct revert)', () => {

  it('pin 01: the Desk file exists', () => {
    expect(DESK, 'Desk file must exist').toBeTypeOf('string');
  });

  it('pin 02: activity-level.js is loaded via <script src>', () => {
    expect(DESK).toMatch(/<script\s+src="activity-level\.js"><\/script>/);
  });

  it('pin 03: _activityRendererForType maps level -> window.ActivityLevel', () => {
    const body = fnBody(DESK, '_activityRendererForType');
    expect(body).toMatch(/type\s*===\s*['"]level['"]/);
    expect(body).toMatch(/window\.ActivityLevel/);
  });

  it('pin 04: _activityHandleType module-scope variable is declared (fast-restart guard kept)', () => {
    expect(DESK).toMatch(/var\s+_activityHandleType\s*=\s*null/);
  });

  it('pin 05: V7 _boardPrevDisplay variable is REMOVED (V7.1 additive overlay -- no hiding)', () => {
    // Only the comment line referencing the removal is allowed; the
    // variable declaration + read/write sites must be gone.
    var decl = DESK.match(/var\s+_boardPrevDisplay\s*=/g);
    expect(decl, '_boardPrevDisplay declaration must be removed').toBeNull();
    var refs = DESK.match(/_boardPrevDisplay\s*[!=<>]/g);
    expect(refs, '_boardPrevDisplay references must be removed').toBeNull();
  });

  it('pin 06: _handleActivityState does NOT set classroom-board.style.display = none', () => {
    const body = fnBody(DESK, '_handleActivityState');
    // The whole function body must NOT contain a "style.display = 'none'"
    // applied to the board element. (Other elements may set display=none;
    // we scope the assertion to mentions of "board".)
    var hideRe = /board[\s\S]{0,40}\.style\.display\s*=\s*['"]none['"]/;
    expect(body).not.toMatch(hideRe);
  });

  it('pin 07: _handleActivityState fast-restart-across-types path keeps destroy + remount logic', () => {
    const body = fnBody(DESK, '_handleActivityState');
    // The Codex MAJOR 5 fold pattern: _activityHandleType !== act.type
    // triggers destroy + null + mount-removal.
    expect(body).toMatch(/_activityHandleType\s*!==\s*act\.type/);
    expect(body).toMatch(/_activityHandle\s*=\s*null/);
  });

  it('pin 08: updateState payload still extends with level + levelKey + lessonKey for level activities', () => {
    const body = fnBody(DESK, '_handleActivityState');
    expect(body).toMatch(/act\.type\s*===\s*['"]level['"]\s*&&\s*act\.level/);
    expect(body).toMatch(/level:\s*act\.level/);
    expect(body).toMatch(/levelKey/);
    expect(body).toMatch(/lessonKey/);
  });

  it('pin 09: V4/V5/V6 renderers still receive act.state directly (no breakage)', () => {
    const body = fnBody(DESK, '_handleActivityState');
    expect(body).toMatch(/var\s+payloadForRenderer\s*=\s*act\.state/);
  });

  it('pin 10: the level renderer mount call propagates currentUsername + boardHandle', () => {
    const body = fnBody(DESK, '_handleActivityState');
    expect(body).toMatch(/Renderer\.mount\(\s*_activityMount\s*,\s*\{[\s\S]*currentUsername[\s\S]*boardHandle[\s\S]*\}\s*\)/);
  });
});
