// desk-activity-kbd.test.js -- V4 spec C7 Unit D (Desk side).
// Pins the planner-direct Desk wiring for the V4 activity engine:
// activity-bridge.js script load, _handleActivityState helper,
// onStateChange summary stash, capture-phase arrow-key handler that
// intercepts ArrowUp/ArrowDown when an activity is live and the
// current user is in the activity's values map.
//
// Structural-pin style (regex over source) mirrors the existing
// tests/desk-modal-polish.test.js pattern -- the Desk file is ~12k
// lines, so booting it whole in jsdom would dominate runtime; the
// behavioral path is exercised in the V4 end-to-end smoke instead.
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

describe('V4 Desk activity wiring (C5.2 planner-direct edits)', () => {

  it('pin 01: the Desk file exists', () => {
    expect(DESK, 'Desk file must exist').toBeTypeOf('string');
  });

  it('pin 02: activity-bridge.js is loaded via <script src>', () => {
    expect(DESK).toMatch(/<script\s+src="activity-bridge\.js"><\/script>/);
  });

  it('pin 03: module-scope variables _lastClassroomSummary, _activityHandle, _activityMount are declared', () => {
    expect(DESK).toMatch(/var\s+_lastClassroomSummary\s*=\s*null/);
    expect(DESK).toMatch(/var\s+_activityHandle\s*=\s*null/);
    expect(DESK).toMatch(/var\s+_activityMount\s*=\s*null/);
  });

  it('pin 04: _activityRendererForType resolves bridge-mean to window.ActivityBridge', () => {
    const body = fnBody(DESK, '_activityRendererForType');
    expect(body).toMatch(/'bridge-mean'/);
    expect(body).toMatch(/window\.ActivityBridge/);
  });

  it('pin 05: _handleActivityState helper is defined', () => {
    const body = fnBody(DESK, '_handleActivityState');
    expect(body).toMatch(/summary/);
    expect(body).toMatch(/_activityHandle/);
  });

  it('pin 06: _handleActivityState mounts on live activity, calls updateState, handles finished + null', () => {
    const body = fnBody(DESK, '_handleActivityState');
    // Mount path: creates the div, inserts before classroom-board-mount.
    expect(body).toMatch(/createElement\(['"]div['"]\)/);
    expect(body).toMatch(/insertBefore/);
    // Update path.
    expect(body).toMatch(/updateState/);
    // Finished path: show outcome + teardown via setTimeout.
    expect(body).toMatch(/showOutcome/);
    expect(body).toMatch(/setTimeout/);
    // Teardown path on null activity.
    expect(body).toMatch(/destroy/);
  });

  it('pin 07: onStateChange in _mountClassroomBoard stashes _lastClassroomSummary AND calls _handleActivityState', () => {
    const body = fnBody(DESK, '_mountClassroomBoard');
    expect(body).toMatch(/_lastClassroomSummary\s*=\s*summary/);
    expect(body).toMatch(/_handleActivityState\s*\(\s*summary\s*\)/);
  });

  it('pin 08: a capture-phase keydown listener is registered with { capture: true }-equivalent', () => {
    // The handler is registered as document.addEventListener('keydown', fn, true).
    // Match the trailing , true) capture argument adjacent to the V4 comment.
    expect(DESK).toMatch(/V4 spec C5\.2 arrow-key gate/);
    expect(DESK).toMatch(/document\.addEventListener\(\s*['"]keydown['"][\s\S]*?,\s*true\s*\)/);
  });

  it('pin 09: capture-phase handler gates on ArrowUp/ArrowDown only', () => {
    // The comment + first conditional pair.
    expect(DESK).toMatch(/e\.key\s*!==\s*['"]ArrowUp['"]\s*&&\s*e\.key\s*!==\s*['"]ArrowDown['"]/);
  });

  it('pin 10: capture-phase handler reads _lastClassroomSummary and checks activity.state.values membership', () => {
    // Stale-summary guard + values-map membership check.
    expect(DESK).toMatch(/_lastClassroomSummary/);
    expect(DESK).toMatch(/sum\.activity\.finished/);
    expect(DESK).toMatch(/\(me in st\.values\)/);
  });

  it('pin 11: capture-phase handler calls e.preventDefault AND e.stopImmediatePropagation', () => {
    // The handler must stop the PlayerSprite bubble-phase listener.
    // The capture flag + stopImmediatePropagation are both load-bearing
    // for the spec C5.2 short-circuit gate.
    const segment = DESK.slice(
      DESK.indexOf('V4 spec C5.2 arrow-key gate'),
      DESK.indexOf('function _mountClassroomBoard')
    );
    expect(segment).toMatch(/preventDefault/);
    expect(segment).toMatch(/stopImmediatePropagation/);
  });

  it('pin 12: capture-phase handler calls _classroomBoardHandle.sendActivityValue with the correct delta', () => {
    const segment = DESK.slice(
      DESK.indexOf('V4 spec C5.2 arrow-key gate'),
      DESK.indexOf('function _mountClassroomBoard')
    );
    expect(segment).toMatch(/_classroomBoardHandle\.sendActivityValue/);
    // Delta is +1 for ArrowUp, -1 for ArrowDown (ternary on e.key).
    expect(segment).toMatch(/e\.key\s*===\s*['"]ArrowUp['"]\s*\)\s*\?\s*1\s*:\s*-1/);
  });

  // 2026-05-24 Codex MAJOR 2 fold regression pin: a teardown timer
  // scheduled when an activity finishes must be CANCELLED if a new live
  // activity arrives in the 2.5s window. Otherwise the stale timer
  // destroys the fresh renderer mid-session.
  it('pin 13: _activityTeardownTimer is declared and cleared on live transition', () => {
    expect(DESK).toMatch(/var\s+_activityTeardownTimer\s*=\s*null/);
    const body = fnBody(DESK, '_handleActivityState');
    // The teardown timer must be assigned via setTimeout AND cleared via
    // clearTimeout when the next live activity arrives.
    expect(body).toMatch(/_activityTeardownTimer\s*=\s*setTimeout/);
    expect(body).toMatch(/clearTimeout\(\s*_activityTeardownTimer\s*\)/);
  });
});
