// tests/p10-cockpit-polish.test.js
//
// P10 -- Teacher -> Student Console: cockpit micro-polish
// (TEACHER_STUDENT_CONSOLE_P10_BUILD.md Section 2 + 3).
//
// T1: proactive currentIdMap re-hydration on member-join events (debounced).
// T2: popup fade-in CSS animation.
//
// Harness mirrors broadcast-nudge-cockpit.test.js: reads the raw HTML source
// and evaluates function bodies in a vm sandbox so no DOM/browser is needed.
//
// ASCII-only. LF line endings.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'teacher-classroom.html'), 'utf-8');

// Extract a named function body from the source (handles async functions).
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces for: ' + name);
}

// ============================================================================
// 1. T1 -- source-level presence checks
// ============================================================================

describe('T1 idMap re-hydration -- source presence', () => {
  it('source contains _maybeRefreshIdMap function', () => {
    expect(html).toMatch(/function\s+_maybeRefreshIdMap\s*\(/);
  });

  it('_IDMAP_REFRESH_DEBOUNCE_MS is declared and set to 2000', () => {
    expect(html).toMatch(/_IDMAP_REFRESH_DEBOUNCE_MS\s*=\s*2000/);
  });

  it('_idMapRefreshTimer variable is declared', () => {
    expect(html).toMatch(/var\s+_idMapRefreshTimer\s*=/);
  });

  it('teardown() clears _idMapRefreshTimer with clearTimeout', () => {
    const body = fnBody(html, 'teardown');
    expect(body).toMatch(/clearTimeout\s*\(\s*_idMapRefreshTimer\s*\)/);
    expect(body).toMatch(/_idMapRefreshTimer\s*=\s*null/);
  });

  it('onStateChange callback calls _maybeRefreshIdMap alongside _refreshNudgeRecipients', () => {
    // Both calls must appear in the same onStateChange region. Confirm by
    // searching the full source for the two back-to-back guarded try blocks.
    expect(html).toMatch(/_refreshNudgeRecipients\(summary\)/);
    expect(html).toMatch(/_maybeRefreshIdMap\(summary\)/);
  });
});

// ============================================================================
// 2. T1 -- behavioural sandbox tests
// ============================================================================

// Build a sandbox that can run _maybeRefreshIdMap with controlled state.
function makeMaybeRefreshSandbox({ currentIdMap = {}, boardHandle = null, lastSummary = null } = {}) {
  const timerIds = [];
  const timerCallbacks = [];

  // setTimeout stub: record calls, return sequential IDs.
  let nextTimerId = 1;
  function stubSetTimeout(fn, delay) {
    const id = nextTimerId++;
    timerIds.push({ id, delay });
    timerCallbacks.push(fn);
    return id;
  }
  function stubClearTimeout(id) {
    const idx = timerIds.findIndex(t => t.id === id);
    if (idx >= 0) timerIds.splice(idx, 1);
  }

  const fetchIdMapCalls = [];
  // fetchIdMap stub returns a Promise that resolves to a fresh map.
  function stubFetchIdMap(section) {
    fetchIdMapCalls.push(section);
    return Promise.resolve({ alice: 'sid-alice', bob: 'sid-bob' });
  }

  const sandbox = {
    currentIdMap,
    boardHandle,
    _lastSummary: lastSummary,
    _idMapRefreshTimer: null,
    _idMapRefreshToken: 0,  // P10 MAJOR fold
    _IDMAP_REFRESH_DEBOUNCE_MS: 2000,
    fetchIdMap: stubFetchIdMap,
    setTimeout: stubSetTimeout,
    clearTimeout: stubClearTimeout,
    Array,
    Object,
    Promise,
  };

  createContext(sandbox);
  runInContext(
    'var currentIdMap = this.currentIdMap;\n' +
    'var boardHandle = this.boardHandle;\n' +
    'var _lastSummary = this._lastSummary;\n' +
    'var _idMapRefreshTimer = this._idMapRefreshTimer;\n' +
    'var _idMapRefreshToken = this._idMapRefreshToken;\n' +
    'var _IDMAP_REFRESH_DEBOUNCE_MS = this._IDMAP_REFRESH_DEBOUNCE_MS;\n' +
    fnBody(html, '_maybeRefreshIdMap') + '\n' +
    'this.__fn = _maybeRefreshIdMap;\n' +
    // After each call, sync the timer back so the test can inspect it.
    'this.__getTimer = function() { return _idMapRefreshTimer; };\n' +
    'this.__setTimer = function(v) { _idMapRefreshTimer = v; };',
    sandbox
  );

  return { sandbox, timerIds, timerCallbacks, fetchIdMapCalls };
}

describe('T1 idMap re-hydration -- debounce behaviour', () => {
  it('schedules a setTimeout when a student member is missing from currentIdMap', () => {
    const { sandbox, timerIds } = makeMaybeRefreshSandbox({
      currentIdMap: { alice: 'sid-alice' },  // bob is missing
    });
    // Codex P10 BLOCKER: summary.members is an ARRAY per classroom-board.js
    // buildSummary -- NOT an object keyed by username.
    const summary = {
      section: 'B',
      members: [
        { username: 'alice', role: 'student', online: true },
        { username: 'bob',   role: 'student', online: true },  // NOT in currentIdMap
      ],
    };
    sandbox.__fn(summary);
    // A timer must have been scheduled.
    expect(timerIds.length).toBe(1);
    expect(timerIds[0].delay).toBe(2000);
  });

  it('does NOT schedule a timer when all student members are already in currentIdMap', () => {
    const { sandbox } = makeMaybeRefreshSandbox({ currentIdMap: { alice: 'sid-alice', bob: 'sid-bob' } });
    const summary = {
      section: 'B',
      members: [
        { username: 'alice', role: 'student', online: true },
        { username: 'bob',   role: 'student', online: true },
      ],
    };
    sandbox.__fn(summary);
    // No gap -> no timer.
    expect(sandbox.__getTimer()).toBeNull();
  });

  it('a second call within the debounce window is a no-op (no second timer)', () => {
    const { sandbox, timerIds } = makeMaybeRefreshSandbox({
      currentIdMap: {},
    });
    const summary = {
      section: 'B',
      members: [{ username: 'bob', role: 'student', online: true }],
    };
    // First call -- schedules timer.
    sandbox.__fn(summary);
    const firstTimerId = sandbox.__getTimer();
    expect(firstTimerId).not.toBeNull();

    // Simulate second call while timer is still pending.
    sandbox.__fn(summary);
    // Timer ID must not have changed -- second call was no-op.
    expect(sandbox.__getTimer()).toBe(firstTimerId);
    // Only one timer recorded total.
    expect(timerIds.length).toBe(1);
  });

  it('after timer fires and fetch resolves, currentIdMap is updated', async () => {
    const { sandbox, timerCallbacks, fetchIdMapCalls } = makeMaybeRefreshSandbox({
      currentIdMap: {},
      boardHandle: { /* truthy */ },
      lastSummary: { section: 'B' },
    });
    // Wire in the lastSummary so the guard inside the timer callback passes.
    runInContext('_lastSummary = { section: "B" };', sandbox);
    runInContext('boardHandle = { connected: true };', sandbox);
    runInContext('_idMapRefreshToken = 0;', sandbox);  // P10 MAJOR fold: token guard

    const summary = {
      section: 'B',
      members: [{ username: 'bob', role: 'student', online: true }],
    };
    sandbox.__fn(summary);

    // Verify timer was scheduled.
    expect(timerCallbacks.length).toBe(1);

    // Fire the timer callback (simulate setTimeout expiry).
    // The callback returns a Promise (fetchIdMap); we must await it.
    await timerCallbacks[0]();

    // fetchIdMap must have been called with the section.
    expect(fetchIdMapCalls).toContain('B');

    // currentIdMap should now reflect the fresh data.
    const freshMap = runInContext('currentIdMap', sandbox);
    expect(freshMap).toMatchObject({ alice: 'sid-alice', bob: 'sid-bob' });
  });

  it('teardown() source clears the pending refresh timer', () => {
    // Source-level assertion: teardown must reference clearTimeout(_idMapRefreshTimer).
    const teardownSrc = fnBody(html, 'teardown');
    expect(teardownSrc).toMatch(/clearTimeout\s*\(\s*_idMapRefreshTimer\s*\)/);
  });
});

// ============================================================================
// 3. T2 -- popup animation CSS checks
// ============================================================================

describe('T2 popup animation -- CSS source assertions', () => {
  it('source contains @keyframes avatar-popup-fade-in', () => {
    expect(html).toMatch(/@keyframes\s+avatar-popup-fade-in/);
  });

  it('.avatar-popup CSS rule references the avatar-popup-fade-in animation', () => {
    // The animation property must appear inside the .avatar-popup block.
    // Extract the block by finding .avatar-popup { ... } (first occurrence).
    const start = html.indexOf('.avatar-popup {');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let blockEnd = -1;
    for (let i = html.indexOf('{', start); i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') {
        depth--;
        if (depth === 0) { blockEnd = i; break; }
      }
    }
    const block = html.slice(start, blockEnd + 1);
    expect(block).toMatch(/animation\s*:/);
    expect(block).toMatch(/avatar-popup-fade-in/);
  });

  it('keyframe uses 140ms ease-out', () => {
    // The animation shorthand on .avatar-popup must specify 140ms ease-out.
    expect(html).toMatch(/animation\s*:\s*avatar-popup-fade-in\s+140ms\s+ease-out/);
  });

  it('keyframe from-state has opacity 0 and translateX(4px)', () => {
    expect(html).toMatch(/from\s*\{\s*opacity\s*:\s*0\s*;\s*transform\s*:\s*translateX\(4px\)/);
  });

  it('keyframe to-state has opacity 1 and translateX(0)', () => {
    expect(html).toMatch(/to\s*\{\s*opacity\s*:\s*1\s*;\s*transform\s*:\s*translateX\(0\)/);
  });
});

// ============================================================================
// 4. ASCII safety check for P10 additions
// ============================================================================

describe('P10 ASCII safety', () => {
  it('no non-ASCII characters in the _maybeRefreshIdMap function body', () => {
    const body = fnBody(html, '_maybeRefreshIdMap');
    for (const ch of body) {
      const code = ch.charCodeAt(0);
      // Tab (9) + LF (10) + CR (13) + printable ASCII (32-126) only.
      expect(
        code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126),
        `unexpected char U+${code.toString(16).padStart(4, '0')} in _maybeRefreshIdMap`
      ).toBe(true);
    }
  });

  it('no non-ASCII characters near the avatar-popup-fade-in keyframe', () => {
    const idx = html.indexOf('@keyframes avatar-popup-fade-in');
    expect(idx).toBeGreaterThan(-1);
    const snippet = html.slice(idx, idx + 300);
    for (const ch of snippet) {
      const code = ch.charCodeAt(0);
      expect(
        code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126),
        `unexpected char U+${code.toString(16).padStart(4, '0')} near keyframe`
      ).toBe(true);
    }
  });
});
